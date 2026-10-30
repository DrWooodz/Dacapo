/* Sound: a soft piano-like synth, the metronome (lookahead scheduler) and the screen wake lock. */
import { Log } from './log.js';
import { clamp } from './util.js';
import { Store } from './store.js';
import { MidiOut } from './input.js';

/* ---------- keep the screen on while practicing (phone next to the piano) ---------- */
export const Wake = {
  lock: null,
  lastUse: Date.now(),
  async ensure() {
    this.lastUse = Date.now();
    if (
      this.lock ||
      !Store.s.settings.keepAwake ||
      document.visibilityState !== 'visible' ||
      !navigator.wakeLock
    )
      return;
    try {
      this.lock = await navigator.wakeLock.request('screen');
      this.lock.addEventListener('release', () => {
        this.lock = null;
      });
    } catch (e) {
      /* not allowed here */
    }
  },
  release() {
    if (this.lock) {
      this.lock.release().catch(() => {});
      this.lock = null;
    }
  },
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - Wake.lastUse < 20 * 60000) Wake.ensure();
});

setInterval(() => {
  if (Wake.lock && Date.now() - Wake.lastUse > 20 * 60000 && !Metro.running) Wake.release();
}, 60000);

/* ---------- audio: soft piano-ish synth ---------- */
export const AudioEngine = {
  ctx: null,
  master: null,
  comp: null,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 3;
      this.master = this.ctx.createGain();
      this.master.gain.value = Store.s.settings.volume ?? 0.8;
      this.master.connect(this.comp).connect(this.ctx.destination);
      Log.ev('audio context created', { state: this.ctx.state, sr: this.ctx.sampleRate });
      this.ctx.onstatechange = () => Log.ev('audio ' + this.ctx.state);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  now() {
    return this.ensure().currentTime;
  },
  voices: [],
  MAX_VOICES: 14,
  // one piano-ish voice with a natural decay; returns a handle that can be released early
  voice(midi, t, vel) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.voices = this.voices.filter(v => v.end > now);
    // steal the oldest sounding voices when too many ring at once; notes scheduled for later are left alone
    const sounding = this.voices.filter(v => v.start <= now + 0.02);
    for (let i = 0; sounding.length - i >= this.MAX_VOICES; i++) {
      const old = sounding[i];
      this.release(old, 0.02);
      this.voices.splice(this.voices.indexOf(old), 1);
    }
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const decay = clamp(3.2 - (midi - 40) * 0.035, 0.7, 3.4);
    const out = ctx.createGain();
    out.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(16000, f * (5 + vel * 9)), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.5, 300), t + decay);
    lp.connect(out);
    out.connect(this.master);
    const oscs = [
      [1, 1, 'triangle'],
      [2, 0.35, 'sine'],
      [3, 0.12, 'sine'],
    ].map(([mul, g, type]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      o.detune.value = (Math.random() - 0.5) * 4;
      const gg = ctx.createGain();
      gg.gain.value = g;
      o.connect(gg).connect(lp);
      o.start(t);
      return o;
    });
    const peak = 0.22 * (0.35 + vel);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(peak, t + 0.004);
    out.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.25);
    out.gain.exponentialRampToValueAtTime(0.0008, t + decay);
    const v = { out, oscs, end: t + decay + 0.1, midi, start: t };
    oscs.forEach(o => o.stop(v.end + 0.05));
    this.voices.push(v);
    return v;
  },
  release(v, tau = 0.06, at) {
    if (!v || v.released) return;
    v.released = true;
    if (v.start > this.ctx.currentTime + 0.02 && at == null) return;
    const ctx = this.ctx;
    const t = Math.max(at ?? ctx.currentTime, ctx.currentTime);
    const g = v.out.gain;
    if (at == null || at <= ctx.currentTime) {
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t);
      else {
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
      }
    }
    g.setTargetAtTime(0.0001, t, tau);
    const stopAt = t + tau * 7;
    v.end = Math.min(v.end, stopAt);
    v.oscs.forEach(o => {
      try {
        o.stop(stopAt);
      } catch (e) {}
    });
  },
  rawPerf(t) {
    return performance.now() + (t - this.ctx.currentTime) * 1000;
  }, // audio clock → performance.now(), no output latency (for MIDI)
  note(midi, when = 0, dur = 1.2, vel = 0.65) {
    if (!Store.s.settings.sound) return;
    const ctx = this.ensure();
    const t = Math.max(ctx.currentTime, when || ctx.currentTime);
    if (MidiOut.active()) {
      const at = this.rawPerf(t);
      MidiOut.noteOn(midi, vel, at);
      MidiOut.noteOff(midi, at + dur * 1000);
      return;
    }
    const v = this.voice(midi, t, vel);
    this.release(v, 0.08, t + dur);
    v.released = false; // allow stealing to cut it early
  },
  // live playing: sound starts now and lasts while the key is held
  noteOn(midi, vel = 0.62) {
    if (!Store.s.settings.sound) return null;
    if (MidiOut.active()) {
      MidiOut.noteOn(midi, vel);
      return { mo: midi };
    }
    const ctx = this.ensure();
    return this.voice(midi, ctx.currentTime, vel);
  },
  noteOff(v) {
    if (!v) return;
    if (v.mo != null) {
      MidiOut.noteOff(v.mo);
      return;
    }
    this.release(v, 0.07);
  },
  stopAll() {
    // silence everything, including notes scheduled for later
    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.voices.forEach(v => {
        try {
          v.out.gain.cancelScheduledValues(0);
          v.out.gain.setValueAtTime(0, now);
          v.oscs.forEach(o => o.stop(now + 0.01));
        } catch (e) {}
      });
      this.voices = [];
    }
    MidiOut.panic();
  },
  chord(midis, when = 0, dur = 1.6, vel = 0.55) {
    midis.forEach(m => this.note(m, when, dur, vel));
  },
  seq(midis, gap = 0.45, dur = 0.9, vel = 0.6) {
    const t = this.now() + 0.05;
    midis.forEach((m, i) =>
      Array.isArray(m) ? this.chord(m, t + i * gap, dur, vel) : this.note(m, t + i * gap, dur, vel),
    );
    return t;
  },
  click(when, accent, vol = 1) {
    const ctx = this.ensure();
    if (Store.s.settings.clickOnPiano && MidiOut.active()) {
      const at = this.rawPerf(when);
      MidiOut.noteOn(accent ? 76 : 77, clamp(vol * (accent ? 0.9 : 0.6), 0.1, 1), at, 9);
      MidiOut.noteOff(accent ? 76 : 77, at + 80, 9);
      return;
    }
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = accent ? 1760 : 1175;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = accent ? 2400 : 1700;
    bp.Q.value = 3;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime((accent ? 0.5 : 0.3) * vol, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
    o.connect(bp).connect(g).connect(this.master);
    o.start(when);
    o.stop(when + 0.06);
  },
  chime() {
    const t = this.now() + 0.02;
    [84, 88, 91].forEach((m, i) => this.note(m, t + i * 0.12, 1.4, 0.35));
  },
  // map audio-clock seconds to performance.now() ms, incl. output latency
  toPerf(audioTime) {
    const ctx = this.ensure();
    const lat = ctx.outputLatency || ctx.baseLatency || 0;
    return performance.now() + (audioTime - ctx.currentTime + lat) * 1000;
  },
};

/* ---------- metronome with lookahead scheduler ---------- */
export const Metro = {
  bpm: 60,
  beats: 4,
  sub: 1,
  vol: 0.8,
  clicks: [],
  groups: [],
  nearClick(t) {
    return this.running && this.clicks.some(c => Math.abs(t - c) < 70);
  },
  running: false,
  nextTime: 0,
  beatIdx: 0,
  subIdx: 0,
  timer: null,
  startAudio: 0,
  queue: [],
  listeners: new Set(),
  countIn: 0,
  raf: 0,
  set(o) {
    Object.assign(this, o);
    this.bpm = clamp(Math.round(this.bpm), 20, 260);
    this.emit('set');
  },
  start(opts = {}) {
    const ctx = AudioEngine.ensure();
    this.stop(true);
    if (opts.bpm) this.bpm = opts.bpm;
    if (opts.beats) this.beats = opts.beats;
    if (opts.sub) this.sub = opts.sub;
    this.groups =
      opts.groups ||
      (this.beats === 6 ? [3] : this.beats === 9 ? [3, 6] : this.beats === 12 ? [3, 6, 9] : []);
    this.countIn = opts.countIn || 0;
    this.running = true;
    this.beatIdx = 0;
    this.subIdx = 0;
    this.nextTime = Math.max(ctx.currentTime + 0.02, opts.at || ctx.currentTime + 0.12);
    this.startAudio = this.nextTime;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
    const loop = () => {
      this.drawTick();
      if (this.running) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.emit('start');
    Log.ev('metronome start', { bpm: this.bpm, beats: this.beats, countIn: this.countIn });
    // audio time of the first "real" downbeat, after the count-in
    return this.startAudio + (this.countIn * this.beats * 60) / this.bpm;
  },
  stop(silent) {
    const was = this.running;
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.running = false;
    this.queue = [];
    if (!silent) this.emit('stop');
    if (was) Log.ev('metronome stop');
  },
  toggle() {
    this.running ? this.stop() : this.start();
  },
  schedule() {
    const ctx = AudioEngine.ctx;
    const spb = 60 / this.bpm;
    const ahead = document.hidden ? 1.2 : 0.12; // timers are throttled in background tabs
    while (this.nextTime < ctx.currentTime + ahead) {
      const pos = this.beatIdx % this.beats;
      const accent = this.subIdx === 0 && (pos === 0 || this.groups.includes(pos));
      if (this.subIdx === 0) {
        this.clicks.push(AudioEngine.toPerf(this.nextTime));
        if (this.clicks.length > 16) this.clicks.shift();
      }
      if (this.subIdx === 0)
        AudioEngine.click(this.nextTime, accent, this.vol * (accent && pos !== 0 ? 0.75 : 1));
      else AudioEngine.click(this.nextTime, false, this.vol * 0.35);
      if (this.subIdx === 0)
        this.queue.push({ t: this.nextTime, beat: this.beatIdx % this.beats, idx: this.beatIdx });
      this.subIdx++;
      if (this.subIdx >= this.sub) {
        this.subIdx = 0;
        this.beatIdx++;
      }
      this.nextTime += spb / this.sub;
    }
  },
  drawTick() {
    const now = AudioEngine.ctx.currentTime;
    while (this.queue.length && this.queue[0].t <= now) {
      const q = this.queue.shift();
      this.emit('beat', q);
    }
  },
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
  emit(kind, data) {
    this.listeners.forEach(f => {
      try {
        f(kind, data);
      } catch (e) {
        Log.err(e, 'metronome listener');
      }
    });
  },
  taps: [],
  tap() {
    const now = performance.now();
    this.taps = this.taps.filter(t => now - t < 2500);
    this.taps.push(now);
    if (this.taps.length >= 3) {
      const d = (this.taps[this.taps.length - 1] - this.taps[0]) / (this.taps.length - 1);
      this.set({ bpm: 60000 / d });
      if (this.running) this.start();
    }
  },
};
