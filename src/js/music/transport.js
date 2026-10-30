/* Playing the Jam's loop: a lookahead scheduler (like the metronome's) for clicks, drums and notes, the
   count-in, and recording what you play as a new layer, one pass of the loop at a time. */
import { Log } from '../core/log.js';
import { AudioEngine } from '../core/audio.js';
import { Input } from '../core/input.js';
import { loopBeats, loopEvents, MAX_LAYERS } from './loop.js';
import { Sounds } from './sounds.js';
import { DRUM_BY_GM } from './instruments.js';

const AHEAD = 0.12; // seconds scheduled ahead
const EARLY = 0.2; // a note this much of a beat before the loop starts counts as on the first beat

export const Transport = {
  L: null,
  playing: false,
  start: 0, // audio time of beat 0 of the first pass
  cursor: 0, // beats scheduled so far, counted from start
  countIn: 0, // beats of count-in before beat 0
  timer: 0,
  events: null,
  rec: null, // {pass, notes: [], open: Map, sound}
  armed: null, // the sound to record with, waiting for the next pass
  listeners: new Set(),
  offs: [],

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
  emit(kind, data) {
    this.listeners.forEach(f => {
      try {
        f(kind, data);
      } catch (e) {
        Log.err(e, 'transport listener');
      }
    });
  },
  spb() {
    return 60 / this.L.bpm;
  },
  // the loop's position (in beats since the first pass began) at an audio time
  beatAt(t) {
    return (t - this.start) / this.spb();
  },
  // where you are in the loop now, as heard (for drawing the playhead)
  position() {
    if (!this.playing) return null;
    const ctx = AudioEngine.ctx;
    const lat = ctx.outputLatency || ctx.baseLatency || 0;
    const b = this.beatAt(ctx.currentTime - lat);
    return { beat: b, inLoop: ((b % loopBeats(this.L)) + loopBeats(this.L)) % loopBeats(this.L) };
  },
  changed() {
    this.events = null; // rebuilt at the next scheduling tick
  },
  setTempo(bpm) {
    const L = this.L;
    if (!L) return;
    if (this.playing) {
      // keep the position: re-anchor the start so the current beat stays where it is
      const ctx = AudioEngine.ctx;
      const b = this.beatAt(ctx.currentTime);
      L.bpm = bpm;
      this.start = ctx.currentTime - b * this.spb();
    } else L.bpm = bpm;
  },

  play(L, { countIn = 0 } = {}) {
    const ctx = AudioEngine.ensure();
    this.stop(true);
    this.L = L;
    this.events = null;
    this.countIn = countIn;
    this.start = ctx.currentTime + 0.1 + countIn * this.spb();
    this.cursor = -countIn;
    this.playing = true;
    this.timer = setInterval(() => this.tick(), 25);
    this.offs = [Input.on(ev => this.noteOn(ev)), Input.onOff(ev => this.noteOff(ev))];
    this.tick();
    this.emit('play');
    Log.ev('jam play', { bpm: L.bpm, bars: L.bars, beats: L.beats, layers: L.layers.length, countIn });
  },
  stop(silent) {
    clearInterval(this.timer);
    this.offs.forEach(f => f());
    this.offs = [];
    const was = this.playing;
    this.playing = false;
    if (this.rec) this.finishRecording();
    this.armed = null;
    if (was) {
      AudioEngine.stopAll();
      Sounds.stopAll();
      if (!silent) this.emit('stop');
      Log.ev('jam stop');
    }
  },

  // schedule everything due in the next moment: clicks, drums and notes, across loop passes
  tick() {
    const L = this.L;
    const ctx = AudioEngine.ctx;
    if (!this.playing || !ctx) return;
    if (!this.events) this.events = loopEvents(L);
    const len = loopBeats(L);
    const spb = this.spb();
    const horizon = this.beatAt(ctx.currentTime + (document.hidden ? 1.2 : AHEAD));
    // clicks: during the count-in, and with the loop when the click is on
    for (let b = Math.ceil(this.cursor); b < horizon; b++)
      if (b < 0 || L.click)
        AudioEngine.click(this.start + b * spb, ((b % L.beats) + L.beats) % L.beats === 0, 0.7);
    // the loop's events, pass by pass
    const from = Math.max(0, this.cursor);
    if (horizon > from) {
      for (let pass = Math.floor(from / len); pass * len < horizon; pass++) {
        for (const e of this.events) {
          const at = pass * len + e.b;
          if (at < from - 1e-9 || at >= horizon) continue;
          const t = this.start + at * spb;
          if (e.drum) Sounds.drum(e.drum, t, e.v);
          else Sounds.play(e.sound, e.m, t, e.d * spb, e.v);
        }
      }
    }
    // recording starts and ends at loop boundaries
    const now = this.beatAt(ctx.currentTime);
    if (this.armed && !this.rec && now >= -EARLY) {
      const pass = Math.max(0, Math.ceil((now - EARLY) / len));
      if (pass * len - now <= EARLY) this.beginRecording(pass);
    }
    if (this.rec && now >= (this.rec.pass + 1) * len) this.finishRecording();
    this.cursor = Math.max(this.cursor, horizon);
  },

  /* ---------- recording ---------- */
  // record the next pass of the loop with a sound ('drums' records the drum pads)
  arm(sound) {
    if (this.L.layers.length >= MAX_LAYERS) return false;
    this.armed = sound;
    this.emit('armed', sound);
    return true;
  },
  disarm() {
    this.armed = null;
    if (this.rec) this.rec = null;
    this.emit('disarmed');
  },
  beginRecording(pass) {
    this.rec = { pass, sound: this.armed, notes: [], open: new Map() };
    this.armed = null;
    this.emit('recording', pass);
  },
  // when a note was heard, in the loop's beats: performance time back to audio time, minus output
  // latency, because you play along with what you hear
  beatOfPerf(tPerf) {
    const ctx = AudioEngine.ctx;
    const lat = ctx.outputLatency || ctx.baseLatency || 0;
    return this.beatAt(ctx.currentTime + (tPerf - performance.now()) / 1000 - lat);
  },
  noteOn(ev) {
    if (!this.rec || this.rec.sound === 'drums') return;
    const n = this.capture(ev.m, ev.vel, this.beatOfPerf(ev.t));
    if (n) this.rec.open.set(ev.m, n); // its length comes with the release
  },
  noteOff(ev) {
    if (!this.rec || ev.m == null) return;
    const n = this.rec.open.get(ev.m);
    if (!n) return;
    n.d = Math.max(0.05, this.beatOfPerf(ev.t) - n.abs);
    this.rec.open.delete(ev.m);
  },
  // a drum pad on the screen: it sounds at once, and is recorded while the drums are being recorded
  pad(gm, vel = 0.9) {
    const d = DRUM_BY_GM[gm];
    if (!d) return;
    Sounds.drum(d.id, AudioEngine.ensure().currentTime, vel);
    if (this.playing && this.rec && this.rec.sound === 'drums')
      this.capture(gm, vel, this.beatOfPerf(performance.now()));
  },
  capture(m, vel, abs) {
    const len = loopBeats(this.L);
    const b = abs - this.rec.pass * len;
    if (b < -EARLY || b >= len) return null;
    const n = { b: Math.max(0, b), m, v: Math.round(vel * 100) / 100, d: 0.1, abs };
    this.rec.notes.push(n);
    return n;
  },
  finishRecording() {
    const r = this.rec;
    this.rec = null;
    if (!r) return;
    const len = loopBeats(this.L);
    // notes still held at the end of the pass last until the end of the loop
    r.open.forEach(n => (n.d = Math.max(0.05, Math.min(len - n.b, (r.pass + 1) * len - n.abs))));
    const notes = r.notes.map(({ b, m, d, v }) => ({
      b: Math.round(b * 1000) / 1000,
      m,
      d: Math.round(Math.min(d, len) * 1000) / 1000,
      v,
    }));
    if (!notes.length) {
      this.emit('recorded', null);
      return;
    }
    const layer = {
      id: 'l' + Date.now().toString(36),
      sound: r.sound,
      grid: r.sound === 'pad' ? 'off' : '16',
      mute: false,
      notes,
    };
    this.L.layers.push(layer);
    this.changed();
    Log.ev('jam layer recorded', { sound: layer.sound, notes: notes.length });
    this.emit('recorded', layer);
  },
};
