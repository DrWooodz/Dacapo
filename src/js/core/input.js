/* What you play: MIDI over USB, the microphone (pitch detection) and the on-screen keys.
 * Every source emits the same note events. */
import { Log } from './log.js';
import { $, clamp, toast } from './util.js';
import { Activity, Store } from './store.js';
import { AudioEngine, Metro, Wake } from './audio.js';

export const Input = {
  listeners: new Set(),
  offListeners: new Set(),
  held: new Map(),
  pedal: false,
  mode: 'touch',
  midiAccess: null,
  midiNames: [],
  mic: null,
  status: 'Touch only',
  live: false,
  lastErr: '',
  touchSound: null, // see KeyTouch below
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
  emit(ev) {
    Activity.note(ev);
    Wake.ensure();
    if (ev.src === 'mic')
      this.held.forEach((v, k) => {
        if (v.src === 'mic') this.held.delete(k);
      });
    this.held.set(ev.m, ev);
    this.listeners.forEach(f => {
      try {
        f(ev);
      } catch (e) {
        Log.err(e, 'note listener');
      }
    });
  },
  // releases: {m, t, src}; pedal changes arrive as {pedal:true|false}
  onOff(fn) {
    this.offListeners.add(fn);
    return () => this.offListeners.delete(fn);
  },
  emitOff(ev) {
    if (ev.m != null) this.held.delete(ev.m);
    this.offListeners.forEach(f => {
      try {
        f(ev);
      } catch (e) {
        Log.err(e, 'release listener');
      }
    });
  },
  // ev: {m, vel, t (performance ms, latency-corrected), src}
  async setMode(mode) {
    Log.ev('input mode ' + mode);
    this.stopMic();
    this.mode = mode;
    Store.s.settings.input = mode;
    Store.save();
    this.lastErr = '';
    if (mode === 'midi') await this.startMidi();
    else if (mode === 'mic') await this.startMic();
    else {
      this.live = false;
      this.status = 'Touch only';
    }
    this.paint();
  },
  paint() {
    const label =
      this.mode === 'midi'
        ? this.live
          ? 'Piano'
          : 'Connect'
        : this.mode === 'mic'
          ? this.live
            ? 'Listening'
            : 'Mic off'
          : 'Connect';
    const t = $('#inputChipTxt');
    if (t) t.textContent = label;
    const d = $('#inputDot');
    if (d) d.classList.toggle('live', this.live);
    const c = $('#inputChip');
    if (c) {
      c.classList.toggle('on', this.live);
      c.title = this.status;
    }
    Store.emit('input');
  },
  /* ---- MIDI ---- */
  async startMidi() {
    this.live = false;
    if (!navigator.requestMIDIAccess) {
      this.lastErr =
        'This browser has no Web MIDI. Use Chrome or Edge on a computer or Android, with the offline copy of this app.';
      this.status = 'Unavailable';
      return;
    }
    try {
      // one MIDI access for the life of the page: asking again (Connect, or switching modes) would bind the
      // same keyboard twice and every note would arrive twice
      this.midiAccess = this.midiAccess || (await navigator.requestMIDIAccess({ sysex: false }));
      const bind = () => {
        this.midiNames = [];
        this.midiAccess.inputs.forEach(inp => {
          if (inp.state === 'disconnected') return;
          this.midiNames.push(inp.name);
          inp.onmidimessage = e => this.onMidi(e);
        });
        this.live = this.midiNames.length > 0;
        // keys held when the cable came out will never send their release
        if (!this.live) this.held.forEach((ev, m) => ev.src === 'midi' && this.held.delete(m));
        this.status = this.live
          ? this.midiNames.join(', ')
          : 'No MIDI keyboard found. Plug it in by USB, then reopen this panel.';
        this.paint();
      };
      bind();
      MidiOut.pick(this.midiAccess);
      Log.ev('midi ready', { inputs: this.midiNames, output: MidiOut.port && MidiOut.port.name });
      this.midiAccess.onstatechange = e => {
        const was = this.live;
        bind();
        MidiOut.pick(this.midiAccess);
        Log.ev('midi state change', {
          port: e && e.port && e.port.name,
          state: e && e.port && e.port.state,
          live: this.live,
        });
        if (was !== this.live) toast(this.live ? 'Piano connected' : 'Piano disconnected', 1800);
      };
    } catch (e) {
      this.lastErr =
        'MIDI access was refused in this view. Open the hosted copy in Chrome or Edge to use your keyboard.';
      this.status = 'Refused';
      Log.warn('midi refused', String((e && e.message) || e));
    }
  },
  onMidi(e) {
    Log.midiMsg(e.data, e.timeStamp);
    if (this.mode !== 'midi') return; // the keyboard stays bound while another input is chosen
    const [st, d1, d2] = e.data;
    const cmd = st & 0xf0;
    const t = e.timeStamp - (Store.s.settings.midiLatency || 0);
    if ((st & 0x0f) === 9) return; // percussion channel (our own metronome clicks, if echoed)
    if (cmd === 0x90 && d2 > 0) {
      const r = MidiOut.recent.get(d1);
      if (r && Math.abs(e.timeStamp - r) < 60) return;
      this.emit({ m: d1, vel: d2 / 127, t, src: 'midi' });
    } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) this.emitOff({ m: d1, t, src: 'midi' });
    else if (cmd === 0xb0 && d1 === 64) {
      const on = d2 >= 64;
      if (on !== this.pedal) {
        this.pedal = on;
        this.emitOff({ pedal: on, t, src: 'midi' });
      }
    }
  },
  /* ---- microphone (monophonic YIN) ---- */
  async startMic() {
    this.live = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.lastErr = 'No microphone API in this view.';
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const ctx = AudioEngine.ensure();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0;
      src.connect(an);
      this.mic = {
        stream,
        src,
        an,
        buf: new Float32Array(an.fftSize),
        cand: null,
        count: 0,
        candT: 0,
        lastEmit: null,
        minRms: 1,
        quiet: 0,
        rms: 0,
        f0: 0,
        raf: 0,
        frame: 0,
        noise: 0.004,
      };
      this.live = true;
      this.status = 'Microphone on. Single notes are detected; chords are not.';
      Log.ev('mic on');
      const loop = () => {
        if (!this.mic) return;
        this.micFrame();
        this.mic.raf = requestAnimationFrame(loop);
      };
      this.mic.raf = requestAnimationFrame(loop);
    } catch (e) {
      this.lastErr =
        'Microphone access was refused in this view. Open the hosted copy of the app in your own browser to use listening.';
      this.status = 'Refused';
      Log.warn('mic refused', String((e && e.message) || e));
    }
  },
  stopMic() {
    if (!this.mic) return;
    cancelAnimationFrame(this.mic.raf);
    try {
      this.mic.stream.getTracks().forEach(t => t.stop());
      this.mic.src.disconnect();
    } catch (e) {}
    this.mic = null;
    this.live = false;
  },
  micFrame() {
    const M = this.mic;
    M.frame++;
    if (M.frame % 2) return; // ~30 analyses/s keeps phones cool
    M.an.getFloatTimeDomainData(M.buf);
    let rms = 0;
    for (let i = 0; i < M.buf.length; i++) rms += M.buf[i] * M.buf[i];
    rms = Math.sqrt(rms / M.buf.length);
    M.rms = rms;
    const gate = Math.max(0.012, M.noise * 3);
    const now = performance.now();
    if (rms < gate) {
      M.quiet++;
      if (M.quiet > 4) {
        if (M.lastEmit != null) this.emitOff({ m: M.lastEmit, t: performance.now(), src: 'mic' });
        M.lastEmit = null;
        M.cand = null;
        M.count = 0;
      }
      M.noise = M.noise * 0.98 + rms * 0.02;
      M.minRms = Math.min(M.minRms, rms);
      return;
    }
    M.quiet = 0;
    const r = yin(M.buf, AudioEngine.ctx.sampleRate);
    if (!r || r.clarity < 0.82 || r.f < 26 || r.f > 4300) {
      M.minRms = Math.min(M.minRms, rms);
      return;
    }
    M.f0 = r.f;
    const m = Math.round(69 + 12 * Math.log2(r.f / 440));
    if (m >= 85 && m <= 94 && Metro.nearClick(now - 30)) return; // ignore the metronome's own click
    if (m === M.cand) M.count++;
    else {
      M.cand = m;
      M.count = 1;
      M.candT = now;
    }
    const restrike = M.lastEmit === m && rms > M.minRms * 1.9 && rms > gate * 1.5;
    if (M.count === 2 && (M.lastEmit !== m || restrike)) {
      M.lastEmit = m;
      M.minRms = rms;
      this.emit({
        m,
        vel: clamp(rms * 6, 0.1, 1),
        t: M.candT - 33 - (Store.s.settings.micLatency || 0),
        src: 'mic',
      });
    } else if (M.count > 2 && restrike) {
      M.minRms = rms;
      this.emit({
        m,
        vel: clamp(rms * 6, 0.1, 1),
        t: now - 33 - (Store.s.settings.micLatency || 0),
        src: 'mic',
      });
    } else M.minRms = Math.min(M.minRms * 1.0, rms);
  },
};

function yin(buf, sr) {
  const N = buf.length,
    half = N >> 1,
    thr = 0.12;
  const tauMin = Math.floor(sr / 4300),
    tauMax = Math.min(half - 1, Math.floor(sr / 26));
  const d = new Float32Array(tauMax + 2);
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let s = 0;
    for (let i = 0; i < half; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }
  d[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    run += d[tau];
    d[tau] = run ? (d[tau] * tau) / run : 1;
  }
  let tau = -1;
  for (let t = Math.max(2, tauMin); t <= tauMax; t++) {
    if (d[t] < thr) {
      while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // fall back to global min if reasonably clear
    let best = 1,
      bt = -1;
    for (let t = Math.max(2, tauMin); t <= tauMax; t++)
      if (d[t] < best) {
        best = d[t];
        bt = t;
      }
    if (best > 0.25) return null;
    tau = bt;
  }
  const a = d[tau - 1],
    b = d[tau],
    c = d[tau + 1] ?? b;
  const den = a + c - 2 * b;
  const shift = den ? (a - c) / (2 * den) : 0;
  return { f: sr / (tau + shift), clarity: 1 - b };
}

// compare pitch with octave tolerance in mic mode
export function sameNote(played, expected, src) {
  if (played === expected) return true;
  return src === 'mic' && Store.s.settings.octaveTolerant && (played - expected) % 12 === 0;
}

/* ---------- MIDI out: let the app's examples and clicks sound on the piano itself ---------- */
export const MidiOut = {
  port: null,
  recent: new Map(),
  active() {
    return !!(this.port && Store.s.settings.midiOut && Input.mode === 'midi' && Input.live);
  },
  pick(access) {
    let best = null;
    access.outputs.forEach(o => {
      if (!best || Input.midiNames.includes(o.name)) best = o;
    });
    this.port = best;
  },
  send(bytes, at) {
    try {
      if (at && at > performance.now()) this.port.send(bytes, at);
      else this.port.send(bytes);
    } catch (e) {}
  },
  noteOn(m, vel = 0.6, at, ch = 0) {
    this.send([0x90 | ch, m, clamp(Math.round(vel * 127), 1, 127)], at);
    if (ch === 0) this.recent.set(m, at || performance.now());
  },
  noteOff(m, at, ch = 0) {
    this.send([0x80 | ch, m, 0], at);
  },
  panic() {
    if (this.port) for (let ch = 0; ch < 16; ch++) this.send([0xb0 | ch, 123, 0]);
  },
};

window.addEventListener('pagehide', () => MidiOut.panic());

/* ---------- on-screen keyboard: multi-touch, held notes, glissando ---------- */
const KeyTouch = {
  held: new Map(), // pointerId -> {m, v, el}
  keyAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.closest ? el.closest('svg.kb[data-play] [data-m]') : null;
  },
  press(id, el) {
    const m = +el.dataset.m;
    el.classList.add('down');
    // a screen can choose the sound of its keys (Input.touchSound: {on(m, vel), off(handle)})
    const sound = Input.touchSound || {
      on: (k, vel) => AudioEngine.noteOn(k, vel),
      off: v => AudioEngine.noteOff(v),
    };
    const v = sound.on(m, 0.62);
    this.held.set(id, { m, v, el, off: sound.off });
    Input.emit({ m, vel: 0.62, t: performance.now(), src: 'touch' });
  },
  lift(id) {
    const h = this.held.get(id);
    if (!h) return;
    this.held.delete(id);
    h.off(h.v);
    h.el.classList.remove('down');
    Input.emitOff({ m: h.m, t: performance.now(), src: 'touch' });
  },
};

// warm up audio on the very first touch anywhere, so the first key isn't late
document.addEventListener(
  'pointerdown',
  () => {
    if (!AudioEngine.ctx || AudioEngine.ctx.state !== 'running') AudioEngine.ensure();
  },
  { capture: true },
);

document.addEventListener(
  'pointerdown',
  e => {
    const k = e.target.closest && e.target.closest('svg.kb[data-play] [data-m]');
    if (!k) return;
    e.preventDefault();
    try {
      e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId);
    } catch (err) {}
    KeyTouch.lift(e.pointerId);
    KeyTouch.press(e.pointerId, k);
  },
  { passive: false },
);

document.addEventListener(
  'pointermove',
  e => {
    const h = KeyTouch.held.get(e.pointerId);
    if (!h) return;
    const k = KeyTouch.keyAt(e.clientX, e.clientY);
    if (!k) {
      KeyTouch.lift(e.pointerId);
      return;
    }
    if (+k.dataset.m !== h.m) {
      KeyTouch.lift(e.pointerId);
      KeyTouch.press(e.pointerId, k);
    } // slide to the next key
  },
  { passive: true },
);

['pointerup', 'pointercancel'].forEach(t =>
  document.addEventListener(t, e => KeyTouch.lift(e.pointerId), { passive: true }),
);

document.addEventListener('contextmenu', e => {
  if (e.target.closest && e.target.closest('svg.kb[data-play]')) e.preventDefault();
});
