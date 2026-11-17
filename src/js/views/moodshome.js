/* Home on the Moods path: where you left off and what to play next, what DaCapo noticed in your playing,
   every mood and key you can learn (browsed by mood, by hand shape or by neighbor), and your trajectory.
   Tapping a key opens a sitting with it. */
import { $, esc, todayKey } from '../core/util.js';
import { Store } from '../core/store.js';
import { bindSegs, go, seg } from '../core/ui.js';
import { midiOf } from '../music/theory.js';
import {
  CIRCLE,
  handShapes,
  MOOD_BY,
  MOOD_FAMILIES,
  moodName,
  MOODS,
  moodScale,
  PCS,
  tonicName,
} from '../music/moods.js';
import { addDays } from '../learn/curriculum.js';
import {
  insights,
  keyStatus,
  lastSitting,
  moodCounts,
  moodOwned,
  prefs,
  STATUS_WORD,
  suggestNext,
  trajectory,
} from '../learn/moods.js';
import { aboutMood } from './mood.js';
import { progressSheet } from './skills.js';

const ago = d => {
  const n = Math.round((new Date(todayKey() + 'T12:00') - new Date(d + 'T12:00')) / 864e5);
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
};

// one key of a mood as a tappable dot: its tonic, colored by where you are with it
const keyDot = (mood, pc, label = tonicName(mood, pc)) => {
  const s = keyStatus(mood, pc);
  return `<button type="button" class="keydot ${s}" data-mood="${mood}" data-pc="${pc}"
    title="${esc(moodName(mood, pc))}: ${STATUS_WORD[s]}">${esc(label)}</button>`;
};

/* ---------- pick up ---------- */
function pickupCard() {
  const last = lastSitting();
  const next = suggestNext();
  const N = MOOD_BY[next.mood];
  // what you did last time: a line of its own, or part of the suggestion when it is the same key
  const did = last
    ? (() => {
        const runs = Object.values(last.runs || {}).reduce((a, b) => a + b, 0);
        const imp = last.imp ? Math.round(last.imp.ms / 60000) : 0;
        const parts = [runs && `${runs} run${runs > 1 ? 's' : ''}`, imp && `${imp} min improvising`].filter(
          Boolean,
        );
        return `${parts.length ? parts.join(' · ') : 'listened'} · ${STATUS_WORD[keyStatus(last.mood, last.pc)]}`;
      })()
    : '';
  const same = last && last.mood === next.mood && last.pc === next.pc;
  const lastLine =
    last && !same
      ? `<button type="button" class="lastline" data-mood="${last.mood}" data-pc="${last.pc}">
          <span class="small">Last time · ${ago(last.d)}</span>
          <b>${esc(moodName(last.mood, last.pc))}</b>
          <span class="small">${did}</span>
        </button>`
      : '';
  return `<section class="card pickup">
    ${lastLine}
    <div class="stack" style="gap:4px">
      <span class="eyebrow">${same ? `Last time · ${ago(last.d)}` : last ? 'Next' : 'Start here'}</span>
      <h2 class="h2">${esc(moodName(next.mood, next.pc))}</h2>
      <p class="small">${same ? `${esc(did)}. ` : ''}${esc(next.why)} Think ${esc(N.hear)}.</p>
    </div>
    <button class="btn cover big" type="button" data-mood="${next.mood}" data-pc="${next.pc}">${same ? 'Continue' : 'Start'}</button>
    <p class="small">Or tap any key below.</p>
  </section>`;
}

function insightsCard() {
  const list = insights();
  if (!list.length) return '';
  return `<section class="card">
    <h2 class="h2">From your playing</h2>
    <div class="stack" style="gap:6px">${list
      .map(
        i =>
          `<p class="insight">${esc(i.text)}${i.mood ? ` <button class="linkbtn small" type="button" data-mood="${i.mood}" data-pc="${i.pc}">Open it</button>` : ''}</p>`,
      )
      .join('')}</div>
  </section>`;
}

/* ---------- the map ---------- */
function byMood(openMood) {
  return MOOD_FAMILIES.map(f => {
    const moods = MOODS.filter(m => m.fam === f.id);
    const row = m => {
      const c = moodCounts(m.id);
      return `<div class="moodrow">
        <div class="row between">
          <button type="button" class="linkbtn moodname" data-about="${m.id}"><b>${esc(m.n)}</b></button>
          <span class="small">${moodOwned(m.id) ? '<span class="pill ok">yours</span> ' : ''}${c.solid ? `${c.solid} solid` : c.met + c.comfortable ? `${c.met + c.comfortable} met` : ''}</span>
        </div>
        <span class="small">${esc(m.feel)}</span>
        <div class="keydots">${PCS.map(pc => keyDot(m.id, pc)).join('')}</div>
      </div>`;
    };
    const open = moods.some(m => m.id === openMood);
    return `<details class="family" ${open ? 'open' : ''}>
      <summary><b>${esc(f.n)}</b> <span class="small">${moods.map(m => m.n).join(', ')}</span></summary>
      ${moods.map(row).join('')}
    </details>`;
  }).join('');
}

function moodPicker(mood) {
  return `<label class="field">Mood<select class="input sm" id="mhMood">${MOODS.map(
    m => `<option value="${m.id}" ${m.id === mood ? 'selected' : ''}>${esc(m.n)}</option>`,
  ).join('')}</select></label>`;
}

function byShape(mood) {
  const groups = handShapes(mood);
  return `${moodPicker(mood)}
    <p class="small">Keys whose right hand uses the same fingers. Learn one, and the others in its group
      come quickly.</p>
    ${groups
      .map(
        g => `<div class="shape">
          <span class="small mono">Right hand ${g.fingers.split('').join(' ')}</span>
          <div class="keydots">${g.pcs.map(pc => keyDot(mood, pc)).join('')}</div>
        </div>`,
      )
      .join('')}`;
}

function byNeighbor(mood) {
  const pcsOf = pc => new Set(moodScale(mood, pc).map(n => ((midiOf(n) % 12) + 12) % 12));
  const changes = CIRCLE.map((pc, i) => {
    if (!i) return '';
    const before = pcsOf(CIRCLE[i - 1]);
    const added = moodScale(mood, pc).filter(n => !before.has(((midiOf(n) % 12) + 12) % 12));
    return added.map(n => 'CDEFGAB'[n.l] + (n.a > 0 ? '♯' : n.a < 0 ? '♭' : '')).join(' ');
  });
  return `${moodPicker(mood)}
    <p class="small">Around the circle of fifths: each key is one note different from the one before
      (shown under it). The easiest way to hear what a single note changes.</p>
    <div class="circle">${CIRCLE.map(
      (pc, i) =>
        `<div class="cstep">${keyDot(mood, pc)}<span class="small mono">${i ? '+' + esc(changes[i]) : 'start'}</span></div>`,
    ).join('')}</div>`;
}

function mapCard(openMood) {
  const p = prefs();
  const way = p.browse || 'mood';
  const mood = p.mood && MOOD_BY[p.mood] ? p.mood : openMood;
  return `<section class="card" id="mhMap">
    <div class="row between"><h2 class="h2">Moods</h2>
      <span class="small legend"><i class="keydot met"></i>met <i class="keydot comfortable"></i>comfortable <i class="keydot solid"></i>solid</span></div>
    ${seg(
      'mhWay',
      [
        ['mood', 'By mood'],
        ['shape', 'By hand shape'],
        ['neighbor', 'By neighbor'],
      ],
      way,
    )}
    <div id="mhWayBody">${way === 'shape' ? byShape(mood) : way === 'neighbor' ? byNeighbor(mood) : byMood(openMood)}</div>
  </section>`;
}

/* ---------- trajectory ---------- */
function trajectoryCard() {
  if (!Store.s.moods.sittings.length && !Object.keys(Store.s.moods.keys).length)
    return `<section class="card"><b class="h2">Your trajectory</b>
      <p class="small">After a few sittings, this shows the keys you have made solid, the moods that are
        yours, and how much you played each week.</p></section>`;
  const weeks = trajectory(12);
  const max = Math.max(30, ...weeks.map(w => w.min));
  const solid = weeks[weeks.length - 1].solid;
  const owned = MOODS.filter(m => moodOwned(m.id)).length;
  const sittings = Store.s.moods.sittings.filter(s => s.d > addDays(todayKey(), -28)).length;
  return `<button type="button" class="card trajcard" id="mhTraj">
    <div class="row between"><b class="h2">Your trajectory</b><span class="small">history ›</span></div>
    <div class="stats">
      <div class="stat"><b>${solid}</b><span>keys solid</span></div>
      <div class="stat"><b>${owned}</b><span>moods yours</span></div>
      <div class="stat"><b>${sittings}</b><span>sittings in 4 weeks</span></div>
    </div>
    <div class="minibars wide" aria-label="Minutes played per week, last 12 weeks">${weeks
      .map(
        w =>
          `<i class="${w.min < 1 ? 'zero' : ''}" style="height:${Math.max(3, (w.min / max) * 40)}px" title="Week to ${w.end}: ${w.min} min"></i>`,
      )
      .join('')}</div>
    <span class="small">Minutes per week, last 12 weeks</span>
  </button>`;
}

function courseCard() {
  return `<section class="card pathcard">
    <div class="grow"><b>Also in DaCapo: the full course</b>
      <span class="small">Daily sessions across note reading, sight-reading, technique, theory, pieces and
        improvising, with spaced reviews.</span></div>
    <button class="btn sm" type="button" id="mhCourse">Switch to the full course</button>
  </section>`;
}

export function moodsHome(page, head) {
  const next = suggestNext();
  page.innerHTML = `<div id="mhRoot" class="stack" style="gap:16px">
    ${head}
    <div class="homegrid">
      <div class="stack" style="gap:16px">${pickupCard()}${insightsCard()}${trajectoryCard()}</div>
      <div class="stack" style="gap:16px">${mapCard(next.mood)}${courseCard()}</div>
    </div></div>`;
  // (the listener goes on this render's own root, so it is never added twice)
  const root = $('#mhRoot', page);
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-mood][data-pc]');
    if (b) go('mood', { mood: b.dataset.mood, pc: +b.dataset.pc });
    const a = e.target.closest('[data-about]');
    if (a) aboutMood(a.dataset.about);
  });
  bindSegs(root, {
    mhWay: v => {
      prefs().browse = v;
      Store.save();
      $('#mhWayBody', page).innerHTML =
        v === 'shape'
          ? byShape(prefs().mood || next.mood)
          : v === 'neighbor'
            ? byNeighbor(prefs().mood || next.mood)
            : byMood(next.mood);
      bindPicker();
    },
  });
  const bindPicker = () => {
    const sel = $('#mhMood', page);
    if (sel)
      sel.onchange = () => {
        prefs().mood = sel.value;
        Store.save();
        const v = prefs().browse;
        $('#mhWayBody', page).innerHTML = v === 'shape' ? byShape(sel.value) : byNeighbor(sel.value);
        bindPicker();
      };
  };
  bindPicker();
  const traj = $('#mhTraj', page);
  if (traj) traj.onclick = progressSheet;
  $('#mhCourse', page).onclick = () => {
    Store.s.path = 'course';
    Store.save();
    go('home');
  };
}
