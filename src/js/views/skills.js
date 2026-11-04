/* The panels Home opens: a skill and its units, this week's focus, and your practice over time. */
import { Log } from '../core/log.js';
import { esc, toast, todayKey } from '../core/util.js';
import { Store } from '../core/store.js';
import { closeBtn, closeSheet, go, openSheet } from '../core/ui.js';
import { addDays, criterion, itemState, STAGE_TXT } from '../learn/curriculum.js';
import { AREA_BY, AREAS, itemDef, skillTiers, TIER_NAMES } from '../learn/areas.js';
import { chooseFocus, currentFocus, rankAreas, SKILLS } from '../learn/skills.js';
import { areaOn, skillStatus } from '../learn/status.js';
import { shortTitle } from './drillinfo.js';

const niceDate = d =>
  new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const shortDate = d =>
  new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

// one milestone: notes learned, a goal reached, integrated, a review (with its date, when asked)
const MILESTONE = h =>
  h.e === 'done'
    ? 'integrated'
    : h.e === 'review'
      ? h.v === 'ok'
        ? 'review: still solid'
        : 'review: needs a refresh'
      : {
          tempo: 'notes learned, building tempo',
          pace: 'notes learned, building speed',
          check: 'goal reached',
        }[h.v] || 'back to building';
export function milestoneRow(h, { date = false } = {}) {
  const d = itemDef(h.id);
  if (!d) return '';
  const dot = h.e === 'done' ? 'done' : h.v === 'check' ? 'check' : 'tempo';
  return `<div class="listrow">
    <span class="dot3 ${dot}"></span>
    <div class="grow">
      <div class="ttl">${esc(shortTitle(d))}</div>
      <div class="small">${esc(MILESTONE(h))}${date ? ' · ' + esc(shortDate(h.d)) : ''}</div>
    </div>
  </div>`;
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

// the units of a skill, tier by tier: where it stands, and any of them to practice now
export function skillSheet(skill) {
  const sk = SKILLS.find(x => x.id === skill);
  const st = skillStatus(skill);
  const now = id => id === st.focus || st.checks.includes(id);
  const body =
    (st.locked
      ? '<p class="notice">Sight-reading opens once you read the treble and bass staff up to an octave fluently.</p>'
      : '') +
    skillTiers(skill)
      .map(
        (tier, i) => `<h3 class="h3">Tier ${i + 1} · ${TIER_NAMES[i + 1]}</h3>
          <div class="stack" style="gap:0">${tier.map(id => itemRow(id, now(id))).join('')}</div>`,
      )
      .join('');
  const area = AREA_BY[sk.area];
  openSheet(
    `<div class="sheethead"><h2 class="h2">${esc(sk.n)}</h2>${closeBtn}</div>
     <p class="small">${esc(area ? area.d : '')} Each tier is a level: 1 Foundations, 2 Developing,
       3 Fluent. The session works on the first unfinished item and moves on when it is integrated; anything
       here can be practiced now as extra practice.</p>
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

// your practice over time: the last two weeks, milestones, and every day played (a wrong day, when
// someone else played, can be removed, with undo)
export function progressSheet() {
  const t = todayKey();
  const days = Store.s.days;
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13));
  const mins = last14.map(d => (days[d] && days[d].min) || 0);
  const max = Math.max(10, ...mins);
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const d = addDays(t, -i);
    if (days[d] && days[d].min >= 1) streak++;
    else if (i > 0) break;
  }
  const dayBar = (d, i) => {
    const cls = [mins[i] < 1 ? 'zero' : '', d === t ? 'today' : ''].join(' ');
    const weekday = 'SMTWTFS'[new Date(d + 'T12:00').getDay()];
    return `<div class="c" title="${d}: ${Math.round(mins[i])} min">
      <div class="bar ${cls}" style="height:${Math.max(2, (mins[i] / max) * 70)}px"></div><span>${weekday}</span></div>`;
  };
  const f = currentFocus();
  const logRow = ([d, v]) => `<div class="listrow">
    <div class="grow">
      <div class="ttl">${shortDate(d)}</div>
      <div class="small">${Math.round(v.min || 0)} min · ${v.reps || 0} reps</div>
    </div>
    <button class="btn sm ghost" type="button" data-del="${d}">Remove</button>
  </div>`;
  const log = Object.entries(days)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 60);
  const recent = Store.s.hist.slice(-12).reverse();
  openSheet(
    `<div class="sheethead"><h2 class="h2">Your practice</h2>${closeBtn}</div>
     ${f ? `<p class="small">Focus: <b>${esc(AREA_BY[f.area].n)}</b> until ${esc(niceDate(f.until))}.</p>` : ''}
     <div class="stats">
       <div class="stat"><b>${Math.round(mins.slice(-7).reduce((a, b) => a + b, 0))}</b><span>minutes in 7 days</span></div>
       <div class="stat"><b>${mins.slice(-7).filter(m => m >= 1).length}/7</b><span>days played</span></div>
       <div class="stat"><b>${streak}</b><span>day streak</span></div>
     </div>
     <div class="week" aria-label="Minutes played, last 14 days">${last14.map(dayBar).join('')}</div>
     <p class="small">Minutes count only while you play on your piano. Short daily sessions beat long
       occasional ones: memory for movement consolidates during sleep.</p>
     <h3 class="h3">Milestones</h3>
     ${
       recent.length
         ? `<div class="stack" style="gap:0">${recent.map(h => milestoneRow(h, { date: true })).join('')}</div>`
         : '<p class="small">Milestones appear here: notes learned, goals reached, integrated.</p>'
     }
     <details class="logdays">
       <summary class="small">Every day played</summary>
       <div class="stack" style="gap:0">${log.length ? log.map(logRow).join('') : '<p class="small">Nothing yet.</p>'}</div>
     </details>`,
    sheet => {
      sheet.querySelectorAll('[data-del]').forEach(b => {
        b.onclick = () => {
          const d = b.dataset.del;
          const old = Store.s.days[d];
          delete Store.s.days[d];
          Store.save();
          Log.ev('day removed', { d });
          progressSheet();
          toast('Day removed', 6000, {
            label: 'Undo',
            run: () => {
              Store.s.days[d] = old;
              Store.save();
              progressSheet();
            },
          });
        };
      });
    },
    { label: 'Your practice' },
  );
}
