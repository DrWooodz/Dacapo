// Shared test setup: open the app with a simulated piano, and fail any test that logs an error.
import { test as base, expect } from '@playwright/test';

// Runs in the page before the app. Helpers reach the app through window.DaCapo (see src/js/app.js).
const PAGE_HELPERS = () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const send = (status, d1, d2, ts) =>
    window.DaCapo.Input.onMidi({ data: [status, d1, d2], timeStamp: ts ?? performance.now() });
  window.__t = {
    sleep,
    send,
    noteOn: (m, vel = 80) => send(0x90, m, vel),
    noteOff: m => send(0x80, m, 0),
    player: () => window.DaCapo.Player.debug,
    steps: () => window.DaCapo.Player.debug.P.drill.steps.map(s => ({ midis: s.midis, beat: s.beat })),
    msg: () => document.querySelector('#plMsg').textContent,
    // wait until the player has left `phase` (for example, finished judging a rep)
    async waitPhaseNot(phase, ms = 8000) {
      const t = performance.now();
      while (performance.now() - t < ms) {
        const d = window.DaCapo.Player.debug;
        if (d && d.P.phase !== phase) return true;
        await sleep(40);
      }
      return false;
    },
    async waitPhase(phase, ms = 15000) {
      const t = performance.now();
      while (performance.now() - t < ms) {
        const d = window.DaCapo.Player.debug;
        if (d && d.P.phase === phase) return true;
        await sleep(40);
      }
      return false;
    },
    // wait mode: play each step's notes, one step after another
    async playWait(steps, gap = 120) {
      for (const s of steps) {
        for (const m of s.midis) {
          send(0x90, m, 80);
          await sleep(8);
        }
        await sleep(gap);
        for (const m of s.midis) send(0x80, m, 0);
      }
    },
    // metronome mode: play each step at its beat, with random timing error (ms), skipped steps, a wrong
    // note, or everything shifted by some semitones (an octave too high: shift 12)
    async playTempo(steps, msBeat, t0, { jitter = 0, skip = [], wrong = false, shift = 0 } = {}) {
      const evs = [];
      steps.forEach((s, i) => {
        if (skip.includes(i)) return;
        const t = t0 + s.beat * msBeat + (Math.random() * 2 - 1) * jitter;
        (s.midis.length ? s.midis : [60]).forEach((m, j) => evs.push([t + j * 6, m + shift]));
      });
      if (wrong) evs.push([t0 + steps[2].beat * msBeat + 30, 30]);
      evs.sort((a, b) => a[0] - b[0]);
      for (const [t, m] of evs) {
        const wait = t - performance.now();
        if (wait > 0) await sleep(wait);
        send(0x90, m, 80, t);
        setTimeout(() => send(0x80, m, 0), 60);
      }
    },
    // theory: answer the current question by playing it (chords together), or a wrong note
    async answerQuiz({ right = true, invert = false } = {}) {
      const t = performance.now();
      while (window.DaCapo.Quiz.debug.phase !== 'ask' && performance.now() - t < 8000) await sleep(40);
      const q = window.DaCapo.Quiz.debug.q;
      const chords = q.kind === 'chord' || q.kind === 'chords';
      let groups = chords ? q.play : q.play.map(m => [m]);
      // a chord in its first inversion: the bottom note moves up an octave
      if (invert) groups = groups.map(([low, ...rest]) => [...rest, low + 12]);
      if (!right) groups = [[groups[0][0] + 1]];
      for (const g of groups) {
        g.forEach(m => send(0x90, m, 80));
        await sleep(chords ? 120 : 60);
        g.forEach(m => send(0x80, m, 0));
        await sleep(chords ? 400 : 100);
      }
      const t1 = performance.now();
      while (window.DaCapo.Quiz.debug.phase !== 'shown' && performance.now() - t1 < 4000) await sleep(40);
      return document.querySelector('#plMsg').textContent;
    },
  };
};

export class App {
  constructor(page) {
    this.page = page;
    this.allowedErrors = [];
  }
  eval(fn, arg) {
    return this.page.evaluate(fn, arg);
  }
  // pretend a piano is plugged in over USB
  async connectPiano() {
    await this.eval(() => {
      const { Input, AudioEngine } = window.DaCapo;
      Input.mode = 'midi';
      Input.live = true;
      Input.midiNames = ['TEST PIANO'];
      Input.paint();
      AudioEngine.ensure();
    });
  }
  // the welcome screen: optionally what matters most, a first piece, then skip the placement check
  async onboard(piece = 'satie-gym-1', { matters = [] } = {}) {
    for (const a of matters) await this.page.locator(`[data-matter="${a}"]`).click();
    if (piece) await this.page.locator(`[data-pick="${piece}"]`).click();
    await this.page.locator('#wcStart').click();
    await this.page.waitForTimeout(300);
  }
  // today's session as "role id" lines
  session() {
    return this.eval(() => window.DaCapo.Store.s.session.list.map(e => `${e.role} ${e.id}`));
  }
  // change an item's saved state (creating it if needed), then open it as extra practice
  async setItem(id, fields, open = true) {
    await this.eval(
      ([id, fields]) => {
        const D = window.DaCapo;
        D.ensureItem(id);
        Object.assign(D.Store.s.items[id], fields);
        D.Store.save();
      },
      [id, fields],
    );
    if (open) await this.practice(id);
  }
  async practice(item) {
    await this.eval(id => window.DaCapo.go('practice', id ? { item: id } : {}), item);
    await this.page.waitForTimeout(300);
  }
  item(id) {
    return this.eval(id => window.DaCapo.Store.s.items[id], id);
  }
  // the plan of the rep on screen
  plan() {
    return this.eval(() => window.DaCapo.Player.debug.P.plan);
  }
  // the plan the next rep of an item will get (right after a rep, before the player moves on)
  nextPlan(id) {
    return this.eval(id => window.DaCapo.planFor(id), id);
  }
  phase() {
    return this.eval(() => window.DaCapo.Player.debug.P.phase);
  }
  message() {
    return this.eval(() => window.__t.msg());
  }
  // one rep in wait mode; optionally one wrong note before step `wrongAt`
  async waitRep({ gap = 80, wrongAt = null } = {}) {
    expect(await this.eval(() => window.__t.waitPhase('ready', 8000))).toBe(true);
    const steps = await this.eval(() => window.__t.steps());
    if (wrongAt == null) await this.eval(([s, g]) => window.__t.playWait(s, g), [steps, gap]);
    else {
      await this.eval(([s, g]) => window.__t.playWait(s, g), [steps.slice(0, wrongAt), gap]);
      await this.eval(() => {
        window.__t.noteOn(30);
        window.__t.noteOff(30);
      });
      await this.eval(([s, g]) => window.__t.playWait(s, g), [steps.slice(wrongAt), gap]);
    }
    expect(await this.eval(() => window.__t.waitPhaseNot('wait'))).toBe(true);
    return this.message();
  }
  // one rep with the metronome, played in time from the count-in
  async tempoRep(opts = {}) {
    expect(await this.eval(() => window.__t.waitPhase('countin', 10000))).toBe(true);
    const info = await this.eval(() => {
      const { P, T } = window.DaCapo.Player.debug;
      return { t0: T.t0, ms: T.msBeat, steps: window.__t.steps(), bpm: P.plan.bpm, hand: P.plan.hand };
    });
    await this.eval(([i, o]) => window.__t.playTempo(i.steps, i.ms, i.t0, o), [info, opts]);
    expect(await this.eval(() => window.__t.waitPhaseNot('tempo'))).toBe(true);
    return { bpm: info.bpm, hand: info.hand, message: await this.message() };
  }
  // theory: answer the current question by playing ({right, invert}); returns the feedback
  answerQuiz(opts = {}) {
    return this.eval(o => window.__t.answerQuiz(o), opts);
  }
  // errors the app logged while the test ran (see allowErrors)
  async loggedErrors() {
    return this.eval(() => window.DaCapo.Log.buf.filter(e => e.k === 'err').map(e => e.m));
  }
  allowErrors(re) {
    this.allowedErrors.push(re);
  }
}

export const test = base.extend({
  app: async ({ page }, use) => {
    const problems = [];
    page.on('pageerror', e => problems.push('page error: ' + e.message));
    page.on('console', m => {
      // fonts and other network requests can fail offline; everything else is a bug
      if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text()))
        problems.push('console: ' + m.text());
    });
    await page.addInitScript(PAGE_HELPERS);
    await page.goto('index.html');
    await page.waitForFunction(() => window.DaCapo && window.DaCapo.Store);
    const app = new App(page);
    await use(app);
    const logged = (await app.loggedErrors()).filter(m => !app.allowedErrors.some(re => re.test(m)));
    const unexpected = problems.filter(m => !app.allowedErrors.some(re => re.test(m)));
    expect([...unexpected, ...logged.map(m => 'logged: ' + m)]).toEqual([]);
  },
});

export { expect };
