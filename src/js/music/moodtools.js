/* Tools for improvising in a mood (pure): the left-hand patterns, each written out over a voice-led
   progression with fingers; how to read what the left hand played; and the right hand's ideas (color
   note, targets, motif and sequence, thirds and sixths, call and response) with what each listens for. */
import { midiOf, nameOf } from './theory.js';
import { CHORD_TONES, MOOD_BY, moodScale, voiceProgression } from './moods.js';

export const pc12 = m => ((m % 12) + 12) % 12;

/* ---------- the left hand ----------
   Each pattern is one bar of 4/4 over one chord: [{b, ms, f, d}]: the beat it starts on, its notes, their
   fingers (null where the hand has a choice) and how many beats it lasts. Chords are voiced so each takes
   the inversion nearest the one before: the hand barely moves while the harmony changes. */
export const LH_PATTERNS = [
  { id: 'fifth', n: 'Root and fifth', how: 'Root and fifth together on beat 1, held. Simple and strong.' },
  { id: 'octave', n: 'Octaves', how: 'The root in octaves on beats 1 and 3: a big, open floor.' },
  {
    id: 'block',
    n: 'Chord on the beat',
    how: 'The chord on beats 1 and 3, each the nearest shape to the last.',
  },
  {
    id: 'broken',
    n: 'Broken chord',
    how: 'Root, fifth, octave, fifth, one note per beat: the left hand keeps moving.',
  },
  {
    id: 'oompah',
    n: 'Bass and chord',
    how: 'The root alone on 1, the chord above it on 2, 3 and 4. Jump, and land.',
  },
  {
    id: 'alberti',
    n: 'Alberti bass',
    how: 'The chord broken low, high, middle, high in even eighths: the classical accompaniment.',
  },
  {
    id: 'tenth',
    n: 'Open tenth',
    how: 'Root, fifth, then the third an octave up: the tenth. A wide, warm sound, the ballad left hand.',
  },
  {
    id: 'sweep',
    n: 'Sweep',
    how: 'Root, fifth, octave, tenth and back down, six even notes a bar: the hand rolls, finger 2 crossing over the thumb.',
  },
  {
    id: 'walking',
    n: 'Walking bass',
    how: 'Root, third, fifth, then the note a half step below the next chord: the bass walks into each change.',
  },
  {
    id: 'pedal',
    n: 'Pedal point',
    how: 'The home note stays in the bass, in octaves, while the chords change above it: tension against a floor.',
  },
];
export const LH_BY = Object.fromEntries(LH_PATTERNS.map(p => [p.id, p]));

// the left hand's chords for a progression: a close voicing from C3 up, and the root from E2 to D♯3
export const lhVoicing = (mood, pc, chords) => voiceProgression(mood, pc, chords, { lo: 47, hi: 55 });

// one bar of a pattern over chord i of a voiced progression V
export function patternBar(id, V, i, tonicPc) {
  const v = V[i];
  const next = V[(i + 1) % V.length];
  const R = v.root;
  const [, third, fifth] = CHORD_TONES[v.info.type];
  const ch = v.right;
  const q = (ms, f) => ms.map((m, k) => ({ b: k, ms: [m], f: [f[k]], d: 1 }));
  switch (id) {
    case 'fifth':
      return [{ b: 0, ms: [R, R + fifth], f: [5, 1], d: 4 }];
    case 'octave':
      return [0, 2].map(b => ({ b, ms: [R, R + 12], f: [5, 1], d: 1.8 }));
    case 'block':
      return [0, 2].map(b => ({ b, ms: ch, f: [5, 3, 1], d: 1.8 }));
    case 'broken':
      return q([R, R + fifth, R + 12, R + fifth], [5, 2, 1, 2]);
    case 'oompah':
      return [{ b: 0, ms: [R], f: [5], d: 1 }, ...[1, 2, 3].map(b => ({ b, ms: ch, f: [5, 3, 1], d: 0.9 }))];
    case 'alberti':
      return [0, 2, 1, 2, 0, 2, 1, 2].map((k, j) => ({ b: j / 2, ms: [ch[k]], f: [[5, 3, 1][k]], d: 0.5 }));
    case 'tenth':
      return q([R, R + fifth, R + 12 + third, R + fifth], [5, 2, 1, 2]);
    case 'sweep':
      return [R, R + fifth, R + 12, R + 12 + third, R + 12, R + fifth].map((m, j) => ({
        b: (j * 2) / 3,
        ms: [m],
        f: [[5, 2, 1, 2, 1, 2][j]],
        d: 2 / 3,
      }));
    case 'walking': {
      // the half step below the next root, in the octave nearest the fifth (above it when the chord repeats)
      const target = next.root === R ? R + 1 : next.root - 1;
      const approach = R + fifth + ((((pc12(target) - pc12(R + fifth) + 6) % 12) + 12) % 12) - 6;
      return q([R, R + third, R + fifth, approach], [5, 3, 1, null]);
    }
    case 'pedal': {
      const T = 40 + pc12(tonicPc - 40);
      return [{ b: 0, ms: [T, T + 12], f: [5, 1], d: 4 }];
    }
    default:
      return [];
  }
}

/* what one left-hand gesture was (notes struck within a moment of each other): a chord, an octave, root
   and fifth, a broken chord tone (3rd or 7th), the home note held under another chord (a pedal), or a
   passing note outside the chord (walking) */
export function lhKind(ms, rootPc, type, tonicPc) {
  const tones = CHORD_TONES[type].map(x => pc12(rootPc + x));
  const pcs = [...new Set(ms.map(pc12))];
  if (ms.length >= 2) {
    if (pcs.length === 1)
      return pcs[0] === pc12(tonicPc) && pc12(rootPc) !== pc12(tonicPc) ? 'pedal' : 'octaves';
    if (pcs.length === 2 && pcs.every(p => p === tones[0] || p === tones[2])) return 'rootFifth';
    return 'chords';
  }
  const p = pcs[0];
  if (p === pc12(tonicPc) && pc12(rootPc) !== pc12(tonicPc)) return 'pedal';
  if (p === tones[0] || p === tones[2]) return 'rootFifth';
  if (tones.includes(p)) return 'broken';
  return 'passing';
}
export const LH_KINDS = ['chords', 'octaves', 'rootFifth', 'broken', 'pedal', 'passing'];

/* ---------- the right hand ---------- */
export const RH_TOOLS = [
  { id: 'free', n: 'Free' },
  { id: 'color', n: 'Color note' },
  { id: 'targets', n: 'Targets' },
  { id: 'motif', n: 'Motif and sequence' },
  { id: 'dyads', n: 'Thirds and sixths' },
  { id: 'call', n: 'Call and response' },
];

// the mood's color note in this key: {pc, name, what, tip}
export function colorNote(mood, pc) {
  const M = MOOD_BY[mood];
  const [semis, what, tip] = M.color;
  const scale = moodScale(mood, pc);
  const i = M.semis.indexOf(semis);
  const n = scale[i];
  return { pc: pc12(midiOf(n)), name: nameOf(n, false), what, tip };
}

export function toolHow(id, mood, pc) {
  const c = colorNote(mood, pc);
  return {
    free: 'Anything with the lit keys. A good start: a few notes, a rest, the same few notes again.',
    color: `${c.name} is ${c.what}: ${c.tip}. It is marked on the keyboard.`,
    targets:
      'Land on a note of the chord (marked) on beats 1 and 3; anything in the scale between them. The melody follows the harmony.',
    motif:
      'Play a short idea, three or four notes, then play it again starting a step higher or lower: a sequence. Most melodies are built this way.',
    dyads:
      'Two notes at once from the scale, a third or a sixth apart (skip one note, or five). Move them together: instant harmony.',
    call: 'Tap Play a call: DaCapo plays a short phrase, then you answer it. Echo its rhythm, and end on the home note.',
  }[id];
}

// where a note sits in the scale, counted in scale steps from the tonic (across octaves); null if outside
export function degreeOf(m, semis, tonicPc) {
  const rel = m - tonicPc;
  const i = semis.indexOf(pc12(rel));
  return i < 0 ? null : Math.floor(rel / 12) * semis.length + i;
}

/* a motif came back: the last three notes have the same shape (in scale steps) as three notes just before
   them. 'sequence' when it starts on another note, 'repeat' when on the same one; else null */
export function motifEcho(degrees) {
  const n = degrees.length;
  if (n < 6) return null;
  const shape = (k, j) => [degrees[k + 1] - degrees[k], degrees[k + 2] - degrees[k + 1], j];
  const [a, b] = shape(n - 3);
  // (a plain run up or down the scale is not a motif: every three notes of it have the same shape)
  if ((a === 0 && b === 0) || (a === b && Math.abs(a) === 1)) return null;
  for (let k = Math.max(0, n - 12); k <= n - 6; k++) {
    const [x, y] = shape(k);
    if (x === a && y === b) return degrees[k] === degrees[n - 3] ? 'repeat' : 'sequence';
  }
  return null;
}

// two right-hand notes at once: a third or a sixth (or their octave-up versions), else null
export function dyadKind(ms) {
  if (ms.length !== 2) return null;
  const d = Math.abs(ms[1] - ms[0]) % 12;
  return d === 3 || d === 4 ? 'third' : d === 8 || d === 9 ? 'sixth' : null;
}

/* a call: a short phrase in the scale, mostly steps, that ends away from home (on the 2nd, 5th or 7th
   degree) so it asks for an answer. rnd is a function returning [0, 1). [{m, b, d}] in beats. */
export function callPhrase(mood, pc, rnd = Math.random) {
  const M = MOOD_BY[mood];
  const tonic = 60 + pc12(midiOf(moodScale(mood, pc)[0]));
  const L = M.semis.length;
  const at = d => tonic + Math.floor(d / L) * 12 + M.semis[((d % L) + L) % L];
  const RHYTHMS = [
    [0, 0.5, 1, 2],
    [0, 1, 1.5, 2],
    [0, 0.5, 1, 1.5, 2],
    [0, 1, 2, 2.5, 3],
  ];
  const rh = RHYTHMS[Math.floor(rnd() * RHYTHMS.length)];
  let d = Math.floor(rnd() * 3) + Math.floor(L / 2) - 1; // start around the middle of the scale
  // (it stays between home and an octave and a half up, in the right hand)
  const degs = rh.map((_, i) => {
    if (i) {
      const s = [-2, -1, -1, 1, 1, 2][Math.floor(rnd() * 6)];
      d += d + s < 0 || d + s > L + (L >> 1) ? -s : s;
    }
    return d;
  });
  // end on a degree that wants to move: the scale's 2nd or 5th-ish note, or the one below home
  const ends = [1, Math.round(L * 0.6), L - 1];
  const last = degs[degs.length - 2];
  const end = ends
    .map(e => e + Math.max(0, Math.round((last - e) / L)) * L)
    .filter(e => e !== last)
    .sort((x, y) => Math.abs(x - last) - Math.abs(y - last))[0];
  degs[degs.length - 1] = end;
  return rh.map((b, i) => ({ m: at(degs[i]), b, d: (rh[i + 1] ?? b + 1) - b }));
}

// an answer: how many notes, and whether it ended on the home note (or at least on a scale note)
export function judgeAnswer(ms, semis, tonicPc) {
  const last = ms[ms.length - 1];
  return {
    n: ms.length,
    home: ms.length > 0 && pc12(last) === pc12(tonicPc),
    inScale: ms.length > 0 && semis.includes(pc12(last - tonicPc)),
  };
}

/* ---------- ear: which mood? ----------
   A phrase in a mood: its first progression under the scale rising, then the color note held and home. */
export function earPhrase(mood, pc, bar = 1.6) {
  const M = MOOD_BY[mood];
  const chords = M.progs[0].chords;
  const V = voiceProgression(mood, pc, chords);
  const out = [];
  for (let i = 0; i < 4; i++) {
    const v = V[i % V.length];
    out.push({ m: v.root, t: i * bar, d: bar, v: 0.45 });
    v.right.forEach(m => out.push({ m, t: i * bar, d: bar, v: 0.25 }));
  }
  const top = Math.max(...V.flatMap(v => v.right));
  const tonic = top + 1 + pc12(midiOf(moodScale(mood, pc)[0]) - top - 1); // the first tonic above the chords
  const run = [...M.semis.map(s => tonic + s), tonic + 12];
  const step = (bar * 2) / run.length;
  run.forEach((m, i) => out.push({ m, t: i * step, d: step, v: 0.55 }));
  // the color note, then the nearest home
  out.push({ m: tonic + M.color[0], t: bar * 2, d: bar * 0.9, v: 0.6 });
  out.push({ m: tonic + (M.color[0] > 6 ? 12 : 0), t: bar * 3, d: bar, v: 0.55 });
  return out;
}

// a round: a mood (the ones you miss come back more), a key, and four choices from more than one family
export function earRound(by = {}, rnd = Math.random, pool = Object.keys(MOOD_BY)) {
  const weight = id => {
    const [n = 0, right = 0] = by[id] || [];
    return 1 + (n - right) * 2 + (n < 2 ? 1 : 0);
  };
  const total = pool.reduce((a, id) => a + weight(id), 0);
  let x = rnd() * total;
  const mood = pool.find(id => (x -= weight(id)) < 0) || pool[0];
  const pick = list => list.splice(Math.floor(rnd() * list.length), 1)[0];
  const fam = MOOD_BY[mood].fam;
  const same = pool.filter(id => id !== mood && MOOD_BY[id].fam === fam);
  const other = pool.filter(id => MOOD_BY[id].fam !== fam);
  const options = [mood];
  if (same.length) options.push(pick(same));
  while (options.length < 4 && other.length) options.push(pick(other));
  // shuffle
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { mood, pc: Math.floor(rnd() * 12), options };
}
