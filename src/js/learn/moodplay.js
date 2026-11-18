/* Play's listening and backing, without the screen. With a mood chosen, it plays a backing (a held drone,
   or one of the mood's progressions with a bass) and listens: notes outside the scale and whether they
   resolved by a step, the color note, chord tones on the strong beats, motifs that came back, thirds and
   sixths, call and response, and what the left hand did against a pattern. Nothing is scored. The view
   (views/play.js) draws it; onChange tells it something moved (a new chord, new counts). */
import { Log } from '../core/log.js';
import { AudioEngine } from '../core/audio.js';
import { Input } from '../core/input.js';
import { midiOf, spellerFor } from '../music/theory.js';
import {
  callPhrase,
  colorNote,
  degreeOf,
  dyadKind,
  judgeAnswer,
  LH_KINDS,
  lhKind,
  lhVoicing,
  motifEcho,
  patternBar,
  pc12,
} from '../music/moodtools.js';
import { detectChord } from '../music/harmony.js';
import { CHORD_TONES, MOOD_BY, moodScale, moodSig, voiceProgression } from '../music/moods.js';
import { Sounds } from '../music/sounds.js';

const SPLIT = 60; // below middle C is the left hand
const TOGETHER = 50; // ms: notes this close are one gesture (a chord, a dyad)
const blankStats = () => ({
  ms: 0,
  notes: 0,
  outside: 0, // notes outside the scale
  resolved: 0, // ...followed by a step into the scale
  pedalMs: 0,
  lh: Object.fromEntries(['n', 'fit', ...LH_KINDS].map(k => [k, 0])),
  rh: {
    color: 0,
    resolved: 0,
    strong: 0,
    onChord: 0,
    sequences: 0,
    repeats: 0,
    thirds: 0,
    sixths: 0,
    calls: 0,
    answers: 0,
    home: 0,
  },
});

// the sitting so far, across moods (for the read-back afterwards: learn/journal.js)
const blankTally = () => ({ ms: 0, notes: 0, lh: 0, pedalMs: 0, lo: 108, hi: 21, chords: {}, moods: {} });

export function createCompanion({ onChange = () => {} } = {}) {
  const st = {
    mood: null,
    pc: 0,
    backing: 'off',
    prog: 0,
    song: null, // a tune whose chords the backing plays instead: {id, t, chords: [[s, type, beats, b0, name]]}
    bpm: 72,
    pattern: 'fifth',
    bars: [], // the backing's bars as they sound: {t (performance ms), i (chord)}
    nextBar: 0,
    bar: 0,
    held: [], // the drone's sounding notes
    call: null, // {from, until (performance ms), ms: the answer so far}
    lastAnswer: null,
  };
  let S = blankStats();
  let T = blankTally();
  let lastChord = { name: '', t: 0 };
  const inMood = () =>
    K ? (T.moods[st.mood + ':' + st.pc] ||= { ms: 0, notes: 0, outside: 0, resolved: 0, color: 0 }) : null;
  // the chord your hands hold (three or more notes sounding together), counted once per change
  const countChord = t => {
    const ms = [...Input.held.keys()];
    if (new Set(ms.map(pc12)).size < 3) return;
    const c = detectChord(ms, spellerFor(K ? moodSig(st.mood, st.pc) : 0));
    if (!c || c.root == null) return;
    if (c.name === lastChord.name && t - lastChord.t < 4000) return;
    lastChord = { name: c.name, t };
    const x = (T.chords[c.name] ||= { n: 0, root: c.root, type: c.type });
    x.n++;
  };
  let lastNote = 0;
  let lastTick = performance.now();
  let lhGroup = null;
  let rhGroup = null;
  let degrees = [];
  const lastIn = { rh: null, lh: null }; // the previous note of each hand: {m, outside}
  const timers = [];
  let K = null; // the chosen mood in its key: {M, tonic, tPc, scalePcs, color}

  const prog = () => (st.song ? st.song.chords : K.M.progs[st.prog].chords);
  const beatsOf = i => (st.song ? st.song.chords[i][2] : 4);
  const voiced = () => voiceProgression(st.mood, st.pc, prog());
  const lhVoiced = () => lhVoicing(st.mood, st.pc, prog());
  // the chord sounding at a moment (performance ms): the backing's when it plays, else the home chord
  const chordAt = t => {
    if (!K) return null;
    if (st.backing !== 'chords' || !st.bars.length) return { i: 0, beat: null, ...chordOf(0) };
    let b = st.bars[0];
    for (const x of st.bars) if (x.t <= t + 80) b = x;
    const b0 = st.song ? st.song.chords[b.i][3] : 0; // (a tune's chord can start mid-bar)
    return { i: b.i, beat: b0 + (t - b.t) / (60000 / st.bpm), ...chordOf(b.i) };
  };
  function chordOf(i) {
    const [s, type, , , name] = prog()[i];
    return { rootPc: pc12(K.tonic + s), type, name };
  }

  /* ---------- the backing: a pad that holds, a bass that plays ---------- */
  const stopSound = () => {
    st.held.forEach(h => Sounds.stop(h));
    st.held = [];
    Sounds.stopAll();
    timers.splice(0).forEach(clearTimeout);
  };
  const playBar = (t, i) => {
    const v = voiced()[i];
    const spb = 60 / st.bpm;
    const beats = beatsOf(i);
    v.right.forEach(m => {
      const h = Sounds.start('pad', m, 0.5, t);
      if (h) Sounds.stop(h, t + spb * beats - 0.05);
    });
    // the bass on beats 1 and 3 of a 4/4 bar; once for a shorter chord
    (beats >= 4 ? [0, 2] : [0]).forEach(b => {
      const h = Sounds.start('bass', v.root, b ? 0.45 : 0.6, t + b * spb);
      if (h) Sounds.stop(h, t + (b + Math.min(1.7, beats - 0.3)) * spb);
    });
  };
  const schedule = () => {
    if (!K || st.backing !== 'chords') return;
    const now = AudioEngine.now();
    while (st.nextBar < now + 0.3) {
      const at = Math.max(now, st.nextBar);
      const i = st.bar % prog().length;
      const bar = (60 / st.bpm) * beatsOf(i);
      playBar(at, i);
      st.bars.push({ t: AudioEngine.toPerf(at), i });
      if (st.bars.length > 16) st.bars.shift();
      timers.push(setTimeout(() => onChange('chord'), Math.max(0, (at - now) * 1000)));
      st.nextBar = at + bar;
      st.bar++;
    }
  };
  const restartBacking = () => {
    stopSound();
    st.bars = [];
    st.bar = 0;
    if (!K) return;
    if (st.backing !== 'off') AudioEngine.ensure();
    st.nextBar = AudioEngine.now() + 0.1;
    if (st.backing === 'drone') {
      // home and its fifth, held, in the middle of the piano where any speaker can play them
      const r = 48 + pc12(K.tPc - 48);
      st.held = [r, r + 7, r + 12].map(m => Sounds.start('pad', m, 0.55)).filter(Boolean);
    }
    onChange('chord');
  };

  /* ---------- listening ---------- */
  const countLh = g => {
    const c = chordAt(g.t);
    if (!c) return;
    S.lh.n++;
    S.lh[lhKind(g.ms, c.rootPc, c.type, K.tPc)]++;
    const want = new Set(patternBar(st.pattern, lhVoiced(), c.i, K.tPc).flatMap(x => x.ms.map(pc12)));
    if (g.ms.every(m => want.has(pc12(m)))) S.lh.fit++;
  };
  const countRh = g => {
    const d = dyadKind(g.ms);
    if (d === 'third') S.rh.thirds++;
    if (d === 'sixth') S.rh.sixths++;
  };
  const onNote = ev => {
    if (ev.m == null) return;
    const t = ev.t || performance.now();
    lastNote = performance.now();
    T.notes++;
    if (ev.m < SPLIT) T.lh++;
    T.lo = Math.min(T.lo, ev.m);
    T.hi = Math.max(T.hi, ev.m);
    clearTimeout(chordT);
    chordT = setTimeout(() => countChord(t), 120);
    if (!K) return;
    S.notes++;
    const B = inMood();
    B.notes++;
    if (pc12(ev.m) === K.color.pc) B.color++; // (either hand, for the read-back)
    const hand = ev.m < SPLIT ? 'lh' : 'rh';
    // a note outside the scale, and whether the same hand stepped from it into the scale
    const outside = !K.scalePcs.has(pc12(ev.m));
    const prev = lastIn[hand];
    if (prev && prev.outside && !outside && Math.abs(ev.m - prev.m) <= 2) (S.resolved++, B.resolved++);
    if (outside) (S.outside++, B.outside++);
    lastIn[hand] = { m: ev.m, outside };
    if (hand === 'lh') {
      if (lhGroup && t - lhGroup.t < TOGETHER) lhGroup.ms.push(ev.m);
      else {
        if (lhGroup) countLh(lhGroup);
        lhGroup = { t, ms: [ev.m] };
      }
      return;
    }
    if (rhGroup && t - rhGroup.t < TOGETHER) rhGroup.ms.push(ev.m);
    else {
      if (rhGroup) countRh(rhGroup);
      rhGroup = { t, ms: [ev.m] };
    }
    if (prev && pc12(prev.m) === K.color.pc && Math.abs(ev.m - prev.m) <= 2 && ev.m !== prev.m)
      S.rh.resolved++;
    if (pc12(ev.m) === K.color.pc) S.rh.color++;
    const c = chordAt(t);
    if (c && c.beat != null) {
      const off = Math.abs(c.beat % 2 < 1 ? c.beat % 2 : (c.beat % 2) - 2); // distance to beat 1 or 3
      if (off < 0.25) {
        S.rh.strong++;
        if (CHORD_TONES[c.type].some(x => pc12(c.rootPc + x) === pc12(ev.m))) S.rh.onChord++;
      }
    }
    const deg = degreeOf(ev.m, K.M.semis, K.tPc);
    if (deg != null) {
      degrees.push(deg);
      if (degrees.length > 16) degrees.shift();
      const echo = motifEcho(degrees);
      if (echo) {
        S.rh[echo === 'sequence' ? 'sequences' : 'repeats']++;
        degrees = degrees.slice(-3); // count each return once
      }
    }
    if (st.call && t >= st.call.from - 150) st.call.ms.push(ev.m);
  };
  let chordT = 0;
  const offInput = Input.on(onNote);

  const tick = setInterval(
    Log.guard('companion tick', () => {
      const now = performance.now();
      const dt = now - lastTick;
      lastTick = now;
      // time counts while you play (a note in the last four seconds)
      if (now - lastNote < 4000) {
        S.ms += dt;
        T.ms += dt;
        if (K) inMood().ms += dt;
        if (Input.pedal) ((S.pedalMs += dt), (T.pedalMs += dt));
      }
      // a gesture is over once nothing joins it
      if (lhGroup && now - lhGroup.t > 200) (countLh(lhGroup), (lhGroup = null));
      if (rhGroup && now - rhGroup.t > 200) (countRh(rhGroup), (rhGroup = null));
      if (st.call && now > st.call.until) {
        const a = judgeAnswer(st.call.ms, K.M.semis, K.tPc);
        st.call = null;
        if (a.n) S.rh.answers++;
        if (a.home) S.rh.home++;
        st.lastAnswer = a;
        onChange('answer');
      }
      schedule();
      onChange('tick');
    }),
    250,
  );

  return {
    st,
    get stats() {
      return S;
    },
    get key() {
      return K;
    },
    get tally() {
      return T;
    },
    // since the last note (ms), and a fresh tally for the next sitting
    get quiet() {
      return lastNote ? performance.now() - lastNote : Infinity;
    },
    newSitting() {
      T = blankTally();
      lastChord = { name: '', t: 0 };
    },
    chordAt,
    voiced,
    lhVoiced,
    setMood(mood, pc) {
      if (mood && !MOOD_BY[mood]) mood = null;
      st.mood = mood;
      st.pc = pc || 0;
      st.prog = 0;
      st.song = null;
      if (!mood) K = null;
      else {
        const scale = moodScale(mood, st.pc);
        const tonic = midiOf(scale[0]);
        K = {
          M: MOOD_BY[mood],
          tonic,
          tPc: pc12(tonic),
          scalePcs: new Set(scale.map(n => pc12(midiOf(n)))),
          color: colorNote(mood, st.pc),
        };
      }
      S = blankStats();
      degrees = [];
      lastIn.rh = lastIn.lh = null;
      if (!K) st.backing = 'off';
      restartBacking();
      Log.ev('companion mood', { mood, pc: st.pc });
    },
    setBacking(v) {
      st.backing = v;
      restartBacking();
    },
    setProg(i) {
      st.prog = i;
      st.song = null;
      restartBacking();
    },
    /* noodle over a tune's chords: its mood and key, its tempo, its chords looping as the backing.
       song: {id, t, mood, pc, bpm, chords: songChords(...)} */
    setSong(song) {
      this.setMood(song.mood, song.pc);
      if (!K) return;
      st.song = {
        id: song.id,
        t: song.t,
        chords: song.chords.map(c => [pc12(c.pc - K.tPc), c.type, c.beats, c.b0, c.name]),
      };
      st.bpm = Math.max(48, Math.min(132, song.bpm || st.bpm));
      st.backing = 'chords';
      restartBacking();
    },
    setBpm(bpm) {
      st.bpm = Math.max(48, Math.min(132, bpm));
      restartBacking();
    },
    setPattern(id) {
      st.pattern = id;
    },
    // the left-hand pattern over the progression, once, on the piano voice
    hearPattern() {
      if (!K) return;
      AudioEngine.ensure();
      const V = lhVoiced();
      const spb = 60 / st.bpm;
      const t0 = AudioEngine.now() + 0.1;
      // (a tune's first four chords)
      V.slice(0, 4).forEach((_, i) =>
        patternBar(st.pattern, V, i, K.tPc).forEach(g =>
          g.ms.forEach(m => AudioEngine.note(m, t0 + (i * 4 + g.b) * spb, g.d * spb, 0.55)),
        ),
      );
    },
    // call and response: a phrase from DaCapo, then a window as long again (and two beats) for your answer
    playCall() {
      if (!K) return;
      AudioEngine.ensure();
      const phrase = callPhrase(st.mood, st.pc);
      const spb = 60 / st.bpm;
      const t0 = AudioEngine.now() + 0.1;
      phrase.forEach(n => AudioEngine.note(n.m, t0 + n.b * spb, n.d * spb * 0.95, 0.6));
      const last = phrase[phrase.length - 1];
      const len = (last.b + last.d) * spb;
      const start = AudioEngine.toPerf(t0 + len);
      st.call = { from: start, until: start + (len + 2 * spb) * 1000, ms: [] };
      st.lastAnswer = null;
      S.rh.calls++;
    },
    destroy() {
      clearInterval(tick);
      clearTimeout(chordT);
      offInput();
      stopSound();
      AudioEngine.stopAll();
    },
  };
}
