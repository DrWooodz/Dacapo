/* Your progress: the saved state, migration from older versions, sync to a Claude account,
 * and practice time counted from actual playing. */
import { Log } from './log.js';
import { DAY, todayKey } from './util.js';

/* ---------- state + sync ---------- */
const STATE_VERSION = 5;

export const DEFAULT_STATE = () => ({
  v: STATE_VERSION,
  savedAt: 0,
  settings: {
    input: 'touch',
    octaveTolerant: true,
    micLatency: 70,
    midiLatency: 0,
    sound: true,
    volume: 0.8,
    midiOut: false,
    clickOnPiano: false,
    keepAwake: true,
    instrument: 'other', // which guide to show: 'cdp-s360', 'acoustic' or any other digital piano
    thru: { on: false, split: 0, left: 'bass', right: 'piano' }, // your piano played through this device
  },
  profile: {
    favorites: [], // composers you love
    onboarded: false,
  },
  items: {}, // a piece's sections and the whole piece -> progress (see learn/pieces.js)
  piece: { working: [] }, // the pieces you are learning: [{pid}]
  days: {}, // 'YYYY-MM-DD' -> {min, reps, clean}
  hist: [], // milestones: {d, id, e}
  lessonsSeen: {}, // kind of drill -> the day its body-and-hands note was last shown
  games: {}, // ear games: best levels
  moods: {
    keys: {}, // 'mood:pc' -> {checks: [days], extra: {drill: clean runs}, last}
    prefs: {
      keys: true,
      fingers: true,
      tempo: false,
      bpm: 60,
      octs: 1,
      exactOctave: false,
      mood: null,
      pc: null,
    },
    ear: { n: 0, right: 0, by: {} }, // "which mood?": answers, right ones, and per mood [heard, right]
  },
  archive: null, // what the daily course (until version 1.5) had learned: kept, not shown
});

export const Store = {
  s: DEFAULT_STATE(),
  db: null,
  uid: null,
  ref: null,
  writing: false,
  dirty: false,
  timer: null,
  listeners: new Set(),
  saves: 0,
  loadLocal() {
    let raw = null;
    try {
      raw = localStorage.getItem('dacapo.v1');
    } catch (e) {
      Log.warn('localStorage unavailable', String(e));
    }
    if (!raw) return;
    try {
      this.s = migrate(JSON.parse(raw));
      Log.ev('state loaded', { v: this.s.v, bytes: raw.length, items: Object.keys(this.s.items).length });
    } catch (e) {
      Log.err(e, 'state load');
      try {
        localStorage.setItem('dacapo.broken.' + Date.now(), raw);
      } catch (e2) {}
      this.s = DEFAULT_STATE();
    }
  },
  async connect() {
    try {
      if (!window.claude || !window.claude.use) return;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return;
      const uid = await user.id();
      if (!uid) return;
      this.db = db;
      this.uid = uid;
      this.ref = db.doc('data/users/' + uid + '/progress');
      Log.ev('sync connected');
      await this.pull();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.pull();
      });
    } catch (e) {
      Log.warn('sync unavailable', String((e && e.message) || e));
    }
  },
  async pull() {
    if (!this.ref) return;
    try {
      const snap = await this.ref.get();
      if (snap.exists) {
        const remote = JSON.parse(snap.data().json || '{}');
        if ((remote.savedAt || 0) > (this.s.savedAt || 0)) {
          this.s = migrate(remote);
          this.saveLocal();
          Log.ev('sync pulled newer state', { savedAt: remote.savedAt });
          this.emit();
        } else if ((remote.savedAt || 0) < (this.s.savedAt || 0)) this.queue();
      } else if (this.s.savedAt) this.queue();
      this.emit('sync');
    } catch (e) {
      Log.warn('sync pull failed', String((e && e.message) || e));
    }
  },
  saveLocal() {
    try {
      localStorage.setItem('dacapo.v1', JSON.stringify(this.s));
    } catch (e) {
      Log.warn('local save failed; pruning', String(e));
      pruneState(this.s, true);
      try {
        localStorage.setItem('dacapo.v1', JSON.stringify(this.s));
      } catch (e2) {
        Log.err(e2, 'local save');
      }
    }
  },
  save() {
    this.s.savedAt = Date.now();
    if (++this.saves % 25 === 1) pruneState(this.s);
    this.saveLocal();
    this.queue();
  },
  queue() {
    if (!this.ref) return;
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 1500);
  },
  async flush() {
    if (!this.ref || this.writing || !this.dirty) return;
    this.writing = true;
    this.dirty = false;
    try {
      let json = JSON.stringify(this.s);
      if (json.length > 230000) {
        pruneState(this.s, true);
        json = JSON.stringify(this.s);
      }
      await this.ref.set({ json, savedAt: this.s.savedAt });
    } catch (e) {
      Log.warn('sync write failed', String((e && e.message) || e));
      if (e && e.code === 'unavailable') {
        this.dirty = true;
        setTimeout(() => this.flush(), 2000 + Math.random() * 2000);
      }
    } finally {
      this.writing = false;
      if (this.dirty) this.queue();
    }
  },
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
  emit(kind = 'state') {
    this.listeners.forEach(f => {
      try {
        f(kind);
      } catch (e) {
        Log.err(e, 'store listener');
      }
    });
  },
};

// Old saved states are brought up to date. Before version 5 (DaCapo 1.x) there was a daily course: its
// progress is kept in archive, and a piece you were learning carries on.
export function migrate(o) {
  if (!o || typeof o !== 'object') return DEFAULT_STATE();
  const from = o.v || 1;
  const s = from < 5 ? fromVersion4(o) : deepMerge(DEFAULT_STATE(), o);
  s.v = STATE_VERSION;
  if (from < STATE_VERSION) Log.ev('migrated state', { from, to: STATE_VERSION });
  return s;
}

function fromVersion4(o) {
  const s = DEFAULT_STATE();
  const set = o.settings || {};
  for (const k of Object.keys(s.settings)) if (set[k] !== undefined) s.settings[k] = set[k];
  s.profile.favorites = (o.profile && o.profile.favorites) || [];
  s.profile.onboarded = !!(o.profile && o.profile.onboarded);
  for (const d in o.days || {}) {
    const x = o.days[d] || {};
    if (+x.min > 0) s.days[d] = { min: +x.min, reps: x.reps || 0, clean: x.clean || 0 };
  }
  const items = o.items || {};
  for (const id in items) if (id.startsWith('p:')) s.items[id] = items[id];
  s.piece.working = ((o.piece && o.piece.working) || []).map(w => ({ pid: w.pid })).filter(w => w.pid);
  s.hist = (o.hist || []).filter(h => h && String(h.id || '').startsWith('p:'));
  s.lessonsSeen = o.lessonsSeen || {};
  s.games = o.games || {};
  const m = o.moods || {};
  for (const [k, v] of Object.entries(m.keys || {}))
    s.moods.keys[k] = { checks: (v && v.checks) || [], extra: (v && v.extra) || {}, last: v && v.last };
  if (m.prefs)
    Object.assign(s.moods.prefs, pickKeys(m.prefs, ['keys', 'fingers', 'tempo', 'bpm', 'octs', 'mood']));
  if (m.ear) s.moods.ear = m.ear;
  const course = Object.fromEntries(Object.entries(items).filter(([id]) => !id.startsWith('p:')));
  if (Object.keys(course).length) s.archive = { from: o.v || 1, items: course, at: todayKey() };
  s.savedAt = o.savedAt || 0;
  return s;
}
const pickKeys = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

// Keep the saved document small enough to sync for years.
function pruneState(s, hard = false) {
  const cap = (arr, n) => {
    if (arr && arr.length > n) arr.splice(0, arr.length - n);
  };
  cap(s.hist, hard ? 150 : 400);
  Object.values(s.items || {}).forEach(it => cap(it.log, hard ? 12 : 30));
  if (s.archive && s.archive.items) Object.values(s.archive.items).forEach(it => it && delete it.log);
  const cutoff = todayKey(new Date(Date.now() - (hard ? 200 : 800) * DAY));
  for (const d in s.days) if (d < cutoff) delete s.days[d];
}

// defaults filled in from base; a saved value of the wrong shape (damaged data) keeps the default
function deepMerge(base, over) {
  if (over === undefined) return base;
  if (base === null) return over; // no default shape (e.g. today's session): taken as saved, checked where used
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (typeof base !== 'object') return typeof over === typeof base ? over : base;
  if (!over || typeof over !== 'object' || Array.isArray(over)) return base;
  const out = { ...base };
  for (const k in over) out[k] = k in base ? deepMerge(base[k], over[k]) : over[k];
  return out;
}

/* ---------- practice time: counted from playing, not from the screen being open ---------- */
export function dayRec(d = todayKey()) {
  return Store.s.days[d] || (Store.s.days[d] = { min: 0, reps: 0, clean: 0 });
}

export const Activity = {
  last: 0,
  acc: 0,
  recent: 0, // recent: ms of activity in the current focus window (read by the session)
  note(ev) {
    if (ev && ev.src === 'touch') return; // on-screen keys are for trying things out, not practice time
    const now = Date.now();
    const gap = now - this.last;
    if (this.last && gap < 20000) {
      this.acc += gap;
      this.recent += gap;
    }
    this.last = now;
    if (this.acc >= 30000) {
      const d = dayRec();
      d.min = Math.round((d.min + this.acc / 60000) * 10) / 10;
      this.acc = 0;
      Store.save();
    }
  },
  flush() {
    if (this.acc > 5000) {
      const d = dayRec();
      d.min = Math.round((d.min + this.acc / 60000) * 10) / 10;
      this.acc = 0;
      Store.save();
    }
  },
};

window.addEventListener('pagehide', () => {
  try {
    Activity.flush();
  } catch (e) {}
});
