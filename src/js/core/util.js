/* Small DOM, formatting and statistics helpers, and the toast message. */

export const $ = (s, r = document) => r.querySelector(s);

export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export const esc = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const rnd = n => Math.floor(Math.random() * n);

export const pick = a => a[rnd(a.length)];

export const DAY = 86400000;

// A practice day runs from 4 in the morning to 4 the next morning, so a late evening session that goes past
// midnight stays one day: one session, one cold check, and two "different days" are really different days.
const DAY_STARTS_AT_HOUR = 4;

export const todayKey = (date = new Date()) => {
  const d = new Date(date.getTime() - DAY_STARTS_AT_HOUR * 3600000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const fmtTime = s => {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function toast(msg, ms = 2200, action) {
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  const sp = document.createElement('span');
  sp.textContent = msg;
  t.appendChild(sp);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.onclick = () => {
      action.run();
      t.remove();
    };
    t.appendChild(b);
    ms = Math.max(ms, 6000);
  }
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export const meanOf = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export const median = a => {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
