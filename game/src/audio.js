// Vice Harbor — synthesized sound. Every effect is built with WebAudio
// oscillators and filtered noise; no audio files are shipped or fetched.

window.VH = window.VH || {};
(function () {
  var VH = window.VH;

  var ctx = null, muted = false, engineOsc = null, engineGain = null;

  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (muted) return;
    var c = ac(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.15, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }

  function noiseBurst(dur, vol, freq) {
    if (muted) return;
    var c = ac(); if (!c) return;
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    var g = c.createGain(); g.gain.value = vol || 0.25;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start();
  }

  VH.audio = {
    unlock: function () { ac(); },
    toggleMute: function () {
      muted = !muted;
      if (engineGain) engineGain.gain.value = muted ? 0 : 0.05;
      return muted;
    },
    isMuted: function () { return muted; },
    click: function () { tone(660, 0.07, 'square', 0.08); },
    cash: function () { tone(880, 0.12, 'sine', 0.16); setTimeout(function () { tone(1318, 0.2, 'sine', 0.16); }, 90); },
    pickup: function () { tone(523, 0.1, 'triangle', 0.14); setTimeout(function () { tone(784, 0.16, 'triangle', 0.14); }, 80); },
    gunshot: function () { noiseBurst(0.14, 0.3, 900); },
    siren: function () { tone(720, 0.5, 'sawtooth', 0.05, 960); setTimeout(function () { tone(960, 0.5, 'sawtooth', 0.05, 720); }, 500); },
    crash: function () { noiseBurst(0.3, 0.35, 500); },
    jobDone: function () {
      var notes = [523, 659, 784, 1046];
      notes.forEach(function (n, i) { setTimeout(function () { tone(n, 0.22, 'triangle', 0.16); }, i * 110); });
    },
    engineStart: function () {
      if (muted) return;
      var c = ac(); if (!c) return;
      if (!engineOsc) {
        engineOsc = c.createOscillator(); engineOsc.type = 'sawtooth';
        engineGain = c.createGain(); engineGain.gain.value = 0.0;
        var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
        engineOsc.connect(f); f.connect(engineGain); engineGain.connect(c.destination);
        engineOsc.frequency.value = 55; engineOsc.start();
      }
      engineGain.gain.linearRampToValueAtTime(0.05, c.currentTime + 0.4);
    },
    engineSet: function (speed01) {
      if (engineOsc && !muted) engineOsc.frequency.value = 55 + speed01 * 130;
    },
    engineStop: function () {
      if (engineGain) engineGain.gain.value = 0;
    }
  };
})();
