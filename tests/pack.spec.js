// Making pieces from notes: packing round-trips through the library, sections of about four bars (repeats
// shared), and chord symbols named from what sounds.
import { test, expect } from './fixtures.js';
import { chordSymbols, packNotes, sectionsOf } from '../src/js/music/pack.js';

const bars4 = n => Array.from({ length: n + 1 }, (_, i) => i * 4);
// a whole-note chord per bar, as {t, d, m}
const block = (bar, ms, d = 4) => ms.map(m => ({ t: bar * 4, d, m, h: m < 60 ? 1 : 0 }));

test('chord symbols: triads, a real 7th, a dominant without its root, the key spelled', () => {
  const notes = [
    ...block(0, [48, 64, 67, 72]), // C E G
    ...block(1, [45, 60, 64, 69]), // A C E
    ...block(2, [43, 59, 62, 65]), // G B D F: G7
    ...block(3, [48, 64, 67, 72]),
  ];
  const syms = chordSymbols(notes, bars4(4), { sig: 0, window: 4 });
  expect(syms.map(s => s[1])).toEqual(['C', 'Am', 'G7', 'C']);
  // B D F with G for part of the bar: a G7 (its root comes and goes), not B°
  const dim = [...block(0, [47, 62, 65]), { t: 2, d: 2, m: 67, h: 0 }];
  expect(chordSymbols(dim, [0, 4], { window: 4 })[0][1]).toBe('G7');
  // flats in a flat key
  const flat = block(0, [46, 62, 65]);
  expect(chordSymbols(flat, [0, 4], { sig: -2, window: 4 })[0][1]).toBe('B♭');
  // a passing note does not make a 7th
  const passing = [...block(0, [48, 64, 67]), { t: 3.5, d: 0.5, m: 71, h: 0 }];
  expect(chordSymbols(passing, [0, 4], { window: 4 })[0][1]).toBe('C');
});

test('sections: about four bars, a pickup joins the first, no lone last bar, repeats shared', () => {
  const phrase = bar => [0, 1, 2, 3].map(i => ({ t: bar * 4 + i, d: 1, m: 60 + i, h: 0 }));
  const notes = [0, 1, 2, 3, 4, 5, 6, 7].flatMap(phrase);
  const secs = sectionsOf(notes, bars4(8));
  expect(secs.map(s => [s[0], s[1]])).toEqual([
    [0, 4],
    [4, 8],
  ]);
  const same = sectionsOf(
    [
      ...phrase(0),
      ...phrase(1),
      ...phrase(0).map(n => ({ ...n, t: n.t + 8 })),
      ...phrase(1).map(n => ({ ...n, t: n.t + 8 })),
    ],
    bars4(4),
    { len: 2 },
  );
  expect(same.map(s => s[2])).toEqual([-1, 0]);
  expect(sectionsOf([], bars4(9)).map(s => [s[0], s[1]])).toEqual([
    [0, 4],
    [4, 9],
  ]);
  expect(sectionsOf([], bars4(9), { pickup: true }).map(s => [s[0], s[1]])).toEqual([
    [0, 5],
    [5, 9],
  ]);
});

test('packed notes read back through the library unchanged', async ({ app }) => {
  const notes = [
    { t: 0, d: 1, m: 60, acc: 0, h: 0, s: 0, f: 1 },
    { t: 0, d: 2, m: 48, acc: 0, h: 1, s: 1, f: 5 },
    { t: 1, d: 0.5, m: 66, acc: 1, h: 0, s: 0, f: 3 },
    { t: 1.5, d: 2.5, m: 58, acc: -1, h: 1, s: 1 },
  ];
  const packed = packNotes(notes, [0, 4]);
  const back = await app.eval(p => {
    const { Library } = window.DaCapo;
    const id = 'mine-packtest';
    Library.saveImports([
      {
        id,
        t: 'Pack test',
        c: 'mine',
        lvl: 1,
        sig: 0,
        ts: [[0, 4, 4]],
        keys: [[0, 0]],
        secs: [[0, 1, -1]],
        ...p,
      },
    ]);
    return Library.notes(id).map(n => ({ t: n.t, d: n.d, m: n.m, h: n.h, f: n.f || 0 }));
  }, packed);
  expect(back).toEqual(notes.map(n => ({ t: n.t, d: n.d, m: n.m, h: n.h, f: n.f || 0 })));
});
