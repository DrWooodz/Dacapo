/* A sitting with one mood in one key: hear it, run it with each hand and together, improvise in it.
   You move between the steps freely. Help is yours to switch: keys lit on the keyboard, finger numbers,
   and tempo (a metronome, off unless you want it). "Check me" is the one strict moment: both hands, two
   octaves, no help. */
import { Log } from '../core/log.js';
import { $, $$, esc } from '../core/util.js';
import { Store } from '../core/store.js';
import { AudioEngine } from '../core/audio.js';
import { bindSegs, closeBtn, go, onUnmount, openSheet, seg } from '../core/ui.js';
import { midiOf } from '../music/theory.js';
import { kbSVG, staffSVG } from '../music/render.js';
import {
  blackKey,
  MOOD_BY,
  MOOD_FAMILIES,
  moodFingering,
  moodName,
  moodRun,
  moodScale,
} from '../music/moods.js';
import { Player } from '../learn/player.js';
import {
  CHECK_DAYS,
  COMFORT_RUNS,
  keyState,
  keyStatus,
  moodOwned,
  moodSource,
  prefs,
  runId,
  sitting,
  STATUS_WORD,
} from '../learn/moods.js';
import { MoodPlay } from '../learn/moodplay.js';
import { bindConnect, connectNotice } from './practice.js';

const STEPS = [
  ['listen', 'Listen'],
  ['rh', 'Right'],
  ['lh', 'Left'],
  ['ht', 'Both'],
  ['play', 'Improvise'],
];

export const moodView = (page, params) => {
  const mood = MOOD_BY[params.mood] ? params.mood : 'natural';
  const pc = Number.isInteger(+params.pc) ? +params.pc % 12 : 0;
  const M = MOOD_BY[mood];
  const st = { step: params.step || 'listen', check: false };
  let player = null;
  let play = null;
  const unmount = () => {
    if (player) player.destroy();
    if (play) play.destroy();
    player = play = null;
  };
  onUnmount(unmount);
  sitting(mood, pc); // you met it
  Store.s.moods.prefs.mood = mood;
  Store.save();
  Log.ev('mood open', { mood, pc });

  page.innerHTML = `
    <section class="session">
      <div class="sess-top">
        <button class="btn sm ghost" type="button" id="mdBack">← Home</button>
        <span class="small" id="mdStatus"></span>
      </div>
      <div class="stack" style="gap:2px">
        <h1 class="h1 pagetitle">${esc(moodName(mood, pc))}</h1>
        <p class="small">${esc(M.feel[0].toUpperCase() + M.feel.slice(1))} · think ${esc(M.hear)}</p>
      </div>
      <div id="mdSteps"></div>
    </section>
    ${connectNotice()}
    <div id="mdHelp"></div>
    <div id="mdBody" style="position:relative"></div>`;
  bindConnect();
  $('#mdBack', page).onclick = () => go('home');

  const status = () => {
    const k = keyState(mood, pc) || { clean: { rh: 0, lh: 0 }, checks: [] };
    const s = keyStatus(mood, pc);
    const n = h => Math.min(COMFORT_RUNS, k.clean[h] || 0);
    $('#mdStatus', page).innerHTML =
      `<span class="pill ${s === 'solid' ? 'ok' : s === 'comfortable' ? 'brass' : ''}">${STATUS_WORD[s]}</span> ` +
      (s === 'solid'
        ? ''
        : s === 'comfortable'
          ? `checks ${new Set(k.checks).size} of ${CHECK_DAYS} days`
          : `clean runs: right ${n('rh')}/${COMFORT_RUNS}, left ${n('lh')}/${COMFORT_RUNS}`);
  };

  // the help switches: keys lit, finger numbers, tempo; and how many octaves
  const paintHelp = () => {
    const box = $('#mdHelp', page);
    const p = prefs();
    if (!['rh', 'lh', 'ht'].includes(st.step)) {
      box.innerHTML = '';
      return;
    }
    if (st.check) {
      box.innerHTML = `<div class="notice row between"><span><b>Check:</b> both hands, two octaves, no help.
        Every note right, evenly, at your own pace.</span>
        <button class="btn sm ghost" type="button" id="mdCancel">Back to practice</button></div>`;
      $('#mdCancel', box).onclick = () => {
        st.check = false;
        draw();
      };
      return;
    }
    const chip = (id, on, label) =>
      `<button type="button" class="chip" data-help="${id}" aria-pressed="${on}">${label}</button>`;
    box.innerHTML = `<div class="helpbar">
      ${chip('keys', p.keys, 'Keys lit')}
      ${chip('fingers', p.fingers, 'Finger numbers')}
      ${chip('tempo', p.tempo, p.tempo ? `Tempo ♩ ${p.bpm}` : 'Tempo')}
      ${p.tempo ? `<span class="row" style="gap:4px"><button class="btn sm ghost" type="button" data-bpm="-5" aria-label="Slower">−</button><button class="btn sm ghost" type="button" data-bpm="5" aria-label="Faster">+</button></span>` : ''}
      ${seg(
        'mdOct',
        [
          ['1', '1 octave'],
          ['2', '2 octaves'],
        ],
        String(p.octs),
        'sm',
      )}
      <button class="btn sm cover" type="button" id="mdCheck">Check me</button>
    </div>`;
    $$('[data-help]', box).forEach(b => {
      b.onclick = () => {
        p[b.dataset.help] = !p[b.dataset.help];
        Store.save();
        draw();
      };
    });
    $$('[data-bpm]', box).forEach(b => {
      b.onclick = () => {
        p.bpm = Math.max(30, Math.min(160, p.bpm + +b.dataset.bpm));
        Store.save();
        draw();
      };
    });
    bindSegs(box, {
      mdOct: v => {
        p.octs = +v;
        Store.save();
        draw();
      },
    });
    $('#mdCheck', box).onclick = () => {
      st.check = true;
      st.step = 'ht';
      draw();
    };
  };

  const listen = body => {
    const run = moodRun(mood, pc, 'rh', 1);
    const up = run.steps.slice(0, Math.ceil(run.steps.length / 2));
    const staff = staffSVG({
      clef: 'treble',
      sig: run.sig,
      items: up.map(s => ({ notes: s.notes })),
      spacing: 34,
      top: 36,
      bottom: 36,
    });
    const marks = {};
    const fr = moodFingering(mood, pc, 'rh', 1);
    up.forEach((s, i) => (marks[s.midis[0]] = { cls: 'rh', f: fr[i] }));
    const owned = moodOwned(mood);
    body.innerHTML = `<div class="card stack">
      <div class="staffwrap"><div style="max-width:520px;margin:0 auto">${staff.svg}</div></div>
      <div class="kbwrap scrollx">${kbSVG({ from: up[0].midis[0] - 3, to: up[up.length - 1].midis[0] + 3, marks, h: 92, interactive: false })}</div>
      <div class="row">
        <button class="btn" type="button" id="mdHearScale">Hear the scale</button>
        <button class="btn" type="button" id="mdHearMood">Hear the mood</button>
      </div>
      <p>${esc(M.how)}</p>
      <p class="small">${blackKey(mood, pc) ? 'A black-key one: the hand sits further in, over the black keys. ' : ''}${
        owned
          ? `${esc(M.n)} is yours: solid in three keys.`
          : `${esc(M.n)} becomes yours when three keys are solid, one of them a black-key one.`
      }</p>
      <p class="small">Then run it with each hand, together, and improvise in it: the steps above, in any order.</p>
    </div>`;
    $('#mdHearScale', body).onclick = () => {
      AudioEngine.ensure();
      AudioEngine.seq(
        run.steps.map(s => s.midis[0]),
        0.32,
        0.6,
        0.55,
      );
    };
    $('#mdHearMood', body).onclick = () => hearMood();
  };

  // the mood's chords, with the scale drifting over them
  const hearMood = () => {
    AudioEngine.ensure();
    AudioEngine.stopAll();
    const tonic = midiOf(moodScale(mood, pc)[0]);
    const T = {
      maj: [0, 4, 7],
      min: [0, 3, 7],
      dim: [0, 3, 6],
      aug: [0, 4, 8],
      dom7: [0, 4, 7, 10],
      dim7: [0, 3, 6, 9],
    };
    const scale = moodScale(mood, pc).map(midiOf);
    const t0 = AudioEngine.now() + 0.1;
    const bar = 2.2;
    M.chords.forEach(([s, type], i) => {
      const r = 40 + ((tonic + s - 40 + 120) % 12);
      AudioEngine.note(r - 12, t0 + i * bar, bar, 0.45);
      AudioEngine.chord(
        T[type].slice(0, 3).map(x => r + 12 + x),
        t0 + i * bar,
        bar,
        0.25,
      );
      // a few scale notes above, stepping toward a chord tone
      [0, 1, 2].forEach(j => {
        const m = scale[(i * 2 + j * 2) % scale.length] + 12;
        AudioEngine.note(m, t0 + i * bar + j * (bar / 3), bar / 3, 0.4);
      });
    });
  };

  const draw = () => {
    unmount();
    status();
    $('#mdSteps', page).innerHTML = seg('mdStep', STEPS, st.step, 'wrap');
    bindSegs($('#mdSteps', page), {
      mdStep: v => {
        st.step = v;
        st.check = false;
        draw();
      },
    });
    paintHelp();
    const body = $('#mdBody', page);
    if (st.step === 'listen') return listen(body);
    if (st.step === 'play') {
      play = MoodPlay.mount(body, { mood, pc });
      return;
    }
    const octs = st.check ? 2 : prefs().octs;
    player = Player.mount(body, {
      id: runId(mood, pc, st.step, octs, st.check),
      source: moodSource({ onAbout: () => aboutMood(mood) }),
      onEvent: ev => {
        if (ev.type === 'rep') status();
      },
    });
  };
  draw();
};

// the mood, explained: what it is, what it sounds like, where you know it from
export function aboutMood(mood) {
  const M = MOOD_BY[mood];
  const fam = MOOD_FAMILIES.find(f => f.id === M.fam);
  openSheet(
    `<div class="sheethead"><h2 class="h2">${esc(M.n)}</h2>${closeBtn}</div>
     <p><b>${esc(fam.n)}:</b> ${esc(M.feel)}.</p>
     <p>${esc(M.how)}</p>
     <p class="small">Where you have heard it: ${esc(M.hear)}.</p>
     <p class="small">Moods are conventions of Western music and film, not physics: trust your own ear.
       On a modern piano every key of a mood sounds the same apart from how high it is; the keys train
       your hands.</p>`,
    null,
    { label: M.n },
  );
}
