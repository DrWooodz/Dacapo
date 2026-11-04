/* Home: where the day starts. Three things, each in one place:
     Today          this week's focus and today's session, step by step; start it, or start at any step
     Where you are  each skill's level and what comes next in it; tap one to see all of it
     Your week      minutes and days played; tap for the full history
   Practicing happens on the Practice screen, which Home opens. */
import { $$, esc, todayKey } from '../core/util.js';
import { Store } from '../core/store.js';
import { go } from '../core/ui.js';
import { addDays, criterion, itemState } from '../learn/curriculum.js';
import { currentSession, entryMinutes, isOpen, jumpTo, rebuildSession } from '../learn/sessions.js';
import {
  chooseFocus,
  currentFocus,
  MAX_LEVEL,
  skillDetail,
  skillLevel,
  SKILLS,
  skillTrend,
} from '../learn/skills.js';
import { AREA_BY, itemDef, workingPieces } from '../learn/areas.js';
import { areaOn, skillStatus } from '../learn/status.js';
import { drawWelcome } from './welcome.js';
import { bindConnect, connectNotice } from './practice.js';
import { shortTitle } from './drillinfo.js';
import { focusSheet, milestoneRow, progressSheet, skillSheet } from './skills.js';
import { settingsSheet } from './settings.js';

const ROLE = { check: 'Cold check', review: 'Review', warm: 'Upkeep', daily: 'Daily', focus: 'Focus' };

export const homeView = page => {
  if (!Store.s.profile.onboarded) return drawWelcome(page);
  const s = currentSession();
  page.innerHTML = `
    <div class="homehead">
      <span class="eyebrow">${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</span>
      <h1 class="h1">${greeting()}</h1>
    </div>
    ${connectNotice()}
    <div class="homegrid">
      <div class="stack" style="gap:16px">${todayCard(s)}${weekCard()}</div>
      ${standingCard()}
    </div>`;
  bindConnect();
  bind(page, s);
};

function greeting() {
  const h = new Date().getHours();
  return h < 4 || h >= 18
    ? 'Good <em>evening</em>.'
    : h < 12
      ? 'Good <em>morning</em>.'
      : 'Good <em>afternoon</em>.';
}

/* ---------- today ---------- */
function focusLine() {
  const f = currentFocus();
  if (!f) return '';
  const area = AREA_BY[f.area];
  if (f.confirmed)
    return `<button type="button" class="focusline" data-act="focus">
      <span class="small">Focus this week</span><b>${esc(area.n)}</b><span class="small link">Change</span>
    </button>`;
  // a new week: the suggestion waits for a yes (practice goes ahead either way)
  return `<div class="focusline suggest">
    <div class="grow"><span class="small">Suggested focus this week</span><b>${esc(area.n)}</b>
      <div class="small">${esc(f.reason || area.d)}</div></div>
    <div class="row">
      <button class="btn sm cover" type="button" data-act="keep">Keep</button>
      <button class="btn sm ghost" type="button" data-act="focus">Change</button>
    </div>
  </div>`;
}

function todayCard(s) {
  if (!s.list.length)
    return `<section class="card today">
      ${focusLine()}
      <h2 class="h2">Nothing to practice today</h2>
      <p class="small">Every area is switched off, or everything is waiting for its next cold check.
        Choose a piece in the Library, or switch an area back on.</p>
      <button class="btn" type="button" data-act="areas">Areas</button>
    </section>`;
  const open = s.list.filter(isOpen);
  const done = s.list.filter(e => e.state === 'done').length;
  const started = s.list.some(e => e.reps || e.state !== 'todo');
  const left = open.reduce((t, e) => t + entryMinutes(e), 0);
  const row = (e, i) => {
    const d = itemDef(e.id);
    if (!d) return '';
    const state = e.state === 'done' ? 'done' : e.state === 'skipped' ? 'skipped' : '';
    // any step can be started from here, a done one too (to go again)
    return `<button type="button" class="todayrow ${state}" data-start="${i}">
      <i class="num">${e.state === 'done' ? '✓' : i + 1}</i>
      <span class="grow"><b>${esc(shortTitle(d))}</b>
        <span class="small">${ROLE[e.role] || 'Focus'}${state === 'skipped' ? ' · skipped' : ''}${
          itemState(e.id) ? ' · ' + esc(criterion(e.id)) : ''
        }</span></span>
      <span class="small">${entryMinutes(e)} min</span>
    </button>`;
  };
  const day = Store.s.days[todayKey()] || {};
  const mins = Math.round(day.min || 0);
  const head = open.length
    ? `<div class="row between"><h2 class="h2">Today</h2>
         <span class="small">${done ? `${done} of ${s.list.length} done · ` : ''}about ${left} min${started ? ' left' : ''}</span></div>`
    : `<div class="row between"><h2 class="h2">Today: <em>done</em>.</h2>
         <span class="small">${mins} min · ${day.clean || 0} clean reps</span></div>`;
  const miles = Store.s.hist.filter(h => h.d === todayKey());
  return `<section class="card today">
    ${focusLine()}
    ${head}
    <div class="todaylist">${s.list.map(row).join('')}</div>
    ${
      open.length
        ? `<button class="btn cover big" type="button" data-act="start">${started ? 'Continue' : 'Start'}</button>`
        : `${miles.length ? `<div class="stack" style="gap:0">${miles.map(h => milestoneRow(h)).join('')}</div>` : ''}
           <p class="small">Tomorrow starts with cold checks of what you reached today. For more now, tap a
             step to go again, or a skill below.</p>`
    }
  </section>`;
}

/* ---------- where you are ---------- */
function nextOf(skill) {
  if (skill === 'pieces') {
    const w = workingPieces();
    if (!w.length) return 'No piece yet: choose one in the Library';
    const p = w.map(x => ({ x, st: skillStatus('p:' + x.pid) })).find(o => o.st.focus || o.st.checks.length);
    return `${w.length} piece${w.length > 1 ? 's' : ''}${p ? ` · next: ${shortTitle(itemDef(p.st.focus || p.st.checks[0]))}` : ''}`;
  }
  if (skill === 'steadiness') {
    const d = skillDetail('steadiness');
    return d ? d[0].toUpperCase() + d.slice(1) : 'Measured from your runs with the metronome';
  }
  const st = skillStatus(skill);
  if (st.locked) return 'Opens when both staffs read fluently';
  const id = st.focus || st.checks[0];
  const detail = skillDetail(skill);
  return (id ? `Next: ${shortTitle(itemDef(id))}` : 'All integrated') + (detail ? ` · ${detail}` : '');
}

function standingCard() {
  const P = Store.s.profile;
  const row = sk => {
    if (sk.area && !areaOn(sk.area)) return '';
    const level = skillLevel(sk.id);
    const trend = level == null ? null : skillTrend(sk.id);
    const value = level == null ? '–' : `${level.toFixed(1)}`;
    const pct = level == null ? 0 : (level / MAX_LEVEL) * 100;
    const tap = sk.id !== 'steadiness';
    return `<${tap ? `button type="button" data-skill="${sk.id}"` : 'div'} class="standrow">
      <b>${esc(sk.n)}</b>
      <span class="skill-track" aria-hidden="true"><i class="tick" style="left:33.3%"></i><i class="tick" style="left:66.6%"></i>
        <span class="skill-bar" style="width:${pct.toFixed(1)}%"></span></span>
      <span class="standval">${
        trend ? `<span class="trend ${trend > 0 ? 'up' : 'down'}">${trend > 0 ? '▲' : '▼'}</span>` : ''
      }<b class="mono">${value}</b></span>
      <span class="small">${esc(nextOf(sk.id))}</span>
    </${tap ? 'button' : 'div'}>`;
  };
  const offer =
    !P.assessed && !P.assessDismissed
      ? `<div class="offer row between">
           <span class="small grow">Not sure where you stand? An 8-minute check sets every level.</span>
           <button class="btn sm cover" type="button" data-act="assess">Start the check</button>
           <button class="btn sm ghost" type="button" data-act="later">Not now</button>
         </div>`
      : '';
  return `<section class="card">
    <div class="row between"><h2 class="h2">Where you are</h2>
      <span class="small">0–${MAX_LEVEL}: Foundations, Developing, Fluent</span></div>
    ${offer}
    <div class="standing">${SKILLS.map(row).join('')}</div>
    ${offer ? '' : '<button class="linkbtn small" type="button" data-act="assess">Measure again with the placement check</button>'}
  </section>`;
}

/* ---------- your week ---------- */
function weekCard() {
  const t = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
  const mins = days.map(d => (Store.s.days[d] || {}).min || 0);
  const max = Math.max(10, ...mins);
  const total = Math.round(mins.reduce((a, b) => a + b, 0));
  const played = mins.filter(m => m >= 1).length;
  const bar = (d, i) =>
    `<i class="${mins[i] < 1 ? 'zero' : ''}${d === t ? ' today' : ''}" style="height:${Math.max(3, (mins[i] / max) * 28)}px"
      title="${d}: ${Math.round(mins[i])} min"></i>`;
  return `<button type="button" class="card weekcard" data-act="progress">
    <span class="grow"><b class="h2">Your week</b>
      <span class="small">${total} min · ${played} of 7 days · history and milestones</span></span>
    <span class="minibars" aria-hidden="true">${days.map(bar).join('')}</span>
  </button>`;
}

function bind(page, s) {
  const act = {
    start: () => go('practice'),
    keep: () => {
      chooseFocus(currentFocus().area);
      go('home');
    },
    focus: () =>
      focusSheet(() => {
        rebuildSession();
        go('home');
      }),
    areas: settingsSheet,
    assess: () => go('assess'),
    later: () => {
      Store.s.profile.assessDismissed = todayKey();
      Store.save();
      go('home');
    },
    progress: progressSheet,
  };
  $$('[data-act]', page).forEach(b => (b.onclick = () => act[b.dataset.act]()));
  $$('[data-start]', page).forEach(b => {
    b.onclick = () => {
      const i = +b.dataset.start;
      jumpTo(s, i);
      go('practice');
    };
  });
  $$('[data-skill]', page).forEach(b => {
    b.onclick = () => (b.dataset.skill === 'pieces' ? go('library') : skillSheet(b.dataset.skill));
  });
}
