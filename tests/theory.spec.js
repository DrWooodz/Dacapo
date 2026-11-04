// Theory: questions answered by playing, then speed, then a cold check of five questions.
import { test, expect } from './fixtures.js';
import { answersInChords, answerSize, check, THEORY_UNITS, makeQuestion } from '../src/js/learn/theory.js';
import { midiOf, pcOf } from '../src/js/music/theory.js';
import { GUIDES, stepGroups } from '../src/js/learn/guides.js';

test('every unit: the answer the app plays is accepted, and a wrong note is not', () => {
  for (const U of THEORY_UNITS) {
    for (let i = 0; i < 200; i++) {
      const q = makeQuestion(U.id);
      const groups = answersInChords(q) ? q.play : q.play.map(m => [m]);
      expect(groups.length, `${U.id}: ${q.prompt}`).toBe(answerSize(q));
      expect(check(q, groups).ok, `${U.id}: ${q.prompt}`).toBe(true);
      const wrong = groups.map(g => g.slice());
      wrong[wrong.length - 1][0] += 1;
      expect(check(q, wrong).ok, `${U.id} accepts a wrong note: ${q.prompt}`).toBe(false);
    }
  }
});

test('smooth voice leading: the chords written on the staff are the voicings that are played', () => {
  for (let i = 0; i < 100; i++) {
    const q = makeQuestion('h15');
    expect(q.show.map(c => c.map(midiOf))).toEqual(q.play);
  }
});

test('every walkthrough belongs to a unit or a style study, and its examples are real notes', () => {
  // (the style studies are checked in the app, in tests/rhythm-improv.spec.js)
  const ids = new Set(THEORY_UNITS.map(u => u.id).concat(['mixo', 'folkminor', 'dorian', 'drone']));
  for (const [id, steps] of Object.entries(GUIDES)) {
    expect(ids.has(id), id).toBe(true);
    expect(steps.length).toBeGreaterThanOrEqual(3);
    for (const step of steps) {
      expect(step.say.length).toBeGreaterThan(20);
      stepGroups(step).forEach(g => g.forEach(n => expect(midiOf(n)).toBeGreaterThan(30)));
    }
  }
  // the modal units' guides show the chords their questions ask for
  const pcsOf = chord => [...new Set(chord.map(pcOf))].sort((a, b) => a - b);
  const last = GUIDES.h18.at(-1).chords.map(c => pcsOf(stepGroups({ notes: c })[0]));
  expect(last).toEqual([
    [1, 4, 9],
    [2, 7, 11],
    [2, 6, 9],
    [1, 4, 9],
  ]); // A G D A
});

test('the modal progressions: ♭VII a whole step below home, folk minor with ♭VI and ♭VII, Dorian with a major IV', () => {
  for (let i = 0; i < 60; i++) {
    const q = makeQuestion('h18');
    const home = q.answer.chords[0].pcs;
    const flat7 = q.answer.chords.find(c => !c.pcs.includes(home[0]) && c.pcs.includes((home[0] + 10) % 12));
    expect(flat7, q.prompt).toBeTruthy();
    expect(flat7.pcs).toContain((home[0] + 2) % 12); // its 3rd is the 2nd of the scale: a major chord
    const d = makeQuestion('h20');
    if (/IV/.test(d.prompt)) {
      const iv = d.answer.chords.find(
        c =>
          c.pcs.includes((d.answer.chords[0].pcs[0] + 5) % 12) &&
          c.pcs.includes((d.answer.chords[0].pcs[0] + 9) % 12),
      );
      expect(iv, d.prompt).toBeTruthy(); // the raised 6th in the IV chord
    }
  }
});

test.describe('in the app', () => {
  test.beforeEach(async ({ app }) => {
    await app.connectPiano();
    await app.onboard();
  });

  test('a right answer, a wrong one, and a skip', async ({ app }) => {
    await app.practice('h:h1');
    await expect(app.page.locator('#qzIntro')).toContainText('Find any note');
    expect(await app.answerQuiz()).toMatch(/^Right: /);
    expect(await app.answerQuiz({ right: false })).toMatch(/^You played [A-G]/);
    await app.page.locator('#plGo').click(); // Next
    await app.eval(() => window.__t.sleep(200));
    await app.page.locator('#plGo').click(); // Skip
    expect(await app.message()).toMatch(/^Skipped\./);
    const it = await app.item('h:h1');
    expect(it.answers.map(a => a.ok)).toEqual([true, false, false]);
  });

  test('a new unit opens with its walkthrough: steps to hear, then on to the questions', async ({
    app,
    page,
  }) => {
    await app.practice('h:h18');
    const guide = page.locator('#qzGuide');
    await expect(guide).toContainText('Step 1 of 4');
    await expect(guide).toContainText('lower its 7th');
    await guide.locator('[data-g="hear"]').click();
    await guide.locator('[data-g="next"]').click();
    await expect(guide).toContainText('Step 2 of 4');
    await guide.locator('[data-g="back"]').click();
    for (let k = 0; k < 3; k++) await guide.locator('[data-g="next"]').click();
    await guide.locator('[data-g="done"]').click();
    await expect(page.locator('#qzIntro')).toBeHidden();
    expect(await app.answerQuiz()).toMatch(/^Right: /);
    // and again from the (i) panel
    await page.locator('#plAbout').click();
    await page.locator('#adGuide').click();
    await expect(page.locator('.sheet')).toContainText('Step 1 of 4');
  });

  test('a chord counts in any inversion', async ({ app }) => {
    await app.practice('h:h5');
    expect(await app.answerQuiz({ invert: true })).toMatch(/^Right: /);
  });

  test('seven right out of eight moves on to speed', async ({ app }) => {
    await app.setItem('h:h1', { answers: Array(6).fill({ ok: true, ms: 3000 }) });
    expect(await app.answerQuiz()).toMatch(/You know this\. Now for speed: under \d+\.\d s per answer\./);
    expect((await app.item('h:h1')).stage).toBe('pace');
  });

  test('the cold check is the first five answers of the day', async ({ app }) => {
    const y = await app.eval(() => window.DaCapo.addDays(window.DaCapo.todayKey(), -1));
    await app.setItem('h:h2', { stage: 'check', passes: [], lastCold: y });
    expect(await app.nextPlan('h:h2')).toMatchObject({ mode: 'quiz', cold: true, hints: false });
    for (let k = 0; k < 4; k++) await app.answerQuiz();
    expect(await app.answerQuiz()).toMatch(/Clean cold check\. One more on another day/);
    expect((await app.item('h:h2')).passes).toHaveLength(1);
  });

  test('when answers keep missing, the unit is explained again and the answer shows sooner', async ({
    app,
    page,
  }) => {
    await app.setItem('h:h1', { since: 11, reps: 11, answers: Array(8).fill({ ok: false, ms: 9000 }) });
    expect(await app.answerQuiz({ right: false })).toMatch(/Let's look at how it works again/);
    await expect(page.locator('#qzIntro')).toBeVisible();
    expect(await app.item('h:h1')).toMatchObject({ stage: 'learn', stalls: 1, guided: 4 });
  });

  test('in the session, a theory cold check waits for its five answers, then counts', async ({
    app,
    page,
  }) => {
    await app.eval(() => {
      const D = window.DaCapo;
      D.ensureItem('h:h1');
      Object.assign(D.Store.s.items['h:h1'], {
        stage: 'check',
        passes: [],
        lastCold: D.addDays(D.todayKey(), -1),
      });
      D.Store.s.session = null;
      D.go('practice');
    });
    expect((await app.session())[0]).toBe('check h:h1');
    for (let k = 0; k < 4; k++) {
      await app.answerQuiz();
      await expect(page.locator('.goalcard')).toHaveCount(0);
    }
    await app.answerQuiz();
    await expect(page.locator('.goalcard')).toContainText('Cold check passed.');
  });
});
