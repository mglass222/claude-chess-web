export class SoundManager {
  constructor() {
    this._ctx = null;
    this._buffers = {};
    this.volume = 0.5;
    this.enabled = true;
  }

  load() {
    const base = import.meta.env.BASE_URL;
    // Create AudioContext eagerly so it exists before user gesture
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._gainNode = this._ctx.createGain();
    this._gainNode.gain.value = this.volume;
    this._gainNode.connect(this._ctx.destination);

    // Fetch and decode each sound
    const types = ['move', 'capture', 'check'];
    for (const type of types) {
      fetch(`${base}sounds/${type}.wav`)
        .then(r => r.arrayBuffer())
        .then(buf => this._ctx.decodeAudioData(buf))
        .then(decoded => { this._buffers[type] = decoded; })
        .catch(e => console.warn(`Failed to load ${type} sound:`, e));
    }

    // Resume AudioContext on first user interaction
    const resume = () => {
      if (this._ctx.state === 'suspended') {
        this._ctx.resume();
      }
      document.removeEventListener('mousedown', resume);
      document.removeEventListener('touchstart', resume);
      document.removeEventListener('click', resume);
    };
    document.addEventListener('mousedown', resume);
    document.addEventListener('touchstart', resume);
    document.addEventListener('click', resume);
  }

  play(type) {
    if (!this.enabled || !this._ctx) return;
    const buffer = this._buffers[type] || this._buffers.move;
    if (!buffer) return;

    // Resume context if still suspended (belt-and-suspenders)
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }

    const source = this._ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this._gainNode);
    source.start(0);
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this._gainNode) {
      this._gainNode.gain.value = this.volume;
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /** Play a short beep for low-time warning using oscillator (no WAV needed). */
  playLowTimeWarning() {
    if (!this.enabled || !this._ctx) return;
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }

    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = this.volume * 0.4;
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(this._ctx.destination);
    osc.start(this._ctx.currentTime);
    osc.stop(this._ctx.currentTime + 0.15);
  }
}
