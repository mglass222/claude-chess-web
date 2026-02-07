import { Howl } from 'howler';

export class SoundManager {
  constructor() {
    this.sounds = {};
    this.volume = 0.5;
    this.enabled = true;
    this._loaded = false;
  }

  load() {
    const base = import.meta.env.BASE_URL;
    try {
      this.sounds.move = new Howl({ src: [`${base}sounds/move.mp3`], volume: this.volume });
      this.sounds.capture = new Howl({ src: [`${base}sounds/capture.mp3`], volume: this.volume });
      this.sounds.check = new Howl({ src: [`${base}sounds/check.mp3`], volume: this.volume });
      this._loaded = true;
    } catch (e) {
      console.warn('Failed to load sounds:', e);
    }
  }

  play(type) {
    if (!this.enabled || !this._loaded) return;
    const sound = this.sounds[type] || this.sounds.move;
    if (sound) {
      sound.volume(this.volume);
      sound.play();
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    for (const s of Object.values(this.sounds)) {
      s.volume(this.volume);
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }
}
