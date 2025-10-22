export class WebSocketAudioHandler {
  private sendWebSocket: WebSocket | null = null;
  private receiveWebSocket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private audioQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private isMuted = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectTimeout: number | null = null;
  private onError: (error: Error) => void;
  private onConnectionChange: (connected: boolean) => void;
  private audioBuffer: Int16Array[] = [];
  private sendInterval: number | null = null;

  constructor(
    onError: (error: Error) => void,
    onConnectionChange: (connected: boolean) => void
  ) {
    this.onError = onError;
    this.onConnectionChange = onConnectionChange;
  }

  async connect(): Promise<void> {
    const sendUrl = 'ws://localhost:8080';
    const receiveUrl = 'ws://localhost:8000';

    return new Promise((resolve, reject) => {
      if (this.sendWebSocket?.readyState === WebSocket.OPEN && 
          this.receiveWebSocket?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.audioContext = new AudioContext({ sampleRate: 24000 });
      
      // Connect to receiving WebSocket
      this.receiveWebSocket = new WebSocket(receiveUrl);
      this.receiveWebSocket.binaryType = 'arraybuffer';

      // Connect to sending WebSocket
      this.sendWebSocket = new WebSocket(sendUrl);
      this.sendWebSocket.binaryType = 'arraybuffer';

      const timeout = setTimeout(() => {
        reject(new Error('Connection timed out'));
        this.sendWebSocket?.close();
        this.receiveWebSocket?.close();
      }, 1000);

      let sendConnected = false;
      let receiveConnected = false;

      const checkBothConnected = () => {
        if (sendConnected && receiveConnected) {
          clearTimeout(timeout);
          console.log('Both WebSockets connected');
          this.reconnectAttempts = 0;
          this.onConnectionChange(true);
          resolve();
        }
      };

      this.sendWebSocket.onopen = () => {
        console.log('Send WebSocket connected to port 8080');
        sendConnected = true;
        checkBothConnected();
      };

      this.receiveWebSocket.onopen = () => {
        console.log('Receive WebSocket connected to port 8000');
        receiveConnected = true;
        checkBothConnected();
      };

      this.receiveWebSocket.onmessage = async (event) => {
        try {
          if (event.data instanceof ArrayBuffer) {
            await this.handleIncomingAudio(new Uint8Array(event.data));
          }
        } catch (error) {
          console.error('Error handling incoming audio:', error);
        }
      };

      this.sendWebSocket.onerror = (error) => {
        clearTimeout(timeout);
        console.error('Send WebSocket error:', error);
        reject(new Error('Failed to connect to port 8080'));
      };

      this.receiveWebSocket.onerror = (error) => {
        clearTimeout(timeout);
        console.error('Receive WebSocket error:', error);
        reject(new Error('Failed to connect to port 8000'));
      };

      this.sendWebSocket.onclose = () => {
        console.log('Send WebSocket closed');
        this.onConnectionChange(false);
        this.attemptReconnect();
      };

      this.receiveWebSocket.onclose = () => {
        console.log('Receive WebSocket closed');
        this.onConnectionChange(false);
        this.attemptReconnect();
      };
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      this.reconnectTimeout = window.setTimeout(async () => {
        try {
          await this.connect();
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

      if (!this.audioContext) {
        this.audioContext = new AudioContext({ sampleRate: 24000 });
      }

      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = this.floatTo16BitPCM(inputData);
        this.audioBuffer.push(pcmData);
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Send buffered audio every 200ms
      this.sendInterval = window.setInterval(() => {
        if (this.audioBuffer.length > 0 && this.sendWebSocket?.readyState === WebSocket.OPEN) {
          const totalLength = this.audioBuffer.reduce((sum, arr) => sum + arr.length, 0);
          const combined = new Int16Array(totalLength);
          let offset = 0;
          
          for (const chunk of this.audioBuffer) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }
          
          this.sendWebSocket.send(combined.buffer);
          this.audioBuffer = [];
        }
      }, 200);

      console.log('Recording started, sending PCM chunks every 200ms');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }

  private floatTo16BitPCM(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
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

    if (this.sendInterval) {
      clearInterval(this.sendInterval);
      this.sendInterval = null;
    }

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.sendWebSocket) {
      this.sendWebSocket.close();
      this.sendWebSocket = null;
    }

    if (this.receiveWebSocket) {
      this.receiveWebSocket.close();
      this.receiveWebSocket = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.audioQueue = [];
    this.audioBuffer = [];
    this.isPlaying = false;
    this.reconnectAttempts = 0;
  }
}
