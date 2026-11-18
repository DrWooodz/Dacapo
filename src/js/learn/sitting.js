/* Recording what you play: a recorder (any input: notes, releases, the pedal), used for takes you record
   yourself and for each sitting at Play, which is kept automatically (the last few) so its read-back in the
   journal can be listened to. Events: [ms, 'n', midi, velocity] | [ms, 'f', midi] | [ms, 'p', 0|1]. */
import { Input } from '../core/input.js';

// when a sitting ends (this long without a note), and what counts as one
export const SITTING = { quiet: 90000, minMs: 30000, minNotes: 30 };

export function createRecorder() {
  const t0 = performance.now();
  const ev = [];
  const offs = [
    Input.on(e => ev.push([Math.round(e.t - t0), 'n', e.m, Math.round(e.vel * 127)])),
    Input.onOff(e => {
      if (e.pedal != null) ev.push([Math.round(e.t - t0), 'p', e.pedal ? 1 : 0]);
      else ev.push([Math.round(e.t - t0), 'f', e.m]);
    }),
  ];
  return {
    get notes() {
      return ev.filter(e => e[1] === 'n').length;
    },
    // the events from the first note, or null if nothing was played
    stop() {
      offs.splice(0).forEach(f => f());
      const out = ev.filter(e => e[0] >= -200).sort((a, b) => a[0] - b[0]);
      const first = out.find(e => e[1] === 'n');
      if (!first) return null;
      const at = first[0];
      out.forEach(e => (e[0] -= at));
      // (a very long sitting keeps its first part)
      return out.slice(0, 40000);
    },
  };
}

// the recordings of the last sittings, by journal entry
const KEY = 'dacapo.sittings';
const KEEP = 6;
export const Sittings = {
  list() {
    try {
      const l = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(l) ? l : [];
    } catch (e) {
      return [];
    }
  },
  get(id) {
    return this.list().find(x => x.id === id) || null;
  },
  save(id, ev) {
    let l = [{ id, d: Date.now(), ev, name: '' }, ...this.list()].slice(0, KEEP);
    // if the browser is full, keep fewer
    while (l.length)
      try {
        localStorage.setItem(KEY, JSON.stringify(l));
        return true;
      } catch (e) {
        l = l.slice(0, l.length - 1);
      }
    return false;
  },
};
