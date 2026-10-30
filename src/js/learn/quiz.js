/* The theory player: a question, you answer by playing, then the next.
   What you play is grouped into notes or chords by learn/answer.js. A wrong answer is shown and played,
   with what you played instead. */
import { Log } from '../core/log.js';
import { esc } from '../core/util.js';
import { AudioEngine } from '../core/audio.js';
import { Input } from '../core/input.js';
import { nameOf, spellerFor } from '../music/theory.js';
import { flashKey, kbSVG, staffSVG } from '../music/render.js';
import { detectChord } from '../music/analysis.js';
import { answersInChords, check, makeQuestion, THEORY_BY_ID } from './theory.js';
import { criterion, itemState, planFor, recordAnswer, STAGE_TXT } from './curriculum.js';
import { itemDef } from './areas.js';
import { collectAnswer } from './answer.js';
import { aboutDrill } from '../views/drillinfo.js';

const HINT_AFTER_MS = 6000;
const GUIDED_HINT_MS = 1500; // after a stall: the answer appears soon, to watch and copy
const NEXT_AFTER = { right: 1600, wrong: 4200 };

export const Quiz = {
  mount(root, { id, role = 'focus', onEvent = () => {} }) {
    const def = itemDef(id);
    const U = THEORY_BY_ID[def.unit];
    const Q = {
      phase: 'idle',
      plan: null,
      q: null,
      listen: null,
      tAsk: 0,
      timers: [],
      dead: false,
      held: false,
      n: 0,
    };
    const $q = s => root.querySelector(s);
    const log = (m, d) => Log.ev('quiz ' + m, Object.assign({ id }, d || {}));
    const later = (fn, ms) => Q.timers.push(setTimeout(() => !Q.dead && fn(), ms));
    const clearTimers = () => {
      Q.timers.forEach(clearTimeout);
      Q.timers = [];
    };
    const speller = spellerFor(0);
    const noteName = m => nameOf(speller(m), false);

    root.innerHTML = `
      <div class="player card quiz" data-kind="theory">
        <div class="pl-head">
          <div class="pl-title"><b>${esc(def.title)}</b><span class="small">${esc(def.sub)}</span></div>
          <button class="iconbtn" type="button" id="plAbout" aria-label="About this unit" title="About this unit">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>
          </button>
        </div>
        <div class="pl-stagebar"><span class="pill" id="plStage"></span><span class="small" id="plCrit"></span></div>
        <div class="quiz-intro" id="qzIntro" hidden></div>
        <div class="quiz-q">
          <div class="quiz-prompt" id="qzPrompt"></div>
          <div class="small" id="qzSub"></div>
        </div>
        <div class="staffwrap" id="qzStaff"></div>
        <div class="feedback pl-msg" id="plMsg" aria-live="polite"></div>
        <div class="cue" id="plCue"></div>
        <div class="kbwrap scrollx" id="plKbWrap"><div id="plKb"></div></div>
        <div class="st-bar pl-bar">
          <button class="iconbtn" type="button" id="plHear" aria-label="Hear it" title="Hear it">
            <svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>
          </button>
          <span class="small" id="plInfo"></span>
          <button class="btn cover sm" type="button" id="plGo">Skip</button>
        </div>
      </div>`;
    const msg = (t, cls = '') => {
      const e = $q('#plMsg');
      e.className = 'feedback pl-msg ' + cls;
      e.textContent = t;
    };

    /* ---------- painting ---------- */
    function paintHead() {
      const it = itemState(id) || {};
      const st = $q('#plStage');
      st.textContent = Q.plan.cold ? 'Cold check' : role === 'review' ? 'Review' : STAGE_TXT[it.stage] || '';
      st.className = 'pill ' + (it.stage === 'done' ? 'ok' : Q.plan.cold || role !== 'focus' ? 'brass' : '');
      $q('#plCrit').textContent = criterion(id);
      $q('#plCue').innerHTML =
        `<span>${Q.plan.cold ? 'Cold check' : 'Why'}</span> ${esc(Q.plan.cold ? Q.plan.label : U.use)}`;
      $q('#plInfo').textContent = Q.plan.pace ? `Goal ${(Q.plan.pace / 1000).toFixed(1)} s per answer` : '';
    }
    // the answer on the staff (shown after answering, or as a hint)
    function paintStaff(show) {
      const box = $q('#qzStaff');
      if (!show) {
        box.innerHTML = '';
        return;
      }
      const groups = Array.isArray(show[0])
        ? show
        : Q.q.kind === 'seq' || Q.q.kind === 'pair'
          ? show.map(n => [n])
          : [show];
      const items = groups.map(g => ({ notes: g.map(n => ({ n, st: n.o >= 4 ? 't' : 'b', cls: 'ok' })) }));
      box.innerHTML = `<div style="max-width:520px;margin:0 auto">${staffSVG({ clef: 'grand', sig: 0, items, spacing: 34, minW: 260, top: 30, bottom: 30 }).svg}</div>`;
    }
    function paintKb(marked = []) {
      const marks = {};
      marked.forEach(m => (marks[m] = { cls: 'rh' }));
      $q('#plKb').innerHTML = kbSVG({ from: 48, to: 84, marks, h: 96 });
    }

    /* ---------- one question ---------- */
    function ask() {
      clearTimers();
      Q.plan = planFor(id);
      Q.q = makeQuestion(def.unit, Q.q);
      Q.hinted = false;
      if (Q.listen) Q.listen.stop();
      Q.listen = collectAnswer(Q.q, groups => answer(check(Q.q, groups).ok, groups));
      Q.phase = 'ask';
      Q.tAsk = performance.now();
      paintHead();
      $q('#qzPrompt').textContent = Q.q.prompt;
      $q('#qzSub').textContent = Q.q.sub;
      $q('#plGo').textContent = 'Skip';
      paintStaff(null);
      paintKb();
      msg(Q.plan.cold ? 'First try today: no hints.' : 'Play your answer.');
      if (Q.plan.hints) later(hint, (itemState(id) || {}).guided > 0 ? GUIDED_HINT_MS : HINT_AFTER_MS);
      log('ask', { prompt: Q.q.prompt, cold: Q.plan.cold });
    }
    function hint() {
      if (Q.phase !== 'ask') return;
      Q.hinted = true;
      paintStaff(Q.q.show);
      paintKb(Q.q.play.flat());
      msg(`Hint: ${Q.q.explain}`);
    }

    /* ---------- listening ---------- */
    // keys light up as you play; after an answer is shown, any key moves on
    const onNote = Log.guard('quiz note', ev => {
      if (Q.dead || Q.held) return;
      if (Q.phase === 'ask') flashKey($q('#plKb svg'), ev.m, 'ok', 160);
      else if (Q.phase === 'shown' && performance.now() - Q.shownAt > 800) ask();
    });

    /* ---------- the answer ---------- */
    function describe(groups) {
      if (answersInChords(Q.q))
        return groups
          .map(g =>
            g.length >= 3
              ? (detectChord(g, speller) || {}).name || g.map(noteName).join('–')
              : g.map(noteName).join('–'),
          )
          .join(', ');
      return groups.map(g => noteName(g[0])).join(' – ');
    }
    function answer(ok, groups = []) {
      if (Q.phase !== 'ask') return;
      clearTimers();
      Q.listen.stop();
      const ms = Math.round(performance.now() - Q.tAsk);
      Q.phase = 'shown';
      Q.shownAt = performance.now();
      Q.n++;
      const chords = answersInChords(Q.q);
      // a microphone hears one note at a time: chords cannot count from it
      const valid = Input.live && Input.mode !== 'touch' && !(chords && Input.mode === 'mic');
      const right = ok && !Q.hinted;
      const out = recordAnswer(id, { ok: right, ms, valid });
      paintStaff(Q.q.show);
      if (ok) {
        msg(
          `${Q.hinted ? 'Right, with the hint' : 'Right'}: ${Q.q.explain}${out.msg ? ' ' + out.msg : ''}`,
          'ok',
        );
      } else {
        paintKb(Q.q.play.flat());
        const what = groups.length ? `You played ${describe(groups)}.` : 'Skipped.';
        msg(`${what} ${Q.q.explain}${out.msg ? ' ' + out.msg : ''}`, 'bad');
        playAnswer();
      }
      $q('#plGo').textContent = 'Next';
      if (out.change === 'stall') showIntro();
      paintHead();
      log('answer', { ok, hinted: Q.hinted, ms, valid, change: out.change });
      onEvent({ type: 'rep', r: { valid, clean: right, mode: 'quiz' }, out });
      if (!Q.held) later(ask, out.change ? NEXT_AFTER.wrong : right ? NEXT_AFTER.right : NEXT_AFTER.wrong);
    }
    function playAnswer() {
      const t = AudioEngine.now() + 0.05;
      const gap = answersInChords(Q.q) ? 0.9 : 0.42;
      Q.q.play.forEach((x, i) =>
        Array.isArray(x)
          ? AudioEngine.chord(x, t + i * gap, gap * 0.95, 0.5)
          : AudioEngine.note(x, t + i * gap, gap * 1.6, 0.55),
      );
    }

    /* ---------- controls ---------- */
    $q('#plGo').onclick = Log.guard('quiz next', () => {
      if (Q.phase === 'ask') {
        log('skip');
        return answer(false);
      }
      ask();
    });
    $q('#plHear').onclick = Log.guard('quiz hear', () => {
      AudioEngine.ensure();
      // before answering, hearing it is a hint (allowed while learning)
      if (Q.phase === 'ask') {
        if (!Q.plan.hints) return msg('Answer first; then you can hear it.');
        Q.hinted = true;
      }
      playAnswer();
    });
    $q('#plAbout').onclick = () => aboutDrill(id);
    // what the unit is about, above the questions: the first time, and again after a stall
    function showIntro() {
      const intro = $q('#qzIntro');
      intro.hidden = false;
      intro.innerHTML = `<b>${esc(U.t)}</b><p>${esc(U.about)}</p>`;
    }
    const it = itemState(id);
    if (!it || !it.reps) showIntro();
    const offs = [Input.on(onNote)];
    Quiz.debug = Q; // for automated tests
    ask();
    log('mounted', { role, stage: (itemState(id) || {}).stage });
    return {
      get phase() {
        return Q.phase;
      },
      get plan() {
        return Q.plan;
      },
      hold(on) {
        Q.held = on;
        if (on) clearTimers();
      },
      destroy() {
        if (Q.dead) return;
        Q.dead = true;
        clearTimers();
        if (Q.listen) Q.listen.stop();
        offs.forEach(f => f());
        log('destroyed');
      },
    };
  },
};
