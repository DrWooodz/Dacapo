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
    // metronome mode: play each step at its beat, with random timing error (ms) or set offsets (ms, one per
    // step, repeating), skipped steps, a wrong note, or everything shifted by some semitones (shift 12)
    async playTempo(
      steps,
      msBeat,
      t0,
      { jitter = 0, offsets = null, skip = [], wrong = false, shift = 0 } = {},
    ) {
      const evs = [];
      steps.forEach((s, i) => {
        if (skip.includes(i)) return;
        const t =
          t0 + s.beat * msBeat + (offsets ? offsets[i % offsets.length] : (Math.random() * 2 - 1) * jitter);
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
  // the first open: the welcome note on Play, dismissed
  async onboard() {
    await this.page.locator('#plyHi').click();
  }
  // change a piece section's saved state (creating it if needed), then open it
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
    if (open) await this.song(id);
  }
  // a piece's page, playing one of its sections (p:<piece>:<section>)
  async song(item) {
    await this.eval(id => window.DaCapo.go('songs', { pid: id.split(':')[1], item: id }), item);
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
    // (a run with notes missing ends at its time-out, after the last beat)
    expect(await this.eval(() => window.__t.waitPhaseNot('tempo', 40000))).toBe(true);
    return { bpm: info.bpm, hand: info.hand, message: await this.message() };
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
