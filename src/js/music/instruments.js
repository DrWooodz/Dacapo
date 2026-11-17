/* The keyboard sounds. How they sound is in sounds.js. */

export const SOUNDS = [
  { id: 'piano', n: 'Piano' },
  { id: 'epiano', n: 'E-piano' },
  { id: 'pad', n: 'Pad' },
  { id: 'bass', n: 'Bass' },
  { id: 'harp', n: 'Harp' },
  { id: 'flute', n: 'Flute' },
];
export const SOUND_BY = Object.fromEntries(SOUNDS.map(s => [s.id, s]));
