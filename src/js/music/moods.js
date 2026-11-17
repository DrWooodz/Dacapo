/* Moods: the scales to improvise in, by the sound they make. A mood is a scale type (its intervals); it can
   be played from any of the 12 keys. This module is pure: the moods, each one spelled in every key, its
   fingering, its chords and progressions, arpeggios and inversions, the circle of fifths, and how moods
   relate (one note different, or the same notes from another home). */
import { midiOf, N, scaleFingers, spellAbove, spellerFor } from './theory.js';

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
    vibes: ['melancholy', 'wistful', 'brooding', 'nostalgic', 'longing', 'lonely', 'rainy', 'earnest'],
    hear: 'most minor-key pop and rock ballads',
    how: 'The plain minor scale: its 3rd, 6th and 7th are low. Its chords on the low 6th and 7th are major, so i – ♭VI – ♭VII climbs home without a leading note.',
    semis: [0, 2, 3, 5, 7, 8, 10],
    color: [8, 'the low 6th', 'the sad note: lean on it and let it fall a half step to the 5th'],
    sigChord: 8,
    progs: [
      {
        chords: [
          [0, 'min'],
          [8, 'maj'],
          [10, 'maj'],
          [0, 'min'],
        ],
        why: 'climbs home without a leading note: earnest, heroic',
      },
      {
        chords: [
          [0, 'min'],
          [10, 'maj'],
          [8, 'maj'],
          [10, 'maj'],
        ],
        why: 'the rock and pop minor loop',
      },
      {
        chords: [
          [0, 'min'],
          [5, 'min'],
          [7, 'min'],
          [0, 'min'],
        ],
        why: 'all minor chords: old and modal',
      },
    ],
  },
  {
    id: 'harmonic',
    n: 'Harmonic minor',
    fam: 'dark',
    feel: 'dark, dramatic, a little exotic',
    vibes: [
      'tragic',
      'fateful',
      'dramatic',
      'brooding',
      'tormented',
      'gothic',
      'russian',
      'romantic',
      'yearning',
      'intense',
      'twisting',
    ],
    hear: 'classical and baroque minor pieces, neoclassical metal',
    how: 'Natural minor with its 7th raised a half step. That leaves a wide gap (a step and a half) between the 6th and 7th, which gives its exotic edge, and makes V a major chord that pulls hard back home.',
    semis: [0, 2, 3, 5, 7, 8, 11],
    color: [
      11,
      'the raised 7th',
      'a half step under home: it pulls up hard, and the gap below it sounds exotic',
    ],
    sigChord: 7,
    progs: [
      {
        chords: [
          [0, 'min'],
          [5, 'min'],
          [7, 'maj'],
          [0, 'min'],
        ],
        why: 'the classical minor cadence: V pulls home',
      },
      {
        chords: [
          [0, 'min'],
          [8, 'maj'],
          [7, 'maj'],
          [0, 'min'],
        ],
        why: 'dramatic: ♭VI sinks to V',
      },
      {
        chords: [
          [0, 'min'],
          [7, 'dom7'],
          [0, 'min'],
          [7, 'dom7'],
        ],
        why: 'rocking between home and its pull',
      },
    ],
  },
  {
    id: 'phrygian',
    n: 'Phrygian',
    fam: 'dark',
    feel: 'ominous, Spanish',
    vibes: ['ominous', 'menacing', 'threatening', 'heavy', 'primal', 'spanish', 'brooding'],
    hear: 'flamenco, heavy-metal riffs, menacing film cues',
    how: 'Natural minor with its 2nd lowered a half step. That low 2nd, a half step above home, is its whole flavor: the chord on it (♭II) sliding down to i sounds like a threat.',
    semis: [0, 1, 3, 5, 7, 8, 10],
    color: [1, 'the low 2nd', 'a half step above home: menacing; slide it down onto the tonic'],
    sigChord: 1,
    progs: [
      {
        chords: [
          [0, 'min'],
          [1, 'maj'],
          [0, 'min'],
          [1, 'maj'],
        ],
        why: 'the Phrygian vamp: ♭II sliding down to i',
      },
      {
        chords: [
          [0, 'min'],
          [1, 'maj'],
          [3, 'maj'],
          [1, 'maj'],
        ],
        why: 'a heavy-metal climb and fall',
      },
    ],
  },
  {
    id: 'locrian',
    n: 'Locrian',
    fam: 'dark',
    feel: 'unstable, uneasy',
    vibes: ['unstable', 'uneasy', 'unresolved', 'twisted', 'nightmare', 'horror', 'dissonant'],
    hear: 'horror cues and some heavy metal; rare as a home key',
    how: 'Phrygian with its 5th lowered too. Its home chord is diminished, so it never quite settles: use it for unease, not for rest.',
    semis: [0, 1, 3, 5, 6, 8, 10],
    color: [6, 'the low 5th', 'the tritone above home: it makes the tonic chord diminished'],
    sigChord: 1,
    progs: [
      {
        chords: [
          [0, 'dim'],
          [1, 'maj'],
          [0, 'dim'],
          [1, 'maj'],
        ],
        why: 'uneasy: home never settles',
      },
      {
        chords: [
          [0, 'dim'],
          [6, 'maj'],
          [1, 'maj'],
          [0, 'dim'],
        ],
        why: 'wandering, horror-film',
      },
    ],
  },
  {
    id: 'dorian',
    n: 'Dorian',
    fam: 'bittersweet',
    feel: 'minor, but hopeful; folk and adventure',
    vibes: ['hopeful', 'bittersweet', 'wandering', 'cool', 'soulful', 'folk', 'adventurous'],
    hear: '"Scarborough Fair", Santana\'s "Oye Como Va", Miles Davis\'s "So What"',
    how: 'Natural minor with its 6th raised a half step. That one brighter note makes IV a major chord: rocking between i and IV is the Dorian sound.',
    semis: [0, 2, 3, 5, 7, 9, 10],
    color: [9, 'the raised 6th', 'the bright note in a minor scale: land on it over the IV chord'],
    sigChord: 5,
    progs: [
      {
        chords: [
          [0, 'min'],
          [5, 'maj'],
          [0, 'min'],
          [5, 'maj'],
        ],
        why: 'the Dorian vamp (Oye Como Va, So What)',
      },
      {
        chords: [
          [0, 'min'],
          [3, 'maj'],
          [5, 'maj'],
          [0, 'min'],
        ],
        why: 'climbing, hopeful',
      },
      {
        chords: [
          [0, 'min'],
          [10, 'maj'],
          [5, 'maj'],
          [0, 'min'],
        ],
        why: 'folk and adventure',
      },
    ],
  },
  {
    id: 'melodic',
    n: 'Melodic minor',
    fam: 'bittersweet',
    feel: 'smooth, sophisticated, jazzy',
    vibes: ['smooth', 'sophisticated', 'jazzy', 'noir', 'elegant', 'nocturnal', 'yearning'],
    hear: 'jazz (players call it the jazz minor)',
    how: 'A major scale with a lowered 3rd: minor at the bottom, major at the top. Here it is played the same way up and down, as jazz players use it.',
    semis: [0, 2, 3, 5, 7, 9, 11],
    color: [
      11,
      'the raised 7th over a minor 3rd',
      'minor below, major above: let a phrase climb through 6 and 7 to home',
    ],
    sigChord: 5,
    progs: [
      {
        chords: [
          [0, 'min'],
          [5, 'dom7'],
          [0, 'min'],
          [5, 'dom7'],
        ],
        why: 'a jazz minor vamp',
      },
      {
        chords: [
          [0, 'min'],
          [2, 'min'],
          [7, 'dom7'],
          [0, 'min'],
        ],
        why: 'minor ii – V – i',
      },
    ],
  },
  {
    id: 'minpent',
    n: 'Minor pentatonic',
    fam: 'bittersweet',
    feel: 'bluesy, simple, impossible to get wrong',
    vibes: ['bluesy', 'gritty', 'raw', 'rock', 'soulful', 'simple'],
    hear: 'blues and rock guitar solos',
    how: 'Five notes of natural minor, without the 2nd and 6th. No half steps, so no note clashes with another: the easiest scale to improvise in.',
    semis: [0, 3, 5, 7, 10],
    color: [
      3,
      'the minor 3rd',
      'it makes the scale minor: slide into it from the key just below, as blues players do',
    ],
    sigChord: 10,
    parent: 'natural',
    progs: [
      {
        chords: [
          [0, 'min'],
          [5, 'min'],
          [0, 'min'],
          [10, 'maj'],
        ],
        why: 'a blues-rock minor groove',
      },
      {
        chords: [
          [0, 'min'],
          [10, 'maj'],
          [8, 'maj'],
          [10, 'maj'],
        ],
        why: 'the rock loop: every note fits',
      },
    ],
  },
  {
    id: 'phrygdom',
    n: 'Phrygian dominant',
    fam: 'exotic',
    feel: 'Middle Eastern, Spanish, fiery',
    vibes: ['fiery', 'passionate', 'exotic', 'intense', 'desert', 'spanish'],
    hear: 'klezmer and Middle Eastern music ("Hava Nagila"), flamenco',
    how: 'Phrygian with a major 3rd: the low 2nd and the wide gap up to the 3rd make it sound unmistakably Middle Eastern. It is harmonic minor started from its 5th note.',
    semis: [0, 1, 4, 5, 7, 8, 10],
    color: [
      1,
      'the low 2nd against a major 3rd',
      'the wide gap between them is the sound: play 1 – ♭2 – 3 slowly',
    ],
    sigChord: 1,
    progs: [
      {
        chords: [
          [0, 'maj'],
          [1, 'maj'],
          [0, 'maj'],
          [1, 'maj'],
        ],
        why: 'the Middle Eastern vamp',
      },
      {
        chords: [
          [0, 'maj'],
          [1, 'maj'],
          [10, 'min'],
          [0, 'maj'],
        ],
        why: 'circling home',
      },
      {
        chords: [
          [5, 'min'],
          [1, 'maj'],
          [0, 'maj'],
          [0, 'maj'],
        ],
        why: 'a flamenco close: iv – ♭II – I',
      },
    ],
  },
  {
    id: 'dblharm',
    n: 'Double harmonic',
    fam: 'exotic',
    feel: 'very exotic, snake-charmer',
    vibes: ['exotic', 'mystical', 'hypnotic', 'ancient', 'desert', 'intense'],
    hear: 'Dick Dale\'s "Misirlou", Arabic and Indian music',
    how: 'Two wide gaps, one in each half: a low 2nd up to a major 3rd, and a low 6th up to a major 7th. Both halves have the same shape.',
    semis: [0, 1, 4, 5, 7, 8, 11],
    color: [
      1,
      'the low 2nd and the major 7th',
      'two wide gaps around home: trill between 7 and 1, and between ♭2 and 1',
    ],
    sigChord: 1,
    progs: [
      {
        chords: [
          [0, 'maj'],
          [1, 'maj'],
          [0, 'maj'],
          [1, 'maj'],
        ],
        why: 'the snake-charmer vamp',
      },
      {
        chords: [
          [0, 'maj'],
          [5, 'min'],
          [1, 'maj'],
          [0, 'maj'],
        ],
        why: 'darker, with iv',
      },
    ],
  },
  {
    id: 'hirajoshi',
    n: 'Hirajoshi',
    fam: 'exotic',
    feel: 'Japanese, haunting, still',
    vibes: ['haunting', 'still', 'sparse', 'meditative', 'misty', 'ancient', 'japanese'],
    hear: 'Japanese koto music',
    how: 'Five notes with two half steps (2nd to 3rd, 5th to 6th) and two wide gaps. Slow, spacious phrases suit it best.',
    semis: [0, 2, 3, 7, 8],
    color: [8, 'the low 6th', 'the half step above the 5th: let phrases fall onto the 5th'],
    sigChord: 8,
    progs: [
      {
        chords: [
          [0, 'min'],
          [8, 'maj'],
          [0, 'min'],
          [8, 'maj'],
        ],
        why: 'still and spacious',
      },
      {
        chords: [
          [8, 'maj'],
          [0, 'min'],
          [8, 'maj'],
          [0, 'min'],
        ],
        why: 'the same, starting away from home',
      },
    ],
  },
  {
    id: 'wholetone',
    n: 'Whole tone',
    fam: 'strange',
    feel: 'dreamy, floating, weightless',
    vibes: ['dreamy', 'floating', 'weightless', 'hazy', 'surreal', 'unresolved', 'impressionist'],
    hear: 'Debussy ("Voiles"), dream sequences in film and cartoons',
    how: 'Only whole steps, six notes to the octave. Every note is the same distance from its neighbors, so none feels like home: the music floats.',
    semis: [0, 2, 4, 6, 8, 10],
    usual: [0, 1, 2, 3, 4, 5], // written C D E F♯ G♯ A♯

    color: [
      6,
      'the raised 4th',
      'every note is a whole step from the next: no note feels like home, so drift',
    ],
    sigChord: 2,
    progs: [
      {
        chords: [
          [0, 'aug'],
          [2, 'aug'],
          [0, 'aug'],
          [2, 'aug'],
        ],
        why: 'floating: two augmented chords',
      },
      {
        chords: [
          [0, 'aug'],
          [2, 'aug'],
          [4, 'aug'],
          [2, 'aug'],
        ],
        why: 'a dream sequence, drifting up',
      },
    ],
  },
  {
    id: 'diminished',
    n: 'Diminished',
    fam: 'strange',
    feel: 'suspense, tension, a villain sneaking up',
    vibes: ['suspense', 'tension', 'sinister', 'creeping', 'anxious', 'twisting', 'villain'],
    hear: 'suspense and villain cues; jazz over diminished chords',
    how: 'Whole step, half step, over and over: eight notes. It repeats every three half steps, so it sounds the same from four places: tense and circling.',
    semis: [0, 2, 3, 5, 6, 8, 9, 11],
    color: [
      6,
      'the low 5th',
      'the tritone above home makes the home chord diminished: step from it up to the 6th, and the circling starts',
    ],
    sigChord: 2,
    progs: [
      {
        chords: [
          [0, 'dim7'],
          [2, 'dim7'],
          [0, 'dim7'],
          [2, 'dim7'],
        ],
        why: 'suspense: two diminished chords',
      },
      {
        chords: [
          [0, 'dim7'],
          [2, 'maj'],
          [0, 'dim7'],
          [5, 'maj'],
        ],
        why: 'tension with major chords hidden in it',
      },
    ],
  },
  {
    id: 'major',
    n: 'Major',
    fam: 'bright',
    feel: 'happy, settled, open',
    vibes: ['happy', 'settled', 'open', 'triumphant', 'warm', 'hopeful', 'hymn'],
    hear: 'most cheerful pop, folk songs and hymns',
    how: 'The plain major scale: whole, whole, half, whole, whole, whole, half. Home is I; IV and V lead back to it.',
    semis: [0, 2, 4, 5, 7, 9, 11],
    color: [
      11,
      'the leading note (the 7th)',
      'a half step under home: it pulls up, and sounds finished when it gets there',
    ],
    sigChord: 7,
    progs: [
      {
        chords: [
          [0, 'maj'],
          [5, 'maj'],
          [7, 'maj'],
          [0, 'maj'],
        ],
        why: 'home, away, tension, home',
      },
      {
        chords: [
          [0, 'maj'],
          [9, 'min'],
          [5, 'maj'],
          [7, 'maj'],
        ],
        why: 'the 1950s progression',
      },
      {
        chords: [
          [0, 'maj'],
          [7, 'maj'],
          [9, 'min'],
          [5, 'maj'],
        ],
        why: 'the most common pop progression',
      },
    ],
  },
  {
    id: 'mixolydian',
    n: 'Mixolydian',
    fam: 'bright',
    feel: 'folk, Celtic, adventurous',
    vibes: ['rousing', 'earthy', 'celtic', 'folk', 'adventurous', 'rock'],
    hear: 'The Beatles\' "Norwegian Wood", Celtic folk tunes',
    how: 'Major with its 7th lowered a half step. The chord on that lowered 7th (♭VII) going back to I sounds open rather than final.',
    semis: [0, 2, 4, 5, 7, 9, 10],
    color: [10, 'the low 7th', 'a whole step under home: phrases come home from below without pulling'],
    sigChord: 10,
    progs: [
      {
        chords: [
          [0, 'maj'],
          [10, 'maj'],
          [5, 'maj'],
          [0, 'maj'],
        ],
        why: 'the folk and rock progression',
      },
      {
        chords: [
          [0, 'maj'],
          [10, 'maj'],
          [0, 'maj'],
          [10, 'maj'],
        ],
        why: 'the Mixolydian vamp',
      },
    ],
  },
  {
    id: 'lydian',
    n: 'Lydian',
    fam: 'bright',
    feel: 'magical, wondrous, film music',
    vibes: ['wondrous', 'magical', 'floating', 'cinematic', 'awe', 'dreamy'],
    hear: '"The Simpsons" theme, film scores for flying and wonder',
    how: 'Major with its 4th raised a half step. That makes II a major chord: I to II floats upward without ever settling.',
    semis: [0, 2, 4, 6, 7, 9, 11],
    color: [6, 'the raised 4th', 'one note above the plain 4th: hold it over the I chord and it shimmers'],
    sigChord: 2,
    progs: [
      {
        chords: [
          [0, 'maj'],
          [2, 'maj'],
          [0, 'maj'],
          [2, 'maj'],
        ],
        why: 'the Lydian float: I – II',
      },
      {
        chords: [
          [0, 'maj'],
          [2, 'maj'],
          [11, 'min'],
          [0, 'maj'],
        ],
        why: 'wonder, film music',
      },
    ],
  },
  {
    id: 'majpent',
    n: 'Major pentatonic',
    fam: 'bright',
    feel: 'open, simple, folk',
    vibes: ['pastoral', 'peaceful', 'calm', 'open', 'folk', 'country'],
    hear: 'folk melodies, country, many East Asian folk tunes',
    how: 'Five notes of the major scale, without the 4th and 7th. No half steps, so nothing clashes.',
    semis: [0, 2, 4, 7, 9],
    color: [9, 'the 6th', 'sweet and open: end phrases on it instead of on home'],
    sigChord: 9,
    parent: 'major',
    progs: [
      {
        chords: [
          [0, 'maj'],
          [9, 'min'],
          [0, 'maj'],
          [9, 'min'],
        ],
        why: 'gentle, folk',
      },
      {
        chords: [
          [0, 'maj'],
          [5, 'maj'],
          [0, 'maj'],
          [7, 'maj'],
        ],
        why: 'country: home, away, home, the pull back',
      },
    ],
  },
  {
    id: 'blues',
    n: 'Blues',
    fam: 'bright',
    feel: 'gritty, soulful',
    vibes: ['gritty', 'soulful', 'swagger', 'smoky', 'raw', 'late-night'],
    hear: 'blues, rock and roll, jazz',
    how: 'Minor pentatonic plus one passing note between the 4th and 5th, the blue note. Slide through it; do not sit on it.',
    semis: [0, 3, 5, 6, 7, 10],
    color: [6, 'the blue note', 'the flat 5th: slide through it to the 5th, never sit on it'],
    sigChord: 5,
    progs: [
      {
        chords: [
          [0, 'dom7'],
          [0, 'dom7'],
          [0, 'dom7'],
          [0, 'dom7'],
          [5, 'dom7'],
          [5, 'dom7'],
          [0, 'dom7'],
          [0, 'dom7'],
          [7, 'dom7'],
          [5, 'dom7'],
          [0, 'dom7'],
          [7, 'dom7'],
        ],
        why: 'the 12-bar blues',
      },
      {
        chords: [
          [0, 'dom7'],
          [5, 'dom7'],
          [0, 'dom7'],
          [5, 'dom7'],
        ],
        why: 'a two-chord blues vamp',
      },
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
/* a mood in a key, spelled: of the tonic's two names (C♯ or D♭), the one whose scale needs fewer
   accidentals; on a tie, the usual key name (E♭ minor, F♯ major). Harmonic and melodic minor take their
   natural minor's tonic: G♯ harmonic minor (with its F𝄪), not A♭. */
export function moodScale(moodId, pc) {
  const mood = MOOD_BY[moodId];
  if (moodId === 'harmonic' || moodId === 'melodic') return spellFrom(moodScale('natural', pc)[0], mood);
  const usual = (mood.semis.includes(3) && !mood.semis.includes(4) ? MINOR_NAMES : MAJOR_NAMES)[pc];
  const named = sc => 'CDEFGAB'[sc[0].l] + (sc[0].a > 0 ? '#' : sc[0].a < 0 ? 'b' : '') === usual;
  const options = TONICS[pc].map(t => spellFrom(t, mood));
  return options.reduce((a, b) =>
    accidentals(b) < accidentals(a) || (accidentals(b) === accidentals(a) && named(b)) ? b : a,
  );
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
// a mood's key signature: the one that needs the fewest accidentals, except that harmonic and melodic
// minor are written with their natural minor's signature and the raised notes marked, as in printed music
export const moodSig = (moodId, pc) =>
  sigFor(moodScale(['harmonic', 'melodic'].includes(moodId) ? 'natural' : moodId, pc));

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
  return scaleFingering(up, hand, octs);
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
// arpeggios leap: the hand opens wider, and the thumb passes under a bigger gap
const ARP = {
  reach: { 12: 6, 13: 8, 14: 9, 15: 10, 23: 5, 24: 7, 25: 8, 34: 4, 35: 6, 45: 4 },
  under: [4, 6],
};
const SCALE = { reach: REACH, under: [3, 4] };

// moving outward (away from the thumb) by d semitones from finger f1 to f2; b1, b2: black keys
function stepCost(d, b1, b2, f1, f2, hand = SCALE) {
  if (f2 > f1) {
    if (d > hand.reach[f1 * 10 + f2]) return Infinity;
    const skipped = f2 - f1 - 1;
    // a skipped finger is natural over a wide gap, awkward over a step
    return skipped * (d >= 3 ? 0.3 : 1.5) + (d >= 4 && skipped === 0 && f1 > 1 ? 1 : 0);
  }
  if (f2 === 1 && f1 >= 2 && f1 <= 4) {
    // the thumb passes under
    if (d > hand.under[f1 === 2 ? 0 : 1]) return Infinity;
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
function fingerOutward(midis, hand = SCALE, { open = false, first = 0, end = 0 } = {}) {
  const n = midis.length;
  const last = open ? -1 : n - 1; // open: the last note is not an end, the run goes on from it
  const black = midis.map(onBlack);
  const cost = Array.from({ length: n }, () => Array(6).fill(Infinity));
  const from = Array.from({ length: n }, () => Array(6).fill(0));
  for (let f = 1; f <= 5; f++) {
    if (first && f !== first) continue;
    // a scale starts on the thumb from a white key, on 2 (or 3 or 4) from a black one
    const start = black[0] ? (f === 2 ? 0 : f === 3 || f === 4 ? 0.8 : 4) : f === 1 ? 0 : 3;
    cost[0][f] = start + nodeCost(black[0], f, 0, last);
  }
  for (let i = 1; i < n; i++) {
    const d = Math.abs(midis[i] - midis[i - 1]);
    for (let f2 = 1; f2 <= 5; f2++)
      for (let f1 = 1; f1 <= 5; f1++) {
        const c =
          cost[i - 1][f1] +
          stepCost(d, black[i - 1], black[i], f1, f2, hand) +
          nodeCost(black[i], f2, i, last);
        if (c < cost[i][f2]) {
          cost[i][f2] = c;
          from[i][f2] = f1;
        }
      }
  }
  let f = end || 1;
  if (!end) for (let g = 2; g <= 5; g++) if (cost[n - 1][g] < cost[n - 1][f]) f = g;
  if (cost[n - 1][f] === Infinity) return null;
  const out = [f];
  for (let i = n - 1; i > 0; i--) out.unshift((f = from[i][f]));
  out.cost = cost[n - 1][out[n - 1]];
  return out;
}

/* fingers for a run of several octaves that repeats one octave's pattern, as published fingerings do.
   oneUp: one octave going up, with the top note. Worked out moving outward from the thumb (the right
   hand going up, the left hand coming down from the top). For two octaves or more the octave's pattern
   must loop: its top note takes the finger its first note had, so the next octave starts the same way. */
function octaveFingers(oneUp, octs, handId, reach = SCALE) {
  const outward = handId === 'rh' ? oneUp : oneUp.slice().reverse();
  const flip = f => (handId === 'rh' ? f : f.slice().reverse());
  if (octs === 1 && reach !== ARP) return flip(fingerOutward(outward, reach)); // (arpeggios keep their 2-octave pattern)
  const n = outward.length - 1;
  let cyc = null;
  for (let s = 1; s <= 5; s++) {
    const r = fingerOutward(outward, reach, { open: true, first: s, end: s });
    if (r && (!cyc || r.cost < cyc.cost)) cyc = r;
  }
  const seq = [];
  for (let o = 0; o < octs; o++) seq.push(...cyc.slice(0, n));
  // the last note: the next finger up if it reaches, as a run normally ends (an arpeggio ending on a
  // black key keeps its pattern's finger: D♭ major ends on 4 in the right hand, 2 in the left)
  const prev = seq[seq.length - 1];
  const d = Math.abs(outward[n] - outward[n - 1]);
  const black = onBlack(outward[n]);
  let end = cyc[n];
  if (!(reach === ARP && black))
    for (let f = prev + 1; f <= 5; f++)
      if (stepCost(d, onBlack(outward[n - 1]), black, prev, f, reach) < Infinity) end = f;
  seq.push(end);
  return flip(seq);
}

/* fingers for a scale run up and back down, as the drill plays it. midisUp: the notes going up, tonic to
   tonic. The left hand's thumb is on the right, so going down it moves like the right hand going up: its
   fingering is worked out from the top note down. */
function scaleFingering(midisUp, hand, octs) {
  const n = (midisUp.length - 1) / octs;
  const up = octaveFingers(midisUp.slice(0, n + 1), octs, hand);
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
    sig: moodSig(moodId, pc),
    clef: hand === 'ht' ? 'grand' : hand === 'rh' ? 'treble' : 'bass',
  };
}

// the circle of fifths: each key one note different from the last
export const CIRCLE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

/* ---------- chords ----------
   Chords are [semitones above the tonic, type]. Numerals count from the tonic on its major scale, so the
   same numeral sounds the same in every mood: ♭VII is a major chord a whole step below home. */
export const CHORD_TONES = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11],
  dom7: [0, 4, 7, 10],
  min7: [0, 3, 7, 10],
  hdim7: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  minmaj7: [0, 3, 7, 11],
  augmaj7: [0, 4, 8, 11],
};
const SUFFIX = {
  maj: '',
  min: 'm',
  dim: '°',
  aug: '+',
  sus2: 'sus2',
  sus4: 'sus4',
  maj7: 'maj7',
  dom7: '7',
  min7: 'm7',
  hdim7: 'm7♭5',
  dim7: '°7',
  minmaj7: 'm(maj7)',
  augmaj7: '+maj7',
};
const TYPE_WORD = {
  maj: 'major',
  min: 'minor',
  dim: 'diminished',
  aug: 'augmented',
  sus2: 'suspended 2nd',
  sus4: 'suspended 4th',
  maj7: 'major 7th',
  dom7: 'dominant 7th',
  min7: 'minor 7th',
  hdim7: 'half-diminished',
  dim7: 'diminished 7th',
  minmaj7: 'minor-major 7th',
  augmaj7: 'augmented major 7th',
};
const DEGREE = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];
const LOWER = new Set(['min', 'dim', 'min7', 'hdim7', 'dim7', 'minmaj7']);
const NUM_SUFFIX = {
  dim: '°',
  aug: '+',
  dim7: '°7',
  hdim7: 'ø7',
  maj7: 'maj7',
  dom7: '7',
  min7: '7',
  minmaj7: '(maj7)',
  augmaj7: '+maj7',
  sus2: 'sus2',
  sus4: 'sus4',
};
/* a chord's numeral counts the letters from home and compares with the major scale: in Locrian the chord
   on the low 5th is ♭V, in Lydian the raised 4th is ♯iv°. The numerals come from the mood's spelling in C,
   so they are the same in every key. */
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
function roman(moodId, semis, type) {
  const s = ((semis % 12) + 12) % 12;
  const scale = moodScale(MOOD_BY[moodId].parent || moodId, 0);
  const root = scale.find(n => ((midiOf(n) % 12) + 12) % 12 === s);
  let d = DEGREE[s];
  if (root) {
    const off = ((s - MAJOR_STEPS[root.l] + 18) % 12) - 6;
    if (Math.abs(off) <= 1) d = (off < 0 ? '♭' : off > 0 ? '♯' : '') + NUMERALS[root.l];
  }
  return (LOWER.has(type) ? d.toLowerCase() : d) + (NUM_SUFFIX[type] || '');
}

// the notes of a chord, spelled from the scale where they are in it
function spellMoodChord(moodId, pc, semis, type) {
  moodId = MOOD_BY[moodId].parent || moodId; // (a pentatonic's chords are spelled from its parent scale)
  const scale = moodScale(moodId, pc);
  const tonic = scale[0];
  const inScale = s => scale.find((n, i) => MOOD_BY[moodId].semis[i] === ((s % 12) + 12) % 12);
  const root = inScale(semis) || spellAbove(tonic, USUAL_LETTER[semis % 12], semis % 12);
  // each note a 3rd, 5th or 7th above the root: rising, and spelled as a chord
  return CHORD_TONES[type].map((x, i) => spellAbove(root, [0, 2, 4, 6][i], x));
}
const noteName = n => 'CDEFGAB'[n.l] + (n.a > 0 ? '♯'.repeat(n.a) : n.a < 0 ? '♭'.repeat(-n.a) : '');

// a chord of a mood, ready to show: numeral, name ("F♯m"), its notes, and what kind it is
export function chordInfo(moodId, pc, [semis, type]) {
  const notes = spellMoodChord(moodId, pc, semis, type);
  return {
    semis,
    type,
    num: roman(moodId, semis, type),
    name: noteName(notes[0]) + SUFFIX[type],
    notes,
    word: TYPE_WORD[type],
  };
}

/* the chords of a mood: the triad and seventh chord on each note of the scale. Seven-note scales stack
   every other note (the chords the scale makes by itself). The pentatonics use the chords of the scale
   they come from; the blues uses its three dominant 7ths; the others list the chords that fit inside them. */
const TRIAD_OF = { '4,7': 'maj', '3,7': 'min', '3,6': 'dim', '4,8': 'aug' };
const SEVENTH_OF = {
  maj: { 11: 'maj7', 10: 'dom7' },
  min: { 10: 'min7', 11: 'minmaj7' },
  dim: { 10: 'hdim7', 9: 'dim7' },
  aug: { 11: 'augmaj7' },
};
export function moodChords(moodId, pc) {
  const M = MOOD_BY[moodId];
  if (M.parent) return moodChords(M.parent, pc);
  let list;
  if (moodId === 'blues')
    list = [
      [0, 'dom7'],
      [5, 'dom7'],
      [7, 'dom7'],
    ].map(c => ({ triad: c, seventh: null }));
  else if (M.semis.length === 7)
    list = M.semis.map((s, i) => {
      const at = k => (M.semis[(i + k) % 7] - s + 12) % 12;
      const triad = TRIAD_OF[[at(2), at(4)].join()];
      const seventh = triad && SEVENTH_OF[triad] ? SEVENTH_OF[triad][at(6)] : null;
      return { triad: [s, triad], seventh: seventh ? [s, seventh] : null };
    });
  else {
    // every triad (and diminished 7th) that lies entirely inside the scale
    const has = s => M.semis.includes(((s % 12) + 12) % 12);
    list = M.semis.flatMap(s =>
      ['maj', 'min', 'dim', 'aug', 'sus4', 'sus2']
        .filter(t => CHORD_TONES[t].every(x => has(s + x)))
        .slice(0, 1)
        .map(t => ({ triad: [s, t], seventh: t === 'dim' && has(s + 9) ? [s, 'dim7'] : null })),
    );
  }
  return list
    .filter(c => c.triad[1])
    .map(c => ({
      ...chordInfo(moodId, pc, c.triad),
      seventh: c.seventh ? chordInfo(moodId, pc, c.seventh) : null,
      signature: c.triad[0] === M.sigChord,
    }));
}

/* ---------- voicings: chords that move as little as possible ----------
   Each chord takes the inversion (and octave) nearest the one before, so the hand stays in one place
   while the harmony changes: voice leading. Right hand around middle C; left hand from E2 to D♯3 for the
   root, the chord just above. */
function nearestVoicing(pcs, prev, lo, hi) {
  let best = null;
  for (let base = lo; base <= hi; base++) {
    if (pcs[0] !== base % 12 && !pcs.includes(base % 12)) continue;
    // a close voicing with its lowest note at base
    const start = pcs.indexOf(base % 12);
    const v = [];
    let m = base;
    for (let k = 0; k < pcs.length; k++) {
      const p = pcs[(start + k) % pcs.length];
      while (m % 12 !== p) m++;
      v.push(m);
    }
    const cost = prev
      ? v.reduce((a, x, i) => a + Math.abs(x - prev[Math.min(i, prev.length - 1)]), 0)
      : Math.abs(v[0] - (lo + hi) / 2);
    if (!best || cost < best.cost) best = { v, cost };
  }
  return best.v;
}
export function voiceProgression(moodId, pc, chords, { lo = 55, hi = 66 } = {}) {
  const tonic = moodScale(moodId, pc)[0];
  const t = ((midiOf(tonic) % 12) + 12) % 12;
  let prev = null;
  return chords.map(([s, type]) => {
    const pcs = CHORD_TONES[type].slice(0, 3).map(x => (t + s + x) % 12);
    const right = nearestVoicing(pcs, prev, lo, hi);
    prev = right;
    const root = 40 + ((t + s - 40 + 120) % 12);
    return { right, root, info: chordInfo(moodId, pc, [s, type]) };
  });
}

/* ---------- drills: a progression, an arpeggio ---------- */
// the progression, one chord a step: the right hand's voiced chord, the left hand's root, or both
/* the fingers for a close triad, by its inversion: root position and 2nd inversion 1 3 5 (left hand 5 3 1
   and 5 2 1), 1st inversion 1 2 5 (left hand 5 3 1) */
function triadFingers(ms, hand) {
  const [a, b, c] = ms;
  // (the wide gap, a 4th or more, is at the top in 1st inversion and at the bottom in 2nd)
  const inv = c - b >= 5 && c - b > b - a ? 1 : b - a >= 5 && b - a > c - b ? 2 : 0;
  return hand === 'rh'
    ? [
        [1, 3, 5],
        [1, 2, 5],
        [1, 3, 5],
      ][inv]
    : [
        [5, 3, 1],
        [5, 3, 1],
        [5, 2, 1],
      ][inv];
}

export function progressionRun(moodId, pc, prog, hand) {
  const V = voiceProgression(moodId, pc, MOOD_BY[moodId].progs[prog].chords);
  const sp = spellerFor(moodSig(moodId, pc));
  const steps = V.map((v, i) => {
    const notes = [];
    if (hand !== 'lh') v.right.forEach(m => notes.push({ n: sp(m), st: 't', fcls: 'rh' }));
    if (hand !== 'rh') notes.push({ n: sp(v.root), st: 'b', fcls: 'lh', f: 5 });
    if (hand !== 'lh') triadFingers(v.right, 'rh').forEach((f, k) => (notes[k].f = f));
    return { midis: notes.map(x => midiOf(x.n)), notes, beat: i * 2, chord: v.info.name };
  });
  return {
    steps,
    sig: moodSig(moodId, pc),
    clef: hand === 'ht' ? 'grand' : hand === 'rh' ? 'treble' : 'bass',
  };
}

// an arpeggio of one chord, root position, up `octs` octaves and back, with fingering for each hand:
// white-root major and minor triads use the standard fingering; the rest is worked out like the scales
export function arpeggioRun(moodId, pc, chord, hand, octs) {
  const info = chordInfo(moodId, pc, chord);
  const tones = CHORD_TONES[chord[1]];
  const root = info.notes[0];
  const side = h => {
    const rm = midiOf(root);
    const shift = (rm > 64 ? -1 : 0) + (h === 'lh' ? -1 : 0);
    const up = [];
    for (let o = 0; o < octs; o++) info.notes.forEach(n => up.push(N(n.l, n.a, n.o + shift + o)));
    up.push(N(root.l, root.a, root.o + shift + octs));
    const ms = up.map(midiOf);
    let f;
    const triad = tones.length === 3 && (chord[1] === 'maj' || chord[1] === 'min') && !onBlack(ms[0]);
    if (triad && h === 'rh') f = ms.map((_, i) => (i === ms.length - 1 ? 5 : [1, 2, 3][i % 3]));
    else if (triad) {
      // the left hand takes 3 on a black third (D, A, E major), 4 otherwise
      const third = onBlack(ms[1]) ? 3 : 4;
      f = ms.map((_, i) => (i === 0 ? 5 : [1, third, 2][i % 3]));
    } else f = octaveFingers(ms.slice(0, tones.length + 1), octs, h, ARP);
    return { notes: up.concat(up.slice(0, -1).reverse()), fingers: f.concat(f.slice(0, -1).reverse()) };
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
    sig: moodSig(moodId, pc),
    clef: hand === 'ht' ? 'grand' : hand === 'rh' ? 'treble' : 'bass',
    info,
  };
}

/* a chord's inversions: root position, 1st, 2nd, root position an octave up, and back down. The right hand
   starts from the root between A3 and G♯4 (C at middle C), the left hand an octave lower */
export function inversionRun(moodId, pc, [semis, type], hand) {
  const t = ((midiOf(moodScale(moodId, pc)[0]) % 12) + 12) % 12;
  const pcs = CHORD_TONES[type].slice(0, 3).map(x => (t + semis + x) % 12);
  const root = 57 + ((pcs[0] - 57 + 120) % 12);
  const sp = spellerFor(moodSig(moodId, pc));
  const shapes = [0, 1, 2, 3].map(inv => {
    const v = [];
    for (let k = 0; k < 3; k++) {
      let m = root + (inv === 3 ? 12 : 0);
      const p = pcs[((inv % 3) + k) % 3];
      if (inv < 3) while (((m % 12) + 12) % 12 !== p || (v.length && m <= v[v.length - 1])) m++;
      else m = root + 12 + CHORD_TONES[type][k];
      if (inv < 3 && k === 0) while (m - 12 >= root) m -= 12;
      v.push(m);
    }
    return v;
  });
  const order = [0, 1, 2, 3, 2, 1, 0];
  const steps = order.map((inv, i) => {
    const notes = [];
    const v = shapes[inv];
    if (hand !== 'lh') {
      const f = triadFingers(v, 'rh');
      v.forEach((m, k) => notes.push({ n: sp(m), st: 't', fcls: 'rh', f: f[k] }));
    }
    if (hand !== 'rh') {
      const f = triadFingers(v, 'lh');
      v.forEach((m, k) => notes.push({ n: sp(m - 12), st: 'b', fcls: 'lh', f: f[k] }));
    }
    return { midis: notes.map(x => midiOf(x.n)), notes, beat: i * 2 };
  });
  return {
    steps,
    sig: moodSig(moodId, pc),
    clef: hand === 'ht' ? 'grand' : hand === 'rh' ? 'treble' : 'bass',
    info: chordInfo(moodId, pc, [semis, type]),
  };
}

/* around the circle of fifths: each major key's home chord, C G D … F C, each the nearest shape to the
   last; the left hand plays the roots. Each chord is spelled in its own key (D♭, not C♯) */
export function circleRun(hand) {
  let prev = null;
  const keys = [...CIRCLE, 0];
  const steps = keys.map((pc, i) => {
    const right = nearestVoicing([pc, (pc + 4) % 12, (pc + 7) % 12], prev, 55, 66);
    prev = right;
    const sp = spellerFor(moodSig('major', pc));
    const root = 40 + ((pc - 40 + 120) % 12);
    const notes = [];
    if (hand !== 'lh') {
      const f = triadFingers(right, 'rh');
      right.forEach((m, k) => notes.push({ n: sp(m), st: 't', fcls: 'rh', f: f[k] }));
    }
    if (hand !== 'rh') notes.push({ n: sp(root), st: 'b', fcls: 'lh', f: 5 });
    return { midis: notes.map(x => midiOf(x.n)), notes, beat: i * 2, chord: tonicName('major', pc) };
  });
  return { steps, sig: 0, clef: hand === 'ht' ? 'grand' : hand === 'rh' ? 'treble' : 'bass' };
}

/* ---------- how moods relate ----------
   one note different, same home: natural minor → harmonic minor raises the 7th. And the same notes from
   another home: A natural minor has C major's notes. */
const DEGREE_NAME = ['home', '2nd', '2nd', '3rd', '3rd', '4th', '', '5th', '6th', '6th', '7th', '7th'];
// (six half steps up is the raised 4th or the lowered 5th: which one depends on where it moves to)
const degreeName = (x, toward) => DEGREE_NAME[x] || (toward > x ? '5th' : '4th');
export function moodNeighbors(id) {
  const A = MOOD_BY[id].semis;
  const out = [];
  for (const B of MOODS) {
    if (B.id === id) continue;
    const only = (P, Q) => P.semis.filter(x => !Q.includes(x));
    const a = A.filter(x => !B.semis.includes(x));
    const b = only(B, A);
    if (a.length === 1 && b.length === 1 && Math.abs(a[0] - b[0]) === 1)
      out.push({ id: B.id, change: `${b[0] > a[0] ? 'raise' : 'lower'} the ${degreeName(a[0], b[0])}` });
    else if (!a.length && b.length === 1) {
      const n = midiNameless(b[0]);
      out.push({ id: B.id, change: `add ${n}` });
    } else if (a.length === 1 && !b.length) out.push({ id: B.id, change: `leave out ${midiNameless(a[0])}` });
  }
  return out;
}
// "the low 5th", "the 6th": a note of a scale by its distance from home
const midiNameless = x =>
  ({ 1: 'the low 2nd', 3: 'the minor 3rd', 6: 'the low 5th', 8: 'the low 6th', 10: 'the low 7th' })[x] ||
  `the ${DEGREE_NAME[x]}`;

// the same notes from another home: [{id, semis}] (this mood's notes, played from semis above its home)
export function moodRelatives(id) {
  const A = new Set(MOOD_BY[id].semis);
  const out = [];
  for (const B of MOODS.filter(x => x.id !== id))
    for (let o = 1; o < 12; o++)
      if (B.semis.length === A.size && A.has(o) && B.semis.every(x => A.has((x + o) % 12)))
        out.push({ id: B.id, semis: o });
  return out;
}

// the key of a mood with the fewest black keys (ties: the first around the circle from C): where a mood
// is easiest to see and to start
export function plainestKey(mood) {
  const blacks = pc => MOOD_BY[mood].semis.filter(x => [1, 3, 6, 8, 10].includes((pc + x) % 12)).length;
  return CIRCLE.reduce((best, pc) => (blacks(pc) < blacks(best) ? pc : best), CIRCLE[0]);
}
