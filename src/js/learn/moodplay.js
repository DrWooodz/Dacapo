/* Improvising in a mood: the scale lit on the keyboard, a backing (a drone, or the mood's chords), and a
   left-hand pattern to try. DaCapo listens: how much you played, how much of it was in the scale, what
   the left hand did (block chords, broken chords, roots and fifths) and how long the pedal was down. That
   is saved with the sitting and becomes the suggestions on Home. Nothing here is scored. */
import { Log } from '../core/log.js';
import { $, $$, esc, fmtTime } from '../core/util.js';
import { Store } from '../core/store.js';
import { AudioEngine } from '../core/audio.js';
import { Input } from '../core/input.js';
import { bindSegs, seg } from '../core/ui.js';
import { midiOf, nameOf, spellerFor } from '../music/theory.js';
import { flashKey, kbSVG } from '../music/render.js';
import { MOOD_BY, moodScale } from '../music/moods.js';
import { recordImprovising } from './moods.js';

const TYPE = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  dom7: [0, 4, 7, 10],
  dim7: [0, 3, 6, 9],
};
const SUFFIX = { maj: '', min: 'm', dim: '°', aug: '+', dom7: '7', dim7: '°7' };

// left-hand patterns: what to play, as chord tones above the root (fifth = 7), with fingers
const LH_PATTERNS = {
  fifth: { n: 'Root and fifth', how: 'Root and fifth together on beat 1, held. Simple and strong.' },
  broken: {
    n: 'Broken chord',
    how: 'Root, fifth, octave, fifth, one note per beat: the left hand keeps moving.',
  },
  block: { n: 'Chord on the beat', how: 'The whole chord on beats 1 and 3. Lift between them.' },
  oompah: {
    n: 'Bass and chord',
    how: 'Root alone on 1, the chord above it on 2, 3 and 4 (or 2 and 3 in a waltz).',
  },
};
const PATTERN_IDS = Object.keys(LH_PATTERNS);

// the notes of a pattern for one chord, low in the left hand: [{m, f}]
function patternNotes(pattern, root, type) {
  const r = 40 + ((root - 40 + 120) % 12); // root between E2 and D♯3
  const t = TYPE[type] || TYPE.maj;
  const fifth = t[2];
  if (pattern === 'fifth')
    return [
      { m: r, f: 5 },
      { m: r + fifth, f: 1 },
    ];
  if (pattern === 'broken')
    return [
      { m: r, f: 5 },
      { m: r + fifth, f: 2 },
      { m: r + 12, f: 1 },
    ];
  if (pattern === 'block') return t.slice(0, 3).map((s, i) => ({ m: r + s, f: [5, 3, 1][i] }));
  return [{ m: r - 12, f: 5 }, ...t.slice(0, 3).map((s, i) => ({ m: r + s, f: [4, 2, 1][i] }))];
}

export const MoodPlay = {
  mount(root, { mood, pc }) {
    const M = MOOD_BY[mood];
    const scale = moodScale(mood, pc);
    const scalePcs = new Set(scale.map(n => ((midiOf(n) % 12) + 12) % 12));
    const sp = spellerFor(0);
    const chordName = ([s, type]) => {
      const n = scale.find(x => (midiOf(x) - midiOf(scale[0]) + 120) % 12 === s);
      return (n ? nameOf(n, false) : nameOf(sp(midiOf(scale[0]) + s), false)) + SUFFIX[type];
    };
    // this sitting's left-hand pattern: a different one each time, unless you choose
    const sits = Store.s.moods.sittings.filter(x => x.imp && x.imp.pattern);
    const lastPattern = sits.length ? sits[sits.length - 1].imp.pattern : null;
    const st = {
      pattern: PATTERN_IDS[(PATTERN_IDS.indexOf(lastPattern) + 1) % PATTERN_IDS.length],
      backing: 'drone',
      bpm: 72,
      chord: 0,
      timer: 0,
      tick: 0,
      nextBar: 0,
      bar: 0,
    };
    const S = { ms: 0, notes: 0, inScale: 0, pedalMs: 0, lh: { n: 0, chords: 0, broken: 0, rootFifth: 0 } };
    let saved = JSON.parse(JSON.stringify(S));
    let lastNote = 0;
    let lastTick = performance.now();
    let lhGroup = null;

    root.innerHTML = `
      <div class="card stack">
        <div class="row between"><h2 class="h2">Improvise</h2><span class="small mono" id="mpTime"></span></div>
        <p class="small">The lit keys are the scale: play anything with them. Nothing here is scored;
          DaCapo only listens, to suggest what to try next.</p>
        <div class="stack" style="gap:6px">
          <span class="eyebrow">Backing</span>
          <div id="mpBack"></div>
          <div class="improv-chords" id="mpChords">${M.chords.map((c, i) => `<span class="chip" data-c="${i}">${esc(chordName(c))}</span>`).join('')}</div>
        </div>
        <div class="stack" style="gap:6px">
          <span class="eyebrow">Left hand</span>
          <div id="mpPat"></div>
          <p class="small" id="mpHow"></p>
        </div>
        <div class="kbwrap scrollx"><div id="mpKb" class="widekb"></div></div>
        <p class="small" id="mpInfo">Start playing whenever you like.</p>
      </div>`;

    const current = () => (st.backing === 'chords' ? M.chords[st.chord] : M.chords[0]);
    const paintKb = () => {
      const [s, type] = current();
      const marks = {};
      for (let m = 36; m <= 84; m++) if (scalePcs.has(m % 12)) marks[m] = { cls: 'rh' };
      patternNotes(st.pattern, midiOf(scale[0]) + s, type).forEach(n => (marks[n.m] = { cls: 'lh', f: n.f }));
      $('#mpKb', root).innerHTML = kbSVG({ from: 28, to: 84, marks, h: 110, interactive: false });
    };
    const paintControls = () => {
      $('#mpBack', root).innerHTML = seg(
        'mpBacking',
        [
          ['off', 'Off'],
          ['drone', 'Drone'],
          ['chords', `Chords ♩ ${st.bpm}`],
        ],
        st.backing,
        'sm',
      );
      $('#mpPat', root).innerHTML = seg(
        'mpPattern',
        PATTERN_IDS.map(id => [id, LH_PATTERNS[id].n]),
        st.pattern,
        'sm wrap',
      );
      $('#mpHow', root).textContent = LH_PATTERNS[st.pattern].how;
      $$('#mpChords [data-c]', root).forEach((el, i) =>
        el.setAttribute('aria-pressed', String(st.backing === 'chords' && i === st.chord)),
      );
      bindSegs(root, {
        mpBacking: v => {
          st.backing = v;
          restartBacking();
          paintControls();
          paintKb();
        },
        mpPattern: v => {
          st.pattern = v;
          paintControls();
          paintKb();
        },
      });
    };

    /* ---------- the backing ---------- */
    const tonic = midiOf(scale[0]);
    const playBar = (t, [s, type]) => {
      const spb = 60 / st.bpm;
      const r = 40 + ((tonic + s - 40 + 120) % 12);
      AudioEngine.note(r - 12, t, spb * 3.8, 0.4);
      AudioEngine.chord(
        (TYPE[type] || TYPE.maj).slice(0, 3).map(x => r + 12 + x),
        t,
        spb * 3.8,
        0.22,
      );
    };
    const schedule = () => {
      if (st.backing === 'off') return;
      const now = AudioEngine.now();
      if (st.backing === 'drone') {
        // the tonic and fifth, low and quiet, renewed before they fade
        if (now + 0.3 >= st.nextBar) {
          const r = 40 + ((tonic - 40 + 120) % 12);
          AudioEngine.chord([r - 12, r - 5, r], Math.max(now, st.nextBar), 7, 0.28);
          st.nextBar = Math.max(now, st.nextBar) + 6;
        }
        return;
      }
      const bar = (60 / st.bpm) * 4;
      while (st.nextBar < now + 0.3) {
        const i = st.bar % M.chords.length;
        playBar(Math.max(now, st.nextBar), M.chords[i]);
        const at = st.nextBar;
        setTimeout(
          () => {
            st.chord = i;
            paintControls();
            paintKb();
          },
          Math.max(0, (at - now) * 1000),
        );
        st.nextBar = Math.max(now, st.nextBar) + bar;
        st.bar++;
      }
    };
    const restartBacking = () => {
      AudioEngine.stopAll();
      st.nextBar = AudioEngine.now() + 0.1;
      st.bar = 0;
      st.chord = 0;
      if (st.backing !== 'off') AudioEngine.ensure();
    };

    /* ---------- listening ---------- */
    const onNote = ev => {
      if (ev.m == null) return;
      const now = performance.now();
      lastNote = now;
      S.notes++;
      if (scalePcs.has(ev.m % 12)) S.inScale++;
      flashKey($('#mpKb svg', root), ev.m, scalePcs.has(ev.m % 12) ? 'down' : 'bad', 260);
      if (ev.m < 60) {
        // left-hand notes struck together (within 60 ms) are one chord
        if (lhGroup && now - lhGroup.t < 60) lhGroup.ms.push(ev.m);
        else {
          if (lhGroup) countLh(lhGroup);
          lhGroup = { t: now, ms: [ev.m] };
        }
      }
    };
    const countLh = g => {
      const [s, type] = current();
      const r = (tonic + s) % 12;
      const tones = new Set((TYPE[type] || TYPE.maj).map(x => (r + x) % 12));
      S.lh.n++;
      if (g.ms.length >= 2) S.lh.chords++;
      else {
        const p = g.ms[0] % 12;
        if (p === r || p === (r + (TYPE[type] || TYPE.maj)[2]) % 12) S.lh.rootFifth++;
        else if (tones.has(p)) S.lh.broken++;
      }
    };
    const offs = [Input.on(onNote)];
    const save = () => {
      if (lhGroup) {
        countLh(lhGroup);
        lhGroup = null;
      }
      const d = {
        ms: S.ms - saved.ms,
        notes: S.notes - saved.notes,
        inScale: S.inScale - saved.inScale,
        pedalMs: S.pedalMs - saved.pedalMs,
        lh: Object.fromEntries(Object.keys(S.lh).map(k => [k, S.lh[k] - saved.lh[k]])),
        pattern: st.pattern,
      };
      if (d.notes > 0) recordImprovising(mood, pc, d);
      saved = JSON.parse(JSON.stringify(S));
    };
    const info = () => {
      const lh = S.lh;
      const lhWord = !lh.n
        ? 'left hand: not yet'
        : lh.chords > lh.n * 0.5
          ? 'left hand: mostly chords'
          : lh.rootFifth > lh.n * 0.6
            ? 'left hand: mostly roots and fifths'
            : lh.broken > lh.n * 0.3
              ? 'left hand: moving through the chords'
              : 'left hand: free';
      $('#mpTime', root).textContent = S.ms > 1000 ? fmtTime(S.ms / 1000) : '';
      if (S.notes)
        $('#mpInfo', root).textContent =
          `${S.notes} notes · ${Math.round((S.inScale / S.notes) * 100)}% in the scale · ${lhWord}`;
    };
    st.tick = setInterval(
      Log.guard('moodplay tick', () => {
        const now = performance.now();
        const dt = now - lastTick;
        lastTick = now;
        // time counts while you play (a note in the last four seconds)
        if (now - lastNote < 4000) {
          S.ms += dt;
          if (Input.pedal) S.pedalMs += dt;
        }
        schedule();
        info();
      }),
      100,
    );
    st.timer = setInterval(save, 20000);
    paintControls();
    paintKb();
    restartBacking();
    Log.ev('moodplay start', { mood, pc, pattern: st.pattern });
    return {
      stats: () => S,
      destroy() {
        clearInterval(st.tick);
        clearInterval(st.timer);
        save();
        offs.forEach(f => f());
        AudioEngine.stopAll();
        Log.ev('moodplay stop', { mood, pc, ms: Math.round(S.ms), notes: S.notes });
      },
    };
  },
};
