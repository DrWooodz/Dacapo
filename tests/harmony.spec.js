// What Play hears: chords named with their inversion.
import { test, expect } from './fixtures.js';
import { spellerFor } from '../src/js/music/theory.js';
import { detectChord } from '../src/js/music/harmony.js';

test('the chord readout names the inversion by the chord tone in the bass', () => {
  const sp = spellerFor(0);
  const c = ms => detectChord(ms, sp).long;
  expect(c([48, 52, 55])).toBe('C major, root position');
  expect(c([52, 55, 60])).toBe('C major, 1st inversion');
  expect(c([43, 48, 52])).toBe('C major, 2nd inversion');
  expect(c([46, 48, 52, 55])).toMatch(/3rd inversion/);
  expect(detectChord([46, 48, 52, 55], sp).name).toBe('C7/B♭'); // the 7th spelled from the root
  expect(c([50, 52, 55, 60])).toMatch(/the 9th in the bass/); // Cadd9 over D
  expect(detectChord([57, 60, 64], sp)).toMatchObject({ name: 'Am', root: 9, type: 'min' });
});
