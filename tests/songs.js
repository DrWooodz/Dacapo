// A multi-instrument MIDI file for the tests: eight bars of game-style music in A Mixolydian.
import { writeMidi } from '../src/js/music/midiwrite.js';
import { parseMidiFile } from '../src/js/music/midiread.js';

export const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
export const PPQ = 480;

// eight bars of game-style music in A Mixolydian: A and G chords, a flute tune, sustained strings,
// a harp in eighths, a bass and drums
export function gameSong() {
  const A = [57, 61, 64];
  const G = [55, 59, 62];
  const chords = [A, G, A, G, A, G, A, A];
  const tune = [69, 71, 73, 76, 74, 71, 74, 79, 76, 73, 69, 71, 74, 71, 67, 69];
  const melody = tune.flatMap((m, i) => [{ b: i * 2, m, d: 1.9, v: 0.8 }]);
  const strings = chords.flatMap((c, k) => c.map(m => ({ b: k * 4, m, d: 4, v: 0.5 })));
  const harp = chords.flatMap((c, k) =>
    [0, 1, 2, 1, 0, 1, 2, 1].map((x, i) => ({ b: k * 4 + i / 2, m: c[x] + 12, d: 0.5, v: 0.5 })),
  );
  const bass = chords.flatMap((c, k) => [
    { b: k * 4, m: c[0] - 12, d: 2, v: 0.8 },
    { b: k * 4 + 2, m: c[0] - 12, d: 2, v: 0.8 },
  ]);
  const drums = [...Array(32)].map((_, i) => ({ b: i, m: i % 2 ? 38 : 36, d: 0.1, v: 0.8 }));
  const bytes = writeMidi({
    bpm: 100,
    beats: 4,
    tracks: [
      { name: 'Tune', ch: 0, program: 73, notes: melody },
      { name: 'Strings', ch: 1, program: 48, notes: strings },
      { name: 'Harp', ch: 2, program: 46, notes: harp },
      { name: 'Bass', ch: 3, program: 32, notes: bass },
      { name: 'Drums', ch: 9, program: 0, notes: drums },
    ],
  });
  return { bytes, parsed: parseMidiFile(buffer(bytes)), melody, bass, all: [melody, strings, harp, bass] };
}
