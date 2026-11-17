/* Harmony: which key a set of notes is in, and which chord they make (Free play's readout). */
import { meanOf } from '../core/util.js';
import { CHORDS, INTERVALS, MAJOR_KEYS, MINOR_KEYS, nameOf, pcOfName, spellAbove } from './theory.js';

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

// a chord tone spelled from the root, as the chord spells it: C7's 7th is B♭, never A♯
const LETTERS_UP = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
function bassName(root, semis, type) {
  const letters =
    semis === 8 && type.startsWith('aug') ? 4 : semis === 9 && type === 'dim7' ? 6 : LETTERS_UP[semis];
  return nameOf(spellAbove(root, letters, semis), false);
}

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
  // the inversion goes by which chord tone is lowest: the 3rd, the 5th, the 7th (else name the tone)
  const low = (bass - best.r + 12) % 12;
  const inv =
    low === 0
      ? 'root position'
      : low === 3 || low === 4
        ? '1st inversion'
        : low >= 6 && low <= 8
          ? '2nd inversion'
          : low === 10 || low === 11 || (low === 9 && best.T.k === 'dim7')
            ? '3rd inversion'
            : `${{ 2: 'the 9th', 5: 'the 4th', 9: 'the 6th' }[low] || 'another note'} in the bass`;
  return {
    name: rootName + best.T.sym + (bass !== best.r ? '/' + bassName(spell(rootM), low, best.T.k) : ''),
    long: `${rootName} ${best.T.n.toLowerCase()}, ${inv}`,
    root: best.r,
    type: best.T.k,
    rootName,
  };
}
