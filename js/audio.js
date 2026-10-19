'use strict';
// All sounds are synthesized with the Web Audio API, so there are no sound
// files to download (and nothing for a school filter to block).
// Positional sounds take { pan, gain, lowpass } from game.spatial().

const Sfx = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let volume = 0.6;
  const HERE = { pan: 0, gain: 1, lowpass: 0 };

  const SHOTS = {
    classic: { crack: 2600, body: 170, len: 0.12, vol: 0.5 },
    ghost: { crack: 1500, body: 120, len: 0.09, vol: 0.32, muffled: true },
    sheriff: { crack: 1500, body: 85, len: 0.32, vol: 0.85 },
    spectre: { crack: 1900, body: 130, len: 0.08, vol: 0.33, muffled: true },
    vandal: { crack: 1100, body: 95, len: 0.22, vol: 0.72 },
    phantom: { crack: 1600, body: 110, len: 0.11, vol: 0.42, muffled: true },
    operator: { crack: 700, body: 55, len: 0.7, vol: 1.0 },
  };

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function setVolume(v) {
    volume = v;
    if (master) master.gain.value = v;
  }

  // Output chain for one sound: [lowpass] -> gain -> panner -> master
  function out(sp, vol) {
    const g = ctx.createGain();
    g.gain.value = vol * sp.gain;
    let entry = g;
    if (sp.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = sp.lowpass;
      f.connect(g);
      entry = f;
    }
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, sp.pan));
      g.connect(p);
      p.connect(master);
    } else {
      g.connect(master);
    }
    return entry;
  }

  function noise(dest, t, dur, type, freq, q, vol, attack = 0.002) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.05);
    return f;
  }

  function tone(dest, t, dur, type, f0, f1, vol, attack = 0.003) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Wrap each sound so nothing throws before the first click unlocks audio.
  const play = fn => (...args) => {
    if (!ctx || ctx.state !== 'running') return;
    fn(ctx.currentTime, ...args);
  };

  return {
    init,
    setVolume,

    shot: play((t, id, sp = HERE) => {
      const s = SHOTS[id] || SHOTS.classic;
      const d = out(sp, s.vol);
      noise(d, t, s.len, s.muffled ? 'lowpass' : 'bandpass', s.crack, s.muffled ? 0.7 : 0.9, 1, 0.001);
      noise(d, t, s.len * 1.8, 'lowpass', 500, 0.5, 0.45);
      tone(d, t, s.len * 0.8, 'sine', s.body * 2, s.body * 0.6, 0.9);
    }),

    knife: play((t, sp = HERE) => {
      const f = noise(out(sp, 0.35), t, 0.18, 'bandpass', 900, 1.5, 1, 0.03);
      f.frequency.exponentialRampToValueAtTime(3200, t + 0.15);
    }),

    step: play((t, sp = HERE, loud = 1) => {
      const d = out(sp, 0.45 * loud);
      noise(d, t, 0.07, 'bandpass', 450 + Math.random() * 350, 1.2, 0.8);
      tone(d, t, 0.06, 'sine', 120, 60, 0.35);
    }),

    land: play((t, sp = HERE) => {
      const d = out(sp, 0.5);
      noise(d, t, 0.12, 'lowpass', 500, 0.8, 0.9);
      tone(d, t, 0.1, 'sine', 90, 45, 0.5);
    }),

    whizz: play((t, sp = HERE) => {
      const f = noise(out(sp, 0.25), t, 0.12, 'bandpass', 4200, 4, 1, 0.01);
      f.frequency.exponentialRampToValueAtTime(1800, t + 0.12);
    }),

    impact: play((t, sp = HERE) => {
      noise(out(sp, 0.18), t, 0.05, 'highpass', 2500, 0.7, 1);
    }),

    headshot: play(t => {
      const d = out(HERE, 0.35);
      tone(d, t, 0.32, 'sine', 1760, 1760, 0.8, 0.001);
      tone(d, t, 0.22, 'sine', 2640, 2640, 0.4, 0.001);
    }),

    hit: play(t => {
      const d = out(HERE, 0.3);
      tone(d, t, 0.08, 'triangle', 320, 180, 0.8);
      noise(d, t, 0.05, 'bandpass', 1200, 1, 0.4);
    }),

    kill: play((t, streak = 1) => {
      const d = out(HERE, 0.28);
      const base = 523 * Math.pow(1.122, Math.min(streak, 5) - 1);
      [1, 1.26, 1.5, 2].forEach((m, i) => tone(d, t + i * 0.06, 0.25, 'triangle', base * m, base * m, 0.7, 0.002));
    }),

    hurt: play((t, sp = HERE) => {
      const d = out(sp, 0.5);
      tone(d, t, 0.15, 'sine', 160, 70, 0.9);
      noise(d, t, 0.1, 'lowpass', 900, 0.7, 0.6);
    }),

    dry: play(t => {
      noise(out(HERE, 0.25), t, 0.03, 'highpass', 3000, 0.7, 1);
    }),

    reload: play((t, dur = 2) => {
      const d = out(HERE, 0.22);
      noise(d, t + 0.15, 0.04, 'highpass', 2200, 0.7, 1);
      noise(d, t + dur * 0.55, 0.05, 'bandpass', 1500, 1.5, 1);
      noise(d, t + dur * 0.85, 0.04, 'highpass', 2800, 0.7, 1);
    }),

    equip: play(t => {
      noise(out(HERE, 0.18), t, 0.06, 'bandpass', 2000, 1.2, 1);
    }),

    throwIt: play((t, sp = HERE) => {
      const f = noise(out(sp, 0.25), t, 0.25, 'bandpass', 500, 1.2, 1, 0.04);
      f.frequency.exponentialRampToValueAtTime(1600, t + 0.2);
    }),

    flashPop: play((t, sp = HERE, ring = 0) => {
      const d = out(sp, 0.6);
      noise(d, t, 0.35, 'bandpass', 2400, 0.6, 1, 0.001);
      tone(d, t, 0.2, 'sine', 140, 50, 0.8);
      if (ring > 0) tone(out(HERE, 0.12), t, ring, 'sine', 3900, 3700, 0.8, 0.01);
    }),

    smoke: play((t, sp = HERE) => {
      const d = out(sp, 0.35);
      const f = noise(d, t, 1.4, 'lowpass', 300, 0.7, 1, 0.08);
      f.frequency.exponentialRampToValueAtTime(1400, t + 0.5);
    }),

    dash: play(t => {
      const f = noise(out(HERE, 0.4), t, 0.3, 'bandpass', 400, 1, 1, 0.01);
      f.frequency.exponentialRampToValueAtTime(2600, t + 0.25);
    }),

    buy: play(t => {
      tone(out(HERE, 0.2), t, 0.07, 'square', 1250, 1250, 0.4);
    }),

    deny: play(t => {
      tone(out(HERE, 0.2), t, 0.12, 'square', 180, 160, 0.4);
    }),

    roundStart: play(t => {
      const d = out(HERE, 0.25);
      tone(d, t, 0.18, 'triangle', 660, 660, 0.8);
      tone(d, t + 0.2, 0.35, 'triangle', 990, 990, 0.8);
    }),

    roundEnd: play((t, won) => {
      const d = out(HERE, 0.25);
      const notes = won ? [523, 659, 784, 1047] : [440, 415, 349, 262];
      notes.forEach((f, i) => tone(d, t + i * 0.11, 0.4, 'triangle', f, f, 0.7));
    }),

    tick: play(t => {
      tone(out(HERE, 0.15), t, 0.05, 'sine', 1800, 1800, 0.6);
    }),
  };
})();
