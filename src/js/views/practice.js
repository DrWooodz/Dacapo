/* Practice: when you want to work on something. The core first (major and minor in every key, and the
   circle of fifths), everything else when you like. A key has three steps, in any order: its scale (right,
   left or both hands), its chords (inversions, progressions, left-hand patterns) and its arpeggios. Help is
   yours to switch: keys lit, finger numbers, a metronome, the exact octave. "Check me" is the one strict
   moment: both hands, two octaves, no help; passing it once makes the key known. */
import { Log } from '../core/log.js';
import { $, $$, esc } from '../core/util.js';
import { Store } from '../core/store.js';
import { AudioEngine } from '../core/audio.js';
import { bindSegs, go, onUnmount, seg } from '../core/ui.js';
import {
  MOOD_BY,
  MOOD_FAMILIES,
  moodChords,
  moodName,
  MOODS,
  PCS,
  plainestKey,
  tonicName,
  voiceProgression,
} from '../music/moods.js';
import { LH_PATTERNS } from '../music/moodtools.js';
import { Player } from '../learn/player.js';
import { CORE, isKnown, moodSource, prefs, runId } from '../learn/moods.js';
import { bindConnect, connectNotice } from './connect.js';
import { hearChords } from './hear.js';

const STEPS = [
  ['scale', 'Scale'],
  ['chords', 'Chords'],
  ['arps', 'Arpeggios'],
];
const HANDS = [
  ['rh', 'Right'],
  ['lh', 'Left'],
  ['ht', 'Both'],
];
// the left-hand patterns to learn first; the rest are a tap away
const CORE_LH = ['fifth', 'broken', 'block', 'oompah', 'alberti'];

export const practiceView = (page, params = {}) => {
  if (params.circle) return circlePage(page);
  if (params.mood && MOOD_BY[params.mood]) return keyPage(page, params);
  const row = id => {
    const M = MOOD_BY[id];
    const known = PCS.filter(pc => isKnown(id, pc)).length;
    return `<div class="moodrow">
      <div class="row between"><b>${esc(M.n)}</b><span class="small">${known ? `${known} of 12 known` : ''}</span></div>
      <div class="keydots">${PCS.map(
        pc =>
          `<button type="button" class="keydot ${isKnown(id, pc) ? 'solid' : ''}" data-mood="${id}" data-pc="${pc}"
             title="${esc(moodName(id, pc))}${isKnown(id, pc) ? ': known' : ''}">${esc(tonicName(id, pc))}</button>`,
      ).join('')}</div>
    </div>`;
  };
  const others = MOOD_FAMILIES.map(f => ({
    f,
    ids: MOODS.filter(m => m.fam === f.id && !CORE.includes(m.id)).map(m => m.id),
  })).filter(x => x.ids.length);
  page.innerHTML = `
    <h1 class="h1 pagetitle">Practice</h1>
    ${connectNotice()}
    <section class="card stack">
      <h2 class="h2">The core</h2>
      <p class="small">Major and minor in every key, with their chords and arpeggios: the ground everything
        else stands on. A filled key is one you have checked. Pick any.</p>
      ${CORE.map(row).join('')}
      <div class="pathcard">
        <div class="grow"><b>Around the circle of fifths</b>
          <span class="small">Every major key's home chord in turn, each the nearest shape to the last.</span></div>
        <button class="btn sm" type="button" id="prCircle">Practice</button>
      </div>
    </section>
    <section class="card stack">
      <h2 class="h2">Everything else</h2>
      <p class="small">Modes, pentatonics, blues and the exotic scales, when you want them.</p>
      ${others
        .map(
          x => `<details class="family"><summary><b>${esc(x.f.n)}</b>
            <span class="small">${x.ids.map(id => esc(MOOD_BY[id].n)).join(', ')}</span></summary>
            ${x.ids.map(row).join('')}</details>`,
        )
        .join('')}
    </section>`;
  bindConnect();
  page.addEventListener('click', e => {
    const b = e.target.closest('[data-mood][data-pc]');
    if (b) go('practice', { mood: b.dataset.mood, pc: +b.dataset.pc });
  });
  $('#prCircle', page).onclick = () => go('practice', { circle: 1 });
};

/* ---------- the help bar ---------- */
function helpBar(box, { hand, step, check, onChange, onCheck }) {
  const p = prefs();
  const chip = (id, on, label) =>
    `<button type="button" class="chip" data-help="${id}" aria-pressed="${on}">${label}</button>`;
  box.innerHTML = `<div class="helpbar">
    ${step === 'lh' ? '' : seg('prHand', HANDS, hand, 'sm')}
    ${chip('keys', p.keys, 'Keys lit')}
    ${chip('fingers', p.fingers, 'Finger numbers')}
    ${chip('exactOctave', p.exactOctave, 'Exact octave')}
    ${chip('tempo', p.tempo, p.tempo ? `Tempo ♩ ${p.bpm}` : 'Tempo')}
    ${p.tempo ? `<span class="row" style="gap:4px"><button class="btn sm ghost" type="button" data-bpm="-5" aria-label="Slower">−</button><button class="btn sm ghost" type="button" data-bpm="5" aria-label="Faster">+</button></span>` : ''}
    ${
      step === 'scale' || step === 'arps'
        ? seg(
            'prOct',
            [
              ['1', '1 octave'],
              ['2', '2 octaves'],
            ],
            String(p.octs),
            'sm',
          )
        : ''
    }
    ${check ? '<button class="btn sm cover" type="button" id="prCheck">Check me</button>' : ''}
  </div>`;
  $$('[data-help]', box).forEach(b => {
    b.onclick = () => {
      p[b.dataset.help] = !p[b.dataset.help];
      Store.save();
      onChange({});
    };
  });
  $$('[data-bpm]', box).forEach(b => {
    b.onclick = () => {
      p.bpm = Math.max(30, Math.min(160, p.bpm + +b.dataset.bpm));
      Store.save();
      onChange({});
    };
  });
  bindSegs(box, {
    prHand: v => onChange({ hand: v }),
    prOct: v => {
      p.octs = +v;
      Store.save();
      onChange({});
    },
  });
  const c = $('#prCheck', box);
  if (c) c.onclick = onCheck;
}

/* ---------- a key ---------- */
function keyPage(page, params) {
  const mood = params.mood;
  const pc = Number.isInteger(+params.pc) ? +params.pc % 12 : plainestKey(mood);
  const M = MOOD_BY[mood];
  const chords = moodChords(mood, pc);
  const st = {
    step: STEPS.some(x => x[0] === params.step) ? params.step : 'scale',
    hand: 'rh',
    check: false,
    prog: 0,
    // the chords step plays one of: a progression, a chord's inversions, a left-hand pattern
    chordWhat: 'prog',
    inv: `${chords[0].semis}.${chords[0].type}`,
    lh: 'fifth',
    arp: `${chords[0].semis}.${chords[0].type}`,
  };
  let player = null;
  const unmount = () => {
    if (player) player.destroy();
    player = null;
  };
  onUnmount(unmount);
  onUnmount(() => AudioEngine.stopAll());
  Object.assign(prefs(), { mood, pc });
  Store.save();
  Log.ev('practice open', { mood, pc });

  page.innerHTML = `
    <section class="session">
      <div class="sess-top">
        <button class="btn sm ghost" type="button" id="prBack">← Practice</button>
        <span class="small" id="prStatus"></span>
      </div>
      <div class="stack" style="gap:2px">
        <h1 class="h1 pagetitle">${esc(moodName(mood, pc))}</h1>
        <p class="small">${esc(M.feel[0].toUpperCase() + M.feel.slice(1))} ·
          <button type="button" class="linkbtn small" id="prAbout">about it</button></p>
      </div>
      <div id="prSteps"></div>
    </section>
    ${connectNotice()}
    <div id="prHelp"></div>
    <div id="prBody" style="position:relative"></div>`;
  bindConnect();
  $('#prBack', page).onclick = () => go('practice');
  $('#prAbout', page).onclick = () => go('explore', { mood, pc });

  const status = () => {
    $('#prStatus', page).innerHTML = isKnown(mood, pc)
      ? '<span class="pill ok">known</span>'
      : '<span class="small">A check makes it known</span>';
  };
  const mountDrill = (host, id) => {
    player = Player.mount(host, {
      id,
      source: moodSource(),
      about: () => go('explore', { mood, pc }),
      onEvent: ev => {
        if (ev.type === 'rep') status();
      },
    });
  };

  const chordsStep = body => {
    const what = [
      ['prog', 'Progressions'],
      ['inv', 'Inversions'],
      ['lh', 'Left-hand patterns'],
    ];
    const progs = M.progs.map((p, k) => {
      const V = voiceProgression(mood, pc, p.chords);
      return `<div class="progrow ${k === st.prog ? 'on' : ''}">
        <div class="grow"><b>${V.map(v => esc(v.info.name)).join(' – ')}</b>
          <span class="small mono">${V.map(v => esc(v.info.num)).join(' – ')}</span>
          <span class="small">${esc(p.why)}</span></div>
        <button class="btn sm ghost" type="button" data-hearp="${k}">Hear</button>
        <button class="btn sm ${k === st.prog ? 'cover' : ''}" type="button" data-prog="${k}">${st.chordWhat === 'lh' ? 'Use' : 'Play it'}</button>
      </div>`;
    });
    const chordChip = (c, attr, on) =>
      `<button type="button" class="chip" ${attr}="${c.semis}.${c.type}" aria-pressed="${on === `${c.semis}.${c.type}`}">${esc(c.name)} <span class="small">${esc(c.num)}</span></button>`;
    const coreLh = LH_PATTERNS.filter(x => CORE_LH.includes(x.id));
    const moreLh = LH_PATTERNS.filter(x => !CORE_LH.includes(x.id));
    const lhChip = x =>
      `<button type="button" class="chip" data-lh="${x.id}" aria-pressed="${x.id === st.lh}">${esc(x.n)}</button>`;
    body.innerHTML = `<div class="card stack">
        ${seg('prChordWhat', what, st.chordWhat, 'sm')}
        ${
          st.chordWhat === 'inv'
            ? `<div class="chips">${chords.map(c => chordChip(c, 'data-inv', st.inv)).join('')}</div>
               <p class="small">Root position, 1st and 2nd inversion, and back: the same chord in three
                 shapes, so you can always reach the nearest one.</p>`
            : st.chordWhat === 'lh'
              ? `<div class="chips">${coreLh.map(lhChip).join('')}</div>
                 <details class="morechords"><summary class="small">More patterns</summary>
                   <div class="chips">${moreLh.map(lhChip).join('')}</div></details>
                 <p class="small">${esc(LH_PATTERNS.find(x => x.id === st.lh).how)}</p>
                 <p class="small">Over this progression:</p>
                 <div class="stack" style="gap:6px">${progs.join('')}</div>`
              : `<div class="stack" style="gap:6px">${progs.join('')}</div>
                 <p class="small">Chords move by the nearest shape: the right hand barely moves, and the
                   left plays the roots.</p>`
        }
      </div>
      <div id="prDrill"></div>`;
    bindSegs(body, {
      prChordWhat: v => {
        st.chordWhat = v;
        draw();
      },
    });
    $$('[data-hearp]', body).forEach(b => {
      b.onclick = () => hearChords(mood, pc, M.progs[+b.dataset.hearp].chords);
    });
    $$('[data-prog]', body).forEach(b => {
      b.onclick = () => {
        st.prog = +b.dataset.prog;
        draw();
      };
    });
    $$('[data-inv]', body).forEach(b => {
      b.onclick = () => {
        st.inv = b.dataset.inv;
        draw();
      };
    });
    $$('[data-lh]', body).forEach(b => {
      b.onclick = () => {
        st.lh = b.dataset.lh;
        draw();
      };
    });
    const host = $('#prDrill', body);
    if (st.chordWhat === 'inv') mountDrill(host, runId(mood, pc, st.hand, 1, `inv${st.inv}`));
    else if (st.chordWhat === 'lh') mountDrill(host, runId(mood, pc, 'lh', 1, `lh${st.lh}.${st.prog}`));
    else mountDrill(host, runId(mood, pc, st.hand, 1, `prog${st.prog}`));
  };

  // arpeggios: the home chord, the signature chord, any chord of the scale
  const arpsStep = body => {
    const chip = c => {
      const v = `${c.semis}.${c.type}`;
      const tag = c === chords[0] ? 'home' : c.signature ? 'signature' : '';
      return `<button type="button" class="chip" data-arp="${v}" aria-pressed="${v === st.arp}">${esc(c.name)}${tag ? ` · ${tag}` : ''}</button>`;
    };
    const lead = chords.filter((c, k) => k === 0 || c.signature);
    body.innerHTML = `<div class="card stack">
        <div class="chips">${lead.map(chip).join('')}</div>
        <details class="morechords"><summary class="small">Every chord</summary>
          <div class="chips">${chords
            .filter(c => !lead.includes(c))
            .map(chip)
            .join('')}</div>
        </details>
        <p class="small">The chord's notes one at a time, up and back: the shape your left hand breaks when
          it accompanies, and your right hand's fastest way across the keys.</p>
      </div>
      <div id="prDrill"></div>`;
    $$('[data-arp]', body).forEach(b => {
      b.onclick = () => {
        st.arp = b.dataset.arp;
        draw();
      };
    });
    mountDrill($('#prDrill', body), runId(mood, pc, st.hand, prefs().octs, `arp${st.arp}`));
  };

  const paintHelp = () => {
    const box = $('#prHelp', page);
    if (st.check) {
      box.innerHTML = `<div class="notice row between"><span><b>Check:</b> both hands, two octaves, no help.
        Every note right, evenly, at your own pace.</span>
        <button class="btn sm ghost" type="button" id="prCancel">Back to practice</button></div>`;
      $('#prCancel', box).onclick = () => {
        st.check = false;
        draw();
      };
      return;
    }
    helpBar(box, {
      hand: st.hand,
      step: st.step === 'chords' && st.chordWhat === 'lh' ? 'lh' : st.step,
      check: st.step === 'scale',
      onChange: ch => {
        Object.assign(st, ch);
        draw();
      },
      onCheck: () => {
        st.check = true;
        draw();
      },
    });
  };

  const draw = () => {
    unmount();
    status();
    $('#prSteps', page).innerHTML = seg('prStep', STEPS, st.step, 'wrap');
    bindSegs($('#prSteps', page), {
      prStep: v => {
        st.step = v;
        st.check = false;
        draw();
      },
    });
    paintHelp();
    const body = $('#prBody', page);
    if (st.step === 'chords') return chordsStep(body);
    if (st.step === 'arps') return arpsStep(body);
    mountDrill(body, st.check ? runId(mood, pc, 'ht', 2, 'check') : runId(mood, pc, st.hand, prefs().octs));
  };
  draw();
}

/* ---------- around the circle ---------- */
function circlePage(page) {
  const st = { hand: 'rh' };
  let player = null;
  onUnmount(() => player && player.destroy());
  page.innerHTML = `
    <section class="session">
      <div class="sess-top"><button class="btn sm ghost" type="button" id="prBack">← Practice</button></div>
      <h1 class="h1 pagetitle">Around the circle of fifths</h1>
      <p class="small">C, G, D … F and home: each major key's home chord, a fifth up each time, in the shape
        nearest the last. Say each key's name as you play it, and you learn the circle with your hands.</p>
    </section>
    ${connectNotice()}
    <div id="prHelp"></div>
    <div id="prBody"></div>`;
  bindConnect();
  $('#prBack', page).onclick = () => go('practice');
  const draw = () => {
    if (player) player.destroy();
    helpBar($('#prHelp', page), {
      hand: st.hand,
      step: 'circle',
      onChange: ch => {
        Object.assign(st, ch);
        draw();
      },
    });
    player = Player.mount($('#prBody', page), {
      id: runId('major', 0, st.hand, 1, 'circle'),
      source: moodSource(),
      about: () => go('explore', { tab: 'circle' }),
    });
  };
  draw();
}
