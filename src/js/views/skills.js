/* Skills: where you stand in each area, this week's focus, and your practice over time. */
import { Log } from '../core/log.js';
import { $, esc, toast, todayKey } from '../core/util.js';
import { Store } from '../core/store.js';
import { closeBtn, closeSheet, go, openSheet } from '../core/ui.js';
import { Library } from '../music/library.js';
import { addDays, criterion, itemState, STAGE_TXT } from '../learn/curriculum.js';
import {
  chooseFocus,
  currentFocus,
  MAX_LEVEL,
  rankAreas,
  skillDetail,
  skillLevel,
  SKILLS,
  skillTrend,
  tierName,
} from '../learn/skills.js';
import {
  AREA_BY,
  AREAS,
  itemDef,
  pieceOrder,
  skillTiers,
  TIER_NAMES,
  workingPieces,
} from '../learn/areas.js';
import { areaOn, skillStatus } from '../learn/status.js';
import { howSheet, shortTitle } from './drillinfo.js';
import { bodySheet } from './guides.js';

export const skillsView = page => {
  const days = Store.s.days;
  const t = todayKey();
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13));
  const mins = last14.map(d => (days[d] && days[d].min) || 0);
  const max = Math.max(10, ...mins);
  const weekMin = Math.round(mins.slice(-7).reduce((a, b) => a + b, 0));
  const activeDays = mins.slice(-7).filter(m => m >= 1).length;
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const d = addDays(t, -i);
    if (days[d] && days[d].min >= 1) streak++;
    else if (i > 0) break;
  }
  const dayBar = (d, i) => {
    const cls = [mins[i] < 1 ? 'zero' : '', d === t ? 'today' : ''].join(' ');
    const height = Math.max(2, (mins[i] / max) * 70);
    const weekday = 'SMTWTFS'[new Date(d + 'T12:00').getDay()];
    return `<div class="c" title="${d}: ${Math.round(mins[i])} min">
      <div class="bar ${cls}" style="height:${height}px"></div><span>${weekday}</span></div>`;
  };
  const f = currentFocus();
  page.innerHTML = `
    <div class="stack">
      <span class="eyebrow">Skills</span>
      <h1 class="h1">Slow is <em>smooth</em>.</h1>
    </div>
    ${
      f
        ? `<div class="card focuscard">
            <div class="row between">
              <div class="grow">
                <span class="eyebrow">This week's focus</span>
                <div class="h3">${esc(AREA_BY[f.area].n)}</div>
                <div class="small">${esc(f.reason || AREA_BY[f.area].d)} Until ${esc(niceDate(f.until))}.</div>
              </div>
              <button class="btn sm" type="button" id="pgFocus">Change</button>
            </div>
          </div>`
        : ''
    }
    <div class="card">
      <div class="cardhead">
        <h2 class="h2">Your skills</h2>
        <span class="small">Level 0–${MAX_LEVEL} · tap one for details</span>
      </div>
      <div class="skills" role="list">${SKILLS.map(skillRow).join('')}</div>
      <p class="small">Each level is a tier: 1 Foundations, 2 Developing, 3 Fluent. Levels come from what
        you play, not from time spent.</p>
    </div>
    <div class="card">
      <div class="stats">
        <div class="stat"><b>${weekMin}</b><span>minutes in 7 days</span></div>
        <div class="stat"><b>${activeDays}/7</b><span>days played</span></div>
        <div class="stat"><b>${streak}</b><span>day streak</span></div>
      </div>
      <div class="week" aria-label="Minutes played, last 14 days">${last14.map(dayBar).join('')}</div>
      <p class="small">Minutes count only while you play on your piano. Short daily sessions beat long
        occasional ones: memory for movement consolidates during sleep.</p>
    </div>
    <div class="card" id="pgMiles">${milestones()}</div>
    <div class="row">
      <button class="btn" type="button" id="pgHow">How DaCapo decides what you practice</button>
      <button class="btn ghost" type="button" id="pgBody">Body and hands</button>
      <button class="btn ghost" type="button" id="pgCheck">Placement check</button>
      <button class="btn ghost" type="button" id="pgLog">Practice log</button>
    </div>`;
  page.querySelectorAll('[data-skill]').forEach(b => {
    b.onclick = () => skillSheet(b.dataset.skill);
  });
  const fb = $('#pgFocus', page);
  if (fb) fb.onclick = () => focusSheet(() => go('skills'));
  $('#pgHow', page).onclick = howSheet;
  $('#pgBody', page).onclick = bodySheet;
  $('#pgCheck', page).onclick = () => go('assess');
  $('#pgLog', page).onclick = logSheet;
};

const niceDate = d =>
  new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

// one bar of the skills graph: the level on a 0-3 scale, with faint lines at each tier
function skillRow(sk) {
  const off = sk.area && !areaOn(sk.area);
  const level = off ? null : skillLevel(sk.id);
  const trend = level == null ? null : skillTrend(sk.id);
  const pct = level == null ? 0 : (level / MAX_LEVEL) * 100;
  const value = off ? 'Off' : level == null ? 'Not measured yet' : `${level.toFixed(1)} · ${tierName(level)}`;
  const trendTxt = trend
    ? `<span class="trend ${trend > 0 ? 'up' : 'down'}">${trend > 0 ? '▲' : '▼'} ${Math.abs(trend)}</span>`
    : '';
  const detail = off ? '' : skillDetail(sk.id);
  const clickable = sk.id !== 'steadiness';
  return `<${clickable ? 'button type="button"' : 'div'} class="skillrow${off ? ' off' : ''}" role="listitem"
      ${clickable ? `data-skill="${sk.id}"` : ''} title="${esc(sk.n)}: ${esc(value)}">
    <div class="skill-head"><b>${esc(sk.n)}</b><span class="small">${esc(value)} ${trendTxt}</span></div>
    <div class="skill-track" aria-hidden="true">
      <i class="tick" style="left:${100 / MAX_LEVEL}%"></i><i class="tick" style="left:${200 / MAX_LEVEL}%"></i>
      <span class="skill-bar" style="width:${pct.toFixed(1)}%"></span>
    </div>
    ${detail ? `<div class="small">${esc(detail)}</div>` : ''}
  </${clickable ? 'button' : 'div'}>`;
}

function milestones() {
  const name = h => {
    if (h.e === 'done') return 'integrated';
    if (h.e === 'review') return h.v === 'ok' ? 'review passed' : 'review: rebuilding';
    return (
      { tempo: 'notes learned', pace: 'notes learned', check: 'goal reached' }[h.v] || 'back to building'
    );
  };
  const row = h => {
    const d = itemDef(h.id);
    if (!d) return '';
    const dot = h.e === 'done' ? 'done' : h.v === 'check' ? 'check' : 'tempo';
    return `<div class="listrow">
      <span class="dot3 ${dot}"></span>
      <div class="grow">
        <div class="ttl">${esc(shortTitle(d))}</div>
        <div class="small">${esc(name(h))} · ${esc(h.d)}</div>
      </div>
    </div>`;
  };
  const recent = Store.s.hist.slice(-12).reverse();
  return (
    '<div class="cardhead"><h2 class="h2">Milestones</h2></div>' +
    (recent.length
      ? `<div class="stack" style="gap:0">${recent.map(row).join('')}</div>`
      : '<p class="small">Milestones appear here: notes learned, goals reached, integrated.</p>')
  );
}

function itemRow(id, now) {
  const d = itemDef(id);
  if (!d) return '';
  const it = itemState(id);
  return `<div class="listrow">
    <span class="dot3 ${it ? it.stage : ''}"></span>
    <div class="grow">
      <div class="ttl">${esc(shortTitle(d))}${now ? ' <span class="tag rh">now</span>' : ''}</div>
      <div class="small">${esc(it ? STAGE_TXT[it.stage] + ' · ' + criterion(id) : d.sub || 'Not started')}</div>
    </div>
    <button class="btn sm ghost" type="button" data-p="${esc(id)}">Practice</button>
  </div>`;
}

// the units of a skill, tier by tier (or the sections of each piece you work on)
function skillSheet(skill) {
  const sk = SKILLS.find(s => s.id === skill);
  let body;
  if (skill === 'pieces') {
    const pieces = workingPieces();
    body = pieces.length
      ? pieces
          .map(w => {
            const st = skillStatus('p:' + w.pid);
            const now = id => id === st.focus || st.checks.includes(id);
            return `<h3 class="h3">${esc(Library.get(w.pid).t)}</h3>
              <div class="stack" style="gap:0">${pieceOrder(w.pid)
                .map(id => itemRow(id, now(id)))
                .join('')}</div>`;
          })
          .join('')
      : '<p class="small">No pieces yet. Choose one in the Library.</p>';
  } else {
    const st = skillStatus(skill);
    const now = id => id === st.focus || st.checks.includes(id);
    body =
      (st.locked
        ? '<p class="notice">Sight-reading opens once you read the treble and bass staff up to an octave fluently.</p>'
        : '') +
      skillTiers(skill)
        .map(
          (tier, i) => `<h3 class="h3">Tier ${i + 1} · ${TIER_NAMES[i + 1]}</h3>
            <div class="stack" style="gap:0">${tier.map(id => itemRow(id, now(id))).join('')}</div>`,
        )
        .join('');
  }
  const area = AREA_BY[sk.area];
  openSheet(
    `<div class="sheethead"><h2 class="h2">${esc(sk.n)}</h2>${closeBtn}</div>
     <p class="small">${esc(area ? area.d : '')} The session works on the first unfinished item and moves
       on only when it is integrated; you can practice anything here as extra practice.</p>
     ${body}`,
    sheet => {
      sheet.querySelectorAll('[data-p]').forEach(b => {
        b.onclick = () => {
          closeSheet();
          go('practice', { item: b.dataset.p });
        };
      });
    },
    { label: sk.n },
  );
}

// choose this week's focus: the suggestion first, with its reason
export function focusSheet(onChange) {
  const f = currentFocus();
  const ranked = rankAreas();
  // the suggestion waiting for your answer stays the suggestion
  const suggested = f && !f.confirmed ? f.area : ranked[0] && ranked[0].area;
  ranked.sort((a, b) => (b.area === suggested) - (a.area === suggested));
  const row =
    r => `<button type="button" class="pickrow" data-area="${r.area}" aria-pressed="${f && f.area === r.area}">
      <b>${esc(AREA_BY[r.area].n)}${r.area === suggested ? ' <span class="tag rh">suggested</span>' : ''}</b>
      <span class="small">${esc(r.area === (f && f.area) && f.reason ? f.reason : r.reason)}</span>
    </button>`;
  const off = AREAS.filter(a => !areaOn(a.id));
  openSheet(
    `<div class="sheethead"><h2 class="h2">This week's focus</h2>${closeBtn}</div>
     <p class="small">Most of each session goes to the focus for a week; the other areas get a few minutes of
       upkeep so nothing fades. Your choices teach the suggestions what matters to you.</p>
     <div class="stack" style="gap:8px">${ranked.map(row).join('')}</div>
     ${off.length ? `<p class="small">Switched off in Settings: ${off.map(a => esc(a.n)).join(', ')}.</p>` : ''}`,
    sheet => {
      sheet.querySelectorAll('[data-area]').forEach(b => {
        b.onclick = () => {
          chooseFocus(b.dataset.area);
          closeSheet();
          toast(`This week: ${AREA_BY[b.dataset.area].n}`);
          if (onChange) onChange();
        };
      });
    },
    { label: "This week's focus" },
  );
}

// the days you played; a wrong day (someone else played) can be removed, with undo
function logSheet() {
  const days = Object.entries(Store.s.days)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 60);
  const dateName = d =>
    new Date(d + 'T12:00').toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  const row = ([d, v]) => `<div class="listrow">
    <div class="grow">
      <div class="ttl">${dateName(d)}</div>
      <div class="small">${Math.round(v.min || 0)} min · ${v.reps || 0} reps</div>
    </div>
    <button class="btn sm ghost" type="button" data-del="${d}">Remove</button>
  </div>`;
  openSheet(
    `<div class="sheethead"><h2 class="h2">Practice log</h2>${closeBtn}</div>
     <p class="small">Minutes are counted from your playing. If a day is wrong (someone else played,
       or you were testing), remove it.</p>
     <div class="stack" style="gap:0" id="lgList">${
       days.length ? days.map(row).join('') : '<p class="small">Nothing yet.</p>'
     }</div>`,
    sheet => {
      sheet.querySelectorAll('[data-del]').forEach(b => {
        b.onclick = () => {
          const d = b.dataset.del;
          const old = Store.s.days[d];
          delete Store.s.days[d];
          Store.save();
          Log.ev('day removed', { d });
          logSheet();
          toast('Day removed', 6000, {
            label: 'Undo',
            run: () => {
              Store.s.days[d] = old;
              Store.save();
              logSheet();
            },
          });
        };
      });
    },
    { label: 'Practice log' },
  );
}
