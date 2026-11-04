/* Harmony: which key a set of notes is in, which chord they make, and (for whole pieces) the mode and
   the chord of each bar. Pure functions: nothing here touches the page or the sound. */
import { meanOf } from '../core/util.js';
import { CHORDS, INTERVALS, MAJOR_KEYS, MINOR_KEYS, nameOf, pcOfName, spellerFor } from './theory.js';

const KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];

const KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(x, y) {
  const mx = meanOf(x),
    my = meanOf(y);
  let a = 0,
    b = 0,
    c = 0;
  for (let i = 0; i < x.length; i++) {
    a += (x[i] - mx) * (y[i] - my);
    b += (x[i] - mx) ** 2;
    c += (y[i] - my) ** 2;
  }
  return b && c ? a / Math.sqrt(b * c) : 0;
}

export function detectKey(ms) {
  if (ms.length < 8) return null;
  const h = new Array(12).fill(0);
  ms.forEach(m => h[((m % 12) + 12) % 12]++);
  const rot = (prof, pc) => prof.map((_, i) => prof[(i - pc + 12) % 12]);
  const all = [
    ...MAJOR_KEYS.map(k => ({ ...k, mode: 'major', r: pearson(h, rot(KK_MAJ, pcOfName(k.t))) })),
    ...MINOR_KEYS.map(k => ({ ...k, mode: 'minor', r: pearson(h, rot(KK_MIN, pcOfName(k.t))) })),
  ].sort((a, b) => b.r - a.r);
  return { best: all[0], second: all[1], conf: all[0].r - all[1].r, hist: h };
}

const CHORD_T = [
  ...Object.entries(CHORDS).map(([k, v]) => ({ k, s: v.s, sym: v.sym, n: v.n })),
  { k: 'sus2', s: [0, 2, 7], sym: 'sus2', n: 'Suspended 2nd' },
  { k: 'sus4', s: [0, 5, 7], sym: 'sus4', n: 'Suspended 4th' },
  { k: 'six', s: [0, 4, 7, 9], sym: '6', n: 'Major 6th' },
  { k: 'm6', s: [0, 3, 7, 9], sym: 'm6', n: 'Minor 6th' },
  { k: 'add9', s: [0, 2, 4, 7], sym: 'add9', n: 'Major add 9' },
  { k: 'maj9', s: [0, 2, 4, 7, 11], sym: 'maj9', n: 'Major 9th' },
  { k: 'm9', s: [0, 2, 3, 7, 10], sym: 'm9', n: 'Minor 9th' },
  { k: 'dom9', s: [0, 2, 4, 7, 10], sym: '9', n: 'Dominant 9th' },
];

export function detectChord(midis, spell) {
  const ms = [...new Set(midis)].sort((a, b) => a - b);
  if (!ms.length) return null;
  const pcs = [...new Set(ms.map(m => m % 12))];
  const bass = ms[0] % 12;
  const nm = m => nameOf(spell(m), false);
  if (pcs.length === 1) return { name: nm(ms[0]), long: ms.length > 1 ? 'Octave' : 'Single note' };
  if (pcs.length === 2) {
    const iv = INTERVALS.find(i => i.s === ((ms[ms.length - 1] - ms[0]) % 12 || 12));
    return {
      name: nm(ms[0]) + '–' + nm(ms[ms.length - 1]),
      long: iv.s === 7 ? 'Open 5th' : iv.long[0].toUpperCase() + iv.long.slice(1),
    };
  }
  let best = null;
  for (const r of pcs) {
    const iv = new Set(pcs.map(p => (p - r + 12) % 12));
    for (const T of CHORD_T) {
      const ts = new Set(T.s);
      const all = [...iv].every(x => ts.has(x));
      const exact = all && iv.size === ts.size;
      const no5 = !exact && all && T.s.length >= 4 && !iv.has(7) && iv.size === ts.size - 1;
      if (!exact && !no5) continue;
      const score = (exact ? 10 : 6) + (r === bass ? 3 : 0) - T.s.length * 0.1;
      if (!best || score > best.score) best = { r, T, score };
    }
  }
  if (!best) return { name: ms.map(nm).join(' '), long: 'Cluster or unusual voicing' };
  const rootM = ms.find(m => m % 12 === best.r);
  const rootName = nm(rootM);
  const bi = best.T.s.indexOf((bass - best.r + 12) % 12);
  const inv =
    bass === best.r
      ? 'root position'
      : ['root position', '1st inversion', '2nd inversion', '3rd inversion', '4th inversion'][bi] ||
        'inverted';
  return {
    name: rootName + best.T.sym + (bass !== best.r ? '/' + nm(ms[0]) : ''),
    long: `${rootName} ${best.T.n.toLowerCase()}, ${inv}`,
    root: best.r,
    type: best.T.k,
    rootName,
  };
}

/* ---------- whole pieces: the mode, and the chord of each bar ---------- */
// The seven modes of the major scale, by the degree of the scale they start on. Game and folk music
// (Old School RuneScape among it) lives in Dorian, Mixolydian and natural minor as much as in major.
const MODES = [
  {
    name: 'major',
    also: 'Ionian',
    feel: 'bright and settled',
    how: 'The ordinary major scale. Home is I; IV and V lead back to it.',
  },
  {
    name: 'Dorian',
    also: '',
    feel: 'minor, but with a bright 6th: hopeful, folk-like',
    how: 'A minor scale with its 6th raised a half step. That raised 6th makes the IV chord major, so i to IV (A minor to D major in A Dorian) is its signature.',
  },
  {
    name: 'Phrygian',
    also: '',
    feel: 'minor with a dark lowered 2nd: Spanish, ominous',
    how: 'A minor scale with its 2nd lowered a half step. The chord on that 2nd (♭II) sliding down to i is its signature.',
  },
  {
    name: 'Lydian',
    also: '',
    feel: 'major with a raised 4th: dreamy, floating',
    how: 'A major scale with its 4th raised a half step. That makes the II chord major: I to II (C to D in C Lydian) floats without settling.',
  },
  {
    name: 'Mixolydian',
    also: '',
    feel: 'major with a lowered 7th: folk, Celtic, adventurous',
    how: 'A major scale with its 7th lowered a half step. The chord on that lowered 7th (♭VII) going back to I is its signature: A to G to A in A Mixolydian. There is no strong pull from V, so the music feels open rather than final.',
  },
  {
    name: 'minor',
    also: 'Aeolian',
    feel: 'natural minor: sad, earnest, ballad-like',
    how: 'The natural minor scale. Its 3rd, 6th and 7th are all low, so the chords on them (♭III, ♭VI, ♭VII) are major: i ♭VI ♭VII i is the classic folk and game-music minor.',
  },
  {
    name: 'Locrian',
    also: '',
    feel: 'unstable; rarely a home key',
    how: 'Its home chord is diminished, so it hardly ever feels like home.',
  },
];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const TRIADS = [
  { type: 'maj', s: [0, 4, 7] },
  { type: 'min', s: [0, 3, 7] },
  { type: 'dim', s: [0, 3, 6] },
  { type: 'dom7', s: [0, 4, 7, 10] },
  { type: 'min7', s: [0, 3, 7, 10] },
  { type: 'maj7', s: [0, 4, 7, 11] },
];
const pc12 = m => ((m % 12) + 12) % 12;

// how much each pitch class sounds between a and b (notes: [{t, d, m}]), and the lowest one at a
function weights(notes, a, b) {
  const w = new Array(12).fill(0);
  let low = null;
  for (const n of notes) {
    const s = Math.max(a, n.t);
    const e = Math.min(b, n.t + n.d);
    if (e <= s) continue;
    w[pc12(n.m)] += e - s;
    if (n.t <= a + (b - a) * 0.25 && (!low || n.m < low.m)) low = n;
  }
  return { w, bass: low ? pc12(low.m) : null };
}

// the chord a set of weights makes: {root, type, fit} (fit: share of what sounds that the chord explains)
function chordOf(w, bass) {
  const total = w.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let best = null;
  for (let r = 0; r < 12; r++)
    for (const T of TRIADS) {
      const tones = T.s.map(x => (r + x) % 12);
      const inside = tones.reduce((a, p) => a + w[p], 0);
      // a 7th chord only when its 7th is really there
      if (T.s.length === 4 && w[tones[3]] < total * 0.12) continue;
      if (w[r] < total * 0.08) continue; // the root has to sound
      const score =
        inside - 0.7 * (total - inside) + (bass === r ? total * 0.25 : 0) - T.s.length * total * 0.02;
      if (!best || score > best.score) best = { root: r, type: T.type, score, fit: inside / total };
    }
  return best;
}

// numerals measured against the major scale of the tonic, so every mode reads the same way:
// in A Mixolydian, G is ♭VII; in A minor, F is ♭VI and C is ♭III
const DEGREE = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];
export function roman(root, type, tonic) {
  const d = DEGREE[(root - tonic + 12) % 12];
  const minorish = type === 'min' || type === 'min7' || type === 'dim';
  const base = minorish ? d.replace(/[IV]+/, x => x.toLowerCase()) : d;
  return base + ({ dim: '°', dom7: '7', min7: '7', maj7: 'maj7' }[type] || '');
}

// chords bar by bar (half bars in 4/4 when the harmony clearly changes in the middle).
// bars: the start of each bar and the end of the last one, in the same unit as the notes.
export function barChords(notes, bars, { halves = true } = {}) {
  const out = [];
  for (let k = 0; k + 1 < bars.length; k++) {
    const [a, b] = [bars[k], bars[k + 1]];
    const whole = weights(notes, a, b);
    const c = chordOf(whole.w, whole.bass);
    let parts = [c && { at: a, ...c }];
    if (halves && c) {
      const mid = (a + b) / 2;
      const one = weights(notes, a, mid);
      const two = weights(notes, mid, b);
      const c1 = chordOf(one.w, one.bass);
      const c2 = chordOf(two.w, two.bass);
      const differ = c1 && c2 && (c1.root !== c2.root || c1.type !== c2.type);
      if (differ && c1.fit > 0.75 && c2.fit > 0.75 && (c1.fit + c2.fit) / 2 > c.fit + 0.08)
        parts = [
          { at: a, ...c1 },
          { at: mid, ...c2 },
        ];
    }
    out.push({ bar: k, chords: parts.filter(Boolean) });
  }
  return out;
}

// the mode of a piece: the major scale that holds most of its notes, and which of its notes is home
// (the bass at the ends, the chords most often built on it). sig: the key signature written in the
// file, if any, which settles ties.
export function findMode(notes, bars, sig = null) {
  const w = new Array(12).fill(0);
  notes.forEach(n => (w[pc12(n.m)] += n.d || 1));
  const total = w.reduce((a, b) => a + b, 0) || 1;
  let parent = 0;
  let bestIn = -1;
  for (let r = 0; r < 12; r++) {
    const inside = MAJOR_STEPS.reduce((a, s) => a + w[(r + s) % 12], 0);
    const writ = sig != null && MAJOR_KEYS.find(k => k.sig === sig);
    const bonus = writ && pcOfName(writ.t) === r ? total * 0.02 : 0;
    if (inside + bonus > bestIn) {
      bestIn = inside + bonus;
      parent = r;
    }
  }
  const scale = MAJOR_STEPS.map(s => (parent + s) % 12);
  // where the music comes to rest
  const chords = barChords(notes, bars, { halves: false })
    .map(b => b.chords[0])
    .filter(Boolean);
  const score = new Array(12).fill(0);
  chords.forEach((c, i) => {
    if (c.type === 'maj' || c.type === 'min' || c.type === 'dom7' || c.type === 'min7') score[c.root] += 1;
    if (i === 0) score[c.root] += 2;
    if (i === chords.length - 1) score[c.root] += 4;
  });
  const last = notes.reduce(
    (a, n) => (!a || n.t + n.d > a.t + a.d || (n.t === a.t && n.m < a.m) ? n : a),
    null,
  );
  if (last) {
    const lastBass = notes
      .filter(n => n.t + n.d >= last.t + last.d - 1)
      .reduce((a, n) => (n.m < a.m ? n : a));
    score[pc12(lastBass.m)] += 3;
  }
  const tonic = scale.reduce((a, p) => (score[p] > score[a] ? p : a), scale[0]);
  const mode = MODES[scale.indexOf(tonic)];
  // natural minor whose 7th is often raised (a major V chord): harmonic minor
  const raised7 =
    mode.name === 'minor' && w[(tonic + 11) % 12] > Math.max(total * 0.02, w[(tonic + 10) % 12] * 0.5);
  return {
    tonic,
    mode: mode.name,
    feel: mode.feel,
    raised7,
    parentSig: (MAJOR_KEYS.find(k => pcOfName(k.t) === parent) || MAJOR_KEYS[0]).sig,
    outside: Math.round((1 - bestIn / total) * 100) / 100,
  };
}

// a chord's letter name, spelled in the key with signature sig: 'G', 'F♯m', 'B°', 'E7'
const SUFFIX = { maj: '', min: 'm', dim: '°', dom7: '7', min7: 'm7', maj7: 'maj7' };
export const chordLabel = (root, type, sig = 0) =>
  nameOf(spellerFor(Math.max(-6, Math.min(6, sig)))(60 + root), false) + (SUFFIX[type] ?? '');

// all of the harmony of a piece in one go: its mode, and the chords of each section (secs: [[a, z]] bars)
export function describeMusic(notes, bars, sig, secs) {
  const mode = findMode(notes, bars, sig);
  const chords = barChords(notes, bars);
  const spell = mode.parentSig;
  const label = c => ({
    root: c.root,
    type: c.type,
    num: roman(c.root, c.type, mode.tonic),
    name: chordLabel(c.root, c.type, spell),
  });
  return {
    ...mode,
    home: chordLabel(mode.tonic, 'maj', spell),
    homeType: { Locrian: 'dim', Dorian: 'min', Phrygian: 'min', minor: 'min' }[mode.mode] || 'maj',
    info: MODES.find(m => m.name === mode.mode),
    sections: secs.map(([a, z]) => ({
      a,
      z,
      bars: chords.slice(a, z).map(b => b.chords.map(label)),
    })),
  };
}
