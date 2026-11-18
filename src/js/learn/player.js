/* The player: one drill, rep after rep, hands on the keys
   One state machine with one timer slot, so nothing can be left half-switched:
     ready -> (first note) -> wait -> review -> ready ...          wait mode
     ready -> countin -> tempo -> review -> countin ...            metronome mode
     paused (nothing played for two reps) -> any key -> countin
   Every transition is logged. The drill's source (a piece, or a Moods drill) decides what the next rep
   should be. */
import { Log } from '../core/log.js';
import { $$, clamp, esc, median, todayKey } from '../core/util.js';
import { Store } from '../core/store.js';
import { AudioEngine, Metro } from '../core/audio.js';
import { Input, sameNote } from '../core/input.js';
import { midiOf, nameOf, spellerFor } from '../music/theory.js';
import { flashKey, kbRange, kbSVG, pieceStaffSVG, staffSVG } from '../music/render.js';
import { analyzeSeq } from '../music/analysis.js';
import { Library } from '../music/library.js';
import { techniqueAdvice, techniqueReport } from '../music/technique.js';
import { buildDrill } from './drill.js';
import { criterion, handWord, itemDef, itemState, planFor, recordRep, STAGE_TXT } from './pieces.js';
import { LESSON_BY, lessonFor } from './lessons.js';
import { lessonSheet } from '../views/guides.js';

const CUES = {
  scale: [
    'Move the thumb early and silently',
    'Wrist level and loose; no twisting',
    'Listen for even spacing between every note',
    'Crescendo up, diminuendo down',
    'Play from the key surface',
    'Eyes on the staff, not your hands',
  ],
  arp: [
    'Let the wrist and elbow travel with the line',
    'Thumb passes close to the keys',
    'Same loudness on the top note',
    'Listen for even spacing',
  ],
  section: [
    'Listen to the top line',
    'Keep the hand close to the keys',
    'Slow enough that nothing surprises you',
    'Shape the phrase, even when slow',
    'Breathe at the end of the phrase',
  ],
  pattern: [
    'Bass deepest, chord lighter',
    'Move early to the next position',
    'Feel the distance; glance only to check',
  ],
  full: [
    'Keep going, whatever happens',
    'Play it as music: shape and color',
    'Listen as if someone else were playing',
  ],
};

const sentence = parts => {
  const t = parts.filter(Boolean).join(', ');
  return t ? t[0].toUpperCase() + t.slice(1) + '.' : '';
};

// timing scatter limits for a clean run (fraction of a beat or of the note spacing). Up to FAIR times the
// limit still counts as clean, with a word about it; beyond that it is a slip. Timing alone is never messy.
const LIMIT = { even: 0.08, evenMic: 0.12, piece: 0.1 };
const FAIR = 1.6;
// the click and you may differ this much before it is mentioned
const TEMPO_TOLERANCE = 0.12;

// "2 wrong notes, 1 hint." for a wait-mode rep that was not clean
function waitModeSlips(wrong, hinted) {
  const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
  return (
    [wrong && plural(wrong, 'wrong note'), hinted && plural(hinted, 'hint')].filter(Boolean).join(', ') + '.'
  );
}

// where you played, relative to the written note: "an octave higher", "two octaves lower"
const octaves = semis =>
  `${Math.abs(semis) === 12 ? 'an octave' : 'two octaves'} ${semis > 0 ? 'higher' : 'lower'}`;

/* Where a drill comes from and where its reps go: a piece's section by default; Moods supplies its own
   (a scale you practice freely, with checks only when you ask). about(id), if given, opens a panel on it. */
const PIECES = {
  def: id => itemDef(id),
  plan: id => planFor(id),
  record: (id, r) => recordRep(id, r),
  state: id => itemState(id),
  stage: id => {
    const it = itemState(id) || {};
    return { text: STAGE_TXT[it.stage] || '', cls: it.stage === 'done' ? 'ok' : '' };
  },
  criterion: id => criterion(id),
};

export const Player = {
  mount(root, { id, onEvent = () => {}, source = PIECES, about = null }) {
    const src = source;
    const P = {
      id,
      root,
      def: src.def(id),
      plan: null,
      drill: null,
      phase: 'idle',
      timer: 0,
      offs: [],
      dead: false,
      idle: 0,
      repN: 0,
    };
    const $p = s => root.querySelector(s);
    const log = (m, d) => Log.ev('player ' + m, Object.assign({ id }, d || {}));
    const later = (fn, ms) => {
      clearTimeout(P.timer);
      P.timer = setTimeout(
        Log.guard('player timer', () => {
          if (!P.dead) fn();
        }),
        ms,
      );
    };
    const cancel = () => {
      clearTimeout(P.timer);
      P.timer = 0;
    };
    const setPhase = (ph, why) => {
      if (P.phase !== ph) log(`${P.phase} → ${ph}`, why ? { why } : undefined);
      P.phase = ph;
      paintBar();
    };
    if (!P.def) {
      root.innerHTML = '<div class="card"><p>This drill is no longer available.</p></div>';
      return { destroy() {} };
    }

    /* ---------- layout ---------- */
    const k = P.def.kind;
    root.innerHTML = `
      <div class="player card" data-kind="${k}">
        <div class="pl-head">
          <div class="pl-title"><b id="plTitle"></b><span class="small" id="plSub"></span></div>
          <button class="iconbtn" type="button" id="plAbout" aria-label="About this drill" title="About this drill" ${about || src.about ? '' : 'hidden'}>
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>
          </button>
        </div>
        <div class="pl-stagebar">
          <span class="pill" id="plStage"></span>
          <span class="small" id="plCrit"></span>
        </div>
        <div class="pl-stage">
          <div class="staffwrap scrollx" id="plStaffWrap"><div id="plStaff"></div></div>
          <div class="countin" id="plCount" hidden></div>
        </div>
        <div class="beats pl-beats" id="plBeats" hidden></div>
        <div class="feedback pl-msg" id="plMsg" aria-live="polite"></div>
        <div class="cue" id="plCue"></div>
        <div class="kbwrap scrollx" id="plKbWrap"><div id="plKb"></div></div>
        <div class="st-bar pl-bar">
          <button class="iconbtn" type="button" id="plHear" aria-label="Hear it" title="Hear it">
            <svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>
          </button>
          <span class="small" id="plInfo"></span>
          <button class="btn cover sm" type="button" id="plGo"></button>
        </div>
      </div>`;
    const msg = (t, cls = '') => {
      const e = $p('#plMsg');
      if (e) {
        e.className = 'feedback pl-msg ' + cls;
        e.textContent = t;
      }
    };

    /* ---------- painting ---------- */
    let staffRes = null;
    let hl = { cur: -1, ok: new Set(), bad: new Set() };
    function paintStaff(follow) {
      const d = P.drill;
      if (!d) return;
      const wrap = $p('#plStaffWrap');
      const box = $p('#plStaff');
      if (!wrap || !box) return;
      if (d.piece) {
        // long music (a whole piece) is drawn a window of bars at a time around where you are
        P.win = null;
        if (d.steps.length > 140) {
          const at = clamp(follow == null ? P.winAt || 0 : follow, 0, d.steps.length - 1);
          P.winAt = at;
          const t0 = d.steps[Math.max(0, at - 6)].beat;
          let bi = 0;
          while (bi + 1 < d.bars.length && d.bars[bi + 1] <= t0 + 1e-6) bi++;
          const base = d.bars[bi];
          const bj = Math.min(d.bars.length - 1, bi + 6);
          const end = d.bars[bj];
          const idx = [];
          d.steps.forEach((x, i) => {
            if (x.beat >= base - 0.3 && x.beat < end - 0.01) idx.push(i);
          });
          const w0 = idx[0] ?? 0;
          const sub = idx.map(i => ({ ...d.steps[i], beat: d.steps[i].beat - base }));
          const map = new Map(idx.map((i, j) => [i, j]));
          const loc = set => new Set([...set].filter(i => map.has(i)).map(i => map.get(i)));
          P.win = { w0, w1: w0 + idx.length, map };
          staffRes = pieceStaffSVG({
            steps: sub,
            ghost: (d.ghost || []).filter(n => n.t >= base && n.t < end).map(n => ({ ...n, t: n.t - base })),
            bars: d.bars.slice(bi, bj + 1).map(b => b - base),
            total: end - base,
            sig: Library.keyAt(d.pid || P.def.pid, d.a + bi),
            time: null,
            clefs: [
              Library.clefAt(d.pid || P.def.pid, 0, d.a + bi),
              Library.clefAt(d.pid || P.def.pid, 1, d.a + bi),
            ],
            clefChanges: [],
            syms: (d.syms || [])
              .filter(
                (c, i, l) =>
                  c.t < end - 1e-6 && (c.t >= base - 1e-6 || !(l[i + 1] && l[i + 1].t <= base + 1e-6)),
              )
              .map(c => ({ ...c, t: Math.max(0, c.t - base) })),
            hl: { cur: map.has(hl.cur) ? map.get(hl.cur) : -1, ok: loc(hl.ok), bad: loc(hl.bad) },
            ppb: 30,
          });
          staffRes.xs = d.steps.map((_, i) => (map.has(i) ? staffRes.xs[map.get(i)] : null));
        } else
          staffRes = pieceStaffSVG({
            steps: d.steps,
            ghost: d.ghost,
            bars: d.bars,
            total: d.total,
            sig: d.sig,
            time: d.time,
            clefs: d.clefs,
            clefChanges: d.clefChanges,
            syms: d.syms,
            hl,
            ppb: d.steps.length > 60 ? 30 : 38,
          });
      } else {
        const items = d.steps.map((s, i) => ({
          notes: s.notes.map(x => ({
            ...x,
            f:
              P.plan.fingers !== false &&
              ((P.plan.mode === 'wait' && P.plan.hints) || k === 'scale' || k === 'arp')
                ? x.f
                : '',
            cls: hl.bad.has(i) ? 'bad' : hl.ok.has(i) ? 'ok' : hl.cur === i ? 'cur' : '',
          })),
          fstack: s.fstack,
          fcls: s.fcls,
        }));
        staffRes = staffSVG({
          clef: d.clef,
          sig: d.sig,
          items,
          spacing: d.spacing || 28,
          top: 40,
          bottom: 44,
          barEvery: d.barEvery || 0,
        });
      }
      const big = staffRes.W > 560;
      const w = Math.round(staffRes.W * (big ? 1.1 : 1.6));
      box.innerHTML = `<div style="width:${big ? w + 'px' : '100%'};max-width:${big ? 'none' : w + 'px'};margin:0 auto">${staffRes.svg}</div>`;
      if (big && follow != null) scrollTo(follow);
    }
    function scrollTo(i) {
      const wrap = $p('#plStaffWrap');
      if (!wrap || !staffRes || staffRes.xs[i] == null) return;
      const w = wrap.scrollWidth;
      const px = (staffRes.xs[i] / staffRes.W) * w;
      const target = Math.max(0, px - wrap.clientWidth * 0.35);
      if (Math.abs(wrap.scrollLeft - target) > wrap.clientWidth * 0.25)
        wrap.scrollTo({ left: target, behavior: 'smooth' });
    }
    function paintKb(stepIdx, showHint) {
      const kb = $p('#plKb');
      if (!kb) return;
      const d = P.drill;
      const all = d.steps.flatMap(s => s.midis).concat((d.ghost || []).map(n => midiOf(n.n)));
      const r = all.length ? kbRange(all, 2, 17) : { from: 48, to: 72 };
      const marks = {};
      const s = d.steps[stepIdx];
      if (showHint && s)
        s.notes.forEach((x, j) => {
          const m = midiOf(x.n);
          marks[m] = { cls: x.fcls || 'rh', f: x.f || x.kf || (s.fstack ? s.fstack[j] : '') };
          if (!marks[m].f || P.plan.fingers === false) delete marks[m].f;
        });
      kb.innerHTML = kbSVG({ ...r, marks, h: 104 });
      if (s && showHint) {
        const wrap = $p('#plKbWrap');
        const key = kb.querySelector(`[data-m="${s.midis[0]}"]`);
        if (wrap && key) {
          const kr = key.getBoundingClientRect(),
            wr = wrap.getBoundingClientRect();
          if (kr.left < wr.left || kr.right > wr.right) wrap.scrollLeft += kr.left - wr.left - wr.width / 2;
        }
      }
    }
    function paintHead() {
      const d = P.def;
      $p('#plTitle').textContent = d.title;
      $p('#plSub').textContent =
        d.sub + (P.plan && P.plan.hand && d.phases.length > 1 ? ' · ' + handWord(P.plan.hand) : '');
      const st = $p('#plStage');
      const stage = src.stage(id, P.plan);
      st.textContent = stage.text;
      st.className = 'pill ' + stage.cls;
      st.hidden = !stage.text;
      $p('#plCrit').textContent = src.criterion(id);
      paintCue();
    }
    // the line under the staff: technique advice when a habit shows up, a note on body and hands once a
    // day, otherwise what this rep is about
    function paintCue() {
      const cue = $p('#plCue');
      if (!cue || !P.plan) return;
      const advice = techniqueAdvice((src.state(id) || {}).tech);
      const seen = (Store.s.lessonsSeen = Store.s.lessonsSeen || {});
      const lesson =
        !advice &&
        P.repN === 0 &&
        seen[P.def.kind] !== todayKey() &&
        lessonFor(P.def.kind, Store.s.sessions || 0);
      if (advice || lesson) {
        const l = advice ? LESSON_BY[advice.lesson] : lesson;
        cue.innerHTML = `<span>${advice ? 'Technique' : 'Before you start'}</span> ${esc(advice ? advice.text : l.cue)}
          <button class="linkbtn" type="button" data-lesson="${l.id}">More</button>`;
        cue.querySelector('[data-lesson]').onclick = () => lessonSheet(l.id);
        if (lesson) seen[P.def.kind] = todayKey();
        return;
      }
      const cues = CUES[P.def.kind] || CUES.scale;
      cue.innerHTML = `<span>${P.plan.mode === 'tempo' ? 'This rep' : 'Focus'}</span> ${esc(P.plan.label || cues[P.repN % cues.length])}`;
    }
    function paintBar() {
      const go = $p('#plGo');
      if (!go) return;
      const info = $p('#plInfo');
      const mode = P.plan && P.plan.mode;
      if (mode === 'tempo') {
        go.hidden = false;
        go.textContent =
          { review: 'Pause', paused: 'Start', stopped: 'Start', needsound: 'Start' }[P.phase] || 'Stop';
      } else {
        go.hidden = P.phase !== 'wait';
        go.textContent = 'Restart';
      }
      if (info)
        info.textContent = !P.plan
          ? ''
          : mode === 'tempo'
            ? `♩ ${P.plan.bpm}`
            : P.plan.paced
              ? `Goal ${(P.plan.pace / 1000).toFixed(1)} s per note`
              : '';
    }

    /* ---------- (re)planning ---------- */
    function replan(reason) {
      const prevHand = P.plan && P.plan.hand,
        prevMode = P.plan && P.plan.mode;
      P.plan = src.plan(id);
      if (!P.plan) return;
      const needNew =
        !P.drill ||
        P.drill.fresh ||
        prevHand !== P.plan.hand ||
        prevMode !== P.plan.mode ||
        reason === 'init';
      if (needNew) {
        P.drill = buildDrill(P.def, P.plan);
        if (!P.drill) {
          msg('This drill could not be built.', 'bad');
          Log.warn('drill build failed', { id, plan: P.plan });
          return;
        }
      }
      P.lenient = Input.mode === 'mic' && P.drill.steps.some(s => s.midis.length > 1);
      log('plan', {
        reason,
        mode: P.plan.mode,
        hand: P.plan.hand,
        bpm: P.plan.bpm,
        hints: P.plan.hints,
        steps: P.drill.steps.length,
        rebuilt: needNew,
      });
      if (P.forceHints) {
        // after a wrong-octave or wrong-hand run, show the keys once
        P.plan.hints = true;
        P.forceHints = false;
      }
      hl = { cur: P.plan.mode === 'wait' ? 0 : -1, ok: new Set(), bad: new Set() };
      paintHead();
      paintStaff(0);
      paintKb(0, P.plan.hints || P.plan.mode === 'tempo');
    }
    function startRep() {
      // enter the ready state for the current plan
      cancel();
      W.reset();
      if (P.plan.mode === 'wait') {
        setPhase('ready');
        const s = P.drill.steps[0];
        msg(`Play the first note to begin${P.plan.hints ? ': ' + label(s) : ''}.`);
      } else if (P.plan.mode === 'tempo') {
        T.countIn();
      }
    }
    const label = s => (s ? s.notes.map(x => `${nameOf(x.n)}${x.f ? ` (${x.f})` : ''}`).join(' + ') : '');

    /* ---------- wait mode ---------- */
    const W = {
      i: 0,
      got: new Set(),
      t0: 0,
      err: [],
      times: [],
      last: 0,
      hintT: 0,
      hinted: new Set(),
      reset() {
        this.i = 0;
        this.got = new Set();
        this.err = new Array(P.drill.steps.length).fill(0);
        this.times = [];
        this.last = 0;
        this.hinted = new Set();
        this.touch = false;
        clearTimeout(this.hintT);
      },
      armHint() {
        clearTimeout(this.hintT);
        if (P.plan.hints) return;
        const i = this.i;
        this.hintT = setTimeout(() => this.showHint(i), 7000);
      },
      showHint(i) {
        clearTimeout(this.hintT);
        if (P.dead || (P.phase !== 'wait' && P.phase !== 'ready') || this.i !== i || this.hinted.has(i))
          return;
        this.hinted.add(i);
        paintKb(i, true);
        msg(`Hint: ${label(P.drill.steps[i])}`);
      },
      note(ev) {
        const d = P.drill;
        const s = d.steps[this.i];
        if (!s) return;
        const fits = m => sameNote(ev.m, m, ev.src);
        if (P.phase === 'review') {
          // playing the first note again starts the next rep at once, if it is the same drill
          if (!P.sameNext || !d.steps[0].midis.some(fits)) return;
          cancel();
          P.plan = src.plan(id);
          paintHead();
          W.reset();
          hl = { cur: 0, ok: new Set(), bad: new Set() };
          setPhase('ready');
        }
        if (P.phase === 'ready') {
          const s0 = d.steps[0];
          if (!s0.midis.some(fits)) {
            msg(`That was ${nameOf(spellerFor(d.sig)(ev.m))}. Start on ${label(s0)}.`, 'bad');
            flashKey($p('#plKb svg'), ev.m, 'bad', 400);
            return;
          }
          setPhase('wait');
          this.t0 = ev.t;
        }
        if (ev.src === 'touch') this.touch = true;
        const need = P.lenient && s.midis.length > 1 ? [s.midis.find(fits)].filter(x => x != null) : s.midis;
        const match = need.find(m => fits(m) && !this.got.has(m));
        if (match != null) {
          if (!this.got.size || ev.t - this.chordT > 1500) {
            this.got = new Set();
            this.chordT = ev.t;
          }
          this.got.add(match);
          flashKey($p('#plKb svg'), ev.m, 'ok', 180);
          if (this.got.size >= need.length) {
            this.times[this.i] = this.chordT;
            hl.ok.add(this.i);
            this.i++;
            this.got = new Set();
            if (this.i >= d.steps.length) return this.finish();
            hl.cur = this.i;
            paintStaff(this.i);
            paintKb(this.i, P.plan.hints);
            this.armHint(); // (windowed drawing follows this.i)
            msg(P.plan.hints ? `Next: ${label(d.steps[this.i])}` : `${this.i} of ${d.steps.length}`);
          }
        } else if (!s.midis.some(fits)) {
          this.err[this.i]++;
          flashKey($p('#plKb svg'), ev.m, 'bad', 450);
          const same = s.midis.find(m => m !== ev.m && (ev.m - m) % 12 === 0);
          msg(
            same != null
              ? `Right note, ${octaves(ev.m - same)} than written.`
              : `That was ${nameOf(spellerFor(d.sig)(ev.m))}.${P.plan.hints ? ' Next: ' + label(s) : ' Try again.'}`,
            'bad',
          );
          // two misses on one note: show it now rather than after the usual wait
          if (this.err[this.i] >= 2 && !P.plan.hints) this.showHint(this.i);
          if (!hl.bad.has(this.i)) {
            hl.bad.add(this.i);
            paintStaff(this.i);
          }
        }
      },
      finish() {
        clearTimeout(this.hintT);
        setPhase('review');
        hl.cur = -1;
        paintStaff();
        paintKb(-1, false);
        const d = P.drill;
        const n = d.steps.length;
        const gaps = [];
        for (let x = 1; x < this.times.length; x++) gaps.push(this.times[x] - this.times[x - 1]);
        // the time per note, from the second note on: how fast you find the notes
        const pace = gaps.length >= 3 ? Math.round(median(gaps)) : null;
        const med = median(gaps) || 600;
        // long pauses are noted, but wait mode is for taking your time: they never make a run unclean
        const hes = gaps.filter(g => g > Math.max(3000, med * 3)).length;
        const hinted = P.plan.hints ? 0 : this.hinted.size;
        // how even the run was at your own pace: the spread of the gaps between notes (0 = perfectly even)
        const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
        const cv =
          gaps.length >= 3
            ? Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length) / mean
            : null;
        const wrongSteps = this.err.filter(e => e).length;
        const clean = wrongSteps === 0 && hinted === 0;
        const srcs = Input.mode;
        const valid = Input.live && Input.mode !== 'touch' && !P.lenient && !this.touch;
        const weak = weakHand(
          d,
          this.err.map((e, i) => (e ? i : -1)).filter(i => i >= 0),
        );
        report({
          mode: 'wait',
          hand: P.plan.hand,
          clean,
          rating: clean ? 'clean' : wrongSteps + hinted <= 1 ? 'slips' : 'messy',
          acc: 1 - wrongSteps / n,
          wrong: wrongSteps,
          hes,
          hinted,
          pace,
          cv,
          valid,
          weak,
          src: srcs,
          msg: clean ? '' : waitModeSlips(wrongSteps, hinted),
        });
      },
    };
    function weakHand(d, badIdx) {
      const c = { rh: 0, lh: 0 };
      badIdx.forEach(i =>
        (d.steps[i] ? d.steps[i].notes : []).forEach(x => {
          if (x.fcls === 'rh' || x.fcls === 'lh') c[x.fcls]++;
        }),
      );
      return c.rh === c.lh ? null : c.rh > c.lh ? 'rh' : 'lh';
    }

    /* ---------- metronome mode ---------- */
    const T = {
      ons: [],
      t0: 0,
      msBeat: 1000,
      offBeat: null,
      raf: 0,
      countIn() {
        cancel();
        hl = { cur: -1, ok: new Set(), bad: new Set() };
        const ac = AudioEngine.ensure();
        if (ac.state !== 'running') {
          // browsers only allow sound after a tap on the page; a key on the piano does not count
          setPhase('needsound');
          msg(
            'Tap the screen once to switch on the metronome. Browsers need one tap before they can play sound.',
            '',
          );
          const wake = Log.guard('sound unlock', () => {
            if (P.dead) return;
            if (AudioEngine.ctx.state === 'running') {
              document.removeEventListener('pointerdown', wake, true);
              clearInterval(P.soundPoll);
              log('sound unlocked');
              this.countIn();
            }
          });
          document.addEventListener(
            'pointerdown',
            () => {
              AudioEngine.ensure();
              setTimeout(wake, 150);
            },
            { capture: true, once: true },
          );
          clearInterval(P.soundPoll);
          P.soundPoll = setInterval(wake, 500);
          P.offs.push(() => clearInterval(P.soundPoll));
          return;
        }
        paintStaff(0);
        paintKb(0, true);
        const d = P.drill;
        const bpm = P.plan.bpm;
        this.msBeat = 60000 / bpm; // quarter-note beats
        const clickBpm = bpm / d.unit;
        const clicks = d.clicks || 4;
        this.ons = [];
        setPhase('countin');
        AudioEngine.ensure();
        const first = Metro.start({ bpm: clickBpm, beats: clicks, sub: 1, countIn: 1 });
        this.t0 = AudioEngine.toPerf(first);
        this.watch(clicks);
        msg(`Count-in, then play at ♩ ${bpm}. When you start exactly does not matter.`);
        const totalMs = (d.beats || 8) * this.msBeat;
        later(
          () => this.finish('timeout'),
          Math.max(1000, this.t0 + totalMs * 1.6 + 2200 - performance.now()),
        );
        this.follow();
      },
      watch(clicks) {
        if (this.offBeat) this.offBeat();
        const cnt = $p('#plCount'),
          dots = $p('#plBeats');
        if (dots) {
          dots.hidden = false;
          dots.innerHTML = '<i></i>'.repeat(Math.min(clicks, 12));
        }
        this.offBeat = Metro.on((kind, q) => {
          if (kind !== 'beat' || P.dead) return;
          if (dots)
            $$('i', dots).forEach((el, j) => {
              el.classList.toggle('on', j === q.beat);
              el.classList.toggle('acc', q.beat === 0);
            });
          if (!cnt) return;
          if (q.idx < clicks) {
            cnt.hidden = false;
            cnt.textContent = clicks - q.idx;
            cnt.className = 'countin' + (q.idx === clicks - 1 ? ' last' : '');
          } else if (q.idx === clicks) {
            cnt.hidden = false;
            cnt.textContent = 'Play';
            cnt.className = 'countin go';
            setTimeout(() => {
              if (cnt) cnt.hidden = true;
            }, 450);
            if (P.phase === 'countin') setPhase('tempo');
          }
        });
      },
      follow() {
        // keep the staff scrolled near where you should be
        cancelAnimationFrame(this.raf);
        const d = P.drill;
        const tick = () => {
          if (P.dead || !['countin', 'tempo'].includes(P.phase)) return;
          const beat = (performance.now() - this.t0) / this.msBeat;
          let i = d.steps.findIndex(s => s.beat >= beat);
          if (i < 0) i = d.steps.length - 1;
          if (P.win && (i >= P.win.w1 - 8 || i < P.win.w0)) paintStaff(i);
          if (i >= 0 && staffRes && staffRes.W > 560) scrollTo(i);
          this.raf = requestAnimationFrame(() => setTimeout(tick, 250));
        };
        tick();
      },
      unwatch() {
        if (this.offBeat) {
          this.offBeat();
          this.offBeat = null;
        }
        cancelAnimationFrame(this.raf);
        const c = $p('#plCount');
        if (c) c.hidden = true;
        const d = $p('#plBeats');
        if (d) d.hidden = true;
      },
      note(ev) {
        if (P.phase === 'paused' || P.phase === 'stopped') {
          log('resume by key');
          msg('Counting in…');
          later(() => this.countIn(), 400);
          setPhase('resuming');
          return;
        }
        if (!['countin', 'tempo'].includes(P.phase)) return;
        this.ons.push(ev);
        const d = P.drill;
        const ok = d.steps.some(s => s.midis.some(m => sameNote(ev.m, m, ev.src)));
        flashKey($p('#plKb svg'), ev.m, ok ? 'ok' : 'bad', 180);
        // the last note: is the run complete? (also when the whole run is an octave or two off, so it
        // ends at once and can be named, instead of waiting for the time-out)
        const last = d.steps[d.steps.length - 1];
        const lateEnough = last && performance.now() > this.t0 + last.beat * this.msBeat * 0.7 - this.msBeat;
        const shift = [0, 12, -12, 24, -24].find(
          sh => last && last.midis.some(m => sameNote(ev.m - sh, m, ev.src)),
        );
        if (lateEnough && shift != null) {
          const rel = this.ons
            .filter(o => o.t > this.t0 - this.msBeat * 1.5)
            .map(o => (shift ? { ...o, m: o.m - shift } : o));
          if (rel.length >= Math.max(2, d.steps.length * 0.6)) {
            const an = analyzeSeq(rel, d.steps, this.msBeat, { one: P.lenient });
            // an octave off: only right at the end, and only when nearly every note fits the shift
            const atEnd = performance.now() > this.t0 + (last.beat - 1.5) * this.msBeat;
            if (an.complete && (!shift || (atEnd && an.accuracy >= 0.8)))
              later(() => this.finish('complete'), 450);
          }
        }
      },
      finish(why) {
        if (!['countin', 'tempo'].includes(P.phase)) return;
        Metro.stop();
        this.unwatch();
        setPhase('review', why);
        const d = P.drill;
        const rel = this.ons.filter(o => o.t > this.t0 - this.msBeat * 1.5);
        if (rel.length < 2) {
          P.idle++;
          if (P.idle >= 2) {
            setPhase('paused');
            msg('Paused. Play any key when you are ready.', '');
            return;
          }
          msg(`I heard ${rel.length ? 'one note' : 'nothing'}. Again…`, 'bad');
          later(() => this.countIn(), 2600);
          return;
        }
        P.idle = 0;
        const an = analyzeSeq(rel, d.steps, this.msBeat, { one: P.lenient });
        an.res.forEach(r => {
          if (r.ok) hl.ok.add(r.i);
          else hl.bad.add(r.i);
        });
        hl.cur = -1;
        paintStaff();
        paintKb(-1, false);
        if (an.matched < d.steps.length * 0.5 && rel.length < d.steps.length * 0.5) {
          msg('That rep was cut short; it does not count. Again…');
          log('incomplete rep', { matched: an.matched });
          later(() => this.countIn(), 2600);
          return;
        }
        const judged = judgeTempoRun(an, d, rel);
        if (judged.ignore) {
          // the other hand's part: say so and run it again, without counting it
          msg(judged.note, 'bad');
          log('rep ignored', { why: judged.why });
          P.forceHints = true;
          later(() => {
            replan('after rep');
            startRep();
          }, 3200);
          return;
        }
        const valid = Input.live && Input.mode !== 'touch' && !P.lenient && !rel.some(o => o.src === 'touch');
        const weak = weakHand(
          d,
          an.res.filter(r => !r.ok).map(r => r.i),
        );
        report({
          mode: 'tempo',
          hand: P.plan.hand,
          clean: judged.rating === 'clean',
          rating: judged.rating,
          acc: an.accuracy,
          wrong: an.wrong,
          tempoRatio: an.tempoRatio,
          sd: d.even ? an.sdGap : an.sdBeat,
          bpm: P.plan.bpm,
          played: judged.played,
          adopt: judged.adopt,
          valid,
          weak,
          msg: judged.note,
          tech: techniqueReport(an, d),
          an,
        });
      },
    };

    /* ---------- judging a run with the metronome ---------- */
    // rating: 'clean' | 'slips' | 'messy', with a note; adopt: steady and faster than the click;
    // ignore: the other hand's part was played (does not count)
    function judgeTempoRun(an, d, rel) {
      const opts = { one: P.lenient };
      const played = Math.round(P.plan.bpm * an.tempoRatio);
      const mic = Input.mode === 'mic';
      // right notes in the wrong octave, or the other hand's part
      if (an.accuracy < 0.6) {
        for (const sh of [12, -12, 24, -24]) {
          const alt = analyzeSeq(
            rel.map(o => ({ ...o, m: o.m - sh })),
            d.steps,
            T.msBeat,
            opts,
          );
          if (alt.accuracy >= 0.8) {
            P.forceHints = true;
            return {
              rating: 'slips',
              played,
              note: `The right notes, but ${octaves(sh)} than written. Check the clef, then play it there.`,
            };
          }
        }
        if (d.ghost && d.ghost.length) {
          const other = new Set(d.ghost.map(n => midiOf(n.n)));
          const mine = new Set(d.steps.flatMap(s => s.midis));
          const theirs = rel.filter(o => other.has(o.m) && !mine.has(o.m)).length;
          if (theirs >= rel.length * 0.5)
            return {
              ignore: true,
              why: 'other hand',
              note: `That was the other hand's part. This run is ${handWord(P.plan.hand)}: play only the dark notes.`,
            };
        }
      }
      // timing: 1 good, 2 fair, 3 uneven
      const [v, lim] = d.piece
        ? [an.sdMs, Math.max(40, LIMIT.piece * T.msBeat * Math.max(an.gapBeats, 0.5))]
        : [an.sdGap, mic ? LIMIT.evenMic : LIMIT.even];
      const timing = v < lim ? 1 : v < lim * FAIR ? 2 : 3;
      const notesOk = an.accuracy === 1 && an.wrong <= (mic ? 1 : 0);
      const ratio = an.tempoRatio;
      if (notesOk && timing < 3) {
        if (Math.abs(ratio - 1) <= TEMPO_TOLERANCE)
          return {
            rating: 'clean',
            played,
            note: timing === 2 ? 'Clean; a few notes a little uneven. Let the click carry you.' : '',
          };
        if (ratio > 1)
          return {
            rating: 'clean',
            played,
            adopt: P.plan.mode === 'tempo',
            note: `Right notes and steady, at ♩ ${played}.`,
          };
        return {
          rating: 'slips',
          played,
          note: `Right notes and steady, a little behind the click: ♩ ${played} instead of ${P.plan.bpm}.`,
        };
      }
      if (notesOk)
        return {
          rating: 'slips',
          played,
          note: 'Right notes; the timing was uneven. Listen for the click and lean on it.',
        };
      if (an.accuracy >= 0.9 && an.wrong <= 2)
        return {
          rating: 'slips',
          played,
          note:
            sentence([
              an.accuracy < 1 && `${d.steps.length - an.matched} missed`,
              an.wrong && `${an.wrong} wrong note${an.wrong > 1 ? 's' : ''}`,
            ]) || 'Close.',
        };
      return {
        rating: 'messy',
        played,
        note: sentence([
          an.accuracy < 1 && `${d.steps.length - an.matched} of ${d.steps.length} missed`,
          an.wrong && `${an.wrong} wrong note${an.wrong > 1 ? 's' : ''}`,
        ]),
      };
    }

    /* ---------- after every rep ---------- */
    function report(r) {
      P.repN++;
      const before = src.state(id) ? src.state(id).stage : null;
      const out = src.record(id, r);
      const next = src.plan(id);
      P.sameNext = !!next && next.mode === P.plan.mode && next.hand === P.plan.hand && !P.drill.fresh;
      log('rep', {
        mode: r.mode,
        hand: r.hand,
        rating: r.rating,
        acc: Math.round((r.acc || 0) * 100) / 100,
        wrong: r.wrong,
        hes: r.hes,
        sd: r.sd != null ? Math.round(r.sd * 1000) / 1000 : undefined,
        tr: r.tempoRatio ? Math.round(r.tempoRatio * 100) / 100 : undefined,
        bpm: r.bpm,
        valid: r.valid,
        change: out.change,
      });
      msg(out.msg || r.msg || (r.clean ? 'Clean.' : 'Again.'), out.tone || (r.clean ? 'ok' : 'bad'));
      if (r.mode === 'tempo' && r.an) showTiming(r.an);
      onEvent({ type: 'rep', r, out, stageBefore: before });
      if (P.dead || P.held) return;
      const delay =
        out.change === 'stage' || out.change === 'done' || out.change === 'phase'
          ? 3200
          : r.mode === 'tempo'
            ? 2600
            : 1400;
      later(() => {
        replan('after rep');
        startRep();
      }, delay);
    }
    function showTiming(an) {
      if (!an || !an.res.length) return;
      // a strip of dots: how early or late each note was compared with your own steady tempo
      const n = an.res.length;
      const W = 300,
        H = 36;
      let s = `<line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="ln"/>`;
      an.res.forEach((r, i) => {
        const x = 8 + (i * (W - 16)) / Math.max(1, n - 1);
        if (!r.ok) {
          s += `<text x="${x}" y="${H / 2 + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--bad)">×</text>`;
          return;
        }
        const y = H / 2 - clamp((r.dev || 0) / (an.msPerBeatPlayed || 1) / 0.25, -1, 1) * (H / 2 - 4);
        s += `<circle cx="${x}" cy="${y}" r="2.6" fill="var(--rh)"/>`;
      });
      const cue = $p('#plCue');
      if (cue)
        cue.innerHTML = `<span>Timing</span><svg viewBox="0 0 ${W} ${H}" class="timing-strip" aria-label="How early or late each note was">${s}</svg>`;
    }

    /* ---------- input ---------- */
    /* any octave (Moods practice, unless you ask for the exact one): a note counts in whatever octave you
       play it. It is read as the nearest written note with its name: the one you are on, in wait mode */
    const fold = ev => {
      const d = P.drill;
      if (!P.plan.anyOctave || !d || !d.steps.length) return ev;
      const step = P.plan.mode === 'wait' ? d.steps[P.phase === 'review' ? 0 : W.i] : null;
      const near = list =>
        list
          .filter(m => (((m - ev.m) % 12) + 12) % 12 === 0)
          .sort((a, b) => Math.abs(a - ev.m) - Math.abs(b - ev.m))[0];
      const m =
        (step && near(step.midis.filter(x => !W.got.has(x)))) ??
        (step && near(step.midis)) ??
        near(d.steps.flatMap(x => x.midis));
      return m == null || m === ev.m ? ev : { ...ev, m, played: ev.m };
    };
    const onNote = Log.guard('player note', raw => {
      if (P.dead || !P.plan) return;
      const ev = fold(raw);
      if (P.plan.mode === 'wait') {
        if (['ready', 'wait', 'review'].includes(P.phase)) W.note(ev);
      } else T.note(ev);
    });
    P.offs.push(Input.on(onNote));
    $p('#plGo').onclick = Log.guard('player go', () => {
      AudioEngine.ensure();
      if (P.plan.mode === 'wait') {
        log('restart');
        startRep();
        return;
      }
      if (['countin', 'tempo'].includes(P.phase)) {
        Metro.stop();
        T.unwatch();
        cancel();
        setPhase('stopped');
        msg('Stopped. Tap Start, or play any key, when you are ready.');
        return;
      }
      if (P.phase === 'review') {
        cancel();
        setPhase('stopped');
        msg('Paused. Tap Start, or play any key, when you are ready.');
        return;
      }
      T.countIn();
    });
    $p('#plHear').onclick = Log.guard('player hear', () => {
      const d = P.drill;
      if (!d) return;
      const bpm = P.plan.mode === 'tempo' ? P.plan.bpm : Math.min(P.plan.bpm || 60, P.def.target || 60);
      const spb = 60 / bpm;
      const t0 = AudioEngine.now() + 0.1;
      d.steps.forEach(s =>
        s.midis.forEach(m =>
          AudioEngine.note(m, t0 + s.beat * spb, Math.max(0.25, (s.dur || 0.5) * spb * 0.95), 0.55),
        ),
      );
    });
    $p('#plAbout').onclick = () => (about || src.about)(id);
    // leaving the app (screen off, another app) stops the metronome; any key or Start resumes
    const onVis = () => {
      if (
        document.visibilityState === 'hidden' &&
        ['countin', 'tempo', 'review'].includes(P.phase) &&
        P.plan.mode === 'tempo'
      ) {
        Metro.stop();
        T.unwatch();
        cancel();
        setPhase('stopped');
        msg('Paused while the app was in the background. Tap Start, or play any key.');
      }
    };
    document.addEventListener('visibilitychange', onVis);
    P.offs.push(() => document.removeEventListener('visibilitychange', onVis));

    Player.debug = { P, W, T }; // for automated tests
    replan('init');
    if (P.plan) startRep();
    log('mounted', { stage: (src.state(id) || {}).stage });
    return {
      get phase() {
        return P.phase;
      },
      get plan() {
        return P.plan;
      },
      hold(on) {
        P.held = on;
        if (on) cancel();
      },
      destroy() {
        if (P.dead) return;
        P.dead = true;
        cancel();
        clearTimeout(W.hintT);
        T.unwatch();
        Metro.stop();
        P.offs.forEach(f => {
          try {
            f();
          } catch (e) {}
        });
        log('destroyed');
      },
    };
  },
};
