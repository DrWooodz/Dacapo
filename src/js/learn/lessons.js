/* Body and hands: short notes on how to play, shown where they matter.
   The app cannot see you, so these are guidance, not graded. They follow mainstream piano pedagogy
   (natural alignment, arm weight, freedom from tension); a teacher who can watch you is still the best
   check. None of it is medical advice: if playing hurts, stop. */

export const LESSONS = [
  {
    id: 'sitting',
    t: 'Sitting at the piano',
    cue: 'Forearms level with the keys, feet flat, sit on the front half of the bench.',
    text: [
      'Set the bench height so your forearms are level with the keys or slightly above them, and sit far enough back that your elbows are a little in front of your body.',
      'Sit on the front half of the bench with both feet flat, and lean slightly forward from the hips. Your weight rests on the bench and your feet, not on your arms.',
    ],
  },
  {
    id: 'hand',
    t: 'Hand shape',
    cue: 'Let the hand keep the gentle curve it has when your arm hangs at your side.',
    text: [
      'Let your arm hang loosely at your side: the curve your fingers take is the shape to play with. Place that shape on the keys without flattening or clawing it.',
      'Play on the fleshy pad near the fingertip; the thumb plays on its outer corner. Keep the knuckles from collapsing, but never stiffen them to hold the shape.',
    ],
  },
  {
    id: 'release',
    t: 'Weight and release',
    cue: 'Let the key go down with arm weight, then release: no pressing after the note sounds.',
    text: [
      'Sound comes from the speed of the key going down, not from pressing it into the bottom. Play with the natural weight of the arm, then release at once: the key stays down with almost no effort.',
      'Check now and then: are your shoulders down? Can you wiggle the wrist while holding a note? If not, you are holding tension that will slow you down and tire you.',
    ],
  },
  {
    id: 'thumb',
    t: 'The thumb in scales',
    cue: 'Move the thumb under early and quietly, while the other fingers play.',
    text: [
      'The thumb starts moving under the hand as soon as it has played, gliding along close to the keys while the 2nd and 3rd fingers play, so it arrives over its next key early instead of jabbing at the last moment.',
      'Let the elbow drift slightly away from the body and the hand travel smoothly along the keyboard; keep the wrist level and avoid twisting it sideways. Coming back, the fingers cross over the thumb with the same quiet, early motion.',
    ],
  },
  {
    id: 'together',
    t: 'Hands together',
    cue: 'Listen for one sound from both hands, not two close together.',
    text: [
      'When both hands play a scale together, the two thumbs cross at different moments, which makes one hand want to rush or wait. Practice slowly enough to hear each pair of notes as one sound.',
      'If one hand keeps lagging, play that hand alone for a few runs, then together again at a slower tempo.',
    ],
  },
  {
    id: 'arpeggio',
    t: 'Arpeggios: let the arm travel',
    cue: 'Let the elbow lead along the keyboard; the hand follows without stretching.',
    text: [
      'An arpeggio covers too much keyboard for the fingers alone. Let the forearm and elbow carry the hand along, so each finger arrives above its key instead of stretching for it.',
      'A small rotation of the forearm helps the thumb pass under; the wrist stays loose and roughly level.',
    ],
  },
  {
    id: 'rotation',
    t: 'Forearm rotation',
    cue: 'Small turns of the forearm, like turning a door handle, do the work in broken chords.',
    text: [
      'In patterns that alternate between thumb and fingers (broken chords, Alberti bass, the left-hand patterns of nocturnes and waltzes), a small rotation of the forearm does much of the work, so the fingers do not have to lift and strike.',
      'Keep the rotation small and relaxed; the hand stays balanced over the key it is playing.',
    ],
  },
  {
    id: 'leaps',
    t: 'Leaps',
    cue: 'Move early, close to the keys, and land on the key surface.',
    text: [
      'In leaps (bass note to chord, as in the Gymnopédies or a waltz), leave the first note early and move in a low arc close to the keys. Arrive above the target before it is time to play it.',
      'Look ahead to where you are going, not at where you are. Practicing the leap slowly with eyes closed builds the feel for the distance.',
    ],
  },
  {
    id: 'tone',
    t: 'Soft and singing tone',
    cue: 'For a soft, singing sound, start from the key surface and press slowly.',
    text: [
      'How loud a note sounds depends on how fast the key goes down. For a soft, singing tone, start with the finger already touching the key and let it go down slowly but all the way.',
      'Melody notes can be a little louder than the accompaniment: let more arm weight into the melody finger and keep the others light.',
    ],
  },
];

export const LESSON_BY = Object.fromEntries(LESSONS.map(l => [l.id, l]));

// which notes fit which kind of drill, most useful first
const FOR_KIND = {
  scale: ['thumb', 'release', 'together', 'hand', 'sitting'],
  arp: ['arpeggio', 'thumb', 'release', 'hand'],
  section: ['tone', 'leaps', 'rotation', 'release', 'sitting'],
  full: ['tone', 'release', 'leaps'],
  pattern: ['rotation', 'leaps', 'release'],
  read: ['sitting', 'hand'],
};

// one note for a kind of drill, rotating day by day
export function lessonFor(kind, dayNumber) {
  const ids = FOR_KIND[kind];
  return ids ? LESSON_BY[ids[dayNumber % ids.length]] : null;
}
