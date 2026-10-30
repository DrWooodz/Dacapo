/* Theory at the keyboard: questions you answer by playing.
   Theory here serves the sound. Every idea is heard and played, never only named, and each unit says
   where it shows up in real music. Units come in tiers; a deeper tier opens only when the one below it
   is in your hands.

   A question: { prompt, sub, kind, answer, show, play, explain }
     kind 'many'   play several keys of one note name in different octaves      answer {pc, count}
          'pair'   play a given note, then a second one a set distance away       answer {from, semis}
          'seq'    play notes one after another (a scale)                         answer {pcs, ascending}
          'chord'  play notes together, any octave and inversion unless bass set  answer {pcs, bass?, extra?}
          'chords' play several chords in order (a progression)                   answer {chords, smoothTop?}
   check(question, groups) compares what you played (groups of notes: one per chord or per note). */
import { pick, rnd } from '../core/util.js';
import {
  buildScale,
  MAJOR_KEYS,
  midiOf,
  N,
  nameOf,
  parseNote,
  pcOf,
  prettyKey,
  spellAbove,
  spellScale,
} from '../music/theory.js';

const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const name = n => nameOf(n, false);
const names = ns => ns.map(name).join(' – ');
const note = t => parseNote(t + '4');
const pcs = ns => [...new Set(ns.map(pcOf))];
// notes to hear, around middle C
const voiced = ns => {
  const base = midiOf(ns[0]) >= 66 ? -12 : 0;
  return ns.map(n => midiOf(n) + base);
};

/* ---------- chords from spelled notes ---------- */
const TRIAD = { maj: [4, 7], min: [3, 7], dim: [3, 6], aug: [4, 8] };
const SEVENTH = { maj7: [4, 7, 11], dom7: [4, 7, 10], min7: [3, 7, 10], hdim7: [3, 6, 10] };
const QUALITY = { maj: 'major', min: 'minor', dim: 'diminished', aug: 'augmented' };
const SEVENTH_NAME = {
  maj7: ['maj7', 'major 7th'],
  dom7: ['7', 'dominant 7th'],
  min7: ['m7', 'minor 7th'],
  hdim7: ['m7♭5', 'half-diminished 7th'],
};
const triad = (root, q) => [root, ...TRIAD[q].map((s, i) => spellAbove(root, 2 * (i + 1), s))];
const seventh = (root, q) => [root, ...SEVENTH[q].map((s, i) => spellAbove(root, 2 * (i + 1), s))];

// the chord on scale degree d (0 = I) of a spelled 7-note scale, as a triad or a 7th chord
function degreeChord(scale, d, size = 3) {
  const out = [];
  for (let i = 0; i < size; i++) {
    const k = d + 2 * i;
    const n = scale[k % 7];
    out.push(N(n.l, n.a, n.o + Math.floor(k / 7)));
  }
  return out;
}
// "F", "Gm" or "B°" for a spelled triad
const chordName = ns => {
  const third = (midiOf(ns[1]) - midiOf(ns[0]) + 12) % 12;
  const fifth = (midiOf(ns[2]) - midiOf(ns[0]) + 12) % 12;
  return name(ns[0]) + (third === 4 ? '' : fifth === 6 ? '°' : 'm');
};
const majorScale = tonic => buildScale(tonic, 'major', 1, false).slice(0, 7);
const ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const ROMAN_QUALITY = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'];

/* ---------- scales by their steps ---------- */
const MODES = {
  major: [2, 2, 1, 2, 2, 2],
  dorian: [2, 1, 2, 2, 2, 1],
  lydian: [2, 2, 2, 1, 2, 2],
  mixolydian: [2, 2, 1, 2, 2, 1],
  aeolian: [2, 1, 2, 2, 1, 2],
  harmonic: [2, 1, 2, 2, 1, 3],
};
const scaleOf = (tonic, mode) => {
  const s = spellScale(tonic, MODES[mode]);
  return s.concat([N(tonic.l, tonic.a, tonic.o + 1)]);
};

const INTERVAL_NAMES = {
  2: 'major 2nd',
  3: 'minor 3rd',
  4: 'major 3rd',
  5: 'perfect 4th',
  6: 'tritone',
  7: 'perfect 5th',
  8: 'minor 6th',
  9: 'major 6th',
  10: 'minor 7th',
  11: 'major 7th',
  12: 'octave',
  1: 'minor 2nd',
};
const INTERVAL_LETTERS = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6, 12: 7 };

/* ---------- question makers ---------- */
function scaleQuestion(tonic, mode, label) {
  const s = scaleOf(tonic, mode);
  return {
    prompt: `Play the ${label} scale`,
    sub: 'One octave up, one note at a time',
    kind: 'seq',
    answer: { pcs: s.map(pcOf), ascending: true },
    show: s,
    play: voiced(s),
    explain: names(s) + '.',
  };
}
function chordQuestion(notes, prompt, explain, extra = {}) {
  const voicing = extra.voicing || notes;
  return {
    prompt,
    sub: extra.bass != null ? 'Any octave; mind the lowest note' : 'Any octave, any inversion',
    kind: 'chord',
    answer: { pcs: pcs(notes), bass: extra.bass, extra: extra.extra },
    show: voicing,
    play: [voiced(voicing)],
    explain,
  };
}
// three-note voicings that move as little as possible: each chord takes the inversion nearest the last,
// with the top note staying or moving by step
function smoothVoicings(chords) {
  const out = [voiced(chords[0])];
  for (const c of chords.slice(1)) {
    const prev = out[out.length - 1];
    const prevTop = Math.max(...prev);
    let best = null;
    for (let inv = 0; inv < 3; inv++)
      for (const shift of [-24, -12, 0, 12]) {
        const ms = c.map((n, i) => midiOf(n) + shift + (i < inv ? 12 : 0)).sort((a, b) => a - b);
        if (ms[0] < 48 || ms[2] > 79) continue;
        const move = ms.reduce((t, m, i) => t + Math.abs(m - prev[i]), 0);
        if (Math.abs(ms[2] - prevTop) > 2) continue;
        if (!best || move < best.move) best = { ms, move };
      }
    out.push(best ? best.ms : voiced(c));
  }
  return out;
}

// the chord's spelled notes, placed at the pitches of a voicing (midi numbers)
const spellVoicing = (notes, midis) =>
  midis.map(m => {
    const n = notes.find(x => pcOf(x) === ((m % 12) + 12) % 12);
    return N(n.l, n.a, n.o + Math.round((m - midiOf(n)) / 12));
  });

function progressionQuestion(chords, prompt, explain, smoothTop = false) {
  const smooth = smoothTop ? smoothVoicings(chords.map(c => c.notes)) : null;
  return {
    prompt,
    sub: smoothTop
      ? 'One chord at a time. Keep the top note moving by step or staying put'
      : 'One chord at a time, any inversion',
    kind: 'chords',
    answer: { chords: chords.map(c => ({ pcs: pcs(c.notes), extra: c.extra })), smoothTop },
    show: smooth ? smooth.map((ms, i) => spellVoicing(chords[i].notes, ms)) : chords.map(c => c.notes),
    play: smooth || chords.map(c => voiced(c.notes)),
    explain,
  };
}
const keyLabel = (k, minor = false) => `${prettyKey(k)} ${minor ? 'minor' : 'major'}`;

/* ---------- the units ---------- */
export const THEORY_UNITS = [
  /* tier 1: the keyboard and its building blocks */
  {
    id: 'h1',
    tier: 1,
    t: 'Find any note',
    goal: 6000,
    about:
      'The black keys come in groups of two and three. C sits just left of each group of two, F just left of each group of three; the other white keys follow from there. Every note name repeats in each octave.',
    use: 'Knowing where every note lives frees your eyes for the music.',
    make() {
      const t = pick(NATURALS);
      return {
        prompt: `Play three different ${t}s`,
        sub: 'In three different octaves',
        kind: 'many',
        answer: { pc: pcOf(note(t)), count: 3 },
        show: [note(t)],
        play: [48, 60, 72].map(m => m + pcOf(note(t))),
        explain: `${t} is ${{ C: 'left of the two black keys', D: 'between the two black keys', E: 'right of the two black keys', F: 'left of the three black keys', G: 'between the first two of the three', A: 'between the last two of the three', B: 'right of the three black keys' }[t]}.`,
      };
    },
  },
  {
    id: 'h2',
    tier: 1,
    t: 'Half and whole steps',
    goal: 6000,
    about:
      'A half step is the very next key, black or white. A whole step is two half steps, with one key in between. E–F and B–C are half steps with no black key between them; that is why scales sound the way they do.',
    use: 'Every scale and chord is built from these two distances.',
    make() {
      const from = note(pick(NATURALS));
      const semis = pick([1, 2]) * pick([1, -1]);
      const word = Math.abs(semis) === 1 ? 'half' : 'whole';
      const target = midiOf(from) + semis;
      return {
        prompt: `Play ${name(from)}, then a ${word} step ${semis > 0 ? 'up' : 'down'}`,
        sub: 'Two notes, one after the other',
        kind: 'pair',
        answer: { from: pcOf(from), semis },
        show: [from],
        play: [midiOf(from), target],
        explain: `A ${word} step ${semis > 0 ? 'up' : 'down'} from ${name(from)} lands ${Math.abs(semis)} key${Math.abs(semis) > 1 ? 's' : ''} ${semis > 0 ? 'to the right' : 'to the left'}, counting black keys.`,
      };
    },
  },
  {
    id: 'h3',
    tier: 1,
    t: 'Major scales',
    goal: 10000,
    about:
      'Every major scale has the same pattern of steps: whole, whole, half, whole, whole, whole, half. Start on any key, follow the pattern, and it sounds like do-re-mi.',
    use: 'Scales are the alphabet of keys: melodies and chords come from them.',
    make() {
      const k = pick(['C', 'G', 'F', 'D', 'A', 'Bb']);
      return scaleQuestion(note(k), 'major', keyLabel(k));
    },
  },
  {
    id: 'h4',
    tier: 1,
    t: 'Intervals',
    goal: 7000,
    about:
      'An interval is the distance between two notes. Each has its own sound: a major 3rd is bright, a perfect 5th open and hollow, an octave the same note higher. Count letter names for the number (C to E is a 3rd) and half steps for the exact size.',
    use: 'Reading by interval (up a 3rd, down a 5th) is how fluent readers read.',
    make() {
      const from = note(pick(NATURALS));
      const semis = pick([2, 4, 5, 7, 9, 12]);
      const to = spellAbove(from, INTERVAL_LETTERS[semis], semis);
      return {
        prompt: `Play ${semis === 12 ? 'an' : 'a'} ${INTERVAL_NAMES[semis]} up from ${name(from)}`,
        sub: `Play ${name(from)}, then the note above`,
        kind: 'pair',
        answer: { from: pcOf(from), semis },
        show: [from, to],
        play: [midiOf(from), midiOf(from) + semis],
        explain: `${name(from)} up to ${name(to)}: ${semis} half steps.`,
      };
    },
  },
  {
    id: 'h5',
    tier: 1,
    t: 'Major and minor chords',
    goal: 6000,
    about:
      'A triad stacks two 3rds. Major (C–E–G) has a major 3rd at the bottom and sounds bright; minor (C–E♭–G) has a minor 3rd at the bottom and sounds darker. The 5th on top is the same in both.',
    use: 'Most of the harmony you will ever play is made of these two chords.',
    make() {
      const root = note(pick(NATURALS));
      const q = pick(['maj', 'min']);
      const ns = triad(root, q);
      return chordQuestion(
        ns,
        `Play ${name(root)} ${QUALITY[q]}`,
        `${name(root)} ${QUALITY[q]}: ${names(ns)}.`,
      );
    },
  },
  /* tier 2: harmony inside a key */
  {
    id: 'h6',
    tier: 2,
    t: 'The chords of a key',
    goal: 7000,
    about:
      'Build a triad on each note of a major scale, using only notes of that scale, and you get the chords of the key: I, IV and V are major; ii, iii and vi are minor; vii° is diminished. Roman numerals name a chord by its place in the key.',
    use: 'With these seven chords you can accompany most melodies in that key.',
    make() {
      const k = pick(['C', 'G', 'F', 'D']);
      const d = rnd(7);
      const ns = degreeChord(majorScale(note(k)), d);
      return chordQuestion(
        ns,
        `In ${keyLabel(k)}, play the ${ROMAN[d]} chord`,
        `${ROMAN[d]} in ${keyLabel(k)} is ${name(ns[0])} ${ROMAN_QUALITY[d]}: ${names(ns)}.`,
      );
    },
  },
  {
    id: 'h7',
    tier: 2,
    t: 'Key signatures',
    goal: 10000,
    about:
      'A key signature lists the sharps or flats of a key once, at the start of each line. Sharps keys go up by 5ths (G has one sharp, D two, A three); flat keys go down by 5ths (F has one flat, B♭ two, E♭ three).',
    use: 'Reading the key signature first tells you which black keys the piece lives on.',
    make() {
      const sig = pick([1, 2, 3, 4, -1, -2, -3, -4]);
      const k = MAJOR_KEYS.find(x => x.sig === sig).k;
      const q = scaleQuestion(note(k), 'major', keyLabel(k));
      q.prompt = `Play the major scale with ${Math.abs(sig)} ${sig > 0 ? 'sharp' : 'flat'}${Math.abs(sig) > 1 ? 's' : ''}`;
      q.explain = `${Math.abs(sig)} ${sig > 0 ? 'sharp' : 'flat'}${Math.abs(sig) > 1 ? 's' : ''} is ${keyLabel(k)}: ${names(q.show)}.`;
      return q;
    },
  },
  {
    id: 'h8',
    tier: 2,
    t: 'Inversions',
    goal: 7000,
    about:
      'A chord keeps its name when its notes are rearranged. With the root at the bottom it is in root position; with the 3rd at the bottom, first inversion; with the 5th at the bottom, second inversion. Inversions let chords connect smoothly.',
    use: 'Pianists move between chords by inversion so the hand barely travels.',
    make() {
      const root = note(pick(NATURALS.filter(t => t !== 'B')));
      const q = pick(['maj', 'min']);
      const ns = triad(root, q);
      const inv = pick([1, 2]);
      const bass = ns[inv];
      // the notes below the new bass move up an octave
      const voicing = ns.slice(inv).concat(ns.slice(0, inv).map(n => N(n.l, n.a, n.o + 1)));
      return chordQuestion(
        ns,
        `Play ${name(root)} ${QUALITY[q]} with ${name(bass)} at the bottom`,
        `${inv === 1 ? 'First' : 'Second'} inversion: ${names(voicing)}, with ${name(bass)} lowest.`,
        { bass: pcOf(bass), voicing },
      );
    },
  },
  {
    id: 'h9',
    tier: 2,
    t: 'Seventh chords',
    goal: 8000,
    about:
      'Add one more 3rd on top of a triad and you get a seventh chord. Dominant 7th (G7) pulls strongly home; major 7th (Cmaj7) sounds soft and open, like the chords that open Satie’s first Gymnopédie; minor 7th (Dm7) is mellow.',
    use: 'Seventh chords are the color of Satie, Debussy, Chopin’s nocturnes and all of jazz.',
    make() {
      const root = note(pick(NATURALS));
      const q = pick(['maj7', 'dom7', 'min7', 'hdim7']);
      const ns = seventh(root, q);
      return chordQuestion(
        ns,
        `Play ${name(root)}${SEVENTH_NAME[q][0]}`,
        `${name(root)}${SEVENTH_NAME[q][0]}, a ${SEVENTH_NAME[q][1]} chord: ${names(ns)}.`,
      );
    },
  },
  {
    id: 'h10',
    tier: 2,
    t: 'I – IV – V – I',
    goal: 14000,
    about:
      'Home, away, tension, home. I is rest, IV moves away, V wants to resolve, and I resolves it. This progression is the backbone of countless pieces, from hymns to the blues.',
    use: 'Play it in a key, then improvise a melody over it: you are composing.',
    make() {
      const k = pick(['C', 'G', 'F', 'D', 'A']);
      const sc = majorScale(note(k));
      const chords = [0, 3, 4, 0].map(d => ({ notes: degreeChord(sc, d) }));
      return progressionQuestion(
        chords,
        `Play I – IV – V – I in ${keyLabel(k)}`,
        `In ${keyLabel(k)}: ${chords.map(c => chordName(c.notes)).join(' – ')}.`,
      );
    },
  },
  {
    id: 'h11',
    tier: 2,
    t: 'Cadences',
    goal: 10000,
    about:
      'A cadence ends a phrase, like punctuation. V – I (authentic) is a full stop. IV – I (plagal, the "amen") is a softer close. A phrase that stops on V (a half cadence) is a comma: it asks for more.',
    use: 'Hearing cadences shows you where phrases breathe, in any piece.',
    make() {
      const k = pick(['C', 'G', 'F', 'D', 'Bb']);
      const sc = majorScale(note(k));
      const type = pick(['authentic', 'plagal', 'half']);
      const degs = { authentic: [4, 0], plagal: [3, 0], half: [0, 4] }[type];
      const chords = degs.map(d => ({ notes: degreeChord(sc, d) }));
      const label = {
        authentic: 'an authentic cadence (V – I)',
        plagal: 'a plagal cadence (IV – I)',
        half: 'a half cadence (I – V)',
      }[type];
      return progressionQuestion(
        chords,
        `In ${keyLabel(k)}, play ${label}`,
        `In ${keyLabel(k)}: ${chords.map(c => chordName(c.notes)).join(' – ')}.`,
      );
    },
  },
  /* tier 3: color and motion */
  {
    id: 'h12',
    tier: 3,
    t: 'ii – V – I',
    goal: 14000,
    about:
      'ii – V – I is the strongest way home: each chord’s root falls a 5th to the next. Play the chords as triads, or add 7ths (Dm7 – G7 – Cmaj7 in C) for the smooth, rich sound of jazz and of Chopin’s nocturnes.',
    use: 'Once you hear ii – V – I, you will find it everywhere.',
    make() {
      const k = pick(['C', 'F', 'G', 'D', 'Bb', 'Eb']);
      const sc = majorScale(note(k));
      const chords = [1, 4, 0].map(d => {
        const tri = degreeChord(sc, d);
        const sev = degreeChord(sc, d, 4);
        return { notes: tri, extra: pcOf(sev[3]) };
      });
      return progressionQuestion(
        chords,
        `Play ii – V – I in ${keyLabel(k)}`,
        `In ${keyLabel(k)}: ${chords.map(c => names(c.notes)).join(', then ')} (7ths welcome).`,
      );
    },
  },
  {
    id: 'h13',
    tier: 3,
    t: 'Minor keys',
    goal: 9000,
    about:
      'In a minor key the 7th note is usually raised by a half step, so V becomes a major chord that leads home strongly. That raised 7th makes the harmonic minor scale, with its distinctive gap between the 6th and 7th notes.',
    use: 'Chopin’s preludes in E minor and C minor live on this pull from V to i.',
    make() {
      const k = pick(['A', 'E', 'D', 'G', 'C']);
      const tonic = note(k);
      if (Math.random() < 0.5) {
        const s = scaleOf(tonic, 'harmonic');
        const q = scaleQuestion(tonic, 'harmonic', `${prettyKey(k)} harmonic minor`);
        q.explain = `${names(s)}: the 7th, ${name(s[6])}, is raised.`;
        return q;
      }
      const five = spellAbove(tonic, 4, 7);
      const ns = triad(five, 'maj');
      return chordQuestion(
        ns,
        `In ${keyLabel(k, true)}, play the V chord`,
        `V in ${keyLabel(k, true)} is ${name(five)} major, with the raised 7th: ${names(ns)}.`,
      );
    },
  },
  {
    id: 'h14',
    tier: 3,
    t: 'Secondary dominants',
    goal: 9000,
    about:
      'Any chord can get its own V for a moment. V of V (written V/V) is the major chord a 5th above V: in C major, D major (or D7) leading to G. It adds a brief, bright lift on the way to V.',
    use: 'The "surprise" sharps in a simple piece are often secondary dominants.',
    make() {
      const k = pick(['C', 'G', 'F', 'D']);
      const five = spellAbove(note(k), 4, 7);
      const vv = spellAbove(five, 4, 7);
      const ns = triad(vv, 'maj');
      return chordQuestion(
        ns,
        `In ${keyLabel(k)}, play V of V`,
        `V of V in ${keyLabel(k)} is ${name(vv)} major (${names(ns)}), which leads to V, ${name(five)}. A 7th (${name(spellAbove(vv, 6, 10))}) is welcome.`,
        { extra: pcOf(spellAbove(vv, 6, 10)) },
      );
    },
  },
  {
    id: 'h15',
    tier: 3,
    t: 'Smooth voice leading',
    goal: 16000,
    about:
      'Good accompaniment moves as little as possible. Keep notes that two chords share, and move the others to the nearest note. A simple test: let the top note stay or move by step.',
    use: 'This is what makes a progression sing instead of jump.',
    make() {
      const k = pick(['C', 'G', 'F', 'D']);
      const sc = majorScale(note(k));
      const chords = [0, 3, 4, 0].map(d => ({ notes: degreeChord(sc, d) }));
      return progressionQuestion(
        chords,
        `Play I – IV – V – I in ${keyLabel(k)}, smoothly`,
        'Keep shared notes, move the others to the nearest chord note, and the top line moves by step.',
        true,
      );
    },
  },
  {
    id: 'h16',
    tier: 3,
    t: 'Modes',
    goal: 10000,
    about:
      'Play the white keys from D to D and you hear Dorian: minor, with a bright raised 6th. From F to F is Lydian: major, with a dreamy raised 4th. From G to G is Mixolydian: major with a lowered 7th. Satie and Debussy loved these colors.',
    use: 'Improvising in a mode gives a whole mood with no wrong notes.',
    make() {
      const opts = [
        ['D', 'dorian'],
        ['A', 'dorian'],
        ['E', 'dorian'],
        ['F', 'lydian'],
        ['C', 'lydian'],
        ['G', 'mixolydian'],
        ['D', 'mixolydian'],
      ];
      const [k, mode] = pick(opts);
      return scaleQuestion(note(k), mode, `${k} ${mode[0].toUpperCase() + mode.slice(1)}`);
    },
  },
  {
    id: 'h17',
    tier: 3,
    t: 'Whole-tone and pentatonic',
    goal: 9000,
    about:
      'The whole-tone scale is all whole steps: six notes with no home, the haze of Debussy’s "Voiles". The pentatonic scale has five notes and no half steps; the black keys alone form one. Neither has a wrong note.',
    use: 'Two scales for improvising color: float with whole-tone, sing with pentatonic.',
    make() {
      if (Math.random() < 0.5) {
        const k = pick(['C', 'D']);
        const tonic = note(k);
        const semis = [0, 2, 4, 6, 8, 10, 12];
        const ms = semis.map(s => midiOf(tonic) + s);
        return {
          prompt: `Play the whole-tone scale from ${k}`,
          sub: 'Seven notes up to the octave, all whole steps',
          kind: 'seq',
          answer: { pcs: ms.map(m => m % 12), ascending: true },
          show: [tonic],
          play: ms,
          explain: `From ${k}: whole step after whole step, ${semis.length - 1} steps to the octave.`,
        };
      }
      const k = pick(['C', 'G', 'F', 'D']);
      const tonic = note(k);
      const steps = [0, 2, 4, 7, 9, 12];
      const s = [0, 1, 2, 4, 5].map(i => majorScale(tonic)[i]).concat([N(tonic.l, tonic.a, tonic.o + 1)]);
      return {
        prompt: `Play the ${prettyKey(k)} major pentatonic scale`,
        sub: 'Five notes and the octave, going up',
        kind: 'seq',
        answer: { pcs: steps.map(x => (pcOf(tonic) + x) % 12), ascending: true },
        show: s,
        play: steps.map(x => midiOf(tonic) + x),
        explain: `${names(s)}: the major scale without its 4th and 7th.`,
      };
    },
  },
];

export const THEORY_BY_ID = Object.fromEntries(THEORY_UNITS.map(u => [u.id, u]));

// a new question for a unit, different from the previous one when possible
export function makeQuestion(unitId, previous) {
  const U = THEORY_BY_ID[unitId];
  let q = U.make();
  for (let i = 0; i < 6 && previous && q.prompt === previous.prompt; i++) q = U.make();
  return q;
}

/* ---------- checking an answer ---------- */
const pcSet = midis => new Set(midis.map(m => ((m % 12) + 12) % 12));

// does one group of notes form the chord? (any octave and inversion; an allowed extra note, e.g. a 7th)
function chordMatches(group, want) {
  const played = pcSet(group);
  const need = new Set(want.pcs);
  if (![...need].every(p => played.has(p))) return false;
  const rest = [...played].filter(p => !need.has(p));
  if (rest.length > (want.extra != null ? 1 : 0)) return false;
  if (rest.length && rest[0] !== want.extra) return false;
  if (want.bass != null && ((Math.min(...group) % 12) + 12) % 12 !== want.bass) return false;
  return true;
}

// how many groups of notes an answer takes: 'one per note' for melodies, 'one per chord' for chords
export function answerSize(q) {
  if (q.kind === 'many') return q.answer.count;
  if (q.kind === 'pair') return 2;
  if (q.kind === 'seq') return q.answer.pcs.length;
  if (q.kind === 'chord') return 1;
  return q.answer.chords.length;
}
export const answersInChords = q => q.kind === 'chord' || q.kind === 'chords';

// groups: arrays of midi numbers, in the order played. Returns { ok, wrongAt }.
export function check(q, groups) {
  const A = q.answer;
  if (q.kind === 'many') {
    const ms = groups.map(g => g[0]);
    const ok = ms.every(m => m % 12 === A.pc) && new Set(ms).size >= A.count;
    return { ok, wrongAt: ok ? -1 : ms.findIndex(m => m % 12 !== A.pc) };
  }
  if (q.kind === 'pair') {
    const [a, b] = groups.map(g => g[0]);
    const okFirst = a % 12 === A.from;
    return { ok: okFirst && b - a === A.semis, wrongAt: okFirst ? 1 : 0 };
  }
  if (q.kind === 'seq') {
    const ms = groups.map(g => g[0]);
    for (let i = 0; i < ms.length; i++) {
      if (ms[i] % 12 !== A.pcs[i]) return { ok: false, wrongAt: i };
      if (A.ascending && i && ms[i] <= ms[i - 1]) return { ok: false, wrongAt: i };
    }
    return { ok: ms.length === A.pcs.length, wrongAt: -1 };
  }
  if (q.kind === 'chord') {
    const ok = chordMatches(groups[0] || [], A);
    return { ok, wrongAt: ok ? -1 : 0 };
  }
  // chords
  for (let i = 0; i < A.chords.length; i++) {
    if (!groups[i] || !chordMatches(groups[i], A.chords[i])) return { ok: false, wrongAt: i };
    if (A.smoothTop && i && Math.abs(Math.max(...groups[i]) - Math.max(...groups[i - 1])) > 2)
      return { ok: false, wrongAt: i, smooth: true };
  }
  return { ok: true, wrongAt: -1 };
}

// is a partly played answer already wrong? (so the player can say so at once)
export function wrongSoFar(q, groups) {
  if (!groups.length) return false;
  if (q.kind === 'chords' || q.kind === 'chord') {
    const i = groups.length - 1;
    const want = q.kind === 'chord' ? q.answer : q.answer.chords[i];
    return !chordMatches(groups[i], want) || (q.kind === 'chords' && check(q, groups).smooth === true);
  }
  const r = check(q, groups);
  return r.wrongAt >= 0 && r.wrongAt < groups.length;
}
