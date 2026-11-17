/* Improvising in a mood: the scale lit on the keyboard, a backing (a held drone, or one of the mood's
   progressions), an idea for the right hand and a pattern for the left. DaCapo listens and says what it
   heard: how much was in the scale, whether the color note came and resolved, chord tones on the strong
   beats, motifs that came back, what the left hand did against its pattern, how long the pedal was down.
   That is saved with the sitting and becomes the suggestions on Home. Nothing here is scored. */
import { Log } from '../core/log.js';
import { $, $$, esc, fmtTime } from '../core/util.js';
import { Store } from '../core/store.js';
import { AudioEngine } from '../core/audio.js';
import { Input } from '../core/input.js';
import { bindSegs, seg } from '../core/ui.js';
import { midiOf } from '../music/theory.js';
import { flashKey, kbSVG } from '../music/render.js';
import {
  callPhrase,
  colorNote,
  degreeOf,
  dyadKind,
  judgeAnswer,
  LH_BY,
  LH_KINDS,
  LH_PATTERNS,
  lhKind,
  lhVoicing,
  motifEcho,
  patternBar,
  pc12,
  RH_TOOLS,
  toolHow,
} from '../music/moodtools.js';
import { CHORD_TONES, MOOD_BY, moodScale, roman, voiceProgression } from '../music/moods.js';
import { Sounds } from '../music/sounds.js';
import { recordImprovising } from './moods.js';

const SPLIT = 60; // below middle C is the left hand
const TOGETHER = 50; // ms: notes this close are one gesture (a chord, a dyad)
const blankStats = () => ({
  ms: 0,
  notes: 0,
  inScale: 0,
  pedalMs: 0,
  lh: Object.fromEntries(['n', 'fit', ...LH_KINDS].map(k => [k, 0])),
  rh: {
    color: 0,
    resolved: 0,
    strong: 0,
    onChord: 0,
    sequences: 0,
    repeats: 0,
    thirds: 0,
    sixths: 0,
    calls: 0,
    answers: 0,
    home: 0,
  },
});

export const MoodPlay = {
  mount(root, { mood, pc }) {
    const M = MOOD_BY[mood];
    const scale = moodScale(mood, pc);
    const tonic = midiOf(scale[0]);
    const tPc = pc12(tonic);
    const scalePcs = new Set(scale.map(n => pc12(midiOf(n))));
    const color = colorNote(mood, pc);
    // this sitting's left-hand pattern: the next one after last time's, unless you choose
    const sits = Store.s.moods.sittings.filter(x => x.imp && x.imp.pattern);
    const lastPattern = sits.length ? sits[sits.length - 1].imp.pattern : null;
    const ids = LH_PATTERNS.map(p => p.id);
    const st = {
      pattern: ids[(ids.indexOf(lastPattern) + 1) % ids.length],
      tool: 'free',
      backing: 'off',
      prog: 0,
      bpm: 72,
      bars: [], // the backing's bars as they sound: {t (performance ms), i (chord)}
      nextBar: 0,
      bar: 0,
      held: [], // the drone's sounding notes
      call: null, // {until (performance ms), ms: the answer so far}
    };
    const S = blankStats();
    let saved = blankStats();
    let lastNote = 0;
    let lastTick = performance.now();
    let lhGroup = null;
    let rhGroup = null;
    const degrees = [];
    let lastRh = null; // the previous right-hand note, to hear the color note resolve
    const timers = [];

    const prog = () => M.progs[st.prog].chords;
    const voiced = () => voiceProgression(mood, pc, prog());
    const lhVoiced = () => lhVoicing(mood, pc, prog());
    // the chord sounding at a moment (performance ms): the backing's when it plays, else the home chord
    const chordAt = t => {
      if (st.backing !== 'chords' || !st.bars.length) return { i: 0, beat: null };
      let b = st.bars[0];
      for (const x of st.bars) if (x.t <= t + 80) b = x;
      return { i: b.i, beat: (t - b.t) / (60000 / st.bpm) };
    };
    const chordOf = i => {
      const [s, type] = prog()[i];
      return { rootPc: pc12(tonic + s), type };
    };

    root.innerHTML = `
      <div class="card stack">
        <div class="row between"><h2 class="h2">Improvise</h2><span class="small mono" id="mpTime"></span></div>
        <p class="small">The lit keys are the scale. Pick an idea for each hand, or none: DaCapo only listens.
          Left hand below middle C.</p>
        <div class="stack" style="gap:6px">
          <span class="eyebrow">Backing</span>
          <div class="row" id="mpBack"></div>
          <div id="mpProg"></div>
        </div>
        <div class="stack" style="gap:6px">
          <span class="eyebrow">Right hand</span>
          <div id="mpTool"></div>
          <p class="small" id="mpToolHow"></p>
          <p class="small mono" id="mpRh"></p>
        </div>
        <div class="stack" style="gap:6px">
          <span class="eyebrow">Left hand</span>
          <div id="mpPat"></div>
          <div class="row"><p class="small grow" id="mpHow"></p>
            <button class="btn sm ghost" type="button" id="mpHearLh">Hear it</button></div>
          <p class="small mono" id="mpLh"></p>
        </div>
        <div class="kbwrap scrollx"><div id="mpKb" class="widekb"></div></div>
        <p class="small" id="mpInfo">Start playing whenever you like.</p>
      </div>`;

    /* ---------- drawing ---------- */
    const paintKb = () => {
      const { i } = chordAt(performance.now());
      const { rootPc, type } = chordOf(i);
      const tones = new Set(CHORD_TONES[type].map(x => pc12(rootPc + x)));
      const marks = {};
      for (let m = SPLIT; m <= 84; m++) {
        if (!scalePcs.has(m % 12)) continue;
        const special =
          (st.tool === 'color' && m % 12 === color.pc) || (st.tool === 'targets' && tones.has(m % 12));
        marks[m] = { cls: special ? 'color' : 'rh' };
      }
      for (let m = 28; m < SPLIT; m++) if (scalePcs.has(m % 12)) marks[m] = { cls: 'soft' };
      patternBar(st.pattern, lhVoiced(), i, tPc).forEach(g =>
        g.ms.forEach((m, k) => (marks[m] = { cls: 'lh', f: g.f[k] })),
      );
      $('#mpKb', root).innerHTML = kbSVG({ from: 28, to: 84, marks, h: 110, interactive: false });
    };
    const paintProg = () => {
      const box = $('#mpProg', root);
      if (st.backing !== 'chords') {
        box.innerHTML = '';
        return;
      }
      const V = voiced();
      const { i } = chordAt(performance.now());
      box.innerHTML = `
        ${seg(
          'mpProgs',
          M.progs.map((p, k) => [String(k), p.chords.map(([s, type]) => roman(s, type)).join(' – ')]),
          String(st.prog),
          'sm wrap',
        )}
        <p class="small">${esc(M.progs[st.prog].why)}.</p>
        <div class="row between">
          <div class="improv-chords" id="mpChords">${V.map((v, k) => `<span class="chip" aria-pressed="${k === i}">${esc(v.info.name)}</span>`).join('')}</div>
          <span class="row" style="gap:4px"><span class="small mono">♩ ${st.bpm}</span>
            <button class="btn sm ghost" type="button" data-mpbpm="-6" aria-label="Slower">−</button>
            <button class="btn sm ghost" type="button" data-mpbpm="6" aria-label="Faster">+</button></span>
        </div>`;
      $$('[data-mpbpm]', box).forEach(b => {
        b.onclick = () => {
          st.bpm = Math.max(48, Math.min(132, st.bpm + +b.dataset.mpbpm));
          restartBacking();
        };
      });
      bindSegs(box, {
        mpProgs: v => {
          st.prog = +v;
          restartBacking();
        },
      });
    };
    const paintChordChips = () => {
      const { i } = chordAt(performance.now());
      $$('#mpChords .chip', root).forEach((el, k) => el.setAttribute('aria-pressed', String(k === i)));
    };
    const paintControls = () => {
      $('#mpBack', root).innerHTML =
        seg(
          'mpBacking',
          [
            ['off', 'Off'],
            ['drone', 'Drone'],
            ['chords', 'Chords'],
          ],
          st.backing,
          'sm',
        ) + (Sounds.on() ? '' : '<span class="small">Sound is off in Settings.</span>');
      $('#mpTool', root).innerHTML = seg(
        'mpTools',
        RH_TOOLS.map(t => [t.id, t.n]),
        st.tool,
        'sm wrap',
      );
      $('#mpToolHow', root).innerHTML =
        esc(toolHow(st.tool, mood, pc)) +
        (st.tool === 'call' ? ' <button class="btn sm" type="button" id="mpCall">Play a call</button>' : '');
      $('#mpPat', root).innerHTML = seg(
        'mpPattern',
        LH_PATTERNS.map(p => [p.id, p.n]),
        st.pattern,
        'sm wrap',
      );
      $('#mpHow', root).textContent = LH_BY[st.pattern].how;
      const call = $('#mpCall', root);
      if (call) call.onclick = playCall;
      bindSegs(root, {
        mpBacking: v => {
          st.backing = v;
          restartBacking();
        },
        mpTools: v => {
          st.tool = v;
          // landing on chord tones needs chords to land on
          if (v === 'targets' && st.backing !== 'chords') {
            st.backing = 'chords';
            restartBacking();
          }
          paintControls();
          paintKb();
          feedback();
        },
        mpPattern: v => {
          st.pattern = v;
          paintControls();
          paintKb();
          feedback();
        },
      });
      paintProg();
    };

    /* ---------- the backing: a pad that holds, a bass that plays ---------- */
    const stopSound = () => {
      st.held.forEach(h => Sounds.stop(h));
      st.held = [];
      Sounds.stopAll();
    };
    const playBar = (t, i) => {
      const V = voiced();
      const v = V[i];
      const spb = 60 / st.bpm;
      v.right.forEach(m => {
        const h = Sounds.start('pad', m, 0.5, t);
        if (h) Sounds.stop(h, t + spb * 4 - 0.05);
      });
      [0, 2].forEach(b => {
        const h = Sounds.start('bass', v.root, b ? 0.45 : 0.6, t + b * spb);
        if (h) Sounds.stop(h, t + (b + 1.7) * spb);
      });
    };
    const schedule = () => {
      if (st.backing !== 'chords') return;
      const now = AudioEngine.now();
      const bar = (60 / st.bpm) * 4;
      while (st.nextBar < now + 0.3) {
        const at = Math.max(now, st.nextBar);
        const i = st.bar % prog().length;
        playBar(at, i);
        st.bars.push({ t: AudioEngine.toPerf(at), i });
        if (st.bars.length > 8) st.bars.shift();
        timers.push(setTimeout(() => (paintChordChips(), paintKb()), Math.max(0, (at - now) * 1000)));
        st.nextBar = at + bar;
        st.bar++;
      }
    };
    const restartBacking = () => {
      stopSound();
      timers.splice(0).forEach(clearTimeout);
      st.bars = [];
      st.bar = 0;
      if (st.backing !== 'off') AudioEngine.ensure();
      st.nextBar = AudioEngine.now() + 0.1;
      if (st.backing === 'drone') {
        // home and its fifth, held, in the middle of the piano where any speaker can play them
        const r = 48 + pc12(tPc - 48);
        st.held = [r, r + 7, r + 12].map(m => Sounds.start('pad', m, 0.55)).filter(Boolean);
      }
      paintControls();
      paintKb();
    };

    // the left-hand pattern over the progression, once, on the piano voice
    const hearLh = () => {
      AudioEngine.ensure();
      const V = lhVoiced();
      const spb = 60 / st.bpm;
      const t0 = AudioEngine.now() + 0.1;
      V.forEach((_, i) =>
        patternBar(st.pattern, V, i, tPc).forEach(g =>
          g.ms.forEach(m => AudioEngine.note(m, t0 + (i * 4 + g.b) * spb, g.d * spb, 0.55)),
        ),
      );
    };
    $('#mpHearLh', root).onclick = hearLh;

    // call and response: a phrase from DaCapo, then a window as long again for your answer
    function playCall() {
      AudioEngine.ensure();
      const phrase = callPhrase(mood, pc);
      const spb = 60 / st.bpm;
      const t0 = AudioEngine.now() + 0.1;
      phrase.forEach(n => AudioEngine.note(n.m, t0 + n.b * spb, n.d * spb * 0.95, 0.6));
      const len = (phrase[phrase.length - 1].b + phrase[phrase.length - 1].d) * spb;
      const start = AudioEngine.toPerf(t0 + len);
      st.call = { from: start, until: start + (len + 2 * spb) * 1000, ms: [] };
      S.rh.calls++;
      $('#mpRh', root).textContent = 'Your turn: answer when the call ends.';
    }
    const closeCall = () => {
      const c = st.call;
      st.call = null;
      const a = judgeAnswer(c.ms, M.semis, tPc);
      if (a.n) S.rh.answers++;
      if (a.home) S.rh.home++;
      $('#mpRh', root).textContent = !a.n
        ? 'No answer heard. Play a call again when you are ready.'
        : `Answered with ${a.n} note${a.n > 1 ? 's' : ''}${a.home ? ', home at the end. Settled.' : a.inScale ? '; it ended away from home, a question answered with a question. Try ending on the home note.' : '.'}`;
    };

    /* ---------- listening ---------- */
    const countLh = g => {
      const { i } = chordAt(g.t);
      const { rootPc, type } = chordOf(i);
      const kind = lhKind(g.ms, rootPc, type, tPc);
      S.lh.n++;
      S.lh[kind]++;
      const want = new Set(patternBar(st.pattern, lhVoiced(), i, tPc).flatMap(x => x.ms.map(pc12)));
      if (g.ms.every(m => want.has(pc12(m)))) S.lh.fit++;
    };
    const countRh = g => {
      const d = dyadKind(g.ms);
      if (d === 'third') S.rh.thirds++;
      if (d === 'sixth') S.rh.sixths++;
    };
    const onNote = ev => {
      if (ev.m == null) return;
      const t = ev.t || performance.now();
      lastNote = performance.now();
      S.notes++;
      const inScale = scalePcs.has(ev.m % 12);
      if (inScale) S.inScale++;
      flashKey($('#mpKb svg', root), ev.m, inScale ? 'down' : 'bad', 260);
      if (ev.m < SPLIT) {
        if (lhGroup && t - lhGroup.t < TOGETHER) lhGroup.ms.push(ev.m);
        else {
          if (lhGroup) countLh(lhGroup);
          lhGroup = { t, ms: [ev.m] };
        }
        return;
      }
      // the right hand
      if (rhGroup && t - rhGroup.t < TOGETHER) rhGroup.ms.push(ev.m);
      else {
        if (rhGroup) countRh(rhGroup);
        rhGroup = { t, ms: [ev.m] };
      }
      if (lastRh != null && pc12(lastRh) === color.pc && Math.abs(ev.m - lastRh) <= 2 && ev.m !== lastRh)
        S.rh.resolved++;
      if (pc12(ev.m) === color.pc) S.rh.color++;
      lastRh = ev.m;
      const { i, beat } = chordAt(t);
      if (beat != null) {
        const off = Math.abs(beat % 2 < 1 ? beat % 2 : (beat % 2) - 2); // distance to beat 1 or 3
        if (off < 0.25) {
          S.rh.strong++;
          const { rootPc, type } = chordOf(i);
          if (CHORD_TONES[type].some(x => pc12(rootPc + x) === pc12(ev.m))) S.rh.onChord++;
        }
      }
      const deg = degreeOf(ev.m, M.semis, tPc);
      if (deg != null) {
        degrees.push(deg);
        if (degrees.length > 16) degrees.shift();
        const echo = motifEcho(degrees);
        if (echo) {
          S.rh[echo === 'sequence' ? 'sequences' : 'repeats']++;
          degrees.splice(0, degrees.length - 3); // count each return once
        }
      }
      if (st.call && t >= st.call.from - 150) st.call.ms.push(ev.m);
    };
    const offs = [Input.on(onNote)];

    // what DaCapo heard, for the idea and the pattern you chose
    const feedback = () => {
      const r = S.rh;
      const lh = S.lh;
      const pct = (a, b) => `${Math.round((a / b) * 100)}%`;
      if (st.tool !== 'call' || !st.call) {
        $('#mpRh', root).textContent = {
          free: '',
          color: r.color
            ? `${color.name} ${r.color} time${r.color > 1 ? 's' : ''}, resolved ${r.resolved}`
            : `${color.name} not played yet`,
          targets:
            st.backing !== 'chords'
              ? 'Needs the chords backing.'
              : r.strong
                ? `On beats 1 and 3: ${r.onChord} of ${r.strong} notes were chord tones`
                : 'Nothing on beats 1 and 3 yet',
          motif:
            r.sequences + r.repeats ? `${r.sequences} sequences · ${r.repeats} repeats` : 'No motif back yet',
          dyads: r.thirds + r.sixths ? `${r.thirds} thirds · ${r.sixths} sixths` : 'No thirds or sixths yet',
          call: r.calls ? `${r.answers} of ${r.calls} calls answered · ${r.home} ended home` : '',
        }[st.tool];
      }
      $('#mpLh', root).textContent = lh.n ? `${pct(lh.fit, lh.n)} on the pattern · ${lhWord(lh)}` : '';
      $('#mpTime', root).textContent = S.ms > 1000 ? fmtTime(S.ms / 1000) : '';
      if (S.notes)
        $('#mpInfo', root).textContent = `${S.notes} notes · ${pct(S.inScale, S.notes)} in the scale`;
    };
    const lhWord = lh => {
      const top = LH_KINDS.reduce((a, k) => (lh[k] > lh[a] ? k : a), LH_KINDS[0]);
      return lh[top] < lh.n * 0.5
        ? 'a mix'
        : {
            chords: 'mostly chords',
            octaves: 'mostly octaves',
            rootFifth: 'mostly roots and fifths',
            broken: 'moving through the chords',
            pedal: 'holding home under the chords',
            passing: 'walking between chord tones',
          }[top];
    };

    const flush = () => {
      if (lhGroup) countLh(lhGroup);
      if (rhGroup) countRh(rhGroup);
      lhGroup = rhGroup = null;
    };
    const save = () => {
      flush();
      const diff = (a, b) => Object.fromEntries(Object.keys(a).map(k => [k, a[k] - b[k]]));
      const d = {
        ms: S.ms - saved.ms,
        notes: S.notes - saved.notes,
        inScale: S.inScale - saved.inScale,
        pedalMs: S.pedalMs - saved.pedalMs,
        lh: diff(S.lh, saved.lh),
        rh: diff(S.rh, saved.rh),
        pattern: st.pattern,
        tool: st.tool,
      };
      if (d.notes > 0) recordImprovising(mood, pc, d);
      saved = JSON.parse(JSON.stringify(S));
    };
    const tick = setInterval(
      Log.guard('moodplay tick', () => {
        const now = performance.now();
        const dt = now - lastTick;
        lastTick = now;
        // time counts while you play (a note in the last four seconds)
        if (now - lastNote < 4000) {
          S.ms += dt;
          if (Input.pedal) S.pedalMs += dt;
        }
        // a gesture is over once nothing joins it
        if (lhGroup && now - lhGroup.t > 200) (countLh(lhGroup), (lhGroup = null));
        if (rhGroup && now - rhGroup.t > 200) (countRh(rhGroup), (rhGroup = null));
        if (st.call && now > st.call.until) closeCall();
        schedule();
        feedback();
      }),
      100,
    );
    const autosave = setInterval(save, 20000);
    paintControls();
    paintKb();
    Log.ev('moodplay start', { mood, pc, pattern: st.pattern });
    return {
      stats: () => S,
      destroy() {
        clearInterval(tick);
        clearInterval(autosave);
        timers.forEach(clearTimeout);
        save();
        offs.forEach(f => f());
        stopSound();
        AudioEngine.stopAll();
        Log.ev('moodplay stop', { mood, pc, ms: Math.round(S.ms), notes: S.notes });
      },
    };
  },
};
