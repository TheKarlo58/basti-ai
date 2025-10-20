export class WebSocketAudioHandler {
  private websocket: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private audioQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private isMuted = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectTimeout: number | null = null;
  private onError: (error: Error) => void;
  private onConnectionChange: (connected: boolean) => void;

  constructor(
    onError: (error: Error) => void,
    onConnectionChange: (connected: boolean) => void
  ) {
    this.onError = onError;
    this.onConnectionChange = onConnectionChange;
  }

  async connect(url: string = 'ws://localhost:8000'): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.websocket?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.audioContext = new AudioContext({ sampleRate: 24000 });
      this.websocket = new WebSocket(url);
      this.websocket.binaryType = 'arraybuffer';

      const timeout = setTimeout(() => {
        reject(new Error('Connection timed out'));
        this.websocket?.close();
      }, 2000);

      this.websocket.onopen = () => {
        clearTimeout(timeout);
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.onConnectionChange(true);
        resolve();
      };

      this.websocket.onmessage = async (event) => {
        try {
          if (event.data instanceof ArrayBuffer) {
            await this.handleIncomingAudio(new Uint8Array(event.data));
          }
        } catch (error) {
          console.error('Error handling incoming audio:', error);
        }
      };

      this.websocket.onerror = (error) => {
        clearTimeout(timeout);
        console.error('WebSocket error:', error);
        reject(new Error('WebSocket connection failed'));
      };

      this.websocket.onclose = () => {
        console.log('WebSocket closed');
        this.onConnectionChange(false);
        this.attemptReconnect(url);
      };
    });
  }

  private attemptReconnect(url: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      this.reconnectTimeout = window.setTimeout(async () => {
        try {
          await this.connect(url);
        } catch (error) {
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.onError(new Error('Failed to reconnect after multiple attempts'));
          }
        }
      }, 2000);
    } else {
      this.onError(new Error('Connection lost and failed to reconnect'));
    }
  }

  async startRecording(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm',
        audioBitsPerSecond: 128000
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && this.websocket?.readyState === WebSocket.OPEN) {
          event.data.arrayBuffer().then((buffer) => {
            this.websocket?.send(buffer);
          });
        }
      };

      this.mediaRecorder.onerror = (error) => {
        console.error('MediaRecorder error:', error);
        this.onError(new Error('Microphone recording failed'));
      };

      // Send small chunks every 100ms for real-time streaming
      this.mediaRecorder.start(100);
      console.log('Recording started');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }

  private async handleIncomingAudio(audioData: Uint8Array) {
    if (!this.audioContext || this.isMuted) return;

    try {
      const arrayBuffer = new ArrayBuffer(audioData.byteLength);
      new Uint8Array(arrayBuffer).set(audioData);
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      this.audioQueue.push(audioBuffer);
      
      if (!this.isPlaying) {
        this.playNextInQueue();
      }
    } catch (error) {
      console.error('Error decoding audio:', error);
    }
  }

  private playNextInQueue() {
    if (this.audioQueue.length === 0 || !this.audioContext) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const audioBuffer = this.audioQueue.shift()!;
    
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    
    source.onended = () => {
      this.playNextInQueue();
    };
    
    source.start(0);
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.audioQueue = [];
    }
  }

  stop() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.audioQueue = [];
    this.isPlaying = false;
    this.reconnectAttempts = 0;
  }
}
