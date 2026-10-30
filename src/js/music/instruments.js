/* The Jam's instruments: a drum kit and a few keyboard sounds, each with its General MIDI number (used
   when a sketch is saved as a MIDI file). How they sound is in sounds.js. */

export const DRUMS = [
  { id: 'kick', n: 'Kick', gm: 36 },
  { id: 'snare', n: 'Snare', gm: 38 },
  { id: 'hat', n: 'Hat', gm: 42 },
  { id: 'open', n: 'Open hat', gm: 46 },
  { id: 'clap', n: 'Clap', gm: 39 },
  { id: 'rim', n: 'Rim', gm: 37 },
];
export const DRUM_BY_GM = Object.fromEntries(DRUMS.map(d => [d.gm, d]));

export const SOUNDS = [
  { id: 'piano', n: 'Piano', gm: 0 },
  { id: 'epiano', n: 'E-piano', gm: 4 },
  { id: 'pad', n: 'Pad', gm: 89 },
  { id: 'bass', n: 'Bass', gm: 33 },
];
export const SOUND_BY = Object.fromEntries(SOUNDS.map(s => [s.id, s]));
