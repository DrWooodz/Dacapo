/* The first open: what DaCapo does, what matters to you, composers you love, and a first piece. */
import { Log } from '../core/log.js';
import { $, esc } from '../core/util.js';
import { Store } from '../core/store.js';
import { go } from '../core/ui.js';
import { COMPOSERS, LEVEL_NAMES, Library } from '../music/library.js';
import { AREAS } from '../learn/areas.js';
import { workOnPiece } from '../learn/sessions.js';
import { bindConnect, connectNotice } from './practice.js';

export function drawWelcome(page) {
  const P = Store.s.profile;
  const fav = new Set(P.favorites);
  const matters = new Set(
    Object.entries(P.weights || {})
      .filter(([, w]) => w > 1)
      .map(([a]) => a),
  );
  let pick = null;
  const suggestions = () =>
    Library.all()
      .filter(p => p.c !== 'mine' && (fav.size ? fav.has(p.c) : true) && p.lvl <= 2)
      .slice(0, 8);
  const chip = (attr, key, on, label) =>
    `<button type="button" class="chip" data-${attr}="${key}" aria-pressed="${on}">${esc(label)}</button>`;
  const pieceCard = p => `
    <button type="button" class="pickcard" data-pick="${p.id}" aria-pressed="${pick === p.id}">
      <b>${esc(p.t)}</b>
      <span>${esc(COMPOSERS[p.c].short)}${p.sub ? ' · ' + esc(p.sub) : ''} · ${LEVEL_NAMES[p.lvl]}</span>
    </button>`;
  const paint = () => {
    page.innerHTML = `
      <div class="card welcome">
        <span class="eyebrow">Welcome to DaCapo</span>
        <h1 class="h1">Open it, and <em>play</em>.</h1>
        <ol class="small">
          <li>Each day DaCapo prepares a short session around one focus for the week, with a few minutes
            of upkeep for everything else.</li>
          <li>Each drill carries over from day to day until it is truly learned: right on the first try of
            the day, on two different days.</li>
          <li>It listens over MIDI and moves on by itself. You keep your hands on the keys.</li>
        </ol>
      </div>
      ${connectNotice(true)}
      <div class="card">
        <div class="cardhead">
          <h2 class="h2">What matters most to you?</h2>
          <span class="small">Choose any; it shapes the suggestions</span>
        </div>
        <div class="chips">${AREAS.map(a => chip('matter', a.id, matters.has(a.id), a.n)).join('')}</div>
      </div>
      <div class="card">
        <div class="cardhead"><h2 class="h2">Composers you love</h2></div>
        <div class="chips">${Object.entries(COMPOSERS)
          .filter(([k]) => k !== 'mine')
          .map(([k, c]) => chip('fav', k, fav.has(k), c.short))
          .join('')}</div>
        <span class="small">A piece to work on (optional; the Library has them all):</span>
        <div class="pickgrid">${suggestions().map(pieceCard).join('')}</div>
      </div>
      <button class="btn cover big" type="button" id="wcCheck">Start with an 8-minute check</button>
      <button class="btn big ghost" type="button" id="wcStart">Skip it and start practicing</button>`;
    bindConnect();
    const toggle = (attr, set) =>
      page.querySelectorAll(`[data-${attr}]`).forEach(b => {
        b.onclick = () => {
          const k = b.dataset[attr];
          if (set.has(k)) set.delete(k);
          else set.add(k);
          paint();
        };
      });
    toggle('matter', matters);
    toggle('fav', fav);
    page.querySelectorAll('[data-pick]').forEach(b => {
      b.onclick = () => {
        pick = pick === b.dataset.pick ? null : b.dataset.pick;
        paint();
      };
    });
    const finish = to => {
      P.favorites = [...fav];
      P.weights = Object.fromEntries(AREAS.map(a => [a.id, matters.has(a.id) ? 1.3 : 1]));
      P.onboarded = true;
      if (pick) workOnPiece(pick, { daily: true });
      Store.s.session = null;
      Store.s.focus = null;
      Store.save();
      Log.ev('onboarded', { matters: [...matters], fav: P.favorites, piece: pick });
      go(to);
    };
    $('#wcCheck', page).onclick = () => finish('assess');
    $('#wcStart', page).onclick = () => finish('practice');
  };
  paint();
}
