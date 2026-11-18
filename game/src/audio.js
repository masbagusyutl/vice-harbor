// Vice Harbor — all sound is synthesised with WebAudio. No audio files.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: low sawtooth whose pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      engineOsc.connect(lp);
      lp.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: two-tone triangle, toggled by gain.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      let hi = false;
      window.setInterval(() => { if (sirenOsc) sirenOsc.frequency.value = hi ? 720 : 980; hi = !hi; }, 420);
    } catch { ctx = null; }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol) {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol || 0.3;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
  }

  return {
    ensure,
    setEngine(speed01) {
      if (!ctx) return;
      engineGain.gain.value = speed01 > 0.02 ? 0.05 + 0.05 * speed01 : 0;
      engineOsc.frequency.value = 55 + 140 * speed01;
    },
    setSiren(on) { if (ctx) sirenGain.gain.value = on ? 0.045 : 0; },
    gunshot() { noise(0.16, 0.4); blip(160, 0.1, 'square', 0.25, 60); },
    punch() { noise(0.08, 0.25); },
    cash() { blip(880, 0.09, 'sine', 0.22); window.setTimeout(() => blip(1174, 0.12, 'sine', 0.22), 90); window.setTimeout(() => blip(1568, 0.18, 'sine', 0.22), 180); },
    denied() { blip(180, 0.2, 'square', 0.2, 120); },
    mission() { blip(523, 0.12, 'sine', 0.22); window.setTimeout(() => blip(784, 0.2, 'sine', 0.22), 120); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
  };
}
