/* Moods: the scales to improvise in, by the sound they make. A mood is a scale type (its intervals); it can
   be played from any of the 12 keys. This module is pure: the moods, each one spelled in every key, its
   fingering, and the ways to group keys (by hand shape, by neighbor). */
import { midiOf, N, scaleFingers, spellAbove } from './theory.js';

/* ---------- the moods ----------
   semis: the scale's notes above the tonic. letters: the letter of each note above the tonic's letter
   (so every scale is spelled with the right note names). chords: a short progression in the mood, as
   [semitones above the tonic, chord type], used for the backing and the left-hand patterns. */
export const MOOD_FAMILIES = [
  { id: 'dark', n: 'Dark' },
  { id: 'bittersweet', n: 'Bittersweet' },
  { id: 'exotic', n: 'Exotic' },
  { id: 'strange', n: 'Strange' },
  { id: 'bright', n: 'Bright' },
];

export const MOODS = [
  {
    id: 'natural',
    n: 'Natural minor',
    fam: 'dark',
    feel: 'sad, earnest, ballad-like',
    hear: 'most minor-key pop and rock ballads',
    how: 'The plain minor scale: its 3rd, 6th and 7th are low. Its chords on the low 6th and 7th are major, so i – ♭VI – ♭VII climbs home without a leading note.',
    semis: [0, 2, 3, 5, 7, 8, 10],
    chords: [
      [0, 'min'],
      [8, 'maj'],
      [10, 'maj'],
      [0, 'min'],
    ],
  },
  {
    id: 'harmonic',
    n: 'Harmonic minor',
    fam: 'dark',
    feel: 'dark, dramatic, a little exotic',
    hear: 'classical and baroque minor pieces, neoclassical metal',
    how: 'Natural minor with its 7th raised a half step. That leaves a wide gap (a step and a half) between the 6th and 7th, which gives its exotic edge, and makes V a major chord that pulls hard back home.',
    semis: [0, 2, 3, 5, 7, 8, 11],
    chords: [
      [0, 'min'],
      [5, 'min'],
      [7, 'maj'],
      [0, 'min'],
    ],
  },
  {
    id: 'phrygian',
    n: 'Phrygian',
    fam: 'dark',
    feel: 'ominous, Spanish',
    hear: 'flamenco, heavy-metal riffs, menacing film cues',
    how: 'Natural minor with its 2nd lowered a half step. That low 2nd, a half step above home, is its whole flavor: the chord on it (♭II) sliding down to i sounds like a threat.',
    semis: [0, 1, 3, 5, 7, 8, 10],
    chords: [
      [0, 'min'],
      [1, 'maj'],
      [0, 'min'],
      [1, 'maj'],
    ],
  },
  {
    id: 'locrian',
    n: 'Locrian',
    fam: 'dark',
    feel: 'unstable, uneasy',
    hear: 'horror cues and some heavy metal; rare as a home key',
    how: 'Phrygian with its 5th lowered too. Its home chord is diminished, so it never quite settles: use it for unease, not for rest.',
    semis: [0, 1, 3, 5, 6, 8, 10],
    chords: [
      [0, 'dim'],
      [1, 'maj'],
      [10, 'min'],
      [0, 'dim'],
    ],
  },
  {
    id: 'dorian',
    n: 'Dorian',
    fam: 'bittersweet',
    feel: 'minor, but hopeful; folk and adventure',
    hear: '"Scarborough Fair", Santana\'s "Oye Como Va", Miles Davis\'s "So What"',
    how: 'Natural minor with its 6th raised a half step. That one brighter note makes IV a major chord: rocking between i and IV is the Dorian sound.',
    semis: [0, 2, 3, 5, 7, 9, 10],
    chords: [
      [0, 'min'],
      [5, 'maj'],
      [0, 'min'],
      [5, 'maj'],
    ],
  },
  {
    id: 'melodic',
    n: 'Melodic minor',
    fam: 'bittersweet',
    feel: 'smooth, sophisticated, jazzy',
    hear: 'jazz (players call it the jazz minor)',
    how: 'A major scale with a lowered 3rd: minor at the bottom, major at the top. Here it is played the same way up and down, as jazz players use it.',
    semis: [0, 2, 3, 5, 7, 9, 11],
    chords: [
      [0, 'min'],
      [5, 'dom7'],
      [7, 'dom7'],
      [0, 'min'],
    ],
  },
  {
    id: 'minpent',
    n: 'Minor pentatonic',
    fam: 'bittersweet',
    feel: 'bluesy, simple, impossible to get wrong',
    hear: 'blues and rock guitar solos',
    how: 'Five notes of natural minor, without the 2nd and 6th. No half steps, so no note clashes with another: the easiest scale to improvise in.',
    semis: [0, 3, 5, 7, 10],
    chords: [
      [0, 'min'],
      [5, 'min'],
      [0, 'min'],
      [10, 'maj'],
    ],
  },
  {
    id: 'phrygdom',
    n: 'Phrygian dominant',
    fam: 'exotic',
    feel: 'Middle Eastern, Spanish, fiery',
    hear: 'klezmer and Middle Eastern music ("Hava Nagila"), flamenco',
    how: 'Phrygian with a major 3rd: the low 2nd and the wide gap up to the 3rd make it sound unmistakably Middle Eastern. It is harmonic minor started from its 5th note.',
    semis: [0, 1, 4, 5, 7, 8, 10],
    chords: [
      [0, 'maj'],
      [1, 'maj'],
      [10, 'min'],
      [0, 'maj'],
    ],
  },
  {
    id: 'dblharm',
    n: 'Double harmonic',
    fam: 'exotic',
    feel: 'very exotic, snake-charmer',
    hear: 'Dick Dale\'s "Misirlou", Arabic and Indian music',
    how: 'Two wide gaps, one in each half: a low 2nd up to a major 3rd, and a low 6th up to a major 7th. Both halves have the same shape.',
    semis: [0, 1, 4, 5, 7, 8, 11],
    chords: [
      [0, 'maj'],
      [1, 'maj'],
      [0, 'maj'],
      [1, 'maj'],
    ],
  },
  {
    id: 'hirajoshi',
    n: 'Hirajoshi',
    fam: 'exotic',
    feel: 'Japanese, haunting, still',
    hear: 'Japanese koto music',
    how: 'Five notes with two half steps (2nd to 3rd, 5th to 6th) and two wide gaps. Slow, spacious phrases suit it best.',
    semis: [0, 2, 3, 7, 8],
    chords: [
      [0, 'min'],
      [8, 'maj'],
      [0, 'min'],
      [8, 'maj'],
    ],
  },
  {
    id: 'wholetone',
    n: 'Whole tone',
    fam: 'strange',
    feel: 'dreamy, floating, weightless',
    hear: 'Debussy ("Voiles"), dream sequences in film and cartoons',
    how: 'Only whole steps, six notes to the octave. Every note is the same distance from its neighbors, so none feels like home: the music floats.',
    semis: [0, 2, 4, 6, 8, 10],
    usual: [0, 1, 2, 3, 4, 5], // written C D E F♯ G♯ A♯

    chords: [
      [0, 'aug'],
      [2, 'aug'],
      [0, 'aug'],
      [2, 'aug'],
    ],
  },
  {
    id: 'diminished',
    n: 'Diminished',
    fam: 'strange',
    feel: 'suspense, tension, a villain sneaking up',
    hear: 'suspense and villain cues; jazz over diminished chords',
    how: 'Whole step, half step, over and over: eight notes. It repeats every three half steps, so it sounds the same from four places: tense and circling.',
    semis: [0, 2, 3, 5, 6, 8, 9, 11],
    chords: [
      [0, 'dim7'],
      [2, 'dim7'],
      [0, 'dim7'],
      [2, 'dim7'],
    ],
  },
  {
    id: 'major',
    n: 'Major',
    fam: 'bright',
    feel: 'happy, settled, open',
    hear: 'most cheerful pop, folk songs and hymns',
    how: 'The plain major scale: whole, whole, half, whole, whole, whole, half. Home is I; IV and V lead back to it.',
    semis: [0, 2, 4, 5, 7, 9, 11],
    chords: [
      [0, 'maj'],
      [5, 'maj'],
      [7, 'maj'],
      [0, 'maj'],
    ],
  },
  {
    id: 'mixolydian',
    n: 'Mixolydian',
    fam: 'bright',
    feel: 'folk, Celtic, adventurous',
    hear: 'The Beatles\' "Norwegian Wood", Celtic folk tunes',
    how: 'Major with its 7th lowered a half step. The chord on that lowered 7th (♭VII) going back to I sounds open rather than final.',
    semis: [0, 2, 4, 5, 7, 9, 10],
    chords: [
      [0, 'maj'],
      [10, 'maj'],
      [5, 'maj'],
      [0, 'maj'],
    ],
  },
  {
    id: 'lydian',
    n: 'Lydian',
    fam: 'bright',
    feel: 'magical, wondrous, film music',
    hear: '"The Simpsons" theme, film scores for flying and wonder',
    how: 'Major with its 4th raised a half step. That makes II a major chord: I to II floats upward without ever settling.',
    semis: [0, 2, 4, 6, 7, 9, 11],
    chords: [
      [0, 'maj'],
      [2, 'maj'],
      [0, 'maj'],
      [2, 'maj'],
    ],
  },
  {
    id: 'majpent',
    n: 'Major pentatonic',
    fam: 'bright',
    feel: 'open, simple, folk',
    hear: 'folk melodies, country, many East Asian folk tunes',
    how: 'Five notes of the major scale, without the 4th and 7th. No half steps, so nothing clashes.',
    semis: [0, 2, 4, 7, 9],
    chords: [
      [0, 'maj'],
      [9, 'min'],
      [0, 'maj'],
      [9, 'min'],
    ],
  },
  {
    id: 'blues',
    n: 'Blues',
    fam: 'bright',
    feel: 'gritty, soulful',
    hear: 'blues, rock and roll, jazz',
    how: 'Minor pentatonic plus one passing note between the 4th and 5th, the blue note. Slide through it; do not sit on it.',
    semis: [0, 3, 5, 6, 7, 10],
    chords: [
      [0, 'dom7'],
      [5, 'dom7'],
      [0, 'dom7'],
      [7, 'dom7'],
    ],
  },
];
export const MOOD_BY = Object.fromEntries(MOODS.map(m => [m.id, m]));

/* ---------- keys ----------
   Twelve tonics by pitch class. The black-key tonics have two names; each mood takes the spelling with
   fewer accidentals (C♯ Phrygian, but D♭ major). */
const TONICS = [
  [N(0, 0, 4)],
  [N(0, 1, 4), N(1, -1, 4)],
  [N(1, 0, 4)],
  [N(1, 1, 4), N(2, -1, 4)],
  [N(2, 0, 4)],
  [N(3, 0, 4)],
  [N(3, 1, 4), N(4, -1, 4)],
  [N(4, 0, 4)],
  [N(4, 1, 4), N(5, -1, 4)],
  [N(5, 0, 4)],
  [N(5, 1, 4), N(6, -1, 4)],
  [N(6, 0, 4)],
];
export const PCS = [...Array(12).keys()];
// keys whose scales lie mostly on black keys feel different under the hand: they count as "black-key"
const onBlack = m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

// the letter a note usually takes, by its distance above the tonic (the flat 5th of the blues is a 5th)
const USUAL_LETTER = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
const accidentals = notes => notes.reduce((a, n) => a + Math.abs(n.a) * (Math.abs(n.a) > 1 ? 3 : 1), 0);
/* Seven-note scales use each letter once. The others (five, six or eight notes) have no fixed letters, so
   they take the letters that read easiest: the fewest accidentals, a letter used twice only when it must
   be (B whole tone is B C♯ D♯ F G A, not B C♯ D♯ E♯ F𝄪 G𝄪). */
function spellFrom(tonic, mood) {
  if (mood.semis.length === 7) return mood.semis.map((s, i) => (i === 0 ? tonic : spellAbove(tonic, i, s)));
  let best = null;
  const walk = (i, prevL, out, cost) => {
    if (best && cost >= best.cost) return;
    if (i === mood.semis.length) {
      best = { cost, notes: out.slice() };
      return;
    }
    for (let L = prevL; L <= prevL + 2 && L <= 6; L++) {
      const n = spellAbove(tonic, L, mood.semis[i]);
      if (Math.abs(n.a) > 2) continue;
      // accidentals, a letter used twice, a letter other than the degree's usual one (a minor 3rd is a
      // 3rd, not a raised 2nd), and sharps mixed with flats all cost
      const mixed = n.a !== 0 && out.some(x => x.a !== 0 && Math.sign(x.a) !== Math.sign(n.a));
      const c =
        Math.abs(n.a) * (Math.abs(n.a) > 1 ? 3 : 1) +
        (L === prevL ? 1.5 : 0) +
        Math.abs(L - (mood.usual ? mood.usual[i] : USUAL_LETTER[mood.semis[i]])) * 0.6 +
        (mixed ? 1 : 0);
      out.push(n);
      walk(i + 1, L, out, cost + c);
      out.pop();
    }
  };
  walk(1, 0, [tonic], 0);
  return best.notes;
}

// the scale of a mood from pitch class pc, one octave up from the tonic (spelled notes, octave 4)
export function moodScale(moodId, pc) {
  const mood = MOOD_BY[moodId];
  const options = TONICS[pc].map(t => spellFrom(t, mood));
  return options.reduce((a, b) => (accidentals(b) < accidentals(a) ? b : a));
}

// the key signature that writes a scale with the fewest accidentals in the music
function sigFor(notes) {
  const SH = [3, 0, 4, 1, 5, 2, 6];
  const FL = [6, 2, 5, 1, 4, 0, 3];
  let best = null;
  for (let sig = -7; sig <= 7; sig++) {
    const accOf = l =>
      sig > 0 && SH.slice(0, sig).includes(l) ? 1 : sig < 0 && FL.slice(0, -sig).includes(l) ? -1 : 0;
    const cost = notes.filter(n => n.a !== accOf(n.l)).length * 2 + Math.abs(sig) * 0.1;
    if (!best || cost < best.cost) best = { sig, cost };
  }
  return best.sig;
}

// the name of a mood in a key: "C♯ Phrygian", "E♭ major" (names of people and places keep their capital)
export function tonicName(moodId, pc) {
  const t = moodScale(moodId, pc)[0];
  return `${'CDEFGAB'[t.l]}${t.a > 0 ? '♯' : t.a < 0 ? '♭' : ''}`;
}
export function moodName(moodId, pc) {
  const n = MOOD_BY[moodId].n;
  const proper = /^(Dorian|Phrygian|Lydian|Mixolydian|Locrian|Hirajoshi)/.test(n);
  return `${tonicName(moodId, pc)} ${proper ? n : n[0].toLowerCase() + n.slice(1)}`;
}

// does a scale sit mostly on black keys from this tonic (half or more of its notes)?
export const blackKey = (moodId, pc) => {
  const ms = MOOD_BY[moodId].semis.map(s => pc + s);
  return ms.filter(onBlack).length >= ms.length / 2 || onBlack(pc);
};

/* ---------- fingering ----------
   Every scale with a published fingering keeps it. The modes are fingered like the major scale they come
   from (the same finger on the same key, as teachers do it): D Dorian is C major's fingering started on D.
   Phrygian dominant borrows harmonic minor's the same way. */
const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const HARMONIC_STEPS = [0, 2, 3, 5, 7, 8, 11];
// the parent scale: the fingering table to use, and where its tonic is relative to the mood's
const PARENT = {
  major: ['major', 0],
  dorian: ['major', -2],
  phrygian: ['major', -4],
  lydian: ['major', -5],
  mixolydian: ['major', -7],
  locrian: ['major', -11],
  natural: ['minor', 0],
  harmonic: ['minor', 0],
  melodic: ['minor', 0],
  phrygdom: ['minor', 5],
};

// key -> finger in the parent scale, for one hand: {pitch class: finger} (the fingers between the ends)
function parentMap(moodId, pc, hand) {
  const [fam, off] = PARENT[moodId];
  const root = (pc + off + 12) % 12;
  const f = scaleFingers((fam === 'major' ? MAJOR_NAMES : MINOR_NAMES)[root], fam, hand, 1).slice(0, 8);
  // natural and melodic minor share the minor table degree by degree; the others go by key
  const degrees =
    fam === 'major' ? MAJOR_STEPS : moodId === 'phrygdom' ? HARMONIC_STEPS : MOOD_BY[moodId].semis;
  const map = {};
  degrees.forEach((s, i) => (map[(root + s) % 12] = hand === 'rh' ? f[i] : f[i === 0 ? 7 : i]));
  return map;
}

// fingers for a scale run up `octs` octaves and back down (the order the drill plays it)
export function moodFingering(moodId, pc, hand, octs) {
  const up = scaleMidis(moodId, pc, hand, octs);
  let f;
  if (PARENT[moodId]) {
    const map = parentMap(moodId, pc, hand);
    f = up.map(m => map[((m % 12) + 12) % 12]);
    // the ends: no thumb on the last key going up (right hand) or the first (left hand)
    const last = f.length - 1;
    if (hand === 'rh' && f[last] === 1) f[last] = Math.min(5, f[last - 1] + 1);
    if (hand === 'lh' && f[0] === 1) f[0] = Math.min(5, f[1] + 1);
    // a raised note (melodic minor's 6th and 7th) can put the parent's thumb on a black key: work it out
    if (!f.some((x, i) => x === 1 && onBlack(up[i]))) return f.concat(f.slice(0, -1).reverse());
  }
  return scaleFingering(up, hand);
}

/* The other scales (pentatonics, blues, whole tone, diminished, Hirajoshi, double harmonic) have no
   standard fingering, so DaCapo works one out from the rules pianists use, written as costs:
     - the thumb never lands on a black key if it can help it
     - the thumb passes under after the 3rd or 4th finger, best right after a black key
     - fingers go up in order between crossings; skipping one is fine only across a wide gap
     - no stretch wider than the hand allows between two fingers
     - the 5th finger only at the top (right hand) or bottom (left hand) end
   The cheapest fingering wins (dynamic programming). */
const REACH = { 12: 5, 13: 7, 14: 8, 15: 9, 23: 3, 24: 5, 25: 7, 34: 3, 35: 5, 45: 3 };

// moving outward (away from the thumb) by d semitones from finger f1 to f2; b1, b2: black keys
function stepCost(d, b1, b2, f1, f2) {
  if (f2 > f1) {
    if (d > REACH[f1 * 10 + f2]) return Infinity;
    const skipped = f2 - f1 - 1;
    // a skipped finger is natural over a wide gap, awkward over a step
    return skipped * (d >= 3 ? 0.3 : 1.5) + (d >= 4 && skipped === 0 && f1 > 1 ? 1 : 0);
  }
  if (f2 === 1 && f1 >= 2 && f1 <= 4) {
    // the thumb passes under
    if (d > (f1 === 2 ? 3 : 4)) return Infinity;
    let c = 1.6 + (f1 === 2 ? 1.2 : 0) + (d >= 3 ? 0.6 : 0);
    if (b2) c += 7;
    if (b1 && !b2) c -= 1.2; // the classic place: thumb on the white key right after a black one
    return c;
  }
  return Infinity;
}

function nodeCost(black, f, i, last) {
  let c = 0;
  if (f === 1 && black) c += 5;
  if (f === 5 && i !== last) c += 4;
  if (f === 5 && black) c += 2; // the short fifth finger reaches a black key awkwardly
  if (f === 4 && i === last && !black) c += 0.2; // a white end note is normally taken with 5
  return c;
}

// fingers for keys played moving outward from the thumb (right hand up, left hand down), in that order
function fingerOutward(midis) {
  const n = midis.length;
  const last = n - 1;
  const black = midis.map(onBlack);
  const cost = Array.from({ length: n }, () => Array(6).fill(Infinity));
  const from = Array.from({ length: n }, () => Array(6).fill(0));
  for (let f = 1; f <= 5; f++) {
    // a scale starts on the thumb from a white key, on 2 (or 3 or 4) from a black one
    const start = black[0] ? (f === 2 ? 0 : f === 3 || f === 4 ? 0.8 : 4) : f === 1 ? 0 : 3;
    cost[0][f] = start + nodeCost(black[0], f, 0, last);
  }
  for (let i = 1; i < n; i++) {
    const d = Math.abs(midis[i] - midis[i - 1]);
    for (let f2 = 1; f2 <= 5; f2++)
      for (let f1 = 1; f1 <= 5; f1++) {
        const c =
          cost[i - 1][f1] + stepCost(d, black[i - 1], black[i], f1, f2) + nodeCost(black[i], f2, i, last);
        if (c < cost[i][f2]) {
          cost[i][f2] = c;
          from[i][f2] = f1;
        }
      }
  }
  let f = 1;
  for (let g = 2; g <= 5; g++) if (cost[last][g] < cost[last][f]) f = g;
  const out = [f];
  for (let i = last; i > 0; i--) out.unshift((f = from[i][f]));
  return out;
}

/* fingers for a scale run up and back down, as the drill plays it. midisUp: the notes going up, tonic to
   tonic. The left hand's thumb is on the right, so going down it moves like the right hand going up: its
   fingering is worked out from the top note down. */
function scaleFingering(midisUp, hand) {
  const up = hand === 'rh' ? fingerOutward(midisUp) : fingerOutward(midisUp.slice().reverse()).reverse();
  return up.concat(up.slice(0, -1).reverse());
}

// the notes of a scale run going up, spelled: the right hand from the tonic nearest middle C (an octave
// lower from F up), the left hand an octave below the right
function runNotes(moodId, pc, hand, octs) {
  const one = moodScale(moodId, pc);
  const shift = (midiOf(one[0]) > 64 ? -1 : 0) + (hand === 'lh' ? -1 : 0);
  const out = [];
  for (let o = 0; o <= octs; o++)
    one.forEach((n, i) => {
      if (o < octs || i === 0) out.push(N(n.l, n.a, n.o + shift + o));
    });
  return out;
}
export const scaleMidis = (moodId, pc, hand, octs) => runNotes(moodId, pc, hand, octs).map(midiOf);

/* a scale run as drill steps: up and back down, two notes a beat, with fingers.
   hand 'rh' | 'lh' | 'ht' (hands together, an octave apart). Steps as the player uses them. */
export function moodRun(moodId, pc, hand, octs) {
  const side = h => {
    const up = runNotes(moodId, pc, h, octs);
    return { notes: up.concat(up.slice(0, -1).reverse()), fingers: moodFingering(moodId, pc, h, octs) };
  };
  const R = side('rh');
  const L = side('lh');
  const note = (S, h, i) => ({ n: S.notes[i], st: h === 'rh' ? 't' : 'b', f: S.fingers[i], fcls: h });
  const steps = R.notes.map((_, i) => {
    const notes =
      hand === 'ht' ? [note(R, 'rh', i), note(L, 'lh', i)] : [note(hand === 'rh' ? R : L, hand, i)];
    return { midis: notes.map(x => midiOf(x.n)), notes, beat: i / 2 };
  });
  return {
    steps,
    sig: sigFor(moodScale(moodId, pc)),
    clef: hand === 'ht' ? 'grand' : hand === 'rh' ? 'treble' : 'bass',
  };
}

/* ---------- ways to group the keys ---------- */
// by hand shape: keys whose scale (right hand, one octave) uses the same fingering pattern
export function handShapes(moodId) {
  const groups = new Map();
  PCS.forEach(pc => {
    const f = moodFingering(moodId, pc, 'rh', 1).slice(0, MOOD_BY[moodId].semis.length + 1);
    const key = f.join('');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pc);
  });
  return [...groups.entries()]
    .map(([fingers, pcs]) => ({ fingers, pcs }))
    .sort((a, b) => b.pcs.length - a.pcs.length);
}

// by neighbor: around the circle of fifths, each key one note different from the last
export const CIRCLE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
