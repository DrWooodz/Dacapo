/* Today's session: what to practice, in what order (where each skill stands is in status.js).
     1. cold checks (at most two): the first time you play something today is the honest test
     2. this week's focus: two items from the focus area, most of the time
     3. pieces marked for daily practice, when pieces are not the focus
     4. a little upkeep: spaced reviews that are due, or a few minutes on an area that has waited
   A piece session (for a longer sitting with your pieces) is built the same way from your pieces only. */
import { Log } from '../core/log.js';
import { todayKey } from '../core/util.js';
import { Store } from '../core/store.js';
import { itemState } from './curriculum.js';
import { areaOn, areaSkills, isDone, skillStatus } from './status.js';
import { AREAS, itemDef, workingPieces } from './areas.js';
import { currentFocus } from './skills.js';

// the items an area works on today, most important first
function focusItems(area) {
  const ids = areaSkills(area)
    .map(sk => skillStatus(sk).focus)
    .filter(Boolean);
  if (area === 'reading') {
    // the weaker clef first: fewer integrated units
    const done = sk => skillStatus(sk).done;
    if (ids.length === 2 && done('bass') < done('treble')) ids.reverse();
  }
  if (area === 'technique' || area === 'theory' || area === 'sight') {
    // two neighbouring items, the current one and the next, so a session is not one thing for half an
    // hour; but only one at a time while its notes are still being learned (a new item starts there)
    const st = skillStatus(area);
    const next = st.order.find(id => id !== st.focus && !isDone(id) && !st.checks.includes(id));
    const learning = ids.length && (itemState(ids[0]) || { stage: 'learn' }).stage === 'learn';
    if (next && ids.length && !learning) ids.push(next);
  }
  return ids.slice(0, 2);
}

function dueReviews() {
  const t = todayKey();
  const working = new Set(workingPieces().map(w => w.pid));
  return Object.entries(Store.s.items)
    .filter(([id, it]) => {
      const d = itemDef(id);
      return (
        d &&
        d.review &&
        it.stage === 'done' &&
        it.due &&
        it.due <= t &&
        areaOn(d.area) &&
        (d.area !== 'pieces' || working.has(d.pid))
      );
    })
    .sort((a, b) => a[1].due.localeCompare(b[1].due))
    .map(([id]) => id);
}

function lastPlayed(area) {
  let last = '';
  for (const [id, it] of Object.entries(Store.s.items))
    if (it.last && it.last > last && (itemDef(id) || {}).area === area) last = it.last;
  return last;
}

function buildSession() {
  const t = todayKey();
  const focus = currentFocus();
  const list = [];
  const add = (id, role) => {
    if (id && !list.some(e => e.id === id) && itemDef(id))
      list.push({ id, role, reps: 0, ok: 0, ms: 0, state: 'todo' });
  };
  // 1. cold checks
  const checks = AREAS.filter(a => areaOn(a.id)).flatMap(a =>
    areaSkills(a.id).flatMap(sk => skillStatus(sk).checks.filter(id => (itemState(id) || {}).lastCold !== t)),
  );
  checks.slice(0, 2).forEach(id => add(id, 'check'));
  // 2. the focus
  if (focus) focusItems(focus.area).forEach(id => add(id, 'focus'));
  // 3. daily pieces (unless pieces are the focus already, or switched off)
  if (areaOn('pieces') && (!focus || focus.area !== 'pieces'))
    workingPieces()
      .filter(w => w.daily)
      .forEach(w => add(skillStatus('p:' + w.pid).focus, 'daily'));
  // 4. upkeep: reviews, or an area that has waited longest
  const reviews = dueReviews().slice(0, 2);
  reviews.forEach(id => add(id, 'review'));
  if (!reviews.length) {
    const waiting = AREAS.filter(a => areaOn(a.id) && a.id !== (focus && focus.area) && a.id !== 'pieces')
      .map(a => ({ a: a.id, last: lastPlayed(a.id), id: focusItems(a.id)[0] }))
      .filter(x => x.id && !list.some(e => e.id === x.id))
      .sort((x, y) => x.last.localeCompare(y.last));
    if (waiting[0]) add(waiting[0].id, 'warm');
  }
  // nothing new to start (everything waits for its cold check): keep those items warm
  if (!list.some(e => e.role === 'focus'))
    AREAS.filter(a => areaOn(a.id)).forEach(a =>
      areaSkills(a.id).forEach(sk =>
        skillStatus(sk).checks.forEach(id => list.length < 4 && add(id, 'focus')),
      ),
    );
  Store.s.sessions = (Store.s.sessions || 0) + 1;
  const s = { day: t, n: Store.s.sessions, list, idx: 0, started: Date.now(), focus: focus && focus.area };
  Log.ev('session built', { day: t, focus: focus && focus.area, list: list.map(e => e.role + ' ' + e.id) });
  return s;
}

// today's session, built on first use each day
export function currentSession() {
  const t = todayKey();
  let s = Store.s.session;
  if (!s || s.day !== t || !Array.isArray(s.list)) {
    s = Store.s.session = buildSession();
    Store.save();
  }
  dropMissing(s);
  return s;
}

// rebuild today's session (after the focus changes), keeping what is already done
export function rebuildSession() {
  const old = Store.s.session;
  const s = buildSession();
  if (old && old.day === s.day) {
    const done = old.list.filter(e => e.state === 'done');
    s.list = done.concat(s.list.filter(e => !done.some(d => d.id === e.id)));
    s.idx = done.length;
  }
  Store.s.session = s;
  Store.save();
  return s;
}

/* ---------- a longer sitting with your pieces ---------- */
export function pieceSession(minutes) {
  const t = todayKey();
  const list = [];
  const add = (id, role, box) => {
    if (id && !list.some(e => e.id === id) && itemDef(id))
      list.push({ id, role, reps: 0, ok: 0, ms: 0, state: 'todo', box });
  };
  const pieces = workingPieces();
  const per = Math.max(8, Math.round(minutes / Math.max(1, pieces.length)));
  for (const w of pieces) {
    const st = skillStatus('p:' + w.pid);
    st.checks.filter(id => (itemState(id) || {}).lastCold !== t).forEach(id => add(id, 'check'));
    if (st.focus) add(st.focus, 'focus', Math.round(per * 0.7));
    // the next section too, when there is time: learning in overlapping chunks joins them
    const next = st.order.find(
      id => id !== st.focus && !isDone(id) && !st.checks.includes(id) && !id.endsWith(':full'),
    );
    if (next && per >= 12) add(next, 'focus', Math.round(per * 0.3));
  }
  dueReviews()
    .filter(id => id.startsWith('p:'))
    .forEach(id => add(id, 'review'));
  const s = { day: t, kind: 'pieces', minutes, list, idx: 0, started: Date.now() };
  Store.s.pieceSession = s;
  Log.ev('piece session built', { minutes, list: list.map(e => e.role + ' ' + e.id) });
  Store.save();
  return s;
}

function dropMissing(s) {
  // drop entries whose item no longer exists (a piece was removed)
  const before = s.list.length;
  s.list = s.list.filter(e => itemDef(e.id));
  if (s.list.length !== before) {
    s.idx = Math.min(s.idx, Math.max(0, s.list.length - 1));
    Store.save();
  }
}

/* ---------- the pieces you work on ---------- */
export const MAX_PIECES = 4;

// start (or resume) working on a piece; progress on its sections is kept if you worked on it before
export function workOnPiece(pid, { daily = false } = {}) {
  const P = Store.s.piece;
  if (P.working.some(w => w.pid === pid)) return true;
  if (P.working.length >= MAX_PIECES) return false;
  P.working.push({ pid, daily });
  P.added[pid] = P.added[pid] || todayKey();
  Log.ev('working on piece', { pid, daily });
  refreshToday();
  return true;
}

// stop working on a piece; its progress stays, ready if you come back
export function stopPiece(pid) {
  const P = Store.s.piece;
  P.working = P.working.filter(w => w.pid !== pid);
  Log.ev('stopped piece', { pid });
  refreshToday();
}

export function setPieceDaily(pid, daily) {
  const w = Store.s.piece.working.find(x => x.pid === pid);
  if (!w) return;
  w.daily = daily;
  Log.ev('piece daily', { pid, daily });
  refreshToday();
}

// a change in your pieces changes today's plan: rebuild the parts not started yet
function refreshToday() {
  const s = Store.s.session;
  if (s && s.day === todayKey()) rebuildSession();
  else Store.save();
}
