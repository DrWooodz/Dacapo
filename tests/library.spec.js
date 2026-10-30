// The built-in library: every piece decodes completely and every section can be practiced.
import { test, expect } from './fixtures.js';

test('every piece decodes, and every section has notes for each of its hands', async ({ app }) => {
  const problems = await app.eval(() => {
    const { Library, Log } = window.DaCapo;
    const out = [];
    for (const p of Library.all()) {
      const before = Log.buf.length;
      const notes = Library.notes(p.id);
      if (Log.buf.slice(before).some(e => /decode count mismatch/.test(e.m))) out.push(`${p.id}: note count`);
      if (notes.some(n => n.m < 21 || n.m > 108)) out.push(`${p.id}: note outside the piano`);
      const bars = Library.bars(p.id);
      if (bars.length < 2 || bars.some((b, i) => i && b <= bars[i - 1])) out.push(`${p.id}: bar lines`);
      const secs = Library.sections(p.id);
      if (!secs.length) out.push(`${p.id}: no sections`);
      secs.forEach((s, k) => {
        if (k && s.a !== secs[k - 1].z) out.push(`${p.id} §${k + 1}: gap or overlap`);
        if (!Library.steps(p.id, s.a, s.z, 'ht').steps.length) out.push(`${p.id} §${k + 1}: empty`);
      });
      if (secs.length && secs[secs.length - 1].z !== p.nb)
        out.push(`${p.id}: sections end at bar ${secs[secs.length - 1].z} of ${p.nb}`);
    }
    return out;
  });
  expect(problems).toEqual([]);
});
