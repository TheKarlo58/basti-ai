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
    const sendUrl = 'ws://localhost:9000';
    const receiveUrl = 'ws://localhost:8000';

    return new Promise((resolve, reject) => {
      if (this.sendWebSocket?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.audioContext = new AudioContext();
      
      // Connect to sending WebSocket (required)
      this.sendWebSocket = new WebSocket(sendUrl);
      this.sendWebSocket.binaryType = 'arraybuffer';

      // Try to connect to receiving WebSocket (optional)
      try {
        this.receiveWebSocket = new WebSocket(receiveUrl);
        this.receiveWebSocket.binaryType = 'arraybuffer';

        this.receiveWebSocket.onopen = () => {
          console.log('Receive WebSocket connected to port 8000');
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

        this.receiveWebSocket.onerror = (error) => {
          console.warn('Receive WebSocket error (optional):', error);
        };

        this.receiveWebSocket.onclose = () => {
          console.log('Receive WebSocket closed');
        };
      } catch (error) {
        console.warn('Could not connect to receive WebSocket (optional):', error);
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timed out'));
        this.sendWebSocket?.close();
      }, 1000);

      this.sendWebSocket.onopen = () => {
        clearTimeout(timeout);
        console.log('Send WebSocket connected to port 8080');
        this.reconnectAttempts = 0;
        this.onConnectionChange(true);
        resolve();
      };

      this.sendWebSocket.onerror = (error) => {
        clearTimeout(timeout);
        console.error('Send WebSocket error:', error);
        reject(new Error('Failed to connect to port 8080'));
      };

      this.sendWebSocket.onclose = () => {
        console.log('Send WebSocket closed');
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
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      if (!this.audioContext) {
        this.audioContext = new AudioContext({ sampleRate: 16000 });
      }

      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const sampleRate = this.audioContext?.sampleRate || 16000;
        const pcmBuffer = this.prepareAudioChunk(inputData, sampleRate);
        this.audioBuffer.push(new Int16Array(pcmBuffer));
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Send buffered audio every 200ms as raw 16-bit PCM chunks (no header)
      this.sendInterval = window.setInterval(() => {
        if (this.audioBuffer.length > 0 && this.sendWebSocket?.readyState === WebSocket.OPEN) {
          const totalLength = this.audioBuffer.reduce((sum, arr) => sum + arr.length, 0);
          const combined = new Int16Array(totalLength);
          let offset = 0;
          
          for (const chunk of this.audioBuffer) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }
          
          // Send raw 16-bit PCM data without any header (sample rate: 16000 Hz)
          this.sendWebSocket.send(combined.buffer);
          this.audioBuffer = [];
        }
      }, 200);

      console.log('Recording started: sending 16-bit PCM chunks at 16kHz every 200ms (no header)');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }

  private prepareAudioChunk(inputFloat32Array: Float32Array, inputSampleRate: number): ArrayBuffer {
    const resampled = this.downsampleBuffer(inputFloat32Array, inputSampleRate, 16000);

    const buffer = new ArrayBuffer(resampled.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < resampled.length; i++) {
      const s = Math.max(-1, Math.min(1, resampled[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }

  private downsampleBuffer(buffer: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
    if (outputSampleRate === inputSampleRate) return buffer;
    const ratio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    let offset = 0;
    for (let i = 0; i < newLength; i++) {
      result[i] = buffer[Math.floor(offset)];
      offset += ratio;
    }
    return result;
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
