export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private websocket: WebSocket | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private isMuted = false;
  private isReceiving = false;
  private onReceivingChange?: (isReceiving: boolean) => void;

  constructor(onReceivingChange?: (isReceiving: boolean) => void) {
    this.onReceivingChange = onReceivingChange;
  }

  async connect(url: string = 'ws://localhost:8000/ws/tts') {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      return;
    }

    this.audioContext = new AudioContext({ sampleRate: 24000 });
    
    this.websocket = new WebSocket(url);
    this.websocket.binaryType = 'arraybuffer';

    this.websocket.onopen = () => {
      console.log('WebSocket connected for audio streaming');
    };

    this.websocket.onmessage = async (event) => {
      if (!this.isReceiving) {
        this.isReceiving = true;
        this.onReceivingChange?.(true);
      }

      try {
        const audioData = new Uint8Array(event.data);
        await this.playAudioChunk(audioData);
      } catch (error) {
        console.error('Error playing audio chunk:', error);
      }
    };

    this.websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.isReceiving = false;
      this.onReceivingChange?.(false);
    };

    this.websocket.onclose = () => {
      console.log('WebSocket closed');
      this.isReceiving = false;
      this.onReceivingChange?.(false);
    };
  }

  private async playAudioChunk(audioData: Uint8Array) {
    if (!this.audioContext || this.isMuted) return;

    try {
      const arrayBuffer = new ArrayBuffer(audioData.byteLength);
      new Uint8Array(arrayBuffer).set(audioData);
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      
      this.sourceNode = source;
      source.start(0);
    } catch (error) {
      console.error('Error decoding audio:', error);
    }
  }

  private base64ToBlob(base64: string): Blob {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'audio/wav' });
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  stop() {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    if (this.sourceNode) {
      this.sourceNode.stop();
      this.sourceNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.isReceiving = false;
    this.onReceivingChange?.(false);
  }
}
