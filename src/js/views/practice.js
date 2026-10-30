/* Practice: open the app and today's session is already waiting. */
import { IN_CLAUDE } from '../env.js';
import { Log } from '../core/log.js';
import { $, $$, esc, todayKey } from '../core/util.js';
import { Activity, Store } from '../core/store.js';
import { AudioEngine } from '../core/audio.js';
import { Input } from '../core/input.js';
import { closeBtn, closeSheet, go, onUnmount, openSheet, UI } from '../core/ui.js';
import { COMPOSERS, LEVEL_NAMES, Library } from '../music/library.js';
import { criterion, itemState, planFor } from '../learn/curriculum.js';
import { Player } from '../learn/player.js';
import { currentSession, rebuildSession, workOnPiece } from '../learn/sessions.js';
import { chooseFocus, currentFocus } from '../learn/skills.js';
import { AREA_BY, AREAS, itemDef, workingPieces } from '../learn/areas.js';
import { focusSheet } from './skills.js';
import { shortTitle } from './drillinfo.js';
import { settingsSheet } from './settings.js';

// active minutes per item per session, by kind of drill; upkeep and daily pieces get less
const TIMEBOX = {
  scale: 7,
  arp: 7,
  read: 6,
  rhythm: 4,
  section: 10,
  full: 14,
  pattern: 6,
  improv: 4,
  theory: 6,
};
const ROLE_BOX = { warm: 4, daily: 6 };
// how long the goal card waits before moving on by itself
const GOAL_WAIT_MS = 6000;

const isOpen = entry => entry.state !== 'done' && entry.state !== 'skipped';
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
  if (!Store.s.profile.onboarded) return drawWelcome();
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
    if (!s) return go('practice');
    const open = s.list.findIndex((e, i) => i >= s.idx && isOpen(e));
    if (open < 0 && s.list.length) return drawSummary(s);
    if (!s.list.length) return drawEmpty();
    s.idx = open;
    const e = s.list[s.idx];
    if (e.state === 'todo') {
      e.state = 'active';
      Store.save();
    }
    const mins = Math.round((Store.s.days[todayKey()] || {}).min || 0);
    const done = s.list.filter(x => x.state === 'done').length;
    const moreAfter = s.list.slice(s.idx + 1).some(isOpen);
    page.innerHTML = `
      ${pieces ? '' : focusBar() + placementOffer()}
      <section class="session">
        <div class="sess-top">
          <div class="grow">
            <b>${pieces ? `Piece session · ${s.minutes} min` : 'Today'}</b>
            <span class="small">· ${done} of ${s.list.length} done${mins ? ` · ${mins} min played` : ''}</span>
          </div>
          <button class="btn sm ghost" type="button" id="ssList">All</button>
        </div>
        <div class="sess-strip" id="ssStrip">${s.list.map((x, i) => stepChip(x, i, s.idx)).join('')}</div>
      </section>
      ${connectNotice()}
      <div id="plHost" style="position:relative"></div>
      <div class="sess-foot">
        <button class="btn sm ghost" type="button" id="ssSkip">Skip this</button>
        <button class="btn sm" type="button" id="ssNext">${moreAfter ? 'Next →' : 'Finish'}</button>
      </div>`;
    bindConnect();
    bindFocusBar();
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
    $('#ssSkip', page).onclick = () => {
      Log.ev('entry skipped', { id: e.id });
      e.state = 'skipped';
      advance(s);
    };
    $('#ssNext', page).onclick = () => {
      Log.ev('entry next', { id: e.id, goal: e.goal });
      e.state = e.reps ? 'done' : 'skipped';
      advance(s);
    };
    $('#ssList', page).onclick = () =>
      sessionSheet(s, i => {
        s.list[s.idx].state = s.list[s.idx].reps ? 'done' : 'todo';
        s.idx = i;
        s.list[i].state = 'active';
        Store.save();
        drawSession();
      });
  }

  // this week's focus: shown at the top; a new suggestion waits for a tap (but never blocks practice)
  function focusBar() {
    const f = currentFocus();
    if (!f) return '';
    const area = AREA_BY[f.area];
    if (f.confirmed)
      return `<div class="focusbar compact">
        <span class="small">This week's focus: <b>${esc(area.n)}</b></span>
        <button class="linkbtn" type="button" data-focus="change">Change</button>
      </div>`;
    return `<div class="focusbar card">
      <span class="eyebrow">This week's focus</span>
      <div class="row between">
        <div class="grow"><b class="h3">${esc(area.n)}</b><div class="small">${esc(f.reason || area.d)}</div></div>
      </div>
      <div class="row">
        <button class="btn sm cover" type="button" data-focus="keep">Sounds good</button>
        <button class="btn sm ghost" type="button" data-focus="change">Choose another</button>
      </div>
    </div>`;
  }
  function bindFocusBar() {
    $$('[data-focus]', page).forEach(b => {
      b.onclick = () => {
        if (b.dataset.focus === 'keep') {
          chooseFocus(currentFocus().area);
          return drawSession();
        }
        focusSheet(() => {
          rebuildSession();
          drawSession();
        });
      };
    });
    $$('[data-assess]', page).forEach(b => {
      b.onclick = () => {
        if (b.dataset.assess === 'go') return go('assess');
        Store.s.profile.assessDismissed = todayKey();
        Store.save();
        drawSession();
      };
    });
  }
  function placementOffer() {
    const P = Store.s.profile;
    if (P.assessed || P.assessDismissed) return '';
    return `<div class="card offer">
      <b>Find your starting points</b>
      <p class="small">An 8-minute check: a few notes to read in each clef, a scale, some chords and a steady
        pulse. It sets your skill levels so practice starts at the right place.</p>
      <div class="row">
        <button class="btn sm cover" type="button" data-assess="go">Start the check</button>
        <button class="btn sm ghost" type="button" data-assess="later">Not now</button>
      </div>
    </div>`;
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
    const box = e.box || ROLE_BOX[e.role] || TIMEBOX[d.kind] || 8;
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

  /* ---------- after the last item ---------- */
  function drawSummary(s) {
    const t = todayKey();
    const day = Store.s.days[t] || {};
    const mins = Math.round(day.min || 0);
    const milestones = Store.s.hist
      .filter(h => h.d === t)
      .map(milestoneRow)
      .join('');
    const more = s.list
      .filter(x => x.role !== 'check' && x.role !== 'review' && itemDef(x.id))
      .map(
        x => `
          <div class="listrow">
            <div class="grow">
              <div class="ttl">${esc(shortTitle(itemDef(x.id)))}</div>
              <div class="small">${esc(criterion(x.id))}</div>
            </div>
            <button class="btn sm" type="button" data-more="${esc(x.id)}">Practice</button>
          </div>`,
      )
      .join('');
    const pieceButton =
      !pieces && workingPieces().length
        ? '<button class="btn" type="button" id="smPieces">A piece session</button>'
        : '';
    page.innerHTML = `
      <div class="card summary">
        <span class="eyebrow">${pieces ? 'Piece session' : 'Today'}</span>
        <h1 class="h1">Session <em>done</em>.</h1>
        <div class="stats">
          <div class="stat"><b>${mins}</b><span>minutes played</span></div>
          <div class="stat"><b>${day.reps || 0}</b><span>reps</span></div>
          <div class="stat"><b>${day.clean || 0}</b><span>clean reps</span></div>
        </div>
        ${
          milestones
            ? `<div class="stack" style="gap:0">${milestones}</div>`
            : `<p class="small">No stage changes today; that is how most days look.
                 Progress is in the reps; the milestones follow.</p>`
        }
        <p class="small">Next time starts with cold checks of what you reached today,
          then picks up where you left off.</p>
      </div>
      <div class="card">
        <div class="cardhead"><h2 class="h2">Want more?</h2></div>
        <div class="stack" style="gap:0">${more}</div>
        <div class="row">
          ${pieceButton}
          <button class="btn" type="button" id="smFree">Free play</button>
          <button class="btn" type="button" id="smLib">Library</button>
        </div>
      </div>`;
    page.querySelectorAll('[data-more]').forEach(b => {
      b.onclick = () => go('practice', { item: b.dataset.more });
    });
    $('#smFree', page).onclick = () => go('free');
    $('#smLib', page).onclick = () => go('library');
    const ps = $('#smPieces', page);
    if (ps) ps.onclick = () => go('library', { pieceSession: true });
  }

  function drawEmpty() {
    page.innerHTML = `
      ${focusBar()}
      <div class="card">
        <h2 class="h2">Nothing scheduled</h2>
        <p class="small">All your areas are switched off, or everything is waiting for its next cold
          check.</p>
        <div class="row">
          <button class="btn" type="button" id="emSet">Areas</button>
          <button class="btn" type="button" id="emLib">Choose a piece</button>
        </div>
      </div>`;
    bindFocusBar();
    $('#emSet', page).onclick = settingsSheet;
    $('#emLib', page).onclick = () => go('library');
  }

  /* ---------- practicing one item outside the session ---------- */
  function drawExtra(id) {
    cleanup();
    if (!itemDef(id)) {
      page.innerHTML = '<div class="card"><p>That item is not available.</p></div>';
      return;
    }
    page.innerHTML = `
      <div class="row between">
        <button class="btn sm ghost" type="button" id="exBack">← Today's session</button>
        <span class="small">Extra practice</span>
      </div>
      ${connectNotice()}
      <div id="plHost" style="position:relative"></div>`;
    bindConnect();
    $('#exBack', page).onclick = () => go('practice');
    player = Player.mount($('#plHost', page), { id, role: 'focus' });
  }

  /* ---------- first open ---------- */
  function drawWelcome() {
    const P = Store.s.profile;
    const fav = new Set(P.favorites);
    const matters = new Set(
      Object.entries(P.weights || {})
        .filter(([, w]) => w > 1)
        .map(([a]) => a),
    );
    let pick = null;
    const suggestions = () =>
      Library.all()
        .filter(p => p.c !== 'mine' && (fav.size ? fav.has(p.c) : true) && p.lvl <= 2)
        .slice(0, 8);
    const chip = (attr, key, on, label) =>
      `<button type="button" class="chip" data-${attr}="${key}" aria-pressed="${on}">${esc(label)}</button>`;
    const pieceCard = p => `
      <button type="button" class="pickcard" data-pick="${p.id}" aria-pressed="${pick === p.id}">
        <b>${esc(p.t)}</b>
        <span>${esc(COMPOSERS[p.c].short)}${p.sub ? ' · ' + esc(p.sub) : ''} · ${LEVEL_NAMES[p.lvl]}</span>
      </button>`;
    const paint = () => {
      page.innerHTML = `
        <div class="card welcome">
          <span class="eyebrow">Welcome to DaCapo</span>
          <h1 class="h1">Open it, and <em>play</em>.</h1>
          <ol class="small">
            <li>Each day DaCapo prepares a short session around one focus for the week, with a few minutes
              of upkeep for everything else.</li>
            <li>Each drill carries over from day to day until it is truly learned: right on the first try of
              the day, on two different days.</li>
            <li>It listens over MIDI and moves on by itself. You keep your hands on the keys.</li>
          </ol>
        </div>
        ${connectNotice(true)}
        <div class="card">
          <div class="cardhead">
            <h2 class="h2">What matters most to you?</h2>
            <span class="small">Choose any; it shapes the suggestions</span>
          </div>
          <div class="chips">${AREAS.map(a => chip('matter', a.id, matters.has(a.id), a.n)).join('')}</div>
        </div>
        <div class="card">
          <div class="cardhead"><h2 class="h2">Composers you love</h2></div>
          <div class="chips">${Object.entries(COMPOSERS)
            .filter(([k]) => k !== 'mine')
            .map(([k, c]) => chip('fav', k, fav.has(k), c.short))
            .join('')}</div>
          <span class="small">A piece to work on (optional; the Library has them all):</span>
          <div class="pickgrid">${suggestions().map(pieceCard).join('')}</div>
        </div>
        <button class="btn cover big" type="button" id="wcCheck">Start with an 8-minute check</button>
        <button class="btn big ghost" type="button" id="wcStart">Skip it and start practicing</button>`;
      bindConnect();
      const toggle = (attr, set) =>
        page.querySelectorAll(`[data-${attr}]`).forEach(b => {
          b.onclick = () => {
            const k = b.dataset[attr];
            if (set.has(k)) set.delete(k);
            else set.add(k);
            paint();
          };
        });
      toggle('matter', matters);
      toggle('fav', fav);
      page.querySelectorAll('[data-pick]').forEach(b => {
        b.onclick = () => {
          pick = pick === b.dataset.pick ? null : b.dataset.pick;
          paint();
        };
      });
      const finish = to => {
        P.favorites = [...fav];
        P.weights = Object.fromEntries(AREAS.map(a => [a.id, matters.has(a.id) ? 1.3 : 1]));
        P.onboarded = true;
        if (pick) workOnPiece(pick, { daily: true });
        Store.s.session = null;
        Store.s.focus = null;
        Store.save();
        Log.ev('onboarded', { matters: [...matters], fav: P.favorites, piece: pick });
        go(to);
      };
      $('#wcCheck', page).onclick = () => finish('assess');
      $('#wcStart', page).onclick = () => finish('practice');
    };
    paint();
  }
};

// one step of the session strip at the top
function stepChip(x, i, current) {
  const d = itemDef(x.id);
  const label = d ? (ROLE_PREFIX[x.role] || '') + shortTitle(d) : x.id;
  const cls = i === current && x.state !== 'done' ? 'now' : x.state;
  return `<span class="sess-step ${cls}" title="${esc(label)}">
    <i>${x.state === 'done' ? '✓' : i + 1}</i><span>${esc(label)}</span></span>`;
}

// one line of today's milestones in the summary
const MILESTONE_WORDS = {
  stage: v =>
    ({
      tempo: 'notes learned, building tempo',
      pace: 'notes learned, building speed',
      check: 'goal reached',
    })[v] || 'back to building',
  done: () => 'integrated',
  review: v => (v === 'ok' ? 'review: still solid' : 'review: needs a refresh'),
};
function milestoneRow(h) {
  const d = itemDef(h.id);
  if (!d) return '';
  const dot = h.e === 'done' ? 'done' : h.v === 'check' ? 'check' : 'tempo';
  const words = (MILESTONE_WORDS[h.e] || (() => h.e))(h.v);
  return `
    <div class="mile">
      <span class="dot3 ${dot}"></span>
      <span><b>${esc(shortTitle(d))}</b> <span class="small">${esc(words)}</span></span>
    </div>`;
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

function sessionSheet(s, onPick) {
  const row = (x, i) => {
    const d = itemDef(x.id);
    if (!d) return '';
    const dot = x.state === 'done' ? 'done' : (itemState(x.id) || {}).stage || '';
    const role =
      { check: 'Cold check · ', review: 'Review · ', warm: 'Upkeep · ', daily: 'Daily · ' }[x.role] || '';
    const state = { done: ' · done', skipped: ' · skipped' }[x.state] || '';
    const now = i === s.idx;
    return `
      <div class="listrow">
        <span class="dot3 ${dot}"></span>
        <div class="grow">
          <div class="ttl">${esc(shortTitle(d))}</div>
          <div class="small">${role}${esc(criterion(x.id))}${state}</div>
        </div>
        <button class="btn sm" type="button" data-go="${i}" ${now ? 'disabled' : ''}>${now ? 'Now' : 'Go'}</button>
      </div>`;
  };
  openSheet(
    `<div class="sheethead"><h2 class="h2">${s.kind === 'pieces' ? 'Piece session' : "Today's session"}</h2>${closeBtn}</div>
     <div class="stack" style="gap:0">${s.list.map(row).join('')}</div>
     <p class="small">Cold checks come first on purpose: the first time you play something today
       shows whether it is really learned. Upkeep keeps the other areas from fading.</p>`,
    sheet => {
      sheet.querySelectorAll('[data-go]').forEach(b => {
        b.onclick = () => {
          closeSheet();
          onPick(+b.dataset.go);
        };
      });
    },
    { label: "Today's session" },
  );
}
