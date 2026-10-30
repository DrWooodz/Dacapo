/* The Jam's instruments, synthesized so there is nothing to download: a drum kit and a few keyboard
   sounds (listed in instruments.js). The piano is the app's own piano voice, which plays on your piano
   when "Sound on the piano" is set. */
import { clamp } from '../core/util.js';
import { Store } from '../core/store.js';
import { AudioEngine } from '../core/audio.js';
import { SOUND_BY } from './instruments.js';

const freq = m => 440 * Math.pow(2, (m - 69) / 12);

export const Sounds = {
  noise: null,
  openHat: null, // a ringing open hi-hat, cut short by the next closed one (as on a real kit)
  active: [], // everything sounding or scheduled: {gain, nodes, end}, so Stop can silence it at once
  track(gain, nodes, end) {
    const now = this.ctx().currentTime;
    this.active = this.active.filter(v => v.end > now);
    const v = { gain, nodes, end };
    this.active.push(v);
    return v;
  },
  // silence everything the Jam has playing or scheduled
  stopAll() {
    const ctx = AudioEngine.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.active.forEach(v => {
      try {
        v.gain.gain.cancelScheduledValues(0);
        v.gain.gain.setValueAtTime(0, now);
        v.nodes.forEach(o => o.stop(now + 0.01));
      } catch (e) {
        /* already stopped */
      }
    });
    this.active = [];
    this.openHat = null;
  },
  on() {
    return Store.s.settings.sound !== false;
  },
  ctx() {
    return AudioEngine.ensure();
  },
  out() {
    this.ctx();
    return AudioEngine.master;
  },
  noiseBuffer() {
    if (!this.noise) {
      const ctx = this.ctx();
      const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
    }
    return this.noise;
  },
  // a burst of noise through a filter, with a fast attack and an exponential decay
  noiseHit(t, { type, f, q = 1, decay, gain }) {
    const ctx = this.ctx();
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    src.connect(flt).connect(g).connect(this.out());
    src.start(t);
    src.stop(t + decay + 0.05);
    this.track(g, [src], t + decay + 0.05);
    return g;
  },
  // a pitched hit: frequency from f0 to f1, amplitude decaying
  toneHit(t, { type, f0, f1, fall, decay, gain }) {
    const ctx = this.ctx();
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + fall);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    o.connect(g).connect(this.out());
    o.start(t);
    o.stop(t + decay + 0.05);
    this.track(g, [o], t + decay + 0.05);
  },

  /* ---------- drums ---------- */
  drum(id, t, vel = 0.9) {
    if (!this.on()) return;
    const ctx = this.ctx();
    t = Math.max(t, ctx.currentTime);
    const v = clamp(vel, 0.05, 1);
    if (id === 'kick') {
      this.toneHit(t, { type: 'sine', f0: 140, f1: 42, fall: 0.11, decay: 0.42, gain: 1.0 * v });
      this.noiseHit(t, { type: 'lowpass', f: 1800, decay: 0.02, gain: 0.25 * v });
    } else if (id === 'snare') {
      this.toneHit(t, { type: 'triangle', f0: 210, f1: 170, fall: 0.06, decay: 0.12, gain: 0.45 * v });
      this.noiseHit(t, { type: 'highpass', f: 1400, decay: 0.2, gain: 0.55 * v });
    } else if (id === 'hat' || id === 'open') {
      if (this.openHat) {
        this.openHat.gain.cancelScheduledValues(t);
        this.openHat.gain.setTargetAtTime(0.0001, t, 0.01);
        this.openHat = null;
      }
      const g = this.noiseHit(t, {
        type: 'highpass',
        f: 7500,
        decay: id === 'open' ? 0.42 : 0.05,
        gain: (id === 'open' ? 0.3 : 0.34) * v,
      });
      if (id === 'open') this.openHat = g;
    } else if (id === 'clap') {
      [0, 0.011, 0.023].forEach(d =>
        this.noiseHit(t + d, { type: 'bandpass', f: 1300, q: 1.4, decay: 0.03, gain: 0.5 * v }),
      );
      this.noiseHit(t + 0.03, { type: 'bandpass', f: 1200, q: 1.1, decay: 0.2, gain: 0.4 * v });
    } else if (id === 'rim') {
      this.toneHit(t, { type: 'triangle', f0: 1700, f1: 1500, fall: 0.02, decay: 0.045, gain: 0.45 * v });
      this.noiseHit(t, { type: 'highpass', f: 3000, decay: 0.025, gain: 0.2 * v });
    }
  },

  /* ---------- keyboard sounds ---------- */
  // start a note at t (or now); returns a handle for stop(). The piano is the app's piano voice, played
  // live here (scheduled piano notes go through play()).
  start(sound, m, vel = 0.7, t) {
    if (!this.on()) return null;
    const ctx = this.ctx();
    t = Math.max(t || 0, ctx.currentTime);
    if (sound === 'piano' || !SOUND_BY[sound]) return { piano: AudioEngine.noteOn(m, vel) };
    const f = freq(m);
    const out = ctx.createGain();
    out.connect(this.out());
    const nodes = [];
    const osc = (type, fr, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = fr;
      o.detune.value = detune;
      nodes.push(o);
      return o;
    };
    let release = 0.1;
    if (sound === 'epiano') {
      // two-operator FM: a bright, bell-like attack that mellows, like a tine piano
      const car = osc('sine', f);
      const mod = osc('sine', f);
      const idx = ctx.createGain();
      idx.gain.setValueAtTime(f * 2.2 * vel, t);
      idx.gain.exponentialRampToValueAtTime(f * 0.25, t + 1.2);
      mod.connect(idx).connect(car.frequency);
      car.connect(out);
      const peak = 0.3 * (0.4 + vel);
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(peak, t + 0.006);
      out.gain.exponentialRampToValueAtTime(peak * 0.3, t + 1.6);
      out.gain.exponentialRampToValueAtTime(0.001, t + 6);
      release = 0.25;
    } else if (sound === 'pad') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.min(4000, 700 + f * 2);
      lp.Q.value = 0.6;
      [-8, 8].forEach(d => osc('sawtooth', f, d).connect(lp));
      osc('sine', f / 2).connect(lp);
      lp.connect(out);
      const peak = 0.11 * (0.5 + vel);
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(peak, t + 0.35);
      release = 0.7;
    } else {
      // bass: saw and square through a closing low-pass
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 4;
      lp.frequency.setValueAtTime(Math.min(3000, f * 8), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(140, f * 2), t + 0.25);
      osc('sawtooth', f).connect(lp);
      osc('square', f, -5).connect(lp);
      lp.connect(out);
      const peak = 0.22 * (0.5 + vel);
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(peak, t + 0.005);
      out.gain.exponentialRampToValueAtTime(peak * 0.6, t + 0.3);
      release = 0.07;
    }
    nodes.forEach(o => o.start(t));
    const h = { out, nodes, release };
    h.v = this.track(out, nodes, Infinity); // until stop() says when it ends
    return h;
  },
  stop(h, t) {
    if (!h || h.stopped) return;
    h.stopped = true;
    const ctx = this.ctx();
    t = Math.max(t || 0, ctx.currentTime);
    if (h.piano !== undefined) return AudioEngine.noteOff(h.piano);
    const g = h.out.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t);
    else g.cancelScheduledValues(t);
    g.setTargetAtTime(0.0001, t, h.release / 3);
    h.nodes.forEach(o => o.stop(t + h.release * 2 + 0.05));
    h.v.end = t + h.release * 2 + 0.05;
  },
  // a note with a known length, scheduled ahead (the loop's playback)
  play(sound, m, t, dur, vel = 0.7) {
    if (sound === 'piano' || !SOUND_BY[sound]) return AudioEngine.note(m, t, dur, vel);
    this.stop(this.start(sound, m, vel, t), t + dur);
  },
};
