// Vice Harbor v2.1 — synthesised sound.
// v2.1: rewritten under the new sealed recording; same sounds as v2.
// Every sound is made with WebAudio oscillators and filtered noise:
// engine hum, a two-tone siren, gunshots, a cash-register ding and
// thuds. No audio files, no network. M toggles mute.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this.ready = false;
  }

  // Must be called from a user gesture at least once.
  init() {
    if (this.ready) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      // Engine hum: a low sawtooth whose pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      this.engineOsc.connect(engineFilter);
      engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Police siren: two alternating tones.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  setEngine(speed01) {
    if (!this.ready) return;
    this.engineOsc.frequency.value = 55 + speed01 * 130;
    this.engineGain.gain.value = speed01 > 0.02 ? 0.05 + speed01 * 0.05 : 0;
  }

  siren(on) {
    if (!this.ready) return;
    this.sirenOn = on;
    this.sirenGain.gain.value = on ? 0.045 : 0;
    if (on && !this._sirenTimer) {
      this._sirenTimer = setInterval(() => {
        if (!this.sirenOsc) return;
        this.sirenOsc.frequency.value = this.sirenOsc.frequency.value > 800 ? 700 : 950;
      }, 420);
    } else if (!on && this._sirenTimer) {
      clearInterval(this._sirenTimer);
      this._sirenTimer = null;
    }
  }

  _noiseBurst(duration, volume, freq) {
    if (!this.ready) return;
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  _tone(freq, duration, volume, type = 'sine', when = 0) {
    if (!this.ready) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    const t0 = this.ctx.currentTime + when;
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  shot(far) {
    this._noiseBurst(0.14, far ? 0.12 : 0.3, far ? 900 : 2400);
  }

  swing() {
    this._noiseBurst(0.12, 0.12, 1200);
  }

  thud() {
    this._noiseBurst(0.18, 0.3, 300);
    this._tone(70, 0.15, 0.25, 'sine');
  }

  ding() {
    this._tone(880, 0.16, 0.25);
    this._tone(1318, 0.3, 0.25, 'sine', 0.12);
  }

  splash() {
    this._noiseBurst(0.3, 0.2, 700);
  }

  horn() {
    this._tone(220, 0.35, 0.25, 'square');
    this._tone(277, 0.35, 0.25, 'square', 0.05);
  }

  click() {
    this._tone(660, 0.06, 0.15, 'square');
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }
}
