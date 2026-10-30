/* Diagnostics: a persistent event log and bug reports
   Everything that matters for debugging a real practice session is written here: errors, app
   events (navigation, session and drill transitions, rep results), input and audio events.
   The log survives reloads (localStorage), so a report made after a problem still shows what
   led up to it. Nothing leaves the device unless you copy, download or send a report.
   The log depends only on the build facts and the toast, so it starts first and catches errors
   anywhere. The app tells it how to describe the rest (setContext). */
import { APP_VERSION, BUILD, IN_CLAUDE } from '../env.js';
import { toast } from './util.js';

export const Log = {
  KEY: 'dacapo.log',
  MAX: 900,
  buf: [],
  sid: Math.random().toString(36).slice(2, 8),
  t0: Date.now(),
  timer: 0,
  errCount: 0,
  lastErrToast: 0,
  midi: { on: 0, off: 0, cc: 0, other: 0, raw: [] },
  ctx: { env: () => ({}), state: () => null, openReport: null },
  // env(): extra fields for the environment summary; state(): a digest of the learning state;
  // openReport(): show the report form
  setContext(ctx) {
    Object.assign(this.ctx, ctx);
  },
  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (Array.isArray(o.buf)) this.buf = o.buf.slice(-this.MAX);
      }
    } catch (e) {
      this.buf = [];
    }
  },
  add(k, m, d) {
    const e = { t: Date.now(), s: this.sid, k, m: String(m).slice(0, 300) };
    if (d !== undefined) {
      try {
        const j = JSON.stringify(d);
        e.d = j.length > 1200 ? j.slice(0, 1200) + '…' : j;
      } catch (err) {
        e.d = '[unserializable]';
      }
    }
    this.buf.push(e);
    if (this.buf.length > this.MAX) this.buf.splice(0, this.buf.length - this.MAX);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.persist(), k === 'err' ? 50 : 1500);
    return e;
  },
  ev(m, d) {
    return this.add('ev', m, d);
  },
  warn(m, d) {
    return this.add('warn', m, d);
  },
  err(e, where = '') {
    this.errCount++;
    const msg = e && e.message ? e.message : String(e);
    const stack = e && e.stack ? String(e.stack).split('\n').slice(0, 6).join(' | ') : '';
    this.add('err', (where ? where + ': ' : '') + msg, stack ? { stack } : undefined);
    this.offerReport();
  },
  persist() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify({ v: 1, buf: this.buf.slice(-this.MAX) }));
    } catch (e) {
      /* storage full: keep in memory */
    }
  },
  clear() {
    this.buf = [];
    this.errCount = 0;
    this.persist();
  },
  // run a function and log (not throw) any error: used around every event handler
  guard(where, fn) {
    return (...a) => {
      try {
        return fn(...a);
      } catch (e) {
        this.err(e, where);
      }
    };
  },
  offerReport() {
    const now = Date.now();
    if (now - this.lastErrToast < 30000 || !this.ctx.openReport) return;
    this.lastErrToast = now;
    try {
      toast('Something went wrong. It was logged.', 7000, {
        label: 'Report',
        run: () => this.ctx.openReport(),
      });
    } catch (e) {}
  },
  midiMsg(data, ts) {
    const st = data[0] & 0xf0;
    if (st === 0x90 && data[2] > 0) this.midi.on++;
    else if (st === 0x80 || st === 0x90) this.midi.off++;
    else if (st === 0xb0) this.midi.cc++;
    else this.midi.other++;
    if (this.midi.raw.length < 40 && data[0] !== 0xfe && data[0] !== 0xf8)
      this.midi.raw.push([Math.round(ts), ...Array.from(data).slice(0, 3)]);
  },
  // compact environment summary for reports
  env() {
    let extra = {};
    try {
      extra = this.ctx.env() || {};
    } catch (e) {
      extra = { error: String(e) };
    }
    return {
      app: APP_VERSION,
      build: BUILD,
      inClaude: IN_CLAUDE,
      ua: navigator.userAgent,
      lang: navigator.language,
      screen: `${screen.width}x${screen.height}@${window.devicePixelRatio || 1}`,
      viewport: `${innerWidth}x${innerHeight}`,
      tz: new Date().getTimezoneOffset(),
      now: new Date().toISOString(),
      up: Math.round((Date.now() - this.t0) / 1000),
      ...extra,
      midiCounts: { ...this.midi, raw: undefined },
      midiFirst: this.midi.raw,
      errors: this.errCount,
      storage: (() => {
        try {
          return {
            state: (localStorage.getItem('dacapo.v1') || '').length,
            log: (localStorage.getItem(this.KEY) || '').length,
          };
        } catch (e) {
          return null;
        }
      })(),
    };
  },
  digest() {
    try {
      return this.ctx.state();
    } catch (e) {
      return { error: String(e) };
    }
  },
  report(note = '', includeLog = true) {
    const head = [
      'DACAPO PROBLEM REPORT',
      `When: ${new Date().toString()}`,
      '',
      'What happened:',
      note.trim() || '(no description)',
      '',
    ].join('\n');
    const body = {
      env: this.env(),
      state: this.digest(),
      log: includeLog
        ? this.buf.slice(-600).map(e => [new Date(e.t).toISOString().slice(5, 23), e.s, e.k, e.m, e.d || ''])
        : [],
    };
    return (
      head + '\n--- diagnostic data (JSON) ---\n' + JSON.stringify(body, null, 0).replace(/\],\["/g, '],\n["')
    );
  },
};

Log.load();

Log.ev('page load', {
  url: location.protocol + '//' + location.host + location.pathname,
  ref: document.referrer ? 'yes' : 'no',
});

window.addEventListener('error', e => {
  Log.err(
    e.error || new Error(e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno),
    'uncaught',
  );
});

window.addEventListener('unhandledrejection', e => {
  Log.err(e.reason || new Error('unhandled rejection'), 'promise');
});

(() => {
  // keep console errors and warnings too
  const ce = console.error.bind(console),
    cw = console.warn.bind(console);
  console.error = (...a) => {
    try {
      Log.add(
        'err',
        a
          .map(x => (x && x.message ? x.message : String(x)))
          .join(' ')
          .slice(0, 300),
        a[0] && a[0].stack ? { stack: String(a[0].stack).split('\n').slice(0, 5).join(' | ') } : undefined,
      );
    } catch (e) {}
    ce(...a);
  };
  console.warn = (...a) => {
    try {
      Log.add('warn', a.map(String).join(' ').slice(0, 300));
    } catch (e) {}
    cw(...a);
  };
})();

document.addEventListener('visibilitychange', () => Log.ev('visibility ' + document.visibilityState));

window.addEventListener('pagehide', () => {
  Log.ev('page hide');
  Log.persist();
});
