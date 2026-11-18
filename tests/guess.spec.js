// Guessing the mood of what is played: every mood in every key is weighed by its notes and where the
// music comes to rest. Checked on played lines and on the tunes, whose keys are known.
import { test, expect } from './fixtures.js';
import { guessMood } from '../src/js/music/moodtools.js';

// played live: notes in order, no durations
const line = s => s.split(' ').map(m => ({ m: +m }));

test('a played line: major, Dorian, minor pentatonic, harmonic minor', () => {
  // C major up and down, ending on C with C in the bass
  expect(guessMood(line('48 60 62 64 65 67 69 71 72 71 69 67 65 64 62 60 43 55 59 62 48 60'))).toMatchObject({
    mood: 'major',
    pc: 0,
  });
  // D Dorian: the natural minor with the bright 6th (B), resting on D
  expect(
    guessMood(line('50 62 64 65 67 69 71 72 74 71 69 67 65 64 62 50 57 62 71 69 62 50 62')),
  ).toMatchObject({
    mood: 'dorian',
    pc: 2,
  });
  // A minor pentatonic: A C D E G only
  expect(guessMood(line('45 57 60 62 64 67 69 67 64 62 60 57 45 57 60 64 62 60 57 45'))).toMatchObject({
    mood: 'minpent',
    pc: 9,
  });
  // A harmonic minor: the raised 7th (G♯) leading home
  expect(
    guessMood(line('45 57 59 60 62 64 65 68 69 68 65 64 62 60 59 57 52 56 59 64 68 45 57')),
  ).toMatchObject({
    mood: 'harmonic',
    pc: 9,
  });
  expect(guessMood(line('60 62 64'))).toBe(null);
});

test('the tunes: their known mood and key, from all their notes', async ({ app }) => {
  const tunes = await app.eval(() => {
    const L = window.DaCapo.Library;
    return L.all()
      .filter(p => p.c === 'tunes' && !p.id.endsWith('-4'))
      .map(p => ({
        id: p.id,
        mood: p.mood,
        pc: p.pc,
        notes: L.notes(p.id).map(n => ({ t: n.t, d: n.d, m: n.m })),
      }));
  });
  const misses = tunes
    .map(p => ({ ...p, g: guessMood(p.notes) }))
    .filter(
      p => !(p.g.mood === p.mood && p.g.pc === p.pc) && !(p.g.alt.mood === p.mood && p.g.alt.pc === p.pc),
    );
  // (the Passion Chorale ends on its dominant, the Phrygian close: E is heard as home)
  expect(misses.map(p => p.id)).toEqual(['tune-passion-chorale']);
});
