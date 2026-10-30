/* The router, bottom sheets and shared controls. */
import { IN_CLAUDE } from '../env.js';
import { Log } from './log.js';
import { $, $$, esc } from './util.js';

export const UI = { view: 'practice', params: {}, cleanup: [] };

// a segmented control: opts [[value, label]], the current value; cls adds classes (e.g. 'wrap')
export function seg(name, opts, val, cls = '') {
  const button = ([v, label]) =>
    `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v) === String(val)}">${label}</button>`;
  return `<div class="seg ${cls}" role="group" data-seg="${name}">${opts.map(button).join('')}</div>`;
}

// delegate seg clicks inside root: handlers[name](value)
// One listener per root; re-binding replaces handlers by name instead of stacking duplicates.
export function bindSegs(root, handlers) {
  if (!root._segs) {
    root._segs = {};
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-seg] [data-v]');
      if (!b || !root.contains(b)) return;
      const g = b.closest('[data-seg]');
      const h = root._segs[g.dataset.seg];
      if (!h) return;
      $$('[data-v]', g).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      h(b.dataset.v);
    });
  }
  Object.assign(root._segs, handlers);
}

export function onUnmount(fn) {
  UI.cleanup.push(fn);
}

export function go(view, params = {}) {
  if (!views[view]) view = 'practice';
  UI.cleanup.forEach(f => {
    try {
      f();
    } catch (e) {
      Log.err(e, 'view cleanup');
    }
  });
  UI.cleanup = [];
  closeSheet();
  Log.ev('view ' + view, Object.keys(params).length ? params : undefined);
  UI.view = view;
  UI.params = params;
  $$('#tabs [data-view]').forEach(b =>
    b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'),
  );
  const page = $('#page');
  const fresh = page.cloneNode(false);
  page.replaceWith(fresh); // drop old listeners
  try {
    views[view](fresh, params);
  } catch (e) {
    Log.err(e, 'view ' + view);
    showViewError(fresh);
  }
  window.scrollTo({ top: 0 });
  try {
    sessionStorage.setItem('dacapo.view', view);
  } catch (e) {}
  if (!IN_CLAUDE)
    try {
      history.replaceState(null, '', '#' + view);
    } catch (e) {}
}

// the screens, registered by the app at boot: name -> (page element, params) => void
const views = {};

export function registerViews(map) {
  Object.assign(views, map);
}

export function hasView(name) {
  return !!views[name];
}

function showViewError(page) {
  page.innerHTML = `<div class="card">
    <h2 class="h2">This screen hit a problem</h2>
    <p class="small">It was logged. You can report it with the flag button at the top, then try again.</p>
    <div class="row">
    <button class="btn" type="button" data-act="home">Back to practice</button>
    <button class="btn" type="button" data-act="report">Report
    it</button></div></div>`;
  $('[data-act="home"]', page).onclick = () => go('practice');
  $('[data-act="report"]', page).onclick = () => Log.ctx.openReport && Log.ctx.openReport();
}

export function openSheet(html, onMount, { label = 'Panel' } = {}) {
  closeSheet();
  const layer = $('#layer');
  layer.innerHTML = `<div class="scrim" data-close></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1">${html}</section>`;
  const sheet = $('.sheet', layer);
  // keyboard and screen-reader users land in the panel, and return where they were when it closes
  layer._return = document.activeElement;
  sheet.focus({ preventScroll: true });
  layer.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.addEventListener('click', e => {
    if (e.target.closest('[data-closebtn]')) closeSheet();
  });
  if (onMount) {
    try {
      const off = onMount(sheet);
      if (typeof off === 'function') layer._off = off;
    } catch (e) {
      Log.err(e, 'sheet ' + label);
    }
  }
  return sheet;
}

export function closeSheet() {
  const layer = $('#layer');
  if (!layer) return;
  if (layer._off) {
    try {
      layer._off();
    } catch (e) {
      Log.err(e, 'sheet cleanup');
    }
    layer._off = null;
  }
  const back = layer._return;
  layer._return = null;
  if (!layer.innerHTML) return;
  layer.innerHTML = '';
  if (back && back.isConnected && back.focus) back.focus({ preventScroll: true });
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSheet();
});

export const closeBtn = `<button class="iconbtn" type="button" data-closebtn aria-label="Close">
  <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
