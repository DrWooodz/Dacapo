/* Explore: look and listen, with nothing recorded. Find a mood by the feel you are after, see how keys fit
   together on the circle of fifths, train the ear, and see the whole of what there is to learn. A mood's
   page has everything about it: how it sounds, its scale and fingering, its color note, its chords and
   progressions, and its neighbors (one note different). From there: noodle in it, or practice it. */
import { $, $$, esc } from '../core/util.js';
import { Store } from '../core/store.js';
import { AudioEngine } from '../core/audio.js';
import { bindSegs, closeBtn, go, onUnmount, openSheet, seg, UI } from '../core/ui.js';
import { kbSVG, staffSVG } from '../music/render.js';
import {
  blackKey,
  CIRCLE,
  circleRun,
  MOOD_BY,
  MOOD_FAMILIES,
  moodChords,
  moodFingering,
  moodName,
  moodNeighbors,
  moodRelatives,
  moodRun,
  MOODS,
  moodSig,
  PCS,
  plainestKey,
  tonicName,
  voiceProgression,
} from '../music/moods.js';
import { colorNote, earRound } from '../music/moodtools.js';
import { prefs } from '../learn/moods.js';
import { hearChords, hearPhrase, hearScale } from './hear.js';
import { drawEcho } from './echo.js';

const TABS = [
  ['feel', 'By feel'],
  ['circle', 'Circle of fifths'],
  ['ear', 'Ear'],
  ['map', 'The map'],
];

export const exploreView = (page, params = {}) => {
  if (params.mood && MOOD_BY[params.mood]) return moodPage(page, params.mood, params.pc);
  const tab = TABS.some(t => t[0] === params.tab) ? params.tab : UI.exploreTab || 'feel';
  UI.exploreTab = tab;
  page.innerHTML = `
    <h1 class="h1 pagetitle">Explore</h1>
    ${seg('exTab', TABS, tab, 'wrap')}
    <div id="exBody" class="stack" style="gap:16px"></div>`;
  bindSegs(page, { exTab: v => go('explore', { tab: v }) });
  const body = $('#exBody', page);
  const off = { feel: feelTab, circle: circleTab, ear: earTab, map: mapTab }[tab](body, params);
  if (typeof off === 'function') onUnmount(off);
  onUnmount(() => AudioEngine.stopAll());
};

/* ---------- by feel ---------- */
const VIBES = [
  'brooding',
  'tragic',
  'melancholy',
  'yearning',
  'ominous',
  'haunting',
  'tension',
  'twisting',
  'noir',
  'mystical',
  'fiery',
  'dreamy',
  'bittersweet',
  'hopeful',
  'gritty',
  'wondrous',
  'triumphant',
  'peaceful',
];

// how well a mood fits the words you typed: each word that one of its vibes, its feel or its name starts
// with (or contains, for longer words)
function score(M, words) {
  const hay = [
    ...M.vibes,
    ...M.feel.split(/[\s,;]+/),
    M.n.toLowerCase(),
    MOOD_FAMILIES.find(f => f.id === M.fam).n.toLowerCase(),
  ];
  return words.reduce(
    (a, w) => a + (hay.some(h => h.startsWith(w) || (w.length >= 4 && h.includes(w))) ? 1 : 0),
    0,
  );
}

// the words for a mood's feel that its description does not already say
const vibesBeyond = M => M.vibes.filter(v => !M.feel.toLowerCase().includes(v));

function moodCard(M) {
  return `<div class="moodcard">
    <div class="grow">
      <b>${esc(M.n)}</b>
      <span class="small">${esc(M.feel)}</span>
      <span class="small vibes">${vibesBeyond(M).slice(0, 5).map(esc).join(' · ')}</span>
    </div>
    <button class="btn sm ghost" type="button" data-hear="${M.id}" aria-label="Hear ${esc(M.n)}">▶ Hear</button>
    <button class="btn sm" type="button" data-open="${M.id}">Open</button>
  </div>`;
}

function feelTab(body) {
  const q = UI.exploreQuery || '';
  body.innerHTML = `
    <section class="card stack">
      <label class="field">What do you want to sound like?
        <input class="input" id="exQ" type="search" value="${esc(q)}" placeholder="brooding, tragic, eerie, triumphant…" autocomplete="off">
      </label>
      <div class="chips">${VIBES.map(v => `<button type="button" class="chip" data-vibe="${v}" aria-pressed="${q.split(/\s+/).includes(v)}">${v}</button>`).join('')}</div>
    </section>
    <div id="exList" class="stack" style="gap:16px"></div>`;
  const list = $('#exList', body);
  const paint = () => {
    const words = (UI.exploreQuery || '')
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);
    if (!words.length) {
      list.innerHTML = MOOD_FAMILIES.map(
        f => `<section class="card"><h2 class="h2">${esc(f.n)}</h2>
          <div class="stack" style="gap:0">${MOODS.filter(m => m.fam === f.id)
            .map(moodCard)
            .join('')}</div></section>`,
      ).join('');
      return;
    }
    const ranked = MOODS.map(M => ({ M, s: score(M, words) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s);
    list.innerHTML = ranked.length
      ? `<section class="card"><div class="stack" style="gap:0">${ranked.map(x => moodCard(x.M)).join('')}</div></section>`
      : `<section class="card"><p class="small">No mood matches those words. Try one of the feels above,
          or a word like dark, sad, tense, dreamy, exotic or bright.</p></section>`;
  };
  const setQ = v => {
    UI.exploreQuery = v;
    $$('[data-vibe]', body).forEach(b =>
      b.setAttribute('aria-pressed', String(v.split(/\s+/).includes(b.dataset.vibe))),
    );
    paint();
  };
  $('#exQ', body).oninput = e => setQ(e.target.value);
  $$('[data-vibe]', body).forEach(b => {
    b.onclick = () => {
      const words = (UI.exploreQuery || '').split(/\s+/).filter(Boolean);
      const v = b.dataset.vibe;
      const next = words.includes(v) ? words.filter(w => w !== v) : [...words, v];
      $('#exQ', body).value = next.join(' ');
      setQ(next.join(' '));
    };
  });
  body.addEventListener('click', e => {
    const h = e.target.closest('[data-hear]');
    if (h) hearPhrase(h.dataset.hear, plainestKey(h.dataset.hear));
    const o = e.target.closest('[data-open]');
    if (o) go('explore', { mood: o.dataset.open });
  });
  paint();
}

/* ---------- a mood ---------- */
const noteLabel = n => esc('CDEFGAB'[n.l] + (n.a > 0 ? '♯'.repeat(n.a) : n.a < 0 ? '♭'.repeat(-n.a) : ''));

function moodPage(page, mood, pcParam) {
  const M = MOOD_BY[mood];
  const p = prefs();
  const pc =
    Number.isInteger(+pcParam) && pcParam !== '' && pcParam != null
      ? +pcParam % 12
      : p.mood === mood && p.pc != null
        ? p.pc
        : plainestKey(mood);
  const fam = MOOD_FAMILIES.find(f => f.id === M.fam);
  const run = moodRun(mood, pc, 'rh', 1);
  const up = run.steps.slice(0, Math.ceil(run.steps.length / 2));
  const fr = moodFingering(mood, pc, 'rh', 1);
  const marks = {};
  up.forEach((s, i) => (marks[s.midis[0]] = { cls: 'rh', f: fr[i] }));
  const color = colorNote(mood, pc);
  marks[up.find(s => ((s.midis[0] % 12) + 12) % 12 === color.pc).midis[0]].cls = 'color';
  const staff = staffSVG({
    clef: 'treble',
    sig: run.sig,
    items: up.map(s => ({ notes: s.notes })),
    spacing: 34,
    top: 36,
    bottom: 36,
  });
  const chords = moodChords(mood, pc);
  const P = M.parent ? MOOD_BY[M.parent] : null;
  const neighbors = moodNeighbors(mood);
  const relatives = moodRelatives(mood).filter(r => MOOD_BY[r.id].semis.length >= 5);
  const chordRow = (c, k) => `<tr class="${c.signature ? 'sig' : ''}">
      <td class="mono">${esc(c.num)}</td>
      <td><b>${esc(c.name)}</b>${c.signature ? ' <span class="pill brass">signature</span>' : ''}
        <span class="small">${esc(c.word)}</span></td>
      <td class="small">${c.notes.map(noteLabel).join(' ')}</td>
      <td class="small">${c.seventh ? esc(c.seventh.name) : ''}</td>
      <td><button class="btn sm ghost" type="button" data-hearc="${k}" aria-label="Hear ${esc(c.name)}">Hear</button></td>
    </tr>`;
  const progRow = (pr, k) => {
    const V = voiceProgression(mood, pc, pr.chords);
    return `<div class="progrow">
      <div class="grow"><b>${V.map(v => esc(v.info.name)).join(' – ')}</b>
        <span class="small mono">${V.map(v => esc(v.info.num)).join(' – ')}</span>
        <span class="small">${esc(pr.why)}</span></div>
      <button class="btn sm ghost" type="button" data-hearp="${k}">Hear</button>
    </div>`;
  };
  page.innerHTML = `
    <section class="session">
      <div class="sess-top">
        <button class="btn sm ghost" type="button" id="mpBack">← Explore</button>
        <span class="pill">${esc(fam.n)}</span>
      </div>
      <div class="stack" style="gap:2px">
        <h1 class="h1 pagetitle">${esc(moodName(mood, pc))}</h1>
        <p class="small">${esc(M.feel[0].toUpperCase() + M.feel.slice(1))}${vibesBeyond(M).length ? ' · ' + vibesBeyond(M).map(esc).join(' · ') : ''}</p>
      </div>
      <div class="keychips" aria-label="Key">${PCS.map(
        x =>
          `<button type="button" class="chip" data-pc="${x}" aria-pressed="${x === pc}">${esc(tonicName(mood, x))}</button>`,
      ).join('')}</div>
      <div class="row">
        <button class="btn cover" type="button" id="mpPlay">Noodle in this</button>
        <button class="btn" type="button" id="mpPractice">Practice this</button>
      </div>
    </section>
    <section class="card stack">
      <h2 class="h2">The sound</h2>
      <div class="row">
        <button class="btn" type="button" id="mpHearMood">Hear the mood</button>
        <button class="btn" type="button" id="mpHearScale">Hear the scale</button>
      </div>
      <p>${esc(M.how)}</p>
      <p><b>Color note: ${esc(color.name)}</b>, ${esc(color.what)}: ${esc(color.tip)}.</p>
      <p class="small">Where you have heard it: ${esc(M.hear)}.</p>
    </section>
    <section class="card stack">
      <h2 class="h2">The scale</h2>
      <div class="staffwrap"><div style="max-width:520px;margin:0 auto">${staff.svg}</div></div>
      <div class="kbwrap scrollx">${kbSVG({ from: up[0].midis[0] - 3, to: up[up.length - 1].midis[0] + 3, marks, h: 92, interactive: false })}</div>
      <p class="small">Right-hand fingering shown; the color note is marked.${blackKey(mood, pc) ? ' A black-key one: the hand sits further in, over the black keys.' : ''}</p>
    </section>
    <section class="card stack">
      <h2 class="h2">Chords</h2>
      ${P ? `<p class="small">These are the chords of ${esc(P.n.toLowerCase())}, the scale ${esc(M.n.toLowerCase())} comes from: the pentatonic leaves out the notes most likely to clash, so it fits over nearly all of them.</p>` : ''}
      <div class="scrollx"><table class="chordtable"><thead><tr><th></th><th>Chord</th><th>Notes</th><th>With 7th</th><th></th></tr></thead><tbody>${chords.map(chordRow).join('')}</tbody></table></div>
      <h3 class="h3">Progressions</h3>
      <div class="stack" style="gap:6px">${M.progs.map(progRow).join('')}</div>
    </section>
    ${
      neighbors.length || relatives.length
        ? `<section class="card stack">
      <h2 class="h2">Neighbors</h2>
      ${
        neighbors.length
          ? `<p class="small">One note different, the same home: the quickest way to hear what a single note does.</p>
        <div class="stack" style="gap:0">${neighbors
          .map(
            n => `<div class="moodcard"><div class="grow"><b>${esc(MOOD_BY[n.id].n)}</b>
              <span class="small">${esc(n.change[0].toUpperCase() + n.change.slice(1))} · ${esc(MOOD_BY[n.id].feel)}</span></div>
              <button class="btn sm ghost" type="button" data-hearn="${n.id}">▶ Hear</button>
              <button class="btn sm" type="button" data-go="${n.id}" data-gopc="${pc}">Open</button></div>`,
          )
          .join('')}</div>`
          : ''
      }
      ${
        relatives.length
          ? `<p class="small">The same notes from another home: change which note feels like home, and the mood changes.</p>
        <div class="stack" style="gap:0">${relatives
          .map(r => {
            const rpc = (pc + r.semis) % 12;
            return `<div class="moodcard"><div class="grow"><b>${esc(moodName(r.id, rpc))}</b>
              <span class="small">${esc(MOOD_BY[r.id].feel)}</span></div>
              <button class="btn sm ghost" type="button" data-hearr="${r.id}" data-rpc="${rpc}">▶ Hear</button>
              <button class="btn sm" type="button" data-go="${r.id}" data-gopc="${rpc}">Open</button></div>`;
          })
          .join('')}</div>`
          : ''
      }
    </section>`
        : ''
    }
    <p class="small">Moods are conventions of Western music and film, not physics: trust your own ear. On a
      piano every key of a mood sounds the same apart from how high it is; the keys train your hands.</p>`;
  $('#mpBack', page).onclick = () => go('explore');
  $('#mpPlay', page).onclick = () => go('play', { mood, pc });
  $('#mpPractice', page).onclick = () => go('practice', { mood, pc });
  $('#mpHearMood', page).onclick = () => hearChords(mood, pc, M.progs[0].chords, { bar: 2.2, melody: true });
  $('#mpHearScale', page).onclick = () => hearScale(mood, pc);
  page.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (d.pc != null && t.closest('.keychips')) go('explore', { mood, pc: +d.pc });
    else if (d.hearc != null) {
      const c = chords[+d.hearc];
      hearChords(mood, pc, [[c.semis, c.type]], { bar: 1.6 });
    } else if (d.hearp != null) hearChords(mood, pc, M.progs[+d.hearp].chords);
    else if (d.hearn) hearPhrase(d.hearn, pc);
    else if (d.hearr) hearPhrase(d.hearr, +d.rpc);
    else if (d.go) go('explore', { mood: d.go, pc: +d.gopc });
  });
  onUnmount(() => AudioEngine.stopAll());
  // remembered for Play and Practice
  Object.assign(p, { mood, pc });
  Store.save();
}

/* ---------- the circle of fifths ---------- */
const SHARPS = 'F C G D A E B'.split(' ');
const FLATS = 'B E A D G C F'.split(' ');
const sigWords = sig =>
  !sig
    ? 'no sharps or flats'
    : sig > 0
      ? `${sig} sharp${sig > 1 ? 's' : ''} (${SHARPS.slice(0, sig).join('♯ ')}♯)`
      : `${-sig} flat${sig < -1 ? 's' : ''} (${FLATS.slice(0, -sig).join('♭ ')}♭)`;
const minorOf = pc => (pc + 9) % 12;

function circleSVG(sel) {
  const cx = 160;
  const cy = 160;
  const arc = (r0, r1, a0, a1) => {
    const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = p(r1, a0);
    const [x1, y1] = p(r1, a1);
    const [x2, y2] = p(r0, a1);
    const [x3, y3] = p(r0, a0);
    return `M${x0} ${y0}A${r1} ${r1} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 0 0 ${x3} ${y3}Z`;
  };
  const i0 = CIRCLE.indexOf(sel);
  const near = new Set([(i0 + 11) % 12, (i0 + 1) % 12]); // IV and V beside I
  let s = '';
  CIRCLE.forEach((pc, i) => {
    const a = ((i * 30 - 90 - 15) * Math.PI) / 180;
    const b = ((i * 30 - 90 + 15) * Math.PI) / 180;
    const mid = (i * 30 - 90) * (Math.PI / 180);
    const cls = i === i0 ? 'sel' : near.has(i) ? 'near' : '';
    const t = (r, text, k) =>
      `<text x="${cx + r * Math.cos(mid)}" y="${cy + r * Math.sin(mid) + 5}" text-anchor="middle" class="${k}">${text}</text>`;
    const sig = moodSig('major', pc);
    const maj = pc === 6 ? 'F♯/G♭' : tonicName('major', pc);
    s += `<g class="wedge ${cls}" data-cpc="${pc}" role="button" aria-label="${esc(maj)} major">
      <path d="${arc(108, 152, a, b)}" class="outer"/>
      <path d="${arc(64, 106, a, b)}" class="inner"/>
      ${t(134, esc(maj), pc === 6 ? 'nm sm' : 'nm')}
      ${t(116, sig ? Math.abs(sig) + (sig > 0 ? '♯' : '♭') : '', 'sg')}
      ${t(85, esc(tonicName('natural', minorOf(pc))) + 'm', 'mn')}
    </g>`;
  });
  return `<svg class="cof" viewBox="0 0 320 320" aria-label="The circle of fifths">${s}
    <text x="160" y="156" text-anchor="middle" class="ctr">major outside</text>
    <text x="160" y="172" text-anchor="middle" class="ctr">minor inside</text></svg>`;
}

function circleTab(body) {
  const sel = UI.circlePc != null ? UI.circlePc : 0;
  const i = CIRCLE.indexOf(sel);
  const IV = CIRCLE[(i + 11) % 12];
  const V = CIRCLE[(i + 1) % 12];
  const name = pc => tonicName('major', pc);
  const minor = pc => tonicName('natural', minorOf(pc));
  const m = pc => minor(pc) + 'm';
  body.innerHTML = `
    <section class="card stack">
      <div class="cofwrap">${circleSVG(sel)}</div>
      <div class="stack" style="gap:6px">
        <h2 class="h2">${esc(name(sel))} major · ${esc(minor(sel))} minor</h2>
        <p>${esc(sigWords(moodSig('major', sel)))}. ${esc(minor(sel))} minor is its relative: the same notes, home on the 6th.</p>
        <p class="small">Its family: ${esc(name(IV))} (IV) and ${esc(name(V))} (V) beside it, ${esc(m(IV))} (ii),
          ${esc(m(V))} (iii) and ${esc(m(sel))} (vi) inside them. Those six chords, plus one diminished chord,
          are every chord of ${esc(name(sel))} major.</p>
        <div class="row">
          <button class="btn sm" type="button" data-prog="0,maj 5,maj 7,maj 0,maj">Hear I – IV – V – I</button>
          <button class="btn sm" type="button" data-prog="9,min 2,min 7,maj 0,maj">Hear vi – ii – V – I</button>
          <button class="btn sm ghost" type="button" id="cfAround">Hear the circle</button>
        </div>
        <div class="row">
          <button class="btn sm" type="button" data-go="major">Explore ${esc(name(sel))} major</button>
          <button class="btn sm" type="button" data-go="natural">Explore ${esc(minor(sel))} minor</button>
          <button class="btn sm cover" type="button" id="cfPractice">Practice the circle</button>
        </div>
      </div>
    </section>
    <section class="card stack">
      <h2 class="h2">How it works</h2>
      <p>Each step clockwise is a fifth up and adds one sharp: the new sharp is the 7th note of the new key
        (G major adds F♯). Each step the other way adds a flat. So a key's signature is just how far round it is.</p>
      <p>Neighbors share all but one note, so moving to a neighboring key sounds smooth, and the chords
        beside a key (IV and V) are its strongest. V to I, one step counter-clockwise, is the strongest pull
        in Western music.</p>
      <p>Progressions often walk the circle home: vi – ii – V – I is three steps counter-clockwise. Inside,
        each minor key sits under its relative major.</p>
    </section>`;
  body.querySelector('.cof').addEventListener('click', e => {
    const w = e.target.closest('[data-cpc]');
    if (!w) return;
    UI.circlePc = +w.dataset.cpc;
    circleTab(body);
  });
  $$('[data-prog]', body).forEach(b => {
    b.onclick = () =>
      hearChords(
        'major',
        sel,
        b.dataset.prog.split(' ').map(x => {
          const [s, t] = x.split(',');
          return [+s, t];
        }),
      );
  });
  $('#cfAround', body).onclick = () => {
    AudioEngine.ensure();
    AudioEngine.stopAll();
    const t0 = AudioEngine.now() + 0.1;
    circleRun('ht').steps.forEach((st, k) => AudioEngine.chord(st.midis, t0 + k * 0.9, 0.9, 0.3));
  };
  $$('[data-go]', body).forEach(b => {
    b.onclick = () =>
      go('explore', { mood: b.dataset.go, pc: b.dataset.go === 'natural' ? minorOf(sel) : sel });
  });
  $('#cfPractice', body).onclick = () => go('practice', { circle: 1 });
}

/* ---------- ear ---------- */
function earTab(body) {
  body.innerHTML = `<section class="card pathcard">
      <div class="grow"><b>Which mood?</b>
        <span class="small" id="exEarScore"></span>
        <span class="small">Hear a phrase, name its mood, and learn the note that gave it away.</span></div>
      <button class="btn" type="button" id="exEar">Listen</button>
    </section>
    <div id="exEcho"></div>`;
  const e = Store.s.moods.ear;
  $('#exEarScore', body).textContent = e.n ? `${e.right} of ${e.n} right so far.` : '';
  $('#exEar', body).onclick = earSheet;
  return drawEcho($('#exEcho', body));
}

function earSheet() {
  const e = Store.s.moods.ear;
  let round = null;
  let answered = false;
  const next = () => {
    round = earRound(e.by);
    answered = false;
    paint();
    hearPhrase(round.mood, round.pc);
  };
  const paint = () => {
    const body = $('#earBody');
    if (!body) return;
    body.innerHTML = `
      <div class="row"><button class="btn" type="button" id="earAgain">Hear it again</button>
        <span class="small">${e.n ? `${e.right} of ${e.n} right` : ''}</span></div>
      <div class="earopts">${round.options
        .map(id => `<button class="btn" type="button" data-ear="${id}">${esc(MOOD_BY[id].n)}</button>`)
        .join('')}</div>
      <p id="earSay" class="small"></p>`;
    $('#earAgain', body).onclick = () => hearPhrase(round.mood, round.pc);
    $$('[data-ear]', body).forEach(b => {
      b.onclick = () => {
        if (answered) return;
        answered = true;
        const right = b.dataset.ear === round.mood;
        const R = MOOD_BY[round.mood];
        const c = colorNote(round.mood, round.pc);
        e.n++;
        if (right) e.right++;
        const by = e.by[round.mood] || [0, 0];
        e.by[round.mood] = [by[0] + 1, by[1] + (right ? 1 : 0)];
        Store.save();
        b.classList.add(right ? 'ok' : 'bad');
        body.querySelector(`[data-ear="${round.mood}"]`).classList.add('ok');
        $('#earSay', body).innerHTML =
          `${right ? 'Yes' : 'No'}: ${esc(moodName(round.mood, round.pc))}, ${esc(R.feel)}.
          The giveaway is ${esc(c.what)} (${esc(c.name)}), held near the end.
          <button class="btn sm cover" type="button" id="earNext">Next</button>`;
        $('#earNext', body).onclick = next;
      };
    });
  };
  openSheet(
    `<div class="sheethead"><h2 class="h2">Which mood?</h2>${closeBtn}</div>
     <p class="small">The mood's chords with its scale rising over them, then its color note and home.</p>
     <div id="earBody" class="stack"></div>`,
    () => {
      next();
      return () => AudioEngine.stopAll();
    },
    { label: 'Which mood?' },
  );
}

/* ---------- the map: what there is to learn ---------- */
const MAP = [
  [
    'core',
    'Keys and the circle of fifths',
    'How every key relates: signatures, relative minors, the chords of a key.',
    'Explore › Circle of fifths',
    ['explore', { tab: 'circle' }],
  ],
  [
    'core',
    'Major and minor scales in every key',
    'Natural and harmonic minor too, with fingering: the ground every other skill stands on.',
    'Practice',
    ['practice', {}],
  ],
  [
    'core',
    'Chords, inversions and voice leading',
    'The chords a scale makes, their inversions, and moving between them by the nearest shape.',
    'Practice › a key › Chords',
    ['practice', {}],
  ],
  [
    'core',
    'Common progressions',
    'Two or three per mood, with why they work.',
    'Explore › a mood',
    ['explore', {}],
  ],
  [
    'core',
    'Left-hand accompaniment',
    'Ten patterns, from root and fifth to Alberti, open tenths and walking bass.',
    'Play › Try something; Practice › Chords',
    ['play', {}],
  ],
  [
    'core',
    'Making a melody',
    'Color notes, chord tones on strong beats, motif and sequence, call and response.',
    'Play › Try something',
    ['play', {}],
  ],
  [
    'core',
    'Ear',
    'Hearing a mood, and playing back what you hear.',
    'Explore › Ear',
    ['explore', { tab: 'ear' }],
  ],
  ['core', 'Repertoire', 'Pieces to learn section by section, and to aim for.', 'Songs', ['songs', {}]],
  [
    'more',
    'Modes and other scales',
    'Dorian to Locrian, the pentatonics and blues, exotic and symmetric scales.',
    'Explore › By feel',
    ['explore', {}],
  ],
  [
    'more',
    'Technique and the body',
    'Posture, arm weight, thumb crossings; advice when a habit shows in your playing.',
    'Settings › Body and hands',
    null,
  ],
  [
    'beyond',
    'Rhythm and groove',
    'Swing, syncopation, grooves. Not in DaCapo yet: play along with records you love, and with the metronome.',
    '',
    null,
  ],
  [
    'beyond',
    'Reading notation fluently',
    'Every drill here is written on the staff, so reading grows as you play; dedicated sight-reading is not part of DaCapo.',
    '',
    null,
  ],
];

function mapTab(body) {
  const group = (k, title, note) => `<section class="card stack">
    <h2 class="h2">${title}</h2>${note ? `<p class="small">${note}</p>` : ''}
    <div class="stack" style="gap:0">${MAP.filter(x => x[0] === k)
      .map(
        ([, t, about, where, to], i) => `<div class="maprow">
          <div class="grow"><b>${esc(t)}</b><span class="small">${esc(about)}</span>
            ${where ? `<span class="small mono">${esc(where)}</span>` : ''}</div>
          ${to ? `<button class="btn sm" type="button" data-map="${k}:${i}">Go</button>` : ''}
        </div>`,
      )
      .join('')}</div></section>`;
  body.innerHTML =
    group(
      'core',
      'The core',
      'What gives the most for the time: learn these first, a few keys deeply rather than everything at once.',
    ) +
    group('more', 'When you want more') +
    group('beyond', 'Beyond DaCapo');
  $$('[data-map]', body).forEach(b => {
    b.onclick = () => {
      const [k, i] = b.dataset.map.split(':');
      const [view, params] = MAP.filter(x => x[0] === k)[+i][4];
      go(view, params);
    };
  });
}
