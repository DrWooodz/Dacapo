/* Practice: today's session (or a piece session) played item by item, and extra practice of one item. */
import { IN_CLAUDE } from '../env.js';
import { Log } from '../core/log.js';
import { $, $$, esc, toast, todayKey } from '../core/util.js';
import { Activity, Store } from '../core/store.js';
import { AudioEngine } from '../core/audio.js';
import { Input } from '../core/input.js';
import { go, onUnmount, UI } from '../core/ui.js';
import { planFor } from '../learn/curriculum.js';
import { Player } from '../learn/player.js';
import { currentSession, entryMinutes, isOpen, jumpTo } from '../learn/sessions.js';
import { itemDef } from '../learn/areas.js';
import { shortTitle } from './drillinfo.js';
import { settingsSheet } from './settings.js';

// how long the goal card waits before moving on by itself
const GOAL_WAIT_MS = 6000;

const ROLE_PREFIX = { check: 'Check: ', review: 'Review: ', warm: 'Upkeep: ', daily: 'Daily: ' };

export const practiceView = (page, params) => {
  let player = null;
  let tick = 0;
  let goalTimer = 0;
  const cleanup = () => {
    if (player) {
      player.destroy();
      player = null;
    }
    clearInterval(tick);
    clearTimeout(goalTimer);
  };
  onUnmount(cleanup);
  if (!Store.s.profile.onboarded) return go('home');
  // where Back leads: the screen you came from
  const from = params.from === 'library' ? 'library' : 'home';
  if (params.item) return drawExtra(params.item);
  const pieces = params.session === 'pieces';
  drawSession();

  // today's session, or the piece session you started
  function theSession() {
    if (pieces) {
      const s = Store.s.pieceSession;
      return s && s.day === todayKey() ? s : null;
    }
    return currentSession();
  }

  /* ---------- the session ---------- */
  function drawSession() {
    cleanup();
    const s = theSession();
    const open = s ? s.list.findIndex((e, i) => i >= s.idx && isOpen(e)) : -1;
    // nothing (left) to play: back to where the day is shown
    if (open < 0) return finished(s);
    s.idx = open;
    const e = s.list[s.idx];
    if (e.state === 'todo') {
      e.state = 'active';
      Store.save();
    }
    const done = s.list.filter(x => x.state === 'done').length;
    const moreAfter = s.list.slice(s.idx + 1).some(isOpen);
    page.innerHTML = `
      <section class="session">
        <div class="sess-top">
          <button class="btn sm ghost" type="button" id="ssBack">← ${pieces ? 'Library' : 'Home'}</button>
          <span class="small">${pieces ? `Piece session · ${s.minutes} min` : 'Today'} · ${done} of ${s.list.length} done</span>
        </div>
        <div class="sess-strip" id="ssStrip">${s.list.map((x, i) => stepChip(x, i, s.idx)).join('')}</div>
      </section>
      ${connectNotice()}
      <div id="plHost" style="position:relative"></div>
      <div class="sess-foot">
        <button class="btn sm" type="button" id="ssNext">${moreAfter ? 'Next →' : 'Finish'}</button>
      </div>`;
    bindConnect();
    e.base = Activity.recent;
    e.goal = e.goal || false;
    player = Player.mount($('#plHost', page), {
      id: e.id,
      role: e.role === 'check' || e.role === 'review' ? e.role : 'focus',
      onEvent: ev => onPlayerEvent(s, e, ev),
    });
    tick = setInterval(
      Log.guard('session tick', () => {
        if (!e.goal && e.role !== 'check' && e.role !== 'review') checkTime(s, e);
      }),
      15000,
    );
    $('#ssBack', page).onclick = () => go(pieces ? 'library' : 'home');
    // on to the next step: this one counts as done once you played it, otherwise as skipped
    $('#ssNext', page).onclick = () => {
      Log.ev(e.reps ? 'entry next' : 'entry skipped', { id: e.id, goal: e.goal });
      e.state = e.reps ? 'done' : 'skipped';
      advance(s);
    };
    // the strip is also the way to any other step of the session
    $$('[data-step]', page).forEach(b => {
      b.onclick = () => {
        jumpTo(s, +b.dataset.step);
        drawSession();
      };
    });
  }

  // the end of a session: today's is summed up on Home, a piece session in the Library
  function finished(s) {
    if (pieces) {
      const mins = Math.round((Store.s.days[todayKey()] || {}).min || 0);
      if (s) toast(`Piece session done${mins ? ` · ${mins} min played today` : ''}.`);
      return go('library');
    }
    return go('home');
  }

  function onPlayerEvent(s, e, ev) {
    if (ev.type === 'rep') {
      if (ev.r.valid) {
        e.reps = (e.reps || 0) + 1;
        if (ev.r.clean) e.ok = (e.ok || 0) + 1;
      }
      e.ms = Activity.recent - (e.base || 0);
      Store.save();
      if (e.goal) return; // already reached; you chose to keep going
      const out = ev.out || {};
      if (e.role === 'check' || e.role === 'review') {
        if (!ev.r.valid) return;
        if (out.change === 'pass' || out.change === 'done')
          return goal(s, e, out.change === 'done' ? 'Integrated.' : 'Cold check passed.');
        if (ev.r.mode === 'quiz') {
          // a theory cold check is the first few answers of the day: wait for its verdict, then a few warm
          if ((planFor(e.id) || {}).cold) return;
          if (out.change === 'fail' || e.warmFrom == null) e.warmFrom = e.reps;
          if (e.reps - e.warmFrom >= 3)
            return goal(s, e, 'Practiced warm. The cold check comes back next time.');
          return;
        }
        if (out.change === 'fail' && e.reps === 1) return; // practice it warm for a moment
        if (e.reps >= 3 || (e.reps >= 2 && ev.r.clean))
          return goal(s, e, 'Practiced warm. The cold check comes back next time.');
      } else {
        if (out.reached) {
          const why = { done: 'Integrated.', pass: 'Cold check passed. Another day to go.' }[out.change];
          return goal(s, e, why || 'Goal reached. Cold checks start next session.');
        }
        checkTime(s, e);
      }
    } else if (ev.type === 'goal' && !e.goal) goal(s, e, 'Enough improvising for today.');
    else if (ev.type === 'improv' && ev.res === 'done' && !e.goal) goal(s, e, 'Integrated.');
  }

  function checkTime(s, e) {
    const d = itemDef(e.id);
    if (!d) return;
    e.ms = Activity.recent - (e.base || 0);
    const box = entryMinutes(e);
    if (e.ms >= box * 60000 && !e.goal)
      goal(
        s,
        e,
        `${box} minutes of focused work: a good place to stop. Spacing it over days is what makes it stick.`,
      );
  }

  // the item is done for today: say so, then move on by itself unless you keep going
  function goal(s, e, why) {
    e.goal = true;
    Store.save();
    if (player) player.hold(true);
    const next = s.list.slice(s.idx + 1).find(isOpen);
    const nd = next && itemDef(next.id);
    Log.ev('entry goal', { id: e.id, why, next: next && next.id });
    const host = $('#plHost', page);
    if (!host) return;
    const card = document.createElement('div');
    card.className = 'goalcard';
    card.innerHTML = `
      <span class="eyebrow">Done for today</span>
      <div class="h2">${esc(why)}</div>
      ${
        nd
          ? `<p class="small">Next: <b>${esc(shortTitle(nd))}</b></p>
             <div class="goalbar"><i id="gcBar"></i></div>`
          : '<p class="small">That was the last one today.</p>'
      }
      <div class="row">
        <button class="btn" type="button" id="gcStay">Keep going</button>
        <button class="btn cover" type="button" id="gcNext">${nd ? 'Next now' : 'Finish'}</button>
      </div>`;
    host.appendChild(card);
    const bar = $('#gcBar', card);
    if (bar)
      requestAnimationFrame(() => {
        bar.style.transitionDuration = GOAL_WAIT_MS + 'ms';
        bar.style.width = '100%';
      });
    const moveOn = () => {
      clearTimeout(goalTimer);
      e.state = 'done';
      advance(s);
    };
    if (nd) goalTimer = setTimeout(moveOn, GOAL_WAIT_MS);
    $('#gcNext', card).onclick = moveOn;
    $('#gcStay', card).onclick = () => {
      clearTimeout(goalTimer);
      card.remove();
      Log.ev('entry keep going', { id: e.id });
      if (player) {
        player.hold(false);
        player.destroy();
      }
      player = Player.mount(host, { id: e.id, role: 'focus', onEvent: ev => onPlayerEvent(s, e, ev) });
    };
  }

  function advance(s) {
    clearTimeout(goalTimer);
    const nextIdx = s.list.findIndex((x, i) => i > s.idx && isOpen(x));
    s.idx = nextIdx >= 0 ? nextIdx : s.list.length;
    Store.save();
    drawSession();
  }

  /* ---------- practicing one item outside the session ---------- */
  function drawExtra(id) {
    cleanup();
    if (!itemDef(id)) {
      page.innerHTML = '<div class="card"><p>That item is not available.</p></div>';
      return;
    }
    page.innerHTML = `
      <div class="sess-top">
        <button class="btn sm ghost" type="button" id="exBack">← ${from === 'library' ? 'Library' : 'Home'}</button>
        <span class="small">Extra practice</span>
      </div>
      ${connectNotice()}
      <div id="plHost" style="position:relative"></div>`;
    bindConnect();
    $('#exBack', page).onclick = () => go(from);
    player = Player.mount($('#plHost', page), { id, role: 'focus' });
  }
};

// one step of the session strip at the top
function stepChip(x, i, current) {
  const d = itemDef(x.id);
  const label = d ? (ROLE_PREFIX[x.role] || '') + shortTitle(d) : x.id;
  const cls = i === current && x.state !== 'done' ? 'now' : x.state;
  const now = i === current && x.state !== 'done';
  return `<button type="button" class="sess-step ${cls}" data-step="${i}" title="${esc(label)}"
    ${now ? 'aria-current="step" disabled' : ''}><i>${x.state === 'done' ? '✓' : i + 1}</i><span>${esc(label)}</span></button>`;
}

// a line about the piano connection, with a Connect button when it is needed
export function connectNotice(always) {
  if (Input.live && Input.mode === 'midi')
    return always
      ? `<div class="notice info row between">
           <span>Piano connected: ${esc(Input.midiNames[0] || 'MIDI')}.</span>
         </div>`
      : '';
  if (IN_CLAUDE)
    return `<div class="notice info"><span>MIDI is blocked inside the Claude app. To play with your piano,
      open the hosted copy of DaCapo in Chrome. Here you can try everything with the on-screen keys
      (practice only, not counted).</span></div>`;
  if (Input.mode === 'mic' && Input.live)
    return always
      ? '<div class="notice info">Listening through the microphone: single notes only.</div>'
      : '';
  const text =
    Input.mode === 'midi'
      ? 'Your piano is not connected. Plug it in by USB (the square port), then tap Connect.'
      : 'Connect your piano so DaCapo can hear you and count your progress.';
  return `<div class="notice info row between">
    <span>${text}</span>
    <button class="btn sm" type="button" data-connect>Connect</button>
  </div>`;
}

export function bindConnect() {
  $$('[data-connect]').forEach(b => {
    b.onclick = async () => {
      AudioEngine.ensure();
      await Input.setMode('midi');
      if (!Input.live) settingsSheet();
      else go(UI.view, UI.params);
    };
  });
}
