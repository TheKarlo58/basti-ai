export class AudioPlayer {
  private audioQueue: string[] = [];
  private isPlaying = false;
  private currentAudio: HTMLAudioElement | null = null;
  private isMuted = false;

  addChunk(base64Audio: string) {
    this.audioQueue.push(base64Audio);
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  private async playNext() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const base64Audio = this.audioQueue.shift()!;

    try {
      const audioBlob = this.base64ToBlob(base64Audio);
      const audioUrl = URL.createObjectURL(audioBlob);

      this.currentAudio = new Audio(audioUrl);
      this.currentAudio.muted = this.isMuted;

      this.currentAudio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        this.playNext();
      };

      this.currentAudio.onerror = () => {
        console.error('Audio playback error');
        URL.revokeObjectURL(audioUrl);
        this.playNext();
      };

      await this.currentAudio.play();
    } catch (error) {
      console.error('Error playing audio:', error);
      this.playNext();
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
    if (this.currentAudio) {
      this.currentAudio.muted = muted;
    }
  }

  stop() {
    this.audioQueue = [];
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.isPlaying = false;
  }
}
