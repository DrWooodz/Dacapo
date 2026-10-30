/* Music theory: spelled notes, scales and fingerings, keys, intervals and chords. */

/* ---------- music math ---------- */
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const LPC = [0, 2, 4, 5, 7, 9, 11];

const ACC_TXT = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };

const PC_NAMES_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

const PC_NAMES_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

// Spelled note {l:0-6, a:-2..2, o:octave}
export const N = (l, a, o) => ({ l, a, o });

export const midiOf = n => 12 * (n.o + 1) + LPC[n.l] + n.a;

export const diaOf = n => n.o * 7 + n.l;

export const nameOf = (n, oct = true) => LETTERS[n.l] + ACC_TXT[n.a] + (oct ? n.o : '');

export const fromDia = (d, a = 0) => N(((d % 7) + 7) % 7, a, Math.floor(d / 7));

export function parseNote(s) {
  // "C#4", "Eb3", "F4"
  const m = /^([A-G])(bb|b|#|x|##)?(-?\d)?$/.exec(s);
  if (!m) throw new Error('bad note ' + s);
  const a = { bb: -2, b: -1, '#': 1, '##': 2, x: 2 }[m[2]] || 0;
  return N(LETTERS.indexOf(m[1]), a, m[3] !== undefined ? +m[3] : 4);
}

export function midiName(m, flats = false) {
  return (flats ? PC_NAMES_FLAT : PC_NAMES_SHARP)[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

function stepUp(n, semis) {
  // next letter, given semitone distance
  const l = (n.l + 1) % 7,
    o = n.o + (n.l === 6 ? 1 : 0);
  const target = midiOf(n) + semis;
  const natural = 12 * (o + 1) + LPC[l];
  return N(l, target - natural, o);
}

const SCALE_STEPS = {
  major: [2, 2, 1, 2, 2, 2, 1],
  natural: [2, 1, 2, 2, 1, 2, 2],
  harmonic: [2, 1, 2, 2, 1, 3, 1],
  melodic: [2, 1, 2, 2, 2, 2, 1],
};

// the note `letters` letter names and `semis` semitones above n, spelled correctly
// (spellAbove(F, 3, 5) is B♭, a perfect 4th above F; never A♯)
export function spellAbove(n, letters, semis) {
  const l = n.l + letters;
  const L = ((l % 7) + 7) % 7;
  const o = n.o + Math.floor(l / 7);
  return N(L, midiOf(n) + semis - (12 * (o + 1) + LPC[L]), o);
}

// a scale from interval steps in semitones, one letter per degree (for 7-note scales)
export function spellScale(tonic, semis) {
  let total = 0;
  return [tonic].concat(semis.map((s, i) => spellAbove(tonic, i + 1, (total += s))));
}

export function buildScale(tonic, type, octaves = 1, descend = true) {
  const steps = SCALE_STEPS[type];
  const out = [tonic];
  let cur = tonic;
  for (let o = 0; o < octaves; o++)
    for (const s of steps) {
      cur = stepUp(cur, s);
      out.push(cur);
    }
  if (descend) {
    if (type === 'melodic') {
      // descend as natural minor
      const nat = buildScale(tonic, 'natural', octaves, false);
      for (let i = nat.length - 2; i >= 0; i--) out.push(nat[i]);
    } else for (let i = out.length - 2; i >= 0; i--) out.push(out[i]);
  }
  return out;
}

// Keys: tonic spelled + signature (+sharps / -flats)
export const MAJOR_KEYS = [
  { k: 'C', t: 'C', sig: 0 },
  { k: 'G', t: 'G', sig: 1 },
  { k: 'D', t: 'D', sig: 2 },
  { k: 'A', t: 'A', sig: 3 },
  { k: 'E', t: 'E', sig: 4 },
  { k: 'B', t: 'B', sig: 5 },
  { k: 'F#', t: 'F#', sig: 6 },
  { k: 'Db', t: 'Db', sig: -5 },
  { k: 'Ab', t: 'Ab', sig: -4 },
  { k: 'Eb', t: 'Eb', sig: -3 },
  { k: 'Bb', t: 'Bb', sig: -2 },
  { k: 'F', t: 'F', sig: -1 },
];

export const MINOR_KEYS = [
  { k: 'A', t: 'A', sig: 0 },
  { k: 'E', t: 'E', sig: 1 },
  { k: 'B', t: 'B', sig: 2 },
  { k: 'F#', t: 'F#', sig: 3 },
  { k: 'C#', t: 'C#', sig: 4 },
  { k: 'G#', t: 'G#', sig: 5 },
  { k: 'Eb', t: 'Eb', sig: -6 },
  { k: 'Bb', t: 'Bb', sig: -5 },
  { k: 'F', t: 'F', sig: -4 },
  { k: 'C', t: 'C', sig: -3 },
  { k: 'G', t: 'G', sig: -2 },
  { k: 'D', t: 'D', sig: -1 },
];

export const prettyKey = k => k.replace('#', '♯').replace(/^([A-G])b/, '$1♭');

// Standard one-octave fingerings, ascending tonic→tonic (8 numbers). For more octaves the
// top/bottom finger becomes the crossing finger.
const FINGER = {
  major: {
    C: ['12312345', '54321321'],
    G: ['12312345', '54321321'],
    D: ['12312345', '54321321'],
    A: ['12312345', '54321321'],
    E: ['12312345', '54321321'],
    B: ['12312345', '43214321'],
    'F#': ['23412312', '43213214'],
    Db: ['23123412', '32143213'],
    Ab: ['34123123', '32143213'],
    Eb: ['31234123', '32143213'],
    Bb: ['41231234', '32143213'],
    F: ['12341234', '54321321'],
  },
  minor: {
    A: ['12312345', '54321321'],
    E: ['12312345', '54321321'],
    B: ['12312345', '43214321'],
    'F#': ['34123123', '43213214'],
    'C#': ['34123123', '32143213'],
    'G#': ['34123123', '32132143'],
    Eb: ['31234123', '21432132'],
    Bb: ['41231234', '21321432'],
    F: ['12341234', '54321321'],
    C: ['12312345', '54321321'],
    G: ['12312345', '54321321'],
    D: ['12312345', '54321321'],
  },
};

// expand fingering across octaves / descending
export function scaleFingers(keyName, type, hand, octaves) {
  const fam = type === 'major' ? 'major' : 'minor';
  const f = (FINGER[fam][keyName] || ['12312345', '54321321'])[hand === 'lh' ? 1 : 0].split('').map(Number);
  // RH repeats f[0..6] per octave and ends on f[7]; LH starts on f[0] and repeats f[1..7] per octave.
  const up = [];
  if (hand === 'lh') {
    up.push(f[0]);
    for (let o = 0; o < octaves; o++) for (let i = 1; i < 8; i++) up.push(f[i]);
  } else {
    for (let o = 0; o < octaves; o++) for (let i = 0; i < 7; i++) up.push(f[i]);
    up.push(f[7]);
  }
  const down = up.slice(0, -1).reverse();
  return up.concat(down);
}

export function keySigNotes(sig, clef) {
  // returns dia positions
  const sharpT = [38, 35, 39, 36, 33, 37, 34],
    flatT = [34, 37, 33, 36, 32, 35, 31];
  const off = clef === 'bass' ? -14 : 0;
  if (sig > 0) return sharpT.slice(0, sig).map(d => ({ d: d + off, a: 1 }));
  if (sig < 0) return flatT.slice(0, -sig).map(d => ({ d: d + off, a: -1 }));
  return [];
}

export function sigAccidentalFor(sig, letter) {
  const sh = [3, 0, 4, 1, 5, 2, 6],
    fl = [6, 2, 5, 1, 4, 0, 3];
  if (sig > 0 && sh.slice(0, sig).includes(letter)) return 1;
  if (sig < 0 && fl.slice(0, -sig).includes(letter)) return -1;
  return 0;
}

export const INTERVALS = [
  { s: 1, n: 'm2', long: 'minor 2nd' },
  { s: 2, n: 'M2', long: 'major 2nd' },
  { s: 3, n: 'm3', long: 'minor 3rd' },
  { s: 4, n: 'M3', long: 'major 3rd' },
  { s: 5, n: 'P4', long: 'perfect 4th' },
  { s: 6, n: 'TT', long: 'tritone' },
  { s: 7, n: 'P5', long: 'perfect 5th' },
  { s: 8, n: 'm6', long: 'minor 6th' },
  { s: 9, n: 'M6', long: 'major 6th' },
  { s: 10, n: 'm7', long: 'minor 7th' },
  { s: 11, n: 'M7', long: 'major 7th' },
  { s: 12, n: 'P8', long: 'octave' },
];

export const CHORDS = {
  maj: { n: 'Major', s: [0, 4, 7], sym: '' },
  min: { n: 'Minor', s: [0, 3, 7], sym: 'm' },
  dim: { n: 'Diminished', s: [0, 3, 6], sym: '°' },
  aug: { n: 'Augmented', s: [0, 4, 8], sym: '+' },
  maj7: { n: 'Major 7th', s: [0, 4, 7, 11], sym: 'maj7' },
  dom7: { n: 'Dominant 7th', s: [0, 4, 7, 10], sym: '7' },
  min7: { n: 'Minor 7th', s: [0, 3, 7, 10], sym: 'm7' },
  hdim7: { n: 'Half-diminished 7th', s: [0, 3, 6, 10], sym: 'ø7' },
  dim7: { n: 'Diminished 7th', s: [0, 3, 6, 9], sym: '°7' },
};

// spell chord tones by stacking thirds from a spelled root
export function spellChord(root, type) {
  const st = CHORDS[type].s;
  return st.map((semi, i) => {
    const l = (root.l + 2 * i) % 7,
      o = root.o + Math.floor((root.l + 2 * i) / 7);
    const nat = 12 * (o + 1) + LPC[l];
    return N(l, midiOf(root) + semi - nat, o);
  });
}

export function keyInfo(type, k) {
  const list = type === 'major' ? MAJOR_KEYS : MINOR_KEYS;
  return list.find(x => x.k === k) || list[0];
}

export function tonicOct(hand, pc, octs) {
  return hand === 'lh' ? (octs === 1 && pc <= 4 ? 3 : 2) : octs === 2 && pc >= 8 ? 3 : 4;
}

export const pcOf = n => (((LPC[n.l] + n.a) % 12) + 12) % 12;

export const pcOfName = t => pcOf(parseNote(t + '4'));

function spellMidi(m, preferFlat = false) {
  const pc = ((m % 12) + 12) % 12;
  const o = Math.floor(m / 12) - 1;
  const sharpMap = [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
    [2, 0],
    [3, 0],
    [3, 1],
    [4, 0],
    [4, 1],
    [5, 0],
    [5, 1],
    [6, 0],
  ];
  const flatMap = [
    [0, 0],
    [1, -1],
    [1, 0],
    [2, -1],
    [2, 0],
    [3, 0],
    [4, -1],
    [4, 0],
    [5, -1],
    [5, 0],
    [6, -1],
    [6, 0],
  ];
  const [l, a] = (preferFlat ? flatMap : sharpMap)[pc];
  return N(l, a, o);
}

// spell a midi number inside a key signature
export function spellerFor(sig = 0) {
  const maj = MAJOR_KEYS.find(k => k.sig === sig) || { t: { '-6': 'Gb', '-7': 'Cb', 7: 'C#' }[sig] || 'C' };
  const map = {};
  buildScale(parseNote(maj.t + '4'), 'major', 1, false)
    .slice(0, 7)
    .forEach(n => (map[pcOf(n)] = [n.l, n.a]));
  return m => {
    const pc = ((m % 12) + 12) % 12;
    let o = Math.floor(m / 12) - 1;
    const e = map[pc];
    if (!e) return spellMidi(m, sig < 0);
    const nat = LPC[e[0]] + e[1];
    if (nat >= 12) o--;
    if (nat < 0) o++;
    return N(e[0], e[1], o);
  };
}

// note from midi + accidental (-2..2), used by the library
export function spellAcc(m, alt) {
  const pc = (((m - alt) % 12) + 12) % 12;
  const l = LPC.indexOf(pc);
  if (l < 0) return spellMidi(m);
  return N(l, alt, Math.floor((m - alt) / 12) - 1);
}
