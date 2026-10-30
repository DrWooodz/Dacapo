/* Echo: the app plays a short phrase, you play it back. Playing by ear, in small steps: a few notes close
   together first, then longer phrases, wider leaps, other keys and minor. Three right in a row moves up a
   level; two misses in a row moves down one, so it stays at the edge of what you can hear. */
import { pick } from '../core/util.js';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PENTA = [0, 2, 4, 7, 9];

// len: notes; scale; span: highest scale step used (0 = the tonic); leap: largest step between notes
// (in scale steps); keys: tonics to choose from; gap: seconds between notes
export const ECHO_LEVELS = [
  { len: 2, scale: PENTA, span: 2, leap: 1, keys: ['C'], gap: 0.6 },
  { len: 3, scale: PENTA, span: 2, leap: 1, keys: ['C'], gap: 0.6 },
  { len: 3, scale: PENTA, span: 3, leap: 2, keys: ['C'], gap: 0.55 },
  { len: 4, scale: PENTA, span: 4, leap: 2, keys: ['C', 'G', 'F'], gap: 0.55 },
  { len: 4, scale: MAJOR, span: 4, leap: 1, keys: ['C', 'G', 'F'], gap: 0.5 },
  { len: 5, scale: MAJOR, span: 7, leap: 2, keys: ['C', 'G', 'F', 'D'], gap: 0.5 },
  { len: 5, scale: MAJOR, span: 7, leap: 4, keys: ['C', 'G', 'F', 'D', 'Bb'], gap: 0.5 },
  { len: 5, scale: MINOR, span: 4, leap: 2, keys: ['A', 'D', 'E'], gap: 0.5 },
  { len: 6, scale: MINOR, span: 7, leap: 4, keys: ['A', 'D', 'E', 'G', 'C'], gap: 0.45 },
  { len: 6, scale: MAJOR, span: 9, leap: 5, keys: ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb'], gap: 0.45 },
  { len: 7, scale: MAJOR, span: 9, leap: 7, keys: ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E'], gap: 0.42 },
];
export const MAX_ECHO = ECHO_LEVELS.length;

const TONIC = { C: 60, D: 62, E: 64, F: 65, G: 55, A: 57, Bb: 58, Eb: 63 };
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const pcName = m => NAMES[((m % 12) + 12) % 12];

// a phrase for a level: {key, minor, tonic, notes: [midi], chord: [midi]}
export function makePhrase(level, previous) {
  const L = ECHO_LEVELS[Math.max(1, Math.min(MAX_ECHO, level)) - 1];
  const key = pick(L.keys);
  const tonic = TONIC[key];
  const minor = L.scale === MINOR;
  // scale step k (may pass the octave) to midi
  const midi = k => tonic + 12 * Math.floor(k / L.scale.length) + L.scale[k % L.scale.length];
  for (let tries = 0; tries < 20; tries++) {
    const steps = [0]; // phrases start on the tonic at first, anywhere in the scale later
    if (level > 3) steps[0] = pick([0, 0, 2, 4].filter(k => k <= L.span));
    while (steps.length < L.len) {
      const last = steps[steps.length - 1];
      const options = [];
      for (let k = 0; k <= L.span; k++) if (k !== last && Math.abs(k - last) <= L.leap) options.push(k);
      steps.push(pick(options));
    }
    const notes = steps.map(midi);
    if (previous && notes.join() === previous.notes.join()) continue;
    const third = minor ? 3 : 4;
    return { key, minor, tonic, notes, chord: [tonic - 12, tonic - 12 + third, tonic - 12 + 7] };
  }
  return makePhrase(level, null);
}

// played: midis in order. Any octave counts; the order and the notes must match.
export function judge(phrase, played) {
  const pc = m => ((m % 12) + 12) % 12;
  for (let i = 0; i < played.length; i++)
    if (i >= phrase.notes.length || pc(played[i]) !== pc(phrase.notes[i])) return { ok: false, wrongAt: i };
  return {
    ok: played.length === phrase.notes.length,
    wrongAt: -1,
    partial: played.length < phrase.notes.length,
  };
}

// the game's progress after an answer: {level, best, streak, misses}
export function afterAnswer(g, ok) {
  const next = { level: g.level || 1, best: g.best || 1, streak: g.streak || 0, misses: g.misses || 0 };
  if (ok) {
    next.streak++;
    next.misses = 0;
    if (next.streak >= 3 && next.level < MAX_ECHO) {
      next.level++;
      next.streak = 0;
    }
  } else {
    next.streak = 0;
    next.misses++;
    if (next.misses >= 2 && next.level > 1) {
      next.level--;
      next.misses = 0;
    }
  }
  next.best = Math.max(next.best, next.level);
  return next;
}
