// Adding a song from a MusicXML file (plain or .mxl): notes, ties, chords, both staves, chord symbols.
import { test, expect } from './fixtures.js';
import path from 'node:path';

const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures');

test.beforeEach(async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
});

for (const file of ['test-air.musicxml', 'test-air.mxl'])
  test(`a score from ${file.split('.')[1]} reads right and can be learned`, async ({ app, page }) => {
    await page.locator('#tabs [data-view="songs"]').click();
    await page.locator('#sgFile').setInputFiles(path.join(FIX, file));
    await expect(page.locator('.sheet')).toContainText('Test Air');
    const p = await app.eval(() => window.DaCapo.Library.imports()[0]);
    expect(p).toMatchObject({ t: 'Test Air', sub: 'Anon.', c: 'mine', nb: 3, bpm: 90, showSyms: true });
    expect(p.keys).toEqual([[0, -1]]);
    expect(p.syms).toEqual([
      [0, 'Dm'],
      [2, 'B♭'],
      [4, 'A7'],
      [8, 'Dm'],
    ]);
    // D minor (harmonic: its C♯), by the notes and where they come to rest
    expect(p).toMatchObject({ mood: 'harmonic', pc: 2 });
    const notes = await app.eval(id => window.DaCapo.Library.notes(id), p.id);
    const rh = notes.filter(n => n.h === 0).map(n => [n.t, n.d, n.m]);
    // the tied G lasts a half note across the bar line; C♯ is spelled sharp
    expect(rh).toEqual([
      [0, 1, 74],
      [1, 1, 76],
      [2, 1, 77],
      [3, 2, 79],
      [5, 1, 73],
      [6, 2, 69],
      [8, 4, 74],
    ]);
    expect(notes.filter(n => n.h === 1).map(n => [n.t, n.m])).toEqual([
      [0, 50],
      [0, 57],
      [2, 46],
      [2, 53],
      [4, 45],
      [8, 50],
    ]);
    expect(notes.find(n => n.m === 73).acc).toBe(1);
    expect(notes.find(n => n.m === 74).f).toBe(1);
    await page.locator('#psGo').click();
    await expect(page.locator('svg.staff .csym').first()).toHaveText('Dm');
    expect(await app.eval(() => window.DaCapo.Player.debug.P.id)).toBe(`p:${p.id}:0`);
  });

test('a file that is not a score says so', async ({ page }) => {
  await page.locator('#tabs [data-view="songs"]').click();
  await page
    .locator('#sgFile')
    .setInputFiles({ name: 'notes.xml', mimeType: 'text/xml', buffer: Buffer.from('<html/>') });
  await expect(page.locator('.toast')).toContainText('not a MusicXML score');
});
