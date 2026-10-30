/* The placement check: about eight minutes that set where each skill starts.
     reading  notes one at a time on the treble staff, then the bass, in rising levels
     scale    C major, right hand, then both hands, at a speed you choose
     theory   questions answered by playing, easiest first, until two in a row are missed
     pulse    play with the click, then keep the beat on your own when it stops
   A level counts as passed with at least two of three notes right, found within three seconds.
   Passed units are marked integrated (they come back for a review, which confirms the placement);
   the first level not passed becomes the next thing to learn. */
import { Log } from '../core/log.js';
import { median, pick, todayKey } from '../core/util.js';
import { Store } from '../core/store.js';
import { fromDia, midiOf } from '../music/theory.js';
import { THEORY_UNITS } from './theory.js';
import { placeItem } from './curriculum.js';

/* ---------- reading ---------- */
// per clef: the unit each level stands for, and the staff positions (diatonic steps) it draws from
const READ_LEVELS = {
  treble: [
    { unit: 'r:r1', dia: [28, 32] },
    { unit: 'r:r3', dia: [28, 35] },
    { unit: 'r:r5', dia: [28, 39] },
    { unit: 'r:r8t', dia: [25, 27, 40, 43] },
  ],
  bass: [
    { unit: 'r:r2', dia: [21, 25] },
    { unit: 'r:r4', dia: [21, 28] },
    { unit: 'r:r6', dia: [17, 28] },
    { unit: 'r:r8b', dia: [14, 16, 29, 31] },
  ],
};
const NOTES_PER_LEVEL = 3;
const FOUND_MS = 3000;

// the notes to show for a clef: three per level, never the same note twice in a row
export function readingNotes(clef) {
  const out = [];
  for (const L of READ_LEVELS[clef]) {
    const [lo, hi, lo2, hi2] = L.dia;
    const pool = [];
    for (let d = lo; d <= hi; d++) pool.push(d);
    if (lo2 != null) for (let d = lo2; d <= hi2; d++) pool.push(d);
    for (let i = 0; i < NOTES_PER_LEVEL; i++) {
      let d = pick(pool);
      while (out.length && d === out[out.length - 1].dia && pool.length > 1) d = pick(pool);
      out.push({ dia: d, n: fromDia(d), midi: midiOf(fromDia(d)), level: READ_LEVELS[clef].indexOf(L) });
    }
  }
  return out;
}

// answers: [{level, ok, ms}] -> per level {ok, ms, passed}
export function scoreReading(clef, answers) {
  return READ_LEVELS[clef].map((L, i) => {
    const a = answers.filter(x => x.level === i);
    const ok = a.filter(x => x.ok);
    const ms = median(ok.map(x => x.ms)) || null;
    return {
      unit: L.unit,
      tried: a.length,
      ok: ok.length,
      ms,
      passed: ok.length >= 2 && ms != null && ms <= FOUND_MS,
    };
  });
}

/* ---------- scale ---------- */
const C_MAJOR_UP_DOWN = [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0];

// how many notes of the expected sequence were played in order: one extra or missed note costs one
// note, not everything after it (longest common subsequence)
function inOrder(played, expected, same) {
  const row = new Array(expected.length + 1).fill(0);
  for (const p of played) {
    let diag = 0;
    for (let j = 1; j <= expected.length; j++) {
      const up = row[j];
      row[j] = same(p, expected[j - 1]) ? diag + 1 : Math.max(row[j], row[j - 1]);
      diag = up;
    }
  }
  return row[expected.length];
}

// notes: [{m, t}] played; hands: 'rh' (one octave) or 'ht' (two octaves, both hands)
export function scoreScale(notes, hands) {
  if (hands === 'rh') {
    if (!notes.length) return { right: 0, of: C_MAJOR_UP_DOWN.length, cv: null, bpm: null };
    // measured from the C nearest the first note
    const base = Math.round((notes[0].m - 60) / 12) * 12 + 60;
    const right = inOrder(
      notes.map(n => n.m - base),
      C_MAJOR_UP_DOWN,
      (a, b) => a === b,
    );
    return { right, of: C_MAJOR_UP_DOWN.length, ...evenness(notes.map(n => n.t)) };
  }
  // both hands: steps are pairs; a step is right when both hands play its pitch class
  const steps = [];
  for (const n of notes) {
    const last = steps[steps.length - 1];
    if (last && n.t - last.t < 120 && last.ms.length < 2) last.ms.push(n.m);
    else steps.push({ t: n.t, ms: [n.m] });
  }
  const octave = [0, 2, 4, 5, 7, 9, 11];
  const up = [...octave, ...octave.map(x => x + 12), 24];
  const seq = [...up, ...up.slice(0, -1).reverse()];
  const pc = m => ((m % 12) + 12) % 12;
  const right = inOrder(steps, seq, (s, x) => s.ms.length === 2 && s.ms.every(m => pc(m) === x % 12));
  return { right, of: seq.length, ...evenness(steps.map(s => s.t)) };
}

// spread of the time between notes (lower is more even) and the tempo, at two notes per beat
function evenness(ts) {
  const gaps = [];
  for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]);
  const inner = gaps.slice(1, -1);
  if (inner.length < 4) return { cv: null, bpm: null };
  const mean = inner.reduce((a, b) => a + b, 0) / inner.length;
  const sd = Math.sqrt(inner.reduce((a, g) => a + (g - mean) ** 2, 0) / inner.length);
  return { cv: sd / mean, bpm: Math.round(60000 / (mean * 2)) };
}

/* ---------- theory ---------- */
// the questions, easiest first; each stands for a unit
export const THEORY_STEPS = ['h1', 'h5', 'h2', 'h4', 'h3', 'h6', 'h8', 'h9', 'h10', 'h13', 'h12'];

// answers: [{unit, ok}] in order -> the units to mark integrated
function scoreTheory(answers) {
  const order = THEORY_UNITS.map(u => u.id);
  const firstMiss = answers.find(a => !a.ok);
  const passed = answers.filter(a => a.ok).map(a => order.indexOf(a.unit));
  if (!passed.length) return [];
  // everything up to the hardest right answer, but never past the first miss
  const limit = Math.min(Math.max(...passed), firstMiss ? order.indexOf(firstMiss.unit) - 1 : Infinity);
  return order.slice(0, limit + 1).filter(id => !answers.some(a => a.unit === id && !a.ok));
}

/* ---------- pulse ---------- */
// taps: [t]; clickTimes: the 8 clicks; returns timing scatter as a fraction of a beat, on your own
export function scorePulse(taps, clickTimes, msBeat) {
  const lastClick = clickTimes[clickTimes.length - 1];
  const own = taps.filter(t => t > lastClick + msBeat * 0.5);
  if (own.length < 5) return null;
  const gaps = [];
  for (let i = 1; i < own.length; i++) gaps.push(own[i] - own[i - 1]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
  return { sd: sd / msBeat, drift: Math.round((msBeat / mean - 1) * 100) };
}

/* ---------- applying the results ---------- */
export function applyPlacement(r) {
  const done = [];
  for (const clef of ['treble', 'bass']) {
    const levels = r.reading && r.reading[clef];
    if (!levels) continue;
    for (const L of levels) {
      if (L.passed) {
        placeItem(L.unit, 'done');
        done.push(L.unit);
        continue;
      }
      // the first level not passed: start it at the right stage
      if (L.ok >= 2)
        placeItem(L.unit, 'pace', { pace: Math.round(Math.min(2600, Math.max(800, L.ms * 1.1)) / 50) * 50 });
      break;
    }
  }
  if (r.scale) {
    const { rh, ht } = r.scale;
    const rhOk = rh && rh.right >= rh.of - 1;
    const htOk = ht && ht.right >= ht.of - 2 && ht.cv != null && ht.cv < 0.18;
    if (htOk)
      placeItem('t:sc:major:C', 'tempo', {
        bpm: Math.max(52, Math.min(80, Math.round((ht.bpm || 52) * 0.9))),
      });
    else if (rhOk) placeItem('t:sc:major:C', 'learn', { phase: 'lh' });
  }
  for (const u of r.theory ? scoreTheory(r.theory) : []) {
    placeItem('h:' + u, 'done');
    done.push('h:' + u);
  }
  if (r.pulse) Store.s.steadyBase = { d: todayKey(), sd: r.pulse.sd };
  Store.s.profile.assessed = todayKey();
  Store.s.session = null; // today's session is rebuilt from the new starting points
  Store.s.focus = null;
  Log.ev('placement applied', { done, scale: !!r.scale, pulse: r.pulse && r.pulse.sd });
  Store.save();
  return done;
}
