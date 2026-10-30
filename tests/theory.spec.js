// Theory: questions answered by playing, then speed, then a cold check of five questions.
import { test, expect } from './fixtures.js';
import { answersInChords, answerSize, check, THEORY_UNITS, makeQuestion } from '../src/js/learn/theory.js';
import { midiOf } from '../src/js/music/theory.js';

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
