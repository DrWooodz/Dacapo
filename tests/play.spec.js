// Play: DaCapo keeps up with whatever you play. Chords named (with numerals once a mood is chosen), the
// key you are in, a backing, one idea at a time for each hand, recordings, and your piano through the
// device.
import { test, expect } from './fixtures.js';

test.beforeEach(async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
});

const play = (app, notes, ms = 30) =>
  app.eval(
    async ([notes, ms]) => {
      for (const m of notes) {
        window.__t.noteOn(m);
        await window.__t.sleep(ms);
        window.__t.noteOff(m);
      }
    },
    [notes, ms],
  );

test('chords are named as you play; it hears the key, and one tap takes it', async ({ app, page }) => {
  await app.eval(() => [57, 60, 64].forEach(m => window.__t.noteOn(m)));
  await expect(page.locator('#plyChord')).toHaveText('Am');
  await expect(page.locator('#plyLong')).toHaveText('A minor, root position');
  await app.eval(() => [57, 60, 64].forEach(m => window.__t.noteOff(m)));
  await play(app, [57, 60, 64, 69, 71, 72, 74, 76, 77, 76, 74, 72, 71, 69, 68, 69, 57, 64, 69]);
  // (the G♯ leading home makes it harmonic minor)
  await expect(page.locator('#plyKey')).toContainText('A harmonic minor');
  await page.locator('#plyUse').click();
  await expect(page.locator('#plyMood')).toContainText('A harmonic minor');
  // now chords carry their numeral, and the scale is lit across the keyboard
  await app.eval(() => [53, 57, 60].forEach(m => window.__t.noteOn(m)));
  await expect(page.locator('#plyLong')).toHaveText('♭VI · F major, root position');
  await app.eval(() => [53, 57, 60].forEach(m => window.__t.noteOff(m)));
  expect(await page.locator('#plyKb rect.tone').count()).toBeGreaterThan(40);
});

test('notes outside the scale are noted, and whether they resolved by a step', async ({ app, page }) => {
  await app.eval(() => window.DaCapo.go('play', { mood: 'major', pc: 0 }));
  // F♯ steps up to G, B♭ to C (a whole step counts), C♯ goes nowhere
  await play(app, [60, 64, 66, 67, 70, 72, 61]);
  await expect(page.locator('#plyOut')).toContainText('3 outside the scale, 2 resolved by a step');
});

test('backing: nothing until you ask; the drone holds; the chords follow the progression you pick', async ({
  app,
  page,
}) => {
  await app.eval(() => window.DaCapo.go('play', { mood: 'harmonic', pc: 0 }));
  const sounding = () => app.eval(() => window.DaCapo.Sounds.active.filter(v => v.end === Infinity).length);
  expect(await sounding()).toBe(0);
  await page.locator('[data-seg="plyBack"] [data-v="drone"]').click();
  expect(await sounding()).toBe(3); // home, its fifth and the octave, held
  await page.locator('[data-seg="plyBack"] [data-v="chords"]').click();
  expect(await sounding()).toBe(0);
  await expect(page.locator('#plyChords .chip')).toHaveText(['Cm', 'Fm', 'G', 'Cm']);
  await page.locator('[data-seg="plyProg"] [data-v="1"]').click();
  await expect(page.locator('[data-seg="plyProg"] [aria-pressed="true"]')).toHaveText('i – ♭VI – V – i');
  await expect(page.locator('#plyChords .chip')).toHaveText(['Cm', 'A♭', 'G', 'Cm']);
  // leaving stops it
  await page.locator('#tabs [data-view="explore"]').click();
  expect(await app.eval(() => window.DaCapo.Sounds.active.length)).toBe(0);
});

test('try something: an idea for each hand, one at a time, with what DaCapo heard', async ({ app, page }) => {
  await app.eval(() => window.DaCapo.go('play', { mood: 'natural', pc: 9 }));
  await page.locator('#plyTryGo').click();
  await expect(page.locator('#plyPat')).toHaveValue('fifth');
  // the left hand on A and E, the right hand in the scale
  await app.eval(async () => {
    const T = window.__t;
    for (let i = 0; i < 20; i++) {
      T.noteOn([45, 52][i % 2]);
      await T.sleep(40);
      T.noteOff([45, 52][i % 2]);
      T.noteOn([69, 71, 72, 74, 76][i % 5]);
      await T.sleep(40);
      T.noteOff([69, 71, 72, 74, 76][i % 5]);
    }
  });
  await expect(page.locator('#plyLh')).toContainText('100% on the pattern · mostly roots and fifths');
  await page.locator('#plyPatNext').click();
  await expect(page.locator('#plyPat')).toHaveValue('octave');
  // the color note: F, marked on the keyboard, counted when played
  await page.locator('#plyTool').selectOption('color');
  await expect(page.locator('#plyKb rect.color[data-m="65"]')).toHaveCount(1);
  await play(app, [65, 64]);
  await expect(page.locator('#plyRh')).toContainText('F 1 time, resolved 1');
  // targets switch the chords on: something to land on
  await page.locator('#plyTool').selectOption('targets');
  await expect(page.locator('[data-seg="plyBack"] [aria-pressed="true"]')).toHaveText('Chords');
});

test('choose a mood from the sheet; clear it to follow your playing again', async ({ page }) => {
  await page.locator('#plyChoose').click();
  await page.locator('.sheet [data-m="phrygian"]').click();
  await page.locator('.sheet [data-k="4"]').click();
  await expect(page.locator('#plyMood')).toContainText('E Phrygian');
  await page.locator('#plyClear').click();
  await expect(page.locator('#plyKey')).toBeVisible();
});

test('a sitting is read back when you stop, kept in the journal with its recording', async ({
  app,
  page,
}) => {
  await app.eval(() => Object.assign(window.DaCapo.SITTING, { quiet: 2500, minMs: 1500, minNotes: 10 }));
  await app.eval(() => window.DaCapo.go('play', { mood: 'natural', pc: 9 }));
  // A minor chords, then a line with an outside note that resolves
  const chord = ms =>
    app.eval(async ms => {
      ms.forEach(m => window.__t.noteOn(m));
      await window.__t.sleep(400);
      ms.forEach(m => window.__t.noteOff(m));
    }, ms);
  for (const c of [
    [45, 57, 60, 64],
    [41, 53, 57, 60],
    [43, 55, 59, 62],
    [45, 57, 60, 64],
  ])
    await chord(c);
  await play(app, [69, 71, 72, 74, 76, 75, 76, 72, 69], 150);
  await expect(page.locator('#plySit')).toBeVisible();
  // quiet for a while: it is over, and read back
  await expect(page.locator('#plyReadback')).toContainText('That sitting', { timeout: 8000 });
  const rb = page.locator('#plyReadback');
  await expect(rb).toContainText('In A natural minor');
  await expect(rb.locator('.chip')).toHaveText([/^Am\s+i$/, /^F\s+♭?VI$/, /^G\s+♭?VII$/]);
  await expect(rb).toContainText('1 note outside the scale, 1 resolved by a step');
  await expect(rb.locator('.callout')).toContainText('Next time');
  const j = await app.eval(() => window.DaCapo.Store.s.journal);
  expect(j).toHaveLength(1);
  expect(j[0]).toMatchObject({ mood: 'natural', pc: 9, chosen: true, outside: 1, resolved: 1 });
  const saved = await app.eval(() => JSON.parse(localStorage.getItem('dacapo.sittings')));
  expect(saved[0].id).toBe(j[0].id);
  expect(saved[0].ev.length).toBeGreaterThan(20);
  // and in the journal list, read back again
  await page.locator('#plyJournalBox summary').click();
  await page.locator('[data-sit]').first().click();
  await expect(page.locator('.sheet')).toContainText('In A natural minor');
  await expect(page.locator('.sheet [data-rb="hear"]')).toBeVisible();
});

test('without a mood, the read-back says what it sounded like', async ({ app, page }) => {
  await app.eval(() => Object.assign(window.DaCapo.SITTING, { quiet: 60000, minMs: 1000, minNotes: 10 }));
  await play(
    app,
    [50, 62, 64, 65, 67, 69, 71, 72, 74, 71, 69, 67, 65, 64, 62, 50, 57, 62, 71, 69, 62, 50, 62],
    90,
  );
  await page.locator('#plyDone').click();
  await expect(page.locator('#plyReadback')).toContainText('It sounded like D Dorian');
});

test('your piano through this device: a sound for each side of middle C', async ({ app, page }) => {
  await app.eval(() => window.DaCapo.settingsSheet());
  await page.locator('#sThru').check();
  await page.locator('#sThruR').selectOption('flute');
  await page.locator('#sThruL').selectOption('bass');
  await app.eval(() => window.DaCapo.closeSheet());
  expect(await app.eval(() => window.DaCapo.Store.s.settings.thru)).toMatchObject({
    on: true,
    split: 60,
    left: 'bass',
    right: 'flute',
  });
  await app.eval(() => [48, 72].forEach(m => window.__t.noteOn(m)));
  expect(await app.eval(() => window.DaCapo.Sounds.active.length)).toBe(2);
  await app.eval(() => [48, 72].forEach(m => window.__t.noteOff(m)));
});
