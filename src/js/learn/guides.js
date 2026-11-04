/* Walkthroughs: a theory unit or a style study explained one step at a time, each step with an example to see on the
   staff and keyboard and to hear. A unit's guide opens the first time you meet it and again from
   "How it works". Examples are written as note names: one chord ('C4 E4 G4'), notes in turn
   (seq), or chords in turn (chords). */
import { parseNote } from '../music/theory.js';

export const GUIDES = {
  h3: [
    {
      say: 'A scale is a ladder from one note to the same note an octave up. C major uses only the white keys.',
      seq: 'C4 D4 E4 F4 G4 A4 B4 C5',
    },
    {
      say: 'Most neighbours are a whole step apart: one key skipped. But E to F and B to C have no key between them: half steps.',
      seq: 'E4 F4 B4 C5',
    },
    {
      say: 'So the pattern of every major scale is: whole, whole, half, whole, whole, whole, half.',
      seq: 'C4 D4 E4 F4 G4 A4 B4 C5',
    },
    {
      say: 'Start on G and follow the same pattern. The 7th step has to be a whole step above E and a half step below G: that is F♯, G major’s one sharp.',
      seq: 'G4 A4 B4 C5 D5 E5 F#5 G5',
    },
    {
      say: 'Start on F and the 4th note has to be a half step above A: B♭, F major’s one flat. Think of the pattern, and the black keys take care of themselves.',
      seq: 'F4 G4 A4 Bb4 C5 D5 E5 F5',
    },
  ],
  h5: [
    {
      say: 'A triad is three notes, each a 3rd above the last: skip a white key, play one. From C: C, E, G.',
      notes: 'C4 E4 G4',
    },
    {
      say: 'The lower gap decides the mood. C up to E is four half steps, a major 3rd: bright. This is C major.',
      seq: 'C4 E4 G4',
    },
    {
      say: 'Lower the middle note a half step, to E♭: now the gap is three half steps, a minor 3rd. C – E♭ – G is C minor, darker.',
      chords: ['C4 E4 G4', 'C4 Eb4 G4'],
    },
    {
      say: 'The top note is seven half steps above the root in both. So for any major chord: root, up 4, up 3. For minor: up 3, then 4. D major, then D minor:',
      chords: ['D4 F#4 A4', 'D4 F4 A4'],
    },
  ],
  h6: [
    {
      say: 'Build a triad on every note of the C major scale, using only its notes (the white keys).',
      chords: ['C4 E4 G4', 'D4 F4 A4', 'E4 G4 B4', 'F4 A4 C5', 'G4 B4 D5', 'A4 C5 E5', 'B4 D5 F5'],
    },
    {
      say: 'Three come out major (C, F, G), three minor (D minor, E minor, A minor), and one, B – D – F, diminished: two small 3rds, tense.',
      chords: ['C4 E4 G4', 'D4 F4 A4', 'B4 D5 F5'],
    },
    {
      say: 'Roman numerals count them up the scale: I ii iii IV V vi vii°. Capitals are major, lowercase minor. I, IV and V, the three major chords:',
      chords: ['C4 E4 G4', 'F4 A4 C5', 'G4 B4 D5'],
    },
    {
      say: 'The numbers mean the same in every major key. In G major: I is G, IV is C, V is D, vi is E minor.',
      chords: ['G4 B4 D5', 'C5 E5 G5', 'D5 F#5 A5', 'E4 G4 B4'],
    },
  ],
  h7: [
    {
      say: 'A key signature is the sharps or flats at the start of each line. They hold for every note of that letter, in every octave, all through the piece. G major’s one sharp, F♯:',
      seq: 'G4 A4 B4 C5 D5 E5 F#5 G5',
    },
    {
      say: 'Sharp keys climb by 5ths, gaining one sharp each: C (none), G (F♯), D (F♯ C♯), A (adds G♯), E (adds D♯).',
      seq: 'C4 G4 D5 A4 E5',
    },
    {
      say: 'Flat keys fall by 5ths: F has one flat (B♭), B♭ has two (adds E♭), E♭ three (adds A♭), A♭ four (adds D♭).',
      seq: 'F4 Bb3 Eb4 Ab3',
    },
    {
      say: 'Two shortcuts. With sharps, home is a half step above the last sharp: last sharp C♯, so D major. With flats, home is the second-to-last flat: B♭ E♭, so B♭ major. D major:',
      seq: 'D4 E4 F#4 G4 A4 B4 C#5 D5',
    },
  ],
  h9: [
    {
      say: 'Stack one more 3rd on a triad and you get a seventh chord. On C, using C major’s notes: C E G B, C major 7. Soft and open.',
      notes: 'C4 E4 G4 B4',
    },
    {
      say: 'On G: G B D F, G7, the dominant 7th. Its B wants to rise to C and its F to fall to E, so it pulls hard toward C.',
      chords: ['G3 B3 D4 F4', 'C4 E4 G4'],
    },
    {
      say: 'On D: D F A C, D minor 7. Mellow, a little wistful.',
      notes: 'D4 F4 A4 C5',
    },
    {
      say: 'On B: B D F A, half-diminished (B m7♭5). Unsettled, it usually leads on somewhere.',
      notes: 'B3 D4 F4 A4',
    },
  ],
  h10: [
    {
      say: 'In C major, I is C, IV is F and V is G: the three major chords of the key.',
      chords: ['C4 E4 G4', 'F4 A4 C5', 'G4 B4 D5'],
    },
    {
      say: 'I is home. IV moves away, gently. V is tension: its B sits a half step under C and wants to go there.',
      chords: ['G4 B4 D5', 'C5 E5 G5'],
    },
    {
      say: 'In a row, I – IV – V – I is a whole little story: home, away, tension, home.',
      chords: ['C4 E4 G4', 'F4 A4 C5', 'G4 B4 D5', 'C5 E5 G5'],
    },
    {
      say: 'The numbers carry to every key. In G major: G – C – D – G.',
      chords: ['G4 B4 D5', 'C5 E5 G5', 'D5 F#5 A5', 'G4 B4 D5'],
    },
  ],
  h11: [
    {
      say: 'A cadence is the end of a phrase, like punctuation. V – I, the authentic cadence, is a full stop.',
      chords: ['G4 B4 D5', 'C5 E5 G5'],
    },
    {
      say: 'IV – I, the plagal cadence, is softer: the "amen" at the end of a hymn.',
      chords: ['F4 A4 C5', 'C5 E5 G5'],
    },
    {
      say: 'Stopping on V, a half cadence, is a comma: it leaves a question in the air.',
      chords: ['C5 E5 G5', 'G4 B4 D5'],
    },
    {
      say: 'In any piece, listen to the last two chords of each phrase: you will hear which one it is.',
    },
  ],
  h12: [
    {
      say: 'In C major, ii is D minor, V is G, I is C. Their roots fall by 5ths: D down to G, G down to C.',
      seq: 'D4 G3 C4',
    },
    {
      say: 'As chords: D minor – G – C. ii shares two notes with IV (F and A) but leads into V even more smoothly.',
      chords: ['D4 F4 A4', 'G3 B3 D4', 'C4 E4 G4'],
    },
    {
      say: 'Add 7ths and it turns rich: Dm7 – G7 – Cmaj7, the sound of jazz standards and Chopin’s nocturnes.',
      chords: ['D4 F4 A4 C5', 'G3 B3 D4 F4', 'C4 E4 G4 B4'],
    },
  ],
  h13: [
    {
      say: 'A minor uses the same white keys as C major, but starts and ends on A: that is natural minor.',
      seq: 'A3 B3 C4 D4 E4 F4 G4 A4',
    },
    {
      say: 'Its V chord is E minor (E G B). There is no note a half step below A, so V – i sounds soft.',
      chords: ['E4 G4 B4', 'A3 C4 E4'],
    },
    {
      say: 'Raise G to G♯ and V becomes E major. G♯ leans into A, so the close is strong: the sound of most classical music in minor.',
      chords: ['E4 G#4 B4', 'A3 C4 E4'],
    },
    {
      say: 'The scale with that raised 7th is harmonic minor. Note the wide gap, a step and a half, between F and G♯.',
      seq: 'A3 B3 C4 D4 E4 F4 G#4 A4',
    },
  ],
  h14: [
    {
      say: 'In C major, V is G. But G can have its own V: the major chord a 5th above it, D major.',
      chords: ['D4 F#4 A4', 'G4 B4 D5'],
    },
    {
      say: 'The F♯ is not in C major. It is a sign that the music is leaning toward G for a moment. That is V of V.',
      chords: ['C4 E4 G4', 'D4 F#4 A4', 'G4 B4 D5', 'C5 E5 G5'],
    },
    {
      say: 'Adding the 7th (D7: D F♯ A C) makes the pull to G stronger still.',
      chords: ['D4 F#4 A4 C5', 'G4 B4 D5'],
    },
  ],
  h16: [
    {
      say: 'A mode is a scale that starts on a different note of a key. The white keys from D to D make D Dorian.',
      seq: 'D4 E4 F4 G4 A4 B4 C5 D5',
    },
    {
      say: 'Dorian is minor, but its 6th (B) is a half step higher than in D minor (B♭). That brighter note makes IV a major chord: D minor to G major.',
      chords: ['D4 F4 A4', 'G4 B4 D5', 'D4 F4 A4'],
    },
    {
      say: 'The white keys from G to G make G Mixolydian: major, but with F instead of F♯. Its lowered 7th gives a major chord a step below home: G to F.',
      chords: ['G4 B4 D5', 'F4 A4 C5', 'G4 B4 D5'],
    },
    {
      say: 'The white keys from F to F make F Lydian: major with a raised 4th (B instead of B♭). F to G major floats without settling.',
      chords: ['F4 A4 C5', 'G4 B4 D5', 'F4 A4 C5'],
    },
    {
      say: 'Each mode is a pattern, so it works from any note. A Dorian: A B C D E F♯ G A.',
      seq: 'A3 B3 C4 D4 E4 F#4 G4 A4',
    },
  ],
  h17: [
    {
      say: 'The whole-tone scale is only whole steps: six notes to the octave.',
      seq: 'C4 D4 E4 F#4 G#4 A#4 C5',
    },
    {
      say: 'Every step is the same size, so no note sounds like home. Its chords are augmented (C E G♯): hazy, suspended.',
      notes: 'C4 E4 G#4',
    },
    {
      say: 'The pentatonic scale has five notes and no half steps. The black keys alone are one.',
      seq: 'F#4 G#4 A#4 C#5 D#5 F#5',
    },
    {
      say: 'C major pentatonic is C D E G A: the major scale without F and B. With no half steps, nothing clashes: any order of its notes sounds like a tune.',
      seq: 'C4 D4 E4 G4 A4 C5',
    },
  ],
  h18: [
    {
      say: 'Take a major scale and lower its 7th a half step: that is Mixolydian. A Mixolydian has G, not G♯.',
      seq: 'A3 B3 C#4 D4 E4 F#4 G4 A4',
    },
    {
      say: 'Build a chord on that G: G B D, a major chord a whole step below home. Numbered against A major, it is ♭VII.',
      chords: ['A3 C#4 E4', 'G3 B3 D4', 'A3 C#4 E4'],
    },
    {
      say: 'Compare the usual V – I (E major to A) with ♭VII – I (G to A). The first is a full stop; the second arrives home relaxed and open.',
      chords: ['E3 G#3 B3', 'A3 C#4 E4', 'G3 B3 D4', 'A3 C#4 E4'],
    },
    {
      say: 'Add IV and you have the classic folk and adventure progression: I – ♭VII – IV – I, A – G – D – A.',
      chords: ['A3 C#4 E4', 'G3 B3 D4', 'D4 F#4 A4', 'A3 C#4 E4'],
    },
  ],
  h19: [
    {
      say: 'A natural minor: the white keys from A to A. Its 3rd, 6th and 7th are all low.',
      seq: 'A3 B3 C4 D4 E4 F4 G4 A4',
    },
    {
      say: 'With G instead of G♯, V is a minor chord, v (E minor). Nothing pulls hard toward A: the music sounds old and modal.',
      chords: ['E4 G4 B4', 'A3 C4 E4'],
    },
    {
      say: 'The low 6th and 7th carry two major chords: F (♭VI) and G (♭VII).',
      chords: ['F3 A3 C4', 'G3 B3 D4'],
    },
    {
      say: 'Together: A minor – F – G – A minor. Climbing ♭VI – ♭VII – i is the heroic minor of ballads, films and game music.',
      chords: ['A3 C4 E4', 'F3 A3 C4', 'G3 B3 D4', 'A3 C4 E4'],
    },
  ],
  h20: [
    {
      say: 'D Dorian: the white keys from D to D. It is D minor with B instead of B♭.',
      seq: 'D4 E4 F4 G4 A4 B4 C5 D5',
    },
    {
      say: 'In D minor, iv is G minor (G B♭ D). Dorian’s B makes it G major, IV. Hear the two:',
      chords: ['G3 Bb3 D4', 'G3 B3 D4'],
    },
    {
      say: 'Rock between i and IV: D minor – G – D minor. Still minor, but hopeful.',
      chords: ['D4 F4 A4', 'G3 B3 D4', 'D4 F4 A4', 'G3 B3 D4'],
    },
    {
      say: 'Dorian’s ♭VII (C major) fits too: D minor – G – C – D minor.',
      chords: ['D4 F4 A4', 'G3 B3 D4', 'C4 E4 G4', 'D4 F4 A4'],
    },
  ],
  /* the modal style studies (improvising palettes) */
  mixo: [
    {
      say: 'This study is in A Mixolydian: the A major scale with G instead of G♯.',
      seq: 'A4 B4 C#5 D5 E5 F#5 G5 A5',
    },
    {
      say: 'Its chords: A (I, home), G (♭VII, a whole step below), D (IV). Around and back: A – G – D – A.',
      chords: ['A3 C#4 E4', 'G3 B3 D4', 'A3 D4 F#4', 'A3 C#4 E4'],
    },
    {
      say: 'The left hand plays a waltz: the bass alone on beat 1, the chord on beats 2 and 3. Bass A, then the chord twice:',
      chords: ['A2', 'A3 C#4 E4', 'A3 C#4 E4'],
    },
    {
      say: 'For the tune, land on a note of the chord on beat 1 (the keyboard marks them) and walk through the scale in between. Over G, try leaning on G itself: that note is what makes it sound like an adventure.',
      seq: 'E5 D5 C#5 B4 A4 G4 B4 D5',
    },
  ],
  folkminor: [
    {
      say: 'D natural minor: D E F G A B♭ C. It keeps C, not C♯, so nothing pulls hard toward D: an old, ballad sound.',
      seq: 'D4 E4 F4 G4 A4 Bb4 C5 D5',
    },
    {
      say: 'The chords: D minor (i), B♭ (♭VI) and C (♭VII). Climbing B♭ – C – D minor is the heroic minor of legends.',
      chords: ['D4 F4 A4', 'Bb3 D4 F4', 'C4 E4 G4', 'D4 F4 A4'],
    },
    {
      say: 'The left hand breaks each chord: the bass, then the chord notes rising and falling in eighth notes.',
      seq: 'D2 A2 F3 A3 F3 A2 A3 F3',
    },
    {
      say: 'Sing slowly over it. End phrases on D, F or A when D minor returns; over C, an E or G sounds like a question waiting for the answer.',
      seq: 'A4 G4 F4 E4 D4',
    },
  ],
  dorian: [
    {
      say: 'E Dorian: E F♯ G A B C♯ D. It is E minor with C♯ instead of C.',
      seq: 'E4 F#4 G4 A4 B4 C#5 D5 E5',
    },
    {
      say: 'That C♯ turns the IV chord major: E minor to A major, instead of E minor to A minor.',
      chords: ['E4 G4 B4', 'A3 C#4 E4', 'E4 G4 B4', 'A3 C4 E4'],
    },
    {
      say: 'The study rocks between i and IV. Over the A chord, land on C♯: that is the note that makes the minor hopeful.',
      seq: 'B4 C#5 E5 C#5 B4',
    },
  ],
  drone: [
    {
      say: 'A drone is a note that never stops. Here it is the open fifth D – A, with no third, so it is neither major nor minor.',
      notes: 'D3 A3',
    },
    {
      say: 'The left hand ripples it like a harp. Your tune decides the mood: F makes it minor, and B (D Dorian’s color note) makes that minor bright.',
      seq: 'D2 A2 D3 A3 D3 A2 A3 D3',
    },
    {
      say: 'Every white key fits. Start and end phrases on D or A; let F and B colour the middle.',
      seq: 'D4 E4 F4 A4 B4 A4 F4 E4 D4',
    },
  ],
};

const notesOf = s => s.split(/\s+/).map(parseNote);

// the groups of notes a step shows, in order: one group for a chord, one per note or per chord in turn
export function stepGroups(step) {
  if (step.notes) return [notesOf(step.notes)];
  if (step.seq) return notesOf(step.seq).map(n => [n]);
  if (step.chords) return step.chords.map(notesOf);
  return [];
}
