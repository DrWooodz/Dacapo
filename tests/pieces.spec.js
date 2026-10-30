// Pieces: the "working on" list, daily practice, piece sessions, sections, and your own MIDI files.
import path from 'node:path';
import { test, expect } from './fixtures.js';

test.beforeEach(async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
});

test('working on a piece from the library; its key comes first in technique', async ({ app, page }) => {
  await app.eval(() => window.DaCapo.go('library'));
  await app.eval(() => window.DaCapo.pieceSheet('chopin-p4'));
  await page.locator('#psHear').click();
  await page.locator('#psLearn').click();
  const working = await app.eval(() => window.DaCapo.Store.s.piece.working);
  expect(working).toEqual([
    { pid: 'satie-gym-1', daily: true },
    { pid: 'chopin-p4', daily: false },
  ]);
  // not daily: it waits for a piece focus or a piece session
  expect((await app.session()).some(e => e.includes('chopin-p4'))).toBe(false);
  await expect(page.locator('.workrow')).toHaveCount(2);
  // the first piece sets the technique key: Satie's Gymnopédie No. 1 is in D major
  expect(await app.eval(() => window.DaCapo.skillStatus('technique').order[0])).toBe('t:sc:major:D');
});

test('the daily switch puts a piece in every session, or takes it out', async ({ app, page }) => {
  await app.eval(() => window.DaCapo.workOnPiece('chopin-p4'));
  await app.eval(() => window.DaCapo.go('library'));
  await page.locator('[data-daily="chopin-p4"]').check();
  expect(await app.session()).toContain('daily p:chopin-p4:0');
  await page.locator('[data-daily="satie-gym-1"]').uncheck();
  expect((await app.session()).some(e => e.includes('satie-gym-1'))).toBe(false);
});

test('a piece session works on your pieces only, for the time you choose', async ({ app, page }) => {
  await app.eval(() => window.DaCapo.workOnPiece('chopin-p4'));
  await app.eval(() => window.DaCapo.go('library'));
  await page.locator('#lbSession').click();
  await page.locator('.sheet button', { hasText: '30' }).click();
  await expect(page.locator('.sess-top')).toContainText('Piece session · 30 min');
  const list = await app.eval(() => window.DaCapo.Store.s.pieceSession.list.map(e => `${e.role} ${e.id}`));
  expect(list).toEqual([
    'focus p:satie-gym-1:0',
    'focus p:satie-gym-1:1',
    'focus p:chopin-p4:0',
    'focus p:chopin-p4:1',
  ]);
  expect(await app.eval(() => window.DaCapo.Player.debug.P.id)).toBe('p:satie-gym-1:0');
});

test('at most four pieces at a time', async ({ app }) => {
  const added = await app.eval(() =>
    ['chopin-p4', 'chopin-p7', 'satie-gno-1', 'satie-gym-2'].map(p => window.DaCapo.workOnPiece(p)),
  );
  expect(added).toEqual([true, true, true, false]);
});

test('a section is learned hand by hand, then together', async ({ app }) => {
  const id = 'p:satie-gym-1:1';
  await app.practice(id);
  expect(await app.eval(id => window.DaCapo.itemDef(id).phases, id)).toEqual(['rh', 'lh', 'ht']);
  expect(await app.plan()).toMatchObject({ hand: 'rh', mode: 'wait', hints: true });
  expect(await app.waitRep()).toBe('Clean. Once more, without the key hints.');

  await app.setItem(id, { phase: 'ht', pc: 0 });
  const steps = await app.eval(() => window.__t.steps());
  expect(steps.some(s => s.midis.length > 1)).toBe(true);
  expect(await app.waitRep()).toBe('Clean. Once more, without the key hints.');
});

test('tempo practice starts one bar early, to practice the join', async ({ app }) => {
  await app.setItem('p:satie-gym-1:1', { stage: 'tempo', phase: null });
  const drill = await app.eval(() => {
    const { a, z, lead, meter } = window.DaCapo.Player.debug.P.drill;
    return { a, z, lead, meter };
  });
  expect(drill).toEqual({ a: 3, z: 8, lead: 3, meter: [3, 4] });
  expect((await app.tempoRep({ jitter: 15 })).message).toBe('Clean at ♩ 36. One more moves the tempo up.');
});

test('when every section is integrated, the whole piece is next', async ({ app }) => {
  await app.eval(() => {
    const D = window.DaCapo;
    D.workOnPiece('chopin-p7');
    D.skillStatus('p:chopin-p7')
      .order.filter(id => !id.endsWith(':full'))
      .forEach(id => {
        D.ensureItem(id);
        Object.assign(D.Store.s.items[id], { stage: 'done', due: D.addDays(D.todayKey(), 30), ivl: 30 });
      });
    D.Store.save();
  });
  expect(await app.eval(() => window.DaCapo.skillStatus('p:chopin-p7').focus)).toBe('p:chopin-p7:full');
  await app.practice('p:chopin-p7:full');
  expect(await app.plan()).toMatchObject({ kind: 'full', mode: 'tempo', hand: 'ht' });
});

test('a long piece is drawn a few bars at a time and follows the playing', async ({ app, page }) => {
  await app.eval(() => {
    const D = window.DaCapo;
    D.workOnPiece('rach-op23-5');
    D.go('practice', { item: 'p:rach-op23-5:full' });
  });
  await page.waitForTimeout(800);
  const start = await app.eval(() => ({
    steps: window.DaCapo.Player.debug.P.drill.steps.length,
    w0: window.DaCapo.Player.debug.P.win.w0,
  }));
  expect(start.steps).toBeGreaterThan(1000);
  expect(start.w0).toBe(0);
  expect(await app.eval(() => window.__t.waitPhase('countin', 10000))).toBe(true);
  await app.eval(() => {
    const { T } = window.DaCapo.Player.debug;
    return window.__t.playTempo(window.__t.steps().slice(0, 90), T.msBeat, T.t0, { jitter: 5 });
  });
  expect(await app.eval(() => window.DaCapo.Player.debug.P.win.w0)).toBeGreaterThan(40);
  await page.locator('#plGo').click();
  expect(await app.phase()).toBe('stopped');
  expect(await app.message()).toMatch(/^Stopped\./);
});

test('a MIDI file can be imported and practiced', async ({ app, page }) => {
  await app.eval(() => window.DaCapo.go('library'));
  await page.setInputFiles('#lbImport', path.join(import.meta.dirname, 'fixtures', 'waltz.mid'));
  const sheet = page.locator('.sheet');
  await expect(sheet).toContainText('Import waltz.mid');
  await expect(sheet).toContainText('right / left hand');
  await page.locator('#imSave').click();
  const piece = await app.eval(() => {
    const p = window.DaCapo.Library.imports()[0];
    return {
      id: p.id,
      notes: window.DaCapo.Library.notes(p.id).length,
      sections: window.DaCapo.Library.sections(p.id).length,
    };
  });
  expect(piece).toMatchObject({ notes: 16, sections: 1 });
  await app.eval(() => window.DaCapo.closeSheet());
  await app.practice(`p:${piece.id}:0`);
  expect(await app.plan()).toMatchObject({ kind: 'section', hand: 'rh', mode: 'wait' });
  expect(await app.waitRep()).toBe('Clean. Once more, without the key hints.');
});
