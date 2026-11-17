/* A sitting with one mood in one key: hear it, run the scale (each hand, or together), learn its chords
   and progressions, its arpeggios, and improvise in it. You move between the steps freely. Help is yours to switch: keys lit on the keyboard, finger numbers,
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
  moodChords,
  moodFingering,
  moodName,
  moodRun,
  moodScale,
  voiceProgression,
} from '../music/moods.js';
import { colorNote } from '../music/moodtools.js';
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
  ['scale', 'Scale'],
  ['chords', 'Chords'],
  ['arps', 'Arpeggios'],
  ['play', 'Improvise'],
];
const HANDS = [
  ['rh', 'Right'],
  ['lh', 'Left'],
  ['ht', 'Both'],
];

export const moodView = (page, params) => {
  const mood = MOOD_BY[params.mood] ? params.mood : 'natural';
  const pc = Number.isInteger(+params.pc) ? +params.pc % 12 : 0;
  const M = MOOD_BY[mood];
  const chords = moodChords(mood, pc);
  // (an older link may name a hand as the step)
  const handStep = ['rh', 'lh', 'ht'].includes(params.step);
  const st = {
    step: handStep ? 'scale' : STEPS.some(x => x[0] === params.step) ? params.step : 'listen',
    hand: handStep ? params.step : 'rh',
    check: false,
    prog: 0,
    arp: chords[0].semis + '.' + chords[0].type,
  };
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

  // the help switches (keys lit, finger numbers, tempo), the hand, and the octaves where they apply
  const paintHelp = () => {
    const box = $('#mdHelp', page);
    const p = prefs();
    if (!['scale', 'chords', 'arps'].includes(st.step)) {
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
      ${seg('mdHand', HANDS, st.hand, 'sm')}
      ${chip('keys', p.keys, 'Keys lit')}
      ${chip('fingers', p.fingers, 'Finger numbers')}
      ${chip('tempo', p.tempo, p.tempo ? `Tempo ♩ ${p.bpm}` : 'Tempo')}
      ${p.tempo ? `<span class="row" style="gap:4px"><button class="btn sm ghost" type="button" data-bpm="-5" aria-label="Slower">−</button><button class="btn sm ghost" type="button" data-bpm="5" aria-label="Faster">+</button></span>` : ''}
      ${
        st.step === 'chords'
          ? ''
          : seg(
              'mdOct',
              [
                ['1', '1 octave'],
                ['2', '2 octaves'],
              ],
              String(p.octs),
              'sm',
            )
      }
      ${st.step === 'scale' ? '<button class="btn sm cover" type="button" id="mdCheck">Check me</button>' : ''}
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
      mdHand: v => {
        st.hand = v;
        draw();
      },
      mdOct: v => {
        p.octs = +v;
        Store.save();
        draw();
      },
    });
    const check = $('#mdCheck', box);
    if (check)
      check.onclick = () => {
        st.check = true;
        draw();
      };
  };

  /* ---------- sound ---------- */
  // chords, voiced so each moves as little as possible from the last, with the root below
  const hearChords = (list, { bar = 1.8, melody = false } = {}) => {
    AudioEngine.ensure();
    AudioEngine.stopAll();
    const V = voiceProgression(mood, pc, list);
    const scale = moodScale(mood, pc).map(midiOf);
    const t0 = AudioEngine.now() + 0.1;
    V.forEach((v, i) => {
      const t = t0 + i * bar;
      AudioEngine.note(v.root, t, bar, 0.45);
      AudioEngine.chord(v.right, t, bar, 0.28);
      // a few scale notes above, stepping toward a chord tone
      if (melody)
        [0, 1, 2].forEach(j =>
          AudioEngine.note(scale[(i * 2 + j * 2) % scale.length] + 12, t + j * (bar / 3), bar / 3, 0.4),
        );
    });
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
    const color = colorNote(mood, pc);
    const owned = moodOwned(mood);
    body.innerHTML = `<div class="card stack">
      <div class="staffwrap"><div style="max-width:520px;margin:0 auto">${staff.svg}</div></div>
      <div class="kbwrap scrollx">${kbSVG({ from: up[0].midis[0] - 3, to: up[up.length - 1].midis[0] + 3, marks, h: 92, interactive: false })}</div>
      <div class="row">
        <button class="btn" type="button" id="mdHearScale">Hear the scale</button>
        <button class="btn" type="button" id="mdHearMood">Hear the mood</button>
      </div>
      <p>${esc(M.how)}</p>
      <p><b>Color note: ${esc(color.name)}</b>, ${esc(color.what)}: ${esc(color.tip)}.</p>
      <p class="small">${blackKey(mood, pc) ? 'A black-key one: the hand sits further in, over the black keys. ' : ''}${
        owned
          ? `${esc(M.n)} is yours: solid in three keys.`
          : `${esc(M.n)} becomes yours when three keys are solid, one of them a black-key one.`
      }</p>
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
    $('#mdHearMood', body).onclick = () => hearChords(M.progs[0].chords, { bar: 2.2, melody: true });
  };

  const mountDrill = (host, id) => {
    player = Player.mount(host, {
      id,
      source: moodSource({ onAbout: () => aboutMood(mood) }),
      onEvent: ev => {
        if (ev.type === 'rep') status();
      },
    });
  };

  // the chords the scale makes, and the progressions that make the mood
  const chordsStep = body => {
    const P = M.parent ? MOOD_BY[M.parent] : null;
    const row = (c, k) => `<tr class="${c.signature ? 'sig' : ''}">
        <td class="mono">${esc(c.num)}</td>
        <td><b>${esc(c.name)}</b>${c.signature ? ' <span class="pill brass">signature</span>' : ''}
          <span class="small">${esc(c.word)}</span></td>
        <td class="small">${c.notes.map(noteLabel).join(' ')}</td>
        <td class="small">${c.seventh ? esc(c.seventh.name) : ''}</td>
        <td><button class="btn sm ghost" type="button" data-hearc="${k}" aria-label="Hear ${esc(c.name)}">Hear</button></td>
      </tr>`;
    const progs = M.progs.map((p, k) => {
      const V = voiceProgression(mood, pc, p.chords);
      return `<div class="progrow ${k === st.prog ? 'on' : ''}">
        <div class="grow"><b>${V.map(v => esc(v.info.name)).join(' – ')}</b>
          <span class="small mono">${V.map(v => esc(v.info.num)).join(' – ')}</span>
          <span class="small">${esc(p.why)}</span></div>
        <button class="btn sm ghost" type="button" data-hearp="${k}">Hear</button>
        <button class="btn sm ${k === st.prog ? 'cover' : ''}" type="button" data-prog="${k}">Play it</button>
      </div>`;
    });
    body.innerHTML = `<div class="card stack">
        <h2 class="h2">Chords of ${esc(moodName(mood, pc))}</h2>
        ${P ? `<p class="small">These are the chords of ${esc(P.n.toLowerCase())}, the scale ${esc(M.n.toLowerCase())} comes from: the pentatonic leaves out the notes most likely to clash, so it fits over nearly all of them.</p>` : ''}
        <div class="scrollx"><table class="chordtable"><thead><tr><th></th><th>Chord</th><th>Notes</th><th>With 7th</th><th></th></tr></thead><tbody>${chords.map(row).join('')}</tbody></table></div>
        <h3 class="h3">Progressions</h3>
        <div class="stack" style="gap:6px">${progs.join('')}</div>
        <p class="small">Chords move by their nearest shape: the right hand barely moves, and the left plays the roots.</p>
      </div>
      <div id="mdDrill"></div>`;
    $$('[data-hearc]', body).forEach(b => {
      b.onclick = () => {
        const c = chords[+b.dataset.hearc];
        hearChords([[c.semis, c.type]], { bar: 1.6 });
      };
    });
    $$('[data-hearp]', body).forEach(b => {
      b.onclick = () => hearChords(M.progs[+b.dataset.hearp].chords);
    });
    $$('[data-prog]', body).forEach(b => {
      b.onclick = () => {
        st.prog = +b.dataset.prog;
        draw();
      };
    });
    mountDrill($('#mdDrill', body), runId(mood, pc, st.hand, 1, `prog${st.prog}`));
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
        <div class="row" style="gap:6px;flex-wrap:wrap">${lead.map(chip).join('')}
          <details class="morechords"><summary class="small">Every chord</summary>
            <div class="row" style="gap:6px;flex-wrap:wrap">${chords
              .filter(c => !lead.includes(c))
              .map(chip)
              .join('')}</div>
          </details></div>
        <p class="small">The chord's notes one at a time, up and back. The same shape your left hand breaks
          when it accompanies, and your right hand's fastest way across the keys.</p>
      </div>
      <div id="mdDrill"></div>`;
    $$('[data-arp]', body).forEach(b => {
      b.onclick = () => {
        st.arp = b.dataset.arp;
        draw();
      };
    });
    mountDrill($('#mdDrill', body), runId(mood, pc, st.hand, prefs().octs, `arp${st.arp}`));
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
    if (st.step === 'chords') return chordsStep(body);
    if (st.step === 'arps') return arpsStep(body);
    if (st.step === 'play') {
      play = MoodPlay.mount(body, { mood, pc });
      return;
    }
    mountDrill(body, st.check ? runId(mood, pc, 'ht', 2, 'check') : runId(mood, pc, st.hand, prefs().octs));
  };
  draw();
};

const noteLabel = n => esc('CDEFGAB'[n.l] + (n.a > 0 ? '♯'.repeat(n.a) : n.a < 0 ? '♭'.repeat(-n.a) : ''));

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
