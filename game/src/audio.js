// Vice Harbor — synthesized sound. No audio files: every sound is built
// with WebAudio oscillators and noise, so the game ships zero media and
// makes zero network requests. Created lazily on the first user gesture.

export function createSoundBank() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return !!ctx;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, vol, lowpass) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    isMuted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.35;
      return muted;
    },
    click() { tone(660, 0.06, 'square', 0.12); },
    cash() { tone(880, 0.09, 'sine', 0.22); setTimeout(() => tone(1320, 0.14, 'sine', 0.22), 90); },
    pickup() { tone(520, 0.1, 'sine', 0.2, 980); },
    jobStart() { tone(392, 0.12, 'triangle', 0.22); setTimeout(() => tone(523, 0.12, 'triangle', 0.22), 120); setTimeout(() => tone(659, 0.2, 'triangle', 0.22), 240); },
    jobDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.22), i * 110)); },
    shoot() { noiseBurst(0.12, 0.4, 2400); tone(180, 0.08, 'sawtooth', 0.15, 60); },
    thud() { tone(90, 0.15, 'sine', 0.3, 45); },
    crash() { noiseBurst(0.3, 0.45, 700); tone(70, 0.25, 'sine', 0.3, 35); },
    wanted() { tone(440, 0.16, 'square', 0.16, 660); setTimeout(() => tone(440, 0.16, 'square', 0.16, 660), 200); },
    busted() { [330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sawtooth', 0.18), i * 180)); },
    wasted() { [392, 311, 233, 175].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.18), i * 200)); },
    checkpoint() { tone(1046, 0.1, 'sine', 0.22); setTimeout(() => tone(1568, 0.16, 'sine', 0.2), 100); },
    engineStart() { tone(60, 0.4, 'sawtooth', 0.15, 140); },
    engine(speed01) {
      if (!ensure() || muted) { this.engineStop(); return; }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0.0;
        engineOsc.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 160, ctx.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.05, ctx.currentTime, 0.1);
    },
    engineStop() {
      if (engineOsc) { try { engineOsc.stop(); } catch (e) {} engineOsc = null; engineGain = null; }
    },
    siren(on) {
      if (!ensure()) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = muted ? 0 : 0.05;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        let up = true;
        sirenOsc._timer = setInterval(() => {
          if (!sirenOsc) return;
          sirenOsc.frequency.setTargetAtTime(up ? 950 : 650, ctx.currentTime, 0.3);
          up = !up;
        }, 450);
      } else if (!on && sirenOsc) {
        clearInterval(sirenOsc._timer);
        try { sirenOsc.stop(); } catch (e) {}
        sirenOsc = null;
        sirenGain = null;
      }
    },
  };
}
