/* Songs: the pieces you are learning, and the music to choose from, one composer at a time. Hard pieces
   are here on purpose: goals to aim for. A piece is learned a section at a time (about four bars): each
   hand, then together, then up to tempo with the metronome; the whole piece last. Tap any section. */
import { Log } from '../core/log.js';
import { $, $$, esc, toast } from '../core/util.js';
import { Store } from '../core/store.js';
import { AudioEngine } from '../core/audio.js';
import { bindSegs, closeBtn, go, onUnmount, openSheet, seg, UI } from '../core/ui.js';
import { scoreText } from '../core/files.js';
import { MAJOR_KEYS, MINOR_KEYS, prettyKey } from '../music/theory.js';
import { COMPOSERS, ERAS, LEVEL_NAMES, Library, listenUrl, scoreUrl } from '../music/library.js';
import { parseMusicXML, pieceFromScore } from '../music/musicxml.js';
import { moodName } from '../music/moods.js';
import { Player } from '../learn/player.js';
import {
  criterion,
  itemDef,
  itemState,
  pieceOrder,
  sectionOriginal,
  STAGE_TXT,
  startPiece,
  stopPiece,
  workingPieces,
} from '../learn/pieces.js';
import { bindConnect, connectNotice } from './connect.js';

const isWorking = pid => workingPieces().some(w => w.pid === pid);
// how far along a piece is: sections at tempo, of all
const progressOf = pid => {
  const ids = pieceOrder(pid);
  return { done: ids.filter(id => (itemState(id) || {}).stage === 'done').length, total: ids.length };
};
// the section to play next: the first not yet at tempo
const nextItem = pid =>
  pieceOrder(pid).find(id => (itemState(id) || {}).stage !== 'done') || pieceOrder(pid)[0];

export const songsView = (page, params = {}) => {
  if (params.pid && Library.get(params.pid)) return piecePage(page, params.pid, params.item);
  const fav = Store.s.profile.favorites || [];
  const all = Library.all();
  // shelves by era (a shelf remembered as a composer opens that composer's era)
  const eraOf = c => (COMPOSERS[c] || {}).era;
  const shelves = Object.keys(ERAS).filter(e => all.some(p => eraOf(p.c) === e));
  const want = ERAS[UI.shelf] ? UI.shelf : eraOf(UI.shelf);
  const shelf = shelves.includes(want)
    ? want
    : shelves.find(e => fav.some(c => eraOf(c) === e)) || shelves[0];
  const shelfName = e => ERAS[e];
  const working = workingPieces();
  page.innerHTML = `
    <h1 class="h1 pagetitle">Songs</h1>
    ${
      working.length
        ? `<section class="card"><h2 class="h2">Learning</h2>${working
            .map(w => {
              const P = Library.get(w.pid);
              const pr = progressOf(w.pid);
              return `<div class="workrow"><div class="row between">
                <button type="button" class="grow linkrow" data-piece="${esc(P.id)}">
                  <span class="ttl">${esc(P.t)}</span>
                  <span class="small">${esc((COMPOSERS[P.c] || {}).short || '')} · ${pr.done} of ${pr.total} at tempo</span>
                </button>
                <button class="btn sm cover" type="button" data-piece="${esc(P.id)}">Open</button>
              </div>${sectionMap(P.id)}</div>`;
            })
            .join('')}</section>`
        : ''
    }
    <section class="card">
      ${seg(
        'sgShelf',
        shelves.map(c => [c, shelfName(c)]),
        shelf,
        'wrap',
      )}
      ${shelfBody(shelf, all)}
    </section>
    <section class="card stack">
      <div class="row between"><b>Add a song</b>
        <label class="btn sm">Choose a MusicXML file<input type="file" id="sgFile" accept=".musicxml,.xml,.mxl" hidden></label></div>
      <p class="small">MusicXML is the score format every notation app exports (MuseScore: File, Export,
        MusicXML). Many scores on musescore.com and IMSLP download as MusicXML too. Chord symbols in the file
        show on the score. The song stays on this device.</p>
    </section>
    <p class="small">Scores: the Mutopia Project (mutopiaproject.org); tunes: the Open Hymnal Project
      (openhymnal.org), public domain. Each piece shows its license and typesetter. Suggested listening and
      full scores open on YouTube and IMSLP.</p>`;
  bindSegs(page, {
    sgShelf: v => {
      UI.shelf = v;
      go('songs');
    },
  });
  $$('[data-piece]', page).forEach(b => {
    b.onclick = () => go('songs', { pid: b.dataset.piece });
  });
  $$('[data-open]', page).forEach(b => {
    b.onclick = () => pieceSheet(b.dataset.open);
  });
  $('#sgFile', page).onchange = e => e.target.files[0] && addScore(e.target.files[0]);
};

// a MusicXML file becomes one of your songs
async function addScore(file) {
  try {
    const sc = parseMusicXML(await scoreText(file));
    const p = pieceFromScore(sc, { file: file.name });
    if (!Library.saveImports(Library.imports().concat(p))) {
      toast('Not enough room on this device for that score.');
      return;
    }
    Log.ev('score added', { n: p.n, nb: p.nb, syms: p.showSyms });
    UI.shelf = 'mine';
    go('songs');
    toast(`Added ${p.t}`);
    pieceSheet(p.id);
  } catch (e) {
    Log.warn('score not read', String((e && e.message) || e));
    toast((e && e.message) || 'Could not read that file.');
  }
}

// difficulty as five dots
const levelDots = n =>
  `<span class="lvl" title="${LEVEL_NAMES[n] || ''}">` +
  [1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('') +
  '</span>';

// the pieces on one shelf: an era's composers, oldest first, each one's pieces easiest first (or your own)
function shelfBody(era, all) {
  // a tune is listed once; its four-part setting is a switch in its panel
  const list = all.filter(p => (COMPOSERS[p.c] || {}).era === era && !(p.pair && p.id.endsWith('-4')));
  if (era === 'mine')
    return `<p class="small">Songs you added. They stay on this device.</p><div class="stack" style="gap:0">${list
      .sort((a, b) => a.t.localeCompare(b.t))
      .map(pieceRow)
      .join('')}</div>`;
  return Object.keys(COMPOSERS)
    .filter(c => list.some(p => p.c === c))
    .map(
      c => `<p class="small shelfhead"><b>${esc(COMPOSERS[c].n)}</b> · ${esc(COMPOSERS[c].life)}</p>
        <div class="stack" style="gap:0">${list
          .filter(p => p.c === c)
          .sort((a, b) => a.lvl - b.lvl || a.t.localeCompare(b.t))
          .map(pieceRow)
          .join('')}</div>`,
    )
    .join('');
}

function pieceRow(p) {
  const tag = isWorking(p.id) ? ' <span class="tag rh">learning</span>' : '';
  return `
    <button type="button" class="piecerow" data-open="${esc(p.id)}">
      <span class="grow">
        <span class="ttl">${esc(p.t)}${tag}</span>
        <span class="small">${p.sub ? esc(p.sub) + ' · ' : ''}${levelDots(p.lvl)} ${LEVEL_NAMES[p.lvl] || ''}
          · ${p.nb} bars</span>
      </span>
      <span class="chev" aria-hidden="true">›</span>
    </button>`;
}

// one square per section, colored by its stage
function sectionMap(pid) {
  const square = s => {
    const it = itemState(sectionOriginal(`p:${pid}:${s.k}`));
    const cls = s.same >= 0 && !(it && it.stage === 'done') ? 'same' : it ? it.stage : '';
    const name = `Section ${s.k + 1}${s.same >= 0 ? ` (same as ${s.same + 1})` : ''}`;
    return `<i class="${cls}" title="${name}: ${it ? STAGE_TXT[it.stage] : 'not started'}"></i>`;
  };
  return `<div class="secmap" aria-label="Sections">${Library.sections(pid).map(square).join('')}</div>`;
}

// a piece in a panel: what it is, how hard, and a way in
export function pieceSheet(pid) {
  const p = Library.get(pid);
  if (!p) return;
  const mine = p.c === 'mine';
  const secs = Library.sections(pid);
  const sig = p.keys && p.keys[0] ? p.keys[0][1] : 0;
  const major = MAJOR_KEYS.find(k => k.sig === sig);
  const minor = MINOR_KEYS.find(k => k.sig === sig);
  const keyName = major ? `${prettyKey(major.k)} major / ${prettyKey(minor.k)} minor signature` : '';
  const meter = p.ts && p.ts[0] ? `${p.ts[0][1]}/${p.ts[0][2]}` : '';
  const tune = p.c === 'tunes';
  const links = mine
    ? ''
    : tune
      ? `<a class="btn ghost" href="${listenUrl(p)}" target="_blank" rel="noopener">Listen</a>`
      : `<a class="btn ghost" href="${scoreUrl(p)}" target="_blank" rel="noopener">Score</a>
       <a class="btn ghost" href="${listenUrl(p)}" target="_blank" rel="noopener">Listen</a>`;
  const source = mine
    ? esc(p.src || '') + ' · stays on this device'
    : tune
      ? `${esc(p.lic)} · from the ${esc(p.by)} (${esc(p.src)})`
      : `Edition: ${esc(p.lic)}${p.by ? ' · typeset by ' + esc(p.by) : ''}${p.mut ? ' · ' + esc(p.mut) : ''}`;
  openSheet(
    `<div class="sheethead"><h2 class="h2">${esc(p.t)}</h2>${closeBtn}</div>
     <p class="small">${p.sub ? esc(p.sub) + ' · ' : ''}${esc((COMPOSERS[p.c] || {}).n || '')}${p.y ? ', ' + p.y : ''}</p>
     <p>${esc(p.tip || '')}</p>
     ${
       p.pair
         ? `<div class="seg" role="group" aria-label="Arrangement">${[pid, p.pair]
             .map(id => Library.get(id))
             .sort((a, b) => a.lvl - b.lvl)
             .map(
               q =>
                 `<button type="button" data-arr="${esc(q.id)}" aria-pressed="${q.id === pid}">${esc(q.sub)}</button>`,
             )
             .join('')}</div>`
         : ''
     }
     <div class="stats">
       <div class="stat"><b>${p.nb}</b><span>bars</span></div>
       <div class="stat"><b>${secs.length}</b><span>sections</span></div>
       <div class="stat"><b>♩ ${p.bpm}</b><span>target tempo</span></div>
       <div class="stat">
         <b>${LEVEL_NAMES[p.lvl] ? p.lvl + '/5' : '–'}</b><span>${esc(LEVEL_NAMES[p.lvl] || '')}</span>
       </div>
     </div>
     <p class="small">${esc(meter)}${meter && keyName ? ' · ' : ''}${esc(keyName)}</p>
     <div class="row">
       <button class="btn" type="button" id="psHear">Hear the opening</button>
       ${links}
     </div>
     <button class="btn cover big" type="button" id="psGo">${isWorking(pid) ? 'Open' : 'Learn this piece'}</button>
     ${
       p.syms && p.syms.length
         ? '<button class="btn" type="button" id="psNoodle">Noodle over its chords</button>'
         : p.mood
           ? `<button class="btn" type="button" id="psMood">Noodle in ${esc(moodName(p.mood, p.pc))}</button>`
           : ''
     }
     <p class="small">${source}</p>
     ${mine ? '<button class="btn sm ghost" type="button" id="psDel">Remove this song</button>' : ''}`,
    sheet => {
      $('#psHear', sheet).onclick = () => playOpening(p);
      $('#psGo', sheet).onclick = () => {
        startPiece(pid);
        go('songs', { pid });
      };
      $$('[data-arr]', sheet).forEach(b => {
        b.onclick = () => b.dataset.arr !== pid && setTimeout(() => pieceSheet(b.dataset.arr));
      });
      const noodle = $('#psNoodle', sheet);
      if (noodle) noodle.onclick = () => go('play', { song: pid });
      const inMood = $('#psMood', sheet);
      if (inMood) inMood.onclick = () => go('play', { mood: p.mood, pc: p.pc });
      const del = $('#psDel', sheet);
      if (del) del.onclick = () => removeImport(pid);
      return () => AudioEngine.stopAll();
    },
    { label: p.t },
  );
}

/* ---------- a piece: its sections, and the one you are playing ---------- */
function piecePage(page, pid, itemParam) {
  const P = Library.get(pid);
  startPiece(pid);
  const ids = pieceOrder(pid);
  const st = { item: ids.includes(itemParam) ? itemParam : nextItem(pid) };
  let player = null;
  onUnmount(() => player && player.destroy());
  onUnmount(() => AudioEngine.stopAll());
  page.innerHTML = `
    <section class="session">
      <div class="sess-top">
        <button class="btn sm ghost" type="button" id="sgBack">← Songs</button>
        <button class="btn sm ghost" type="button" id="sgInfo">About the piece</button>
      </div>
      <h1 class="h1 pagetitle">${esc(P.t)}</h1>
      <p class="small">${esc(P.c === 'tunes' ? P.sub : (COMPOSERS[P.c] || {}).n || '')} · ♩ ${P.bpm} · ${esc(LEVEL_NAMES[P.lvl] || '')}</p>
      <div class="sections" id="sgSecs"></div>
    </section>
    ${connectNotice()}
    <div id="sgBody"></div>
    <div class="row">
      <button class="btn sm ghost" type="button" id="sgReset">Start this section over</button>
      <button class="btn sm ghost" type="button" id="sgStop">Stop learning this piece</button>
    </div>`;
  bindConnect();
  $('#sgBack', page).onclick = () => go('songs');
  $('#sgInfo', page).onclick = () => pieceSheet(pid);
  // a section that went wrong (stuck slow, or one hand alone) can start again from wait mode; two taps
  let resetArmed = false;
  $('#sgReset', page).onclick = e => {
    if (!resetArmed) {
      resetArmed = true;
      e.target.textContent = 'Tap again to start over';
      return;
    }
    resetArmed = false;
    e.target.textContent = 'Start this section over';
    delete Store.s.items[st.item];
    Store.save();
    toast('Started over');
    mount();
  };
  $('#sgStop', page).onclick = () => {
    stopPiece(pid);
    toast('Stopped. Its progress is kept.');
    go('songs');
  };
  const paintSecs = () => {
    $('#sgSecs', page).innerHTML = ids
      .map(id => {
        const d = itemDef(id);
        const it = itemState(id);
        const label = d.kind === 'full' ? 'Whole' : String(d.k + 1);
        return `<button type="button" class="secbtn ${it ? it.stage : ''}" data-item="${id}" aria-pressed="${id === st.item}"
          title="${esc(d.sub)}: ${it ? STAGE_TXT[it.stage] : 'not started'}">${label}</button>`;
      })
      .join('');
    $$('[data-item]', page).forEach(b => {
      b.onclick = () => {
        st.item = b.dataset.item;
        mount();
      };
    });
  };
  const mount = () => {
    if (player) player.destroy();
    paintSecs();
    player = Player.mount($('#sgBody', page), {
      id: st.item,
      about: () => sectionSheet(st.item),
      onEvent: ev => {
        if (ev.type === 'rep') paintSecs();
      },
    });
  };
  mount();
}

// a section: where it stands, and its recent days
function sectionSheet(id) {
  const d = itemDef(id);
  const it = itemState(id);
  if (!d) return;
  const recent = ((it && it.log) || []).slice(-10).reverse();
  openSheet(
    `<div class="sheethead"><h2 class="h2">${esc(d.title)}</h2>${closeBtn}</div>
     <p class="small">${esc(d.sub)}</p>
     ${d.about ? `<p>${esc(d.about)}</p>` : ''}
     <p><b>${esc(STAGE_TXT[it ? it.stage : ''] || 'Not started')}</b> · ${esc(criterion(id))}</p>
     <p class="small">A section is learned in wait mode (the app waits for the right notes): each hand, then
       together, two clean runs each. Then with the metronome: two clean runs out of three raise the tempo
       about 5%, a run with wrong notes lowers it 10%, until it is at the piece's tempo. The notation is
       simplified: spacing shows timing.</p>
     ${
       recent.length
         ? `<div class="stack" style="gap:4px"><span class="eyebrow">Recent days</span>${recent
             .map(
               h => `<div class="row between small"><span>${esc(h.d)}</span>
                 <span>${h.reps} runs · ${h.clean} clean${h.bpm ? ' · best ♩ ' + h.bpm : ''}</span></div>`,
             )
             .join('')}</div>`
         : ''
     }`,
    null,
    { label: 'About this section' },
  );
}

// the first four bars (plus a pickup), at the target tempo
function playOpening(p) {
  AudioEngine.ensure();
  const bars = Library.bars(p.id);
  const end = bars[Math.min(4 + (p.pickup ? 1 : 0), bars.length - 1)];
  const spb = 60 / p.bpm;
  const t0 = AudioEngine.now() + 0.1;
  for (const n of Library.notes(p.id)) {
    if (n.t >= end) continue;
    AudioEngine.note(n.m, t0 + Math.max(0, n.t) * spb, Math.max(0.15, n.d * spb), n.h ? 0.42 : 0.55);
  }
}

function removeImport(pid) {
  Library.saveImports(Library.imports().filter(x => x.id !== pid));
  Library.forget(pid);
  stopPiece(pid);
  for (const k of Object.keys(Store.s.items)) if (k.startsWith(`p:${pid}:`)) delete Store.s.items[k];
  Store.save();
  go('songs');
  toast('Removed');
}
