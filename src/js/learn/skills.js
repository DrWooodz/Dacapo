/* Skills: where you stand in each area, measured from your playing, and what to focus on next.
   A skill's level runs from 0 to 3, one point per tier (Foundations, Developing, Fluent): each tier adds
   the average progress of its units. Steadiness is measured instead of learned: the timing scatter of
   your runs with the metronome. The focus for the week is suggested from these levels, what matters
   to you (learned from the focus you choose), and how long an area has waited. */
import { Log } from '../core/log.js';
import { median, todayKey } from '../core/util.js';
import { Store } from '../core/store.js';
import { Library } from '../music/library.js';
import { addDays, daysBetween, itemState } from './curriculum.js';
import { AREA_BY, AREAS, itemDef, pieceOrder, skillTiers, TIER_NAMES, workingPieces } from './areas.js';
import { areaHasWork } from './status.js';

export const SKILLS = [
  { id: 'treble', n: 'Treble reading', area: 'reading' },
  { id: 'bass', n: 'Bass reading', area: 'reading' },
  { id: 'sight', n: 'Sight-reading', area: 'sight' },
  { id: 'technique', n: 'Technique', area: 'technique' },
  { id: 'theory', n: 'Theory', area: 'theory' },
  { id: 'pieces', n: 'Pieces', area: 'pieces' },
  { id: 'improv', n: 'Improvisation', area: 'improv' },
  { id: 'steadiness', n: 'Steadiness', area: null },
];
export const MAX_LEVEL = 3;
const FOCUS_DAYS = 7;

/* ---------- progress of one item, 0 to 1 ---------- */
function itemProgress(id) {
  const it = itemState(id);
  const def = itemDef(id);
  if (!it || !def) return 0;
  const between = (v, a, b) => (b === a ? 1 : Math.max(0, Math.min(1, (v - a) / (b - a))));
  switch (it.stage) {
    case 'learn':
      return 0.05 + 0.2 * Math.min(1, (it.pc || 0) / 3);
    case 'pace': {
      const [start, goal] =
        def.kind === 'theory' ? [def.goal * 2, def.goal] : [def.pace.start, def.pace.target];
      return 0.3 + 0.5 * between(start - it.pace, 0, start - goal);
    }
    case 'tempo':
      return 0.3 + 0.5 * between(it.bpm, def.start, it.target);
    case 'create':
      return 0.3 + 0.5 * Math.min(1, (it.mins || 0) / (def.minutes || 8));
    case 'check':
      return 0.85 + 0.05 * (it.passes || []).length;
    case 'done':
      return 1;
    default:
      return 0;
  }
}

/* ---------- levels ---------- */
function tieredLevel(skill) {
  return skillTiers(skill).reduce(
    (sum, tier) => sum + tier.reduce((t, id) => t + itemProgress(id), 0) / tier.length,
    0,
  );
}

// pieces: an easy piece learned is level 1; a harder one counts for more
function piecesLevel() {
  const pids = new Set([...workingPieces().map(w => w.pid), ...Object.keys(Store.s.piece.added || {})]);
  let best = 0;
  for (const pid of pids) {
    const P = Library.get(pid);
    if (!P) continue;
    const order = pieceOrder(pid);
    const f = order.reduce((t, id) => t + itemProgress(id), 0) / Math.max(1, order.length);
    best = Math.max(best, Math.min(MAX_LEVEL, ((P.lvl || 1) - 1) / 2 + 1) * f);
  }
  return best;
}

// timing scatter of recent metronome runs, as a fraction of a beat (lower is steadier)
function steadiness() {
  const since = addDays(todayKey(), -21);
  const recent = (Store.s.timing || []).filter(x => x.d >= since).map(x => x.sd);
  if (recent.length >= 4) return median(recent);
  // until there are enough metronome runs: the pulse from the placement check
  return Store.s.steadyBase ? Store.s.steadyBase.sd : null;
}

export function recordTiming(kind, sd, bpm) {
  if (!(sd >= 0) || sd > 0.6) return;
  const list = (Store.s.timing = Store.s.timing || []);
  list.push({ d: todayKey(), kind, sd: Math.round(sd * 1000) / 1000, bpm });
  if (list.length > 200) list.splice(0, list.length - 200);
}

export function skillLevel(skill) {
  if (skill === 'pieces') return piecesLevel();
  if (skill === 'steadiness') {
    const sd = steadiness();
    return sd == null ? null : Math.max(0, Math.min(MAX_LEVEL, (MAX_LEVEL * (0.15 - sd)) / 0.12));
  }
  return tieredLevel(skill);
}

export const tierName = level => TIER_NAMES[Math.min(MAX_LEVEL, Math.floor(level) + 1)];

// a short measurement under each skill, where there is one
export function skillDetail(skill) {
  const items = Object.entries(Store.s.items).filter(([id]) => (itemDef(id) || {}).skill === skill);
  if (skill === 'treble' || skill === 'bass') {
    const paces = items.flatMap(([, it]) => it.paces || []).slice(-8);
    return paces.length ? `${(median(paces) / 1000).toFixed(1)} s per note` : '';
  }
  if (skill === 'theory') {
    const ok = items.flatMap(([, it]) => it.answers || []).filter(a => a.ok);
    return ok.length >= 3 ? `${(median(ok.map(a => a.ms)) / 1000).toFixed(1)} s per answer` : '';
  }
  if (skill === 'technique') {
    const best = Math.max(0, ...items.filter(([, it]) => it.stage !== 'learn').map(([, it]) => it.bpm || 0));
    return best ? `scales up to ♩ ${best}` : '';
  }
  if (skill === 'improv') {
    const mins = items.reduce((t, [, it]) => t + (it.mins || 0), 0);
    return mins >= 1 ? `${Math.round(mins)} minutes improvised` : '';
  }
  if (skill === 'steadiness') {
    const sd = steadiness();
    return sd == null ? 'measured from your metronome runs' : `± ${Math.round(sd * 100)}% of a beat`;
  }
  return '';
}

/* ---------- history, for trends ---------- */
export function snapshotSkills() {
  const t = todayKey();
  const hist = (Store.s.skillHist = Store.s.skillHist || {});
  hist[t] = Object.fromEntries(
    SKILLS.map(s => [s.id, skillLevel(s.id)])
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, Math.round(v * 100) / 100]),
  );
  const days = Object.keys(hist).sort();
  days.slice(0, Math.max(0, days.length - 120)).forEach(d => delete hist[d]);
}

// change over the last two weeks (null when there is no older snapshot)
export function skillTrend(skill) {
  const hist = Store.s.skillHist || {};
  const cutoff = addDays(todayKey(), -14);
  const older = Object.keys(hist)
    .filter(d => d <= cutoff && hist[d][skill] != null)
    .sort()
    .pop();
  const now = skillLevel(skill);
  if (!older || now == null) return null;
  return Math.round((now - hist[older][skill]) * 10) / 10;
}

/* ---------- focus ---------- */
const areaLevel = area =>
  area === 'reading' ? Math.min(skillLevel('treble'), skillLevel('bass')) : skillLevel(area) || 0;

function lastPracticed(area) {
  let last = null;
  for (const [id, it] of Object.entries(Store.s.items))
    if (it.last && (itemDef(id) || {}).area === area && (!last || it.last > last)) last = it.last;
  return last;
}

// every area worth suggesting, with a score and a reason. When a week's focus has run out, the area it was
// on ranks a little lower, so the focus moves around unless one area clearly needs it most.
export function rankAreas() {
  // areas with something new to learn; an area whose units all wait for cold checks gets those anyway
  const on = AREAS.filter(a => Store.s.profile.areas[a.id] !== false);
  const learnable = on.filter(a => areaHasWork(a.id, { learnable: true }));
  const enabled = learnable.length ? learnable : on.filter(a => areaHasWork(a.id));
  const weights = Store.s.profile.weights || {};
  const levels = Object.fromEntries(enabled.map(a => [a.id, areaLevel(a.id)]));
  // how far each area is behind your strongest, as a share of a level (or of the strongest, past level 1)
  const top = Math.max(0, ...Object.values(levels));
  const f = Store.s.focus;
  const prev = f && f.until <= todayKey() ? f.area : null;
  return enabled
    .map(a => {
      const w = weights[a.id] ?? 1;
      const gap = (top - levels[a.id]) / Math.max(1, top); // 0 = your strongest area, 1 = far behind
      const last = lastPracticed(a.id);
      const waited = last ? daysBetween(last, todayKey()) : 14; // never practiced counts as a long wait
      const stalls = Object.entries(Store.s.items).some(
        ([id, it]) => it.stalls && it.last >= addDays(todayKey(), -7) && (itemDef(id) || {}).area === a.id,
      );
      const score =
        w * (1 + gap) + Math.min(0.3, waited * 0.03) - (a.id === prev ? 0.35 : 0) - (stalls ? 0.15 : 0);
      const reason =
        a.id === 'reading' && skillLevel('bass') + 0.3 < skillLevel('treble')
          ? 'Bass reading is behind treble, and it holds back both hands together.'
          : gap > 0.35
            ? `${AREA_BY[a.id].n} is behind your other skills.`
            : w > 1.15
              ? `${AREA_BY[a.id].n} matters to you.`
              : !last
                ? `${AREA_BY[a.id].n} is not started yet.`
                : waited >= 7
                  ? `${AREA_BY[a.id].n} has waited ${waited >= 14 ? 'two weeks or more' : 'a week'}.`
                  : `${AREA_BY[a.id].n} is ready for its next step.`;
      return { area: a.id, score, reason };
    })
    .sort((x, y) => y.score - x.score);
}

// this week's focus; suggested automatically when there is none or it has run out
export function currentFocus() {
  const t = todayKey();
  let f = Store.s.focus;
  const valid = f && f.until > t && Store.s.profile.areas[f.area] !== false && areaHasWork(f.area);
  if (!valid) {
    const best = rankAreas()[0];
    if (!best) return null;
    f = Store.s.focus = {
      area: best.area,
      since: t,
      until: addDays(t, FOCUS_DAYS),
      how: 'suggested',
      reason: best.reason,
      confirmed: false,
    };
    Log.ev('focus suggested', { area: best.area, reason: best.reason });
  }
  return f;
}

// you confirm the suggestion, or choose another area; your choices teach the suggestions
export function chooseFocus(area) {
  const t = todayKey();
  const f = Store.s.focus;
  const weights = (Store.s.profile.weights = Store.s.profile.weights || {});
  const nudge = (id, d) => (weights[id] = Math.max(0.6, Math.min(1.6, (weights[id] ?? 1) + d)));
  if (f && !f.confirmed && f.area !== area) {
    nudge(area, 0.1);
    nudge(f.area, -0.05);
  }
  Store.s.focus = {
    area,
    since: f && f.area === area ? f.since : t,
    until: f && f.area === area ? f.until : addDays(t, FOCUS_DAYS),
    how: f && f.area === area ? f.how : 'chosen',
    reason: f && f.area === area ? f.reason : '',
    confirmed: true,
  };
  Log.ev('focus chosen', { area });
  Store.save();
}
