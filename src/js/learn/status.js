/* Where each skill stands: in its ordered list of units, the one to work on now (the first not yet
   integrated) and the ones waiting for a cold check. Sessions, skills and the screens read this. */
import { Store } from '../core/store.js';
import { itemState } from './curriculum.js';
import { pieceOrder, SIGHT_NEEDS, skillOrder, techniqueOrder, workingPieces } from './areas.js';

export const isDone = id => (itemState(id) || {}).stage === 'done';
export const areaOn = area => Store.s.profile.areas[area] !== false;

/* ---------- where an ordered list of items stands ---------- */
// focus: the first item not yet integrated; checks: items waiting for their cold check
function orderStatus(order) {
  const checks = [];
  let focus = null;
  let done = 0;
  for (const id of order) {
    const it = itemState(id);
    if (id.endsWith(':full') && !order.slice(0, -1).every(isDone)) continue; // the whole piece opens last
    if (it && it.stage === 'done') done++;
    else if (it && it.stage === 'check') checks.push(id);
    else if (!focus) focus = id;
  }
  // do not open something new while two earlier things wait for their cold checks
  if (checks.length >= 2 && focus && !itemState(focus)) focus = null;
  return { order, focus, checks, done, total: order.length };
}

function sightUnlocked() {
  return SIGHT_NEEDS.every(isDone) || skillOrder('sight').some(id => itemState(id));
}

// status of one skill (treble, bass, sight, technique, theory, improv) or of one piece ('p:<pid>')
export function skillStatus(skill) {
  if (skill.startsWith('p:')) return orderStatus(pieceOrder(skill.slice(2)));
  if (skill === 'sight' && !sightUnlocked())
    return { ...orderStatus(skillOrder('sight')), focus: null, locked: true };
  return orderStatus(skill === 'technique' ? techniqueOrder() : skillOrder(skill));
}

// the skills that make up an area
export const areaSkills = area =>
  area === 'reading'
    ? ['treble', 'bass']
    : area === 'pieces'
      ? workingPieces().map(w => 'p:' + w.pid)
      : [area];

// something to practice in an area: a unit to learn, or (unless `learnable`) one waiting for its cold check
export const areaHasWork = (area, { learnable = false } = {}) =>
  areaSkills(area).some(sk => skillStatus(sk).focus || (!learnable && skillStatus(sk).checks.length));
