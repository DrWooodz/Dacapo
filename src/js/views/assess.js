/* The placement check, step by step (the scoring is in learn/assess.js). Every step can be skipped. */
import { Log } from '../core/log.js';
import { $, esc } from '../core/util.js';
import { AudioEngine, Metro } from '../core/audio.js';
import { Input } from '../core/input.js';
import { go, onUnmount } from '../core/ui.js';
import { nameOf, spellerFor } from '../music/theory.js';
import { flashKey, kbSVG, staffSVG } from '../music/render.js';
import { check, makeQuestion } from '../learn/theory.js';
import {
  applyPlacement,
  readingNotes,
  scorePulse,
  scoreReading,
  scoreScale,
  THEORY_STEPS,
} from '../learn/assess.js';
import { collectAnswer } from '../learn/answer.js';
import { AREA_BY, itemDef } from '../learn/areas.js';
import { chooseFocus, rankAreas } from '../learn/skills.js';
import { bindConnect, connectNotice } from './practice.js';
import { focusSheet } from './skills.js';

const QUESTION_MS = 25000; // a theory question left unanswered this long counts as not known
const PULSE = { bpm: 80, withClick: 8, alone: 8 };

export const assessView = page => {
  const R = { reading: {}, theory: [] };
  let cleanups = [];
  const cleanup = () => {
    cleanups.forEach(f => f());
    cleanups = [];
  };
  onUnmount(cleanup);
  const listen = fn => cleanups.push(Input.on(Log.guard('assess note', fn)));
  const timer = (fn, ms) => {
    const t = setTimeout(fn, ms);
    cleanups.push(() => clearTimeout(t));
  };
  const speller = spellerFor(0);
  const STEPS = [
    intro,
    () => reading('treble'),
    () => reading('bass'),
    () => scale('rh'),
    () => scale('ht'),
    theory,
    pulse,
    result,
  ];
  let step = 0;
  const next = () => {
    cleanup();
    step++;
    Log.ev('assess step', { step });
    STEPS[step]();
  };
  intro();

  // the frame every step shares: a title, instructions, the area to play in, a keyboard, skip
  function frame(title, how, { body = '', keyboard = true, skip = true } = {}) {
    const n = STEPS.length - 2;
    page.innerHTML = `
      <div class="stack">
        <span class="eyebrow">Placement check${step > 0 && step <= n ? ` · step ${step} of ${n}` : ''}</span>
        <h1 class="h2">${esc(title)}</h1>
      </div>
      ${step > 0 ? connectNotice() : ''}
      <div class="card assess">
        <p class="small" id="asHow">${how}</p>
        <div id="asBody">${body}</div>
        <div class="feedback pl-msg" id="asMsg" aria-live="polite"></div>
        ${keyboard ? `<div class="kbwrap scrollx"><div id="asKb">${kbSVG({ from: 36, to: 96, h: 96 })}</div></div>` : ''}
        <div class="row between">
          <span class="small" id="asInfo"></span>
          ${skip ? '<button class="btn sm ghost" type="button" id="asSkip">Skip this part</button>' : ''}
        </div>
      </div>`;
    bindConnect();
    const sk = $('#asSkip', page);
    if (sk) sk.onclick = next;
  }
  const msg = (t, cls = '') => {
    const e = $('#asMsg', page);
    if (e) {
      e.className = 'feedback pl-msg ' + cls;
      e.textContent = t;
    }
  };
  const info = t => {
    const e = $('#asInfo', page);
    if (e) e.textContent = t;
  };
  const flash = (m, ok) => flashKey($('#asKb svg', page), m, ok ? 'ok' : 'bad', 220);

  /* ---------- steps ---------- */
  function intro() {
    frame(
      'Find your starting points',
      `About eight minutes at the piano. You will read a few notes in each clef, play a C major scale, answer
       some questions by playing, and keep a steady beat. Nothing here can go wrong: it only decides where
       practice starts. Skip anything you like.`,
      {
        keyboard: false,
        skip: false,
        body: '<button class="btn cover big" type="button" id="asGo">Start</button>',
      },
    );
    $('#asGo', page).onclick = () => {
      AudioEngine.ensure();
      next();
    };
  }

  function reading(clef) {
    const notes = readingNotes(clef);
    const answers = [];
    let i = 0;
    let shownAt = 0;
    frame(
      clef === 'treble' ? 'Reading: treble clef' : 'Reading: bass clef',
      `A note appears on the staff. Play it on the piano, in the octave where it is written. Take the time you
       need, but don't guess: speed only counts when the note is right.`,
    );
    const show = () => {
      const nt = notes[i];
      $('#asBody', page).innerHTML = `<div class="assess-note" data-midi="${nt.midi}">${
        staffSVG({
          clef,
          sig: 0,
          items: [{ notes: [{ n: nt.n, st: clef === 'treble' ? 't' : 'b', cls: 'cur' }] }],
          spacing: 40,
          minW: 200,
          top: 46,
          bottom: 46,
        }).svg
      }</div>`;
      info(`Note ${i + 1} of ${notes.length}`);
      shownAt = performance.now();
    };
    const misses = level => answers.filter(a => a.level === level && !a.ok).length;
    listen(ev => {
      const nt = notes[i];
      if (!nt) return;
      const ok = ev.m === nt.midi;
      answers.push({ level: nt.level, ok, ms: ev.t - shownAt });
      flash(ev.m, ok);
      msg(ok ? 'Right.' : `That was ${nameOf(speller(ev.m))}; this is ${nameOf(nt.n)}.`, ok ? 'ok' : 'bad');
      i++;
      // two misses in a level: the harder levels can wait
      if (i >= notes.length || misses(nt.level) >= 2) {
        R.reading[clef] = scoreReading(clef, answers);
        Log.ev('assess reading', { clef, levels: R.reading[clef].map(l => `${l.ok}/${l.tried} ${l.ms}`) });
        return timer(next, 900);
      }
      timer(show, 450);
    });
    show();
  }

  function scale(hands) {
    if (hands === 'ht' && (!R.scale || !R.scale.rh || R.scale.rh.right < R.scale.rh.of - 2)) return next();
    const want = hands === 'rh' ? 15 : 58;
    const notes = [];
    frame(
      hands === 'rh' ? 'Scale: right hand' : 'Scale: hands together',
      hands === 'rh'
        ? 'Play a C major scale with the right hand, one octave up and back down (C to C to C), at a speed that feels comfortable. No metronome.'
        : 'Now both hands together, two octaves up and back down, at a comfortable speed.',
    );
    info(hands === 'rh' ? 'Start whenever you are ready' : 'Both hands, two octaves');
    let quiet = 0;
    let finished = false;
    const done = () => {
      // once only: notes played after the scale (or the quiet timer) must not score it again and skip a step
      if (finished) return;
      finished = true;
      clearTimeout(quiet);
      R.scale = R.scale || {};
      R.scale[hands] = scoreScale(notes, hands);
      const s = R.scale[hands];
      Log.ev('assess scale', { hands, ...s });
      msg(
        `${s.right} of ${s.of} notes right${s.bpm ? ` · about ♩ ${s.bpm} (two notes per beat)` : ''}${s.cv != null ? ` · ${s.cv < 0.12 ? 'even' : s.cv < 0.2 ? 'fairly even' : 'uneven'}` : ''}.`,
        s.right >= s.of - 1 ? 'ok' : '',
      );
      timer(next, 1800);
    };
    listen(ev => {
      if (finished) return;
      notes.push({ m: ev.m, t: ev.t });
      flash(ev.m, true);
      info(`${hands === 'rh' ? notes.length : Math.round(notes.length / 2)} notes`);
      clearTimeout(quiet);
      if (notes.length >= want) return done();
      quiet = setTimeout(() => notes.length >= 6 && done(), 3000);
    });
    cleanups.push(() => clearTimeout(quiet));
  }

  function theory() {
    let k = 0;
    let missedInRow = 0;
    frame(
      'Theory, by playing',
      'Answer each question on the piano. If you do not know one, skip it: that is useful to know too.',
    );
    const ask = () => {
      if (k >= THEORY_STEPS.length || missedInRow >= 2) return next();
      const unit = THEORY_STEPS[k];
      const q = makeQuestion(unit);
      $('#asBody', page).innerHTML =
        `<div class="quiz-q"><div class="quiz-prompt">${esc(q.prompt)}</div><div class="small">${esc(q.sub)}</div></div>`;
      info(`Question ${k + 1}`);
      msg('');
      let answered = false;
      const finish = ok => {
        if (answered) return;
        answered = true;
        listener.stop();
        R.theory.push({ unit, ok });
        missedInRow = ok ? 0 : missedInRow + 1;
        msg(ok ? 'Right.' : q.explain, ok ? 'ok' : '');
        k++;
        timer(ask, ok ? 900 : 2400);
      };
      const listener = collectAnswer(q, groups => finish(check(q, groups).ok));
      cleanups.push(() => listener.stop());
      timer(() => finish(false), QUESTION_MS);
      $('#asSkip', page).textContent = 'I do not know this one';
      $('#asSkip', page).onclick = () => finish(false);
    };
    listen(ev => flash(ev.m, true));
    ask();
  }

  function pulse() {
    frame(
      'A steady beat',
      `Play any key along with the click. After ${PULSE.withClick} clicks it stops: keep going on your own for
       about ${PULSE.alone} more beats, as evenly as you can.`,
      { body: '<button class="btn cover" type="button" id="asBeat">Start the click</button>' },
    );
    $('#asBeat', page).onclick = () => {
      AudioEngine.ensure();
      $('#asBody', page).innerHTML = '';
      const taps = [];
      const msBeat = 60000 / PULSE.bpm;
      const first = AudioEngine.toPerf(Metro.start({ bpm: PULSE.bpm, beats: 4 }));
      const clicks = Array.from({ length: PULSE.withClick }, (_, i) => first + i * msBeat);
      cleanups.push(() => Metro.stop());
      timer(
        () => {
          Metro.stop();
          msg('Keep going…');
        },
        clicks[clicks.length - 1] - performance.now() + msBeat * 0.6,
      );
      listen(ev => {
        taps.push(ev.t);
        flash(ev.m, true);
      });
      timer(
        () => {
          R.pulse = scorePulse(taps, clicks, msBeat);
          Log.ev('assess pulse', R.pulse || { taps: taps.length });
          msg(
            R.pulse
              ? `On your own: ± ${Math.round(R.pulse.sd * 100)}% of a beat.`
              : 'Not enough beats to measure.',
          );
          timer(next, 1600);
        },
        clicks[clicks.length - 1] - performance.now() + msBeat * (PULSE.alone + 1.5),
      );
    };
  }

  function result() {
    applyPlacement(R);
    const lines = [];
    for (const clef of ['treble', 'bass']) {
      const levels = R.reading[clef];
      if (!levels) continue;
      const passed = levels.filter(l => l.passed);
      const name = clef === 'treble' ? 'Treble reading' : 'Bass reading';
      lines.push(
        passed.length
          ? `${name}: secure up to "${itemDef(passed[passed.length - 1].unit).title.split(': ')[1]}".`
          : `${name}: starts from the beginning, with the first five notes.`,
      );
    }
    if (R.scale && R.scale.rh)
      lines.push(
        `Scales: C major ${R.scale.ht && R.scale.ht.right >= R.scale.ht.of - 2 ? 'hands together' : R.scale.rh.right >= R.scale.rh.of - 1 ? 'right hand' : 'is a good place to start'}.`,
      );
    const right = R.theory.filter(a => a.ok).length;
    if (R.theory.length) lines.push(`Theory: ${right} of ${R.theory.length} questions right.`);
    if (R.pulse) lines.push(`Steadiness: ± ${Math.round(R.pulse.sd * 100)}% of a beat on your own.`);
    const best = rankAreas()[0];
    frame(
      'Your starting points',
      'Practice now starts from here. Anything marked as known comes back for a quick review in a week, which confirms it.',
      {
        keyboard: false,
        skip: false,
        body: `<ul class="small">${lines.map(l => `<li>${esc(l)}</li>`).join('') || '<li>Everything starts from the beginning.</li>'}</ul>
          ${
            best
              ? `<div class="focusbar card"><span class="eyebrow">Suggested focus for this week</span>
                   <b class="h3">${esc(AREA_BY[best.area].n)}</b><div class="small">${esc(best.reason)}</div></div>`
              : ''
          }
          <button class="btn cover big" type="button" id="asDone">Start practicing</button>
          ${best ? '<button class="btn ghost" type="button" id="asOther">Choose another focus</button>' : ''}`,
      },
    );
    $('#asDone', page).onclick = () => {
      if (best) chooseFocus(best.area);
      go('practice');
    };
    const other = $('#asOther', page);
    if (other) other.onclick = () => focusSheet(() => go('practice'));
  }
};
