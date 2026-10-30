// Drawing notation: accidentals follow the rules readers are taught.
import { test, expect } from '@playwright/test';
import { staffSVG } from '../src/js/music/render.js';
import { GLYPHS } from '../src/js/data.js';
import { N } from '../src/js/music/theory.js';

const count = (svg, glyph) => svg.split(GLYPHS[glyph]).length - 1;
const line = notes => notes.map(([l, a]) => ({ notes: [{ n: N(l, a, 4), st: 't' }] }));

test('with bar lines, an accidental lasts to the end of its bar, so a natural is written after it', () => {
  // F♯ F | F F: the second F needs a natural sign; in the next bar the plain F needs none
  const { svg } = staffSVG({
    items: line([
      [3, 1],
      [3, 0],
      [0, 0],
      [1, 0],
      [3, 0],
      [0, 0],
      [1, 0],
      [2, 0],
    ]),
    barEvery: 4,
  });
  expect(count(svg, 'sharp')).toBe(1);
  expect(count(svg, 'natural')).toBe(1);
});

test('with bar lines, a repeated accidental in the same bar is not written twice', () => {
  const { svg } = staffSVG({
    items: line([
      [3, 1],
      [0, 0],
      [3, 1],
      [1, 0],
    ]),
    barEvery: 4,
  });
  expect(count(svg, 'sharp')).toBe(1);
});

test('without bar lines (scales), every altered note shows its sign', () => {
  const { svg } = staffSVG({
    items: line([
      [3, 1],
      [4, 0],
      [3, 1],
    ]),
  });
  expect(count(svg, 'sharp')).toBe(2);
});
