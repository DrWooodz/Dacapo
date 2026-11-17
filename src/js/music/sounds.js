/* A few keyboard sounds, synthesized so there is nothing to download (listed in instruments.js): the
   backing, and your piano played through this device. The piano is the app's own piano voice, which plays on your piano
   when "Sound on the piano" is set. */
import { Store } from '../core/store.js';
import { AudioEngine } from '../core/audio.js';
import { SOUND_BY } from './instruments.js';

const freq = m => 440 * Math.pow(2, (m - 69) / 12);

export const Sounds = {
  noise: null,
  active: [], // everything sounding or scheduled: {gain, nodes, end}, so Stop can silence it at once
  track(gain, nodes, end) {
    const now = this.ctx().currentTime;
    this.active = this.active.filter(v => v.end > now);
    const v = { gain, nodes, end };
    this.active.push(v);
    return v;
  },
  // silence everything playing or scheduled
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
    } else if (sound === 'harp') {
      // plucked: a bright attack through a closing low-pass, ringing on for a few seconds
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(Math.min(6000, f * 10), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 2.5), t + 0.6);
      osc('triangle', f).connect(lp);
      const h2 = ctx.createGain();
      h2.gain.value = 0.25;
      osc('sine', f * 2)
        .connect(h2)
        .connect(lp);
      lp.connect(out);
      const peak = 0.28 * (0.4 + vel);
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(peak, t + 0.003);
      out.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.5);
      out.gain.exponentialRampToValueAtTime(0.001, t + Math.max(1.5, 4.5 - (m - 48) / 12));
      release = 0.6;
    } else if (sound === 'flute') {
      // a soft sine with a little breath, and a gentle vibrato that sets in once the note is held
      const tone = osc('sine', f);
      const tri = ctx.createGain();
      tri.gain.value = 0.12;
      osc('triangle', f * 2)
        .connect(tri)
        .connect(out);
      const lfo = osc('sine', 5.2);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(f * 0.006, t + 0.6);
      lfo.connect(depth).connect(tone.frequency);
      tone.connect(out);
      const breath = ctx.createBufferSource();
      breath.buffer = this.noiseBuffer();
      breath.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = Math.min(8000, f * 2);
      bp.Q.value = 2;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.05 * vel, t);
      bg.gain.exponentialRampToValueAtTime(0.008, t + 0.25);
      breath.connect(bp).connect(bg).connect(out);
      nodes.push(breath);
      const peak = 0.2 * (0.5 + vel);
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(peak, t + 0.06);
      release = 0.12;
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
};
