/* Echo, the call-and-response game (rules in learn/echo.js). */
import { Log } from '../core/log.js';
import { $, esc } from '../core/util.js';
import { Store } from '../core/store.js';
import { AudioEngine } from '../core/audio.js';
import { Input } from '../core/input.js';
import { flashKey, kbSVG } from '../music/render.js';
import { afterAnswer, ECHO_LEVELS, judge, makePhrase, MAX_ECHO, pcName } from '../learn/echo.js';

const PAUSE_MS = { right: 1300, wrong: 3200 };

export function drawEcho(body) {
  const games = (Store.s.games = Store.s.games || {});
  const g = (games.echo = Object.assign({ level: 1, best: 1, streak: 0, misses: 0 }, games.echo));
  const E = { phase: 'idle', phrase: null, played: [], timers: [] };
  const later = (fn, ms) => E.timers.push(setTimeout(fn, ms));
  const clear = () => {
    E.timers.forEach(clearTimeout);
    E.timers = [];
  };

  body.innerHTML = `
    <div class="card echo">
      <div class="row between">
        <div>
          <span class="eyebrow">Echo</span>
          <div class="h3" id="ecLevel"></div>
        </div>
        <div class="streak" id="ecStreak" aria-label="Right in a row"></div>
      </div>
      <p class="small">DaCapo plays a short phrase after a chord that sets the key. Play it back, in any
        octave. Three right in a row and the phrases grow.</p>
      <div class="echo-prompt" id="ecPrompt"></div>
      <div class="feedback pl-msg" id="ecMsg" aria-live="polite"></div>
      <div class="kbwrap scrollx"><div id="ecKb"></div></div>
      <div class="row">
        <button class="btn cover" type="button" id="ecGo">Play a phrase</button>
        <button class="btn" type="button" id="ecAgain" disabled>Hear it again</button>
      </div>
    </div>`;
  const msg = (t, cls = '') => {
    const e = $('#ecMsg', body);
    e.className = 'feedback pl-msg ' + cls;
    e.textContent = t;
  };
  const kb = (marks = {}) => ($('#ecKb', body).innerHTML = kbSVG({ from: 48, to: 84, marks, h: 110 }));

  function paintHead() {
    const L = ECHO_LEVELS[g.level - 1];
    $('#ecLevel', body).textContent = `Level ${g.level} of ${MAX_ECHO} · ${L.len} notes · best ${g.best}`;
    $('#ecStreak', body).innerHTML = [0, 1, 2]
      .map(i => `<i class="${i < g.streak ? 'on' : ''}"></i>`)
      .join('');
  }
  function prompt() {
    const p = E.phrase;
    $('#ecPrompt', body).innerHTML = p
      ? `<b>${esc(p.key.replace('b', '♭'))} ${p.minor ? 'minor' : 'major'}</b> · starts on ${esc(pcName(p.notes[0]))}
         · ${E.played.length} of ${p.notes.length}`
      : '';
  }

  // the key chord, then the phrase; listening starts when it has finished
  function playPhrase() {
    clear();
    const p = E.phrase;
    const L = ECHO_LEVELS[g.level - 1];
    E.phase = 'listen';
    E.played = [];
    const t = AudioEngine.now() + 0.08;
    AudioEngine.chord(p.chord, t, 0.9, 0.42);
    p.notes.forEach((m, i) => AudioEngine.note(m, t + 1.1 + i * L.gap, L.gap * 1.3, 0.62));
    const ends = (1.1 + p.notes.length * L.gap) * 1000;
    later(() => {
      E.phase = 'answer';
      msg('Your turn.');
    }, ends);
    msg('Listen…');
    $('#ecAgain', body).disabled = false;
    kb();
    prompt();
  }
  function newPhrase() {
    E.phrase = makePhrase(g.level, E.phrase);
    $('#ecGo', body).textContent = 'Skip';
    playPhrase();
    Log.ev('echo phrase', { level: g.level, notes: E.phrase.notes.length });
  }

  function answered(ok) {
    E.phase = 'shown';
    Object.assign(g, afterAnswer(g, ok));
    Store.save();
    const p = E.phrase;
    const marks = Object.fromEntries(p.notes.map(m => [m, { cls: 'rh' }]));
    kb(marks);
    if (ok) msg(g.streak === 0 && g.level > 1 ? `Right. Up to level ${g.level}.` : 'Right.', 'ok');
    else {
      msg(`It was ${p.notes.map(pcName).join(' – ')}. Listen once more.`, 'bad');
      const L = ECHO_LEVELS[Math.min(MAX_ECHO, g.level) - 1];
      const t = AudioEngine.now() + 0.5;
      p.notes.forEach((m, i) => AudioEngine.note(m, t + i * L.gap, L.gap * 1.3, 0.62));
    }
    paintHead();
    Log.ev('echo answer', { ok, level: g.level, streak: g.streak });
    later(newPhrase, ok ? PAUSE_MS.right : PAUSE_MS.wrong + p.notes.length * 400);
  }

  const off = Input.on(
    Log.guard('echo note', ev => {
      const svg = $('#ecKb svg', body);
      if (E.phase !== 'answer') return;
      E.played.push(ev.m);
      const r = judge(E.phrase, E.played);
      flashKey(svg, ev.m, r.wrongAt >= 0 ? 'bad' : 'ok', 260);
      prompt();
      if (r.wrongAt >= 0) answered(false);
      else if (r.ok) answered(true);
    }),
  );

  $('#ecGo', body).onclick = () => {
    AudioEngine.ensure();
    newPhrase();
  };
  $('#ecAgain', body).onclick = () => {
    if (!E.phrase) return;
    clear();
    playPhrase();
  };
  kb();
  paintHead();
  msg(Input.live ? 'Press "Play a phrase" when you are ready.' : 'Use your piano, or the keys below.');

  return () => {
    clear();
    off();
  };
}
