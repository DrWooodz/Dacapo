/* Recording yourself: takes kept on the device, with playback. */
import { $, clamp, esc, fmtTime, meanOf, toast } from '../core/util.js';
import { AudioEngine } from '../core/audio.js';
import { Input } from '../core/input.js';
import { midiName } from '../music/theory.js';
import { isBlack } from '../music/render.js';
import { dynName, groupSteps } from '../music/analysis.js';

/* ---------- takes: record what you play (any input), see it as a piano roll, play it back ---------- */
const Takes = {
  rec: null,
  offs: [],
  playing: null,
  list() {
    try {
      return JSON.parse(localStorage.getItem('dacapo.takes') || '[]');
    } catch (e) {
      return [];
    }
  },
  saveList(l) {
    try {
      localStorage.setItem('dacapo.takes', JSON.stringify(l.slice(0, 8)));
    } catch (e) {
      toast('This browser is full; older takes were not kept.');
    }
  },
  start() {
    this.stopRec(true);
    this.rec = { t0: performance.now(), ev: [] };
    this.offs = [
      Input.on(
        ev =>
          this.rec && this.rec.ev.push([Math.round(ev.t - this.rec.t0), 'n', ev.m, Math.round(ev.vel * 127)]),
      ),
      Input.onOff(ev => {
        if (!this.rec) return;
        if (ev.pedal != null) this.rec.ev.push([Math.round(ev.t - this.rec.t0), 'p', ev.pedal ? 1 : 0]);
        else this.rec.ev.push([Math.round(ev.t - this.rec.t0), 'f', ev.m]);
      }),
    ];
  },
  stopRec(discard) {
    this.offs.forEach(f => f());
    this.offs = [];
    const r = this.rec;
    this.rec = null;
    if (discard || !r) return null;
    const ev = r.ev.filter(e => e[0] >= -200).sort((a, b) => a[0] - b[0]);
    if (!ev.some(e => e[1] === 'n')) return null;
    const first = ev.find(e => e[1] === 'n')[0];
    ev.forEach(e => (e[0] -= first));
    const take = { id: 't' + Date.now().toString(36), d: Date.now(), ev, name: '' };
    const l = this.list();
    l.unshift(take);
    this.saveList(l);
    return take;
  },
  // pair note-ons with offs; the sustain pedal extends notes until it lifts
  notes(take) {
    const out = [],
      open = new Map();
    let pedal = false;
    const held = new Set();
    const pedalSpans = [];
    let pStart = 0;
    const end = take.ev.length ? take.ev[take.ev.length - 1][0] + 400 : 0;
    take.ev.forEach(([t, k, m, v]) => {
      if (k === 'n') {
        if (open.has(m)) {
          const o = open.get(m);
          o.dur = t - o.t;
          out.push(o);
        }
        open.set(m, { t, m, vel: v / 127, dur: 0 });
        held.add(m);
      } else if (k === 'f') {
        held.delete(m);
        if (!pedal && open.has(m)) {
          const o = open.get(m);
          o.dur = t - o.t;
          out.push(o);
          open.delete(m);
        }
      } else if (k === 'p') {
        if (m) {
          pedal = true;
          pStart = t;
        } else {
          pedal = false;
          pedalSpans.push([pStart, t]);
          open.forEach((o, mm) => {
            if (!held.has(mm)) {
              o.dur = t - o.t;
              out.push(o);
              open.delete(mm);
            }
          });
        }
      }
    });
    if (pedal) pedalSpans.push([pStart, end]);
    open.forEach(o => {
      o.dur = Math.max(300, end - o.t);
      out.push(o);
    });
    out.forEach(o => (o.dur = Math.max(60, o.dur)));
    return {
      notes: out.sort((a, b) => a.t - b.t),
      pedal: pedalSpans,
      dur: Math.max(end, ...out.map(o => o.t + o.dur)),
    };
  },
  play(take, onEnd) {
    this.stop();
    const { notes, dur } = this.notes(take);
    const t0 = AudioEngine.now() + 0.15;
    notes.forEach(n => AudioEngine.note(n.m, t0 + n.t / 1000, n.dur / 1000, clamp(n.vel, 0.08, 1)));
    const startPerf = performance.now() + 150;
    this.playing = {
      startPerf,
      dur,
      timer: setTimeout(() => {
        this.playing = null;
        onEnd && onEnd();
      }, dur + 400),
    };
    return startPerf;
  },
  stop() {
    if (this.playing) {
      clearTimeout(this.playing.timer);
      this.playing = null;
      AudioEngine.stopAll();
    }
  },
  stats(take) {
    const { notes, pedal, dur } = this.notes(take);
    if (!notes.length) return null;
    const vels = notes.map(n => n.vel);
    const lo = Math.min(...notes.map(n => n.m)),
      hi = Math.max(...notes.map(n => n.m));
    const onsets = groupSteps(
      notes.map(n => ({ t: n.t, m: n.m, vel: n.vel })),
      50,
    );
    let gap = 0;
    for (let i = 1; i < onsets.length; i++) gap = Math.max(gap, onsets[i].t - onsets[i - 1].t);
    const ped = pedal.reduce((a, [x, y]) => a + (y - x), 0);
    return {
      n: notes.length,
      dur,
      nps: notes.length / Math.max(1, dur / 1000),
      vlo: Math.min(...vels),
      vhi: Math.max(...vels),
      vavg: meanOf(vels),
      lo,
      hi,
      gap,
      pedalPct: dur ? ped / dur : 0,
    };
  },
  roll(take, w = 640) {
    const { notes, pedal, dur } = this.notes(take);
    if (!notes.length) return '';
    const lo = Math.min(...notes.map(n => n.m)) - 2,
      hi = Math.max(...notes.map(n => n.m)) + 2;
    const rows = hi - lo + 1;
    const rh = clamp(Math.floor(180 / rows), 3, 9);
    const H = rows * rh + 18;
    const sx = (w - 30) / Math.max(1, dur);
    let s = '';
    for (let m = lo; m <= hi; m++) {
      const y = (hi - m) * rh;
      if (isBlack(m)) s += `<rect x="28" y="${y}" width="${w - 28}" height="${rh}" fill="var(--sunk)"/>`;
      if (m % 12 === 0)
        s +=
          `<text x="0" y="${y + rh - 1}" font-size="8" fill="var(--muted)">C${m / 12 - 1}</text>` +
          `<line x1="28" x2="${w}" y1="${y + rh}" y2="${y + rh}" stroke="var(--line)"/>`;
    }
    for (let sec = 0; sec * 1000 < dur; sec += dur > 30000 ? 5 : 1) {
      const x = 30 + sec * 1000 * sx;
      s += `<line x1="${x}" x2="${x}" y1="0" y2="${rows * rh}" stroke="var(--line)" stroke-width=".5"/>`;
    }
    notes.forEach(n => {
      const y = (hi - n.m) * rh;
      const x = (30 + n.t * sx).toFixed(1);
      const width = Math.max(2, n.dur * sx).toFixed(1);
      const opacity = (0.25 + n.vel * 0.75).toFixed(2); // louder notes are darker
      s += `<rect x="${x}" y="${y + 0.5}" width="${width}" height="${rh - 1}" rx="1.5" fill="var(--rh)" fill-opacity="${opacity}"/>`;
    });
    pedal.forEach(([a, b]) => {
      const width = Math.max(2, (b - a) * sx);
      s += `<rect x="${30 + a * sx}" y="${rows * rh + 6}" width="${width}" height="6" rx="2" fill="var(--brass)"/>`;
    });
    const playhead = `<line class="playhead" x1="30" x2="30" y1="0" y2="${rows * rh}" stroke="var(--brass)" stroke-width="2" opacity="0"/>`;
    return `<svg class="roll" viewBox="0 0 ${w} ${H}" style="width:100%;height:auto" role="img"
      aria-label="Piano roll of the take"><g>${s}</g>${playhead}</svg>`;
  },
};

export function takesCardHTML() {
  return `
    <div class="cardhead">
      <h2 class="h2">Takes</h2>
      <span class="small">Record, look, listen back</span>
    </div>
    <p class="small">Listening back is the most honest feedback there is. Record a run-through, then listen
      away from the keys: you hear rushing, uneven runs and muddy pedal that you miss while playing. Takes
      stay on this device (last 8).</p>
    <div class="row">
      <button class="btn cover" type="button" id="tkRec">● Record</button>
      <span class="small mono" id="tkTime"></span>
    </div>
    <div id="tkList" class="stack"></div>`;
}

export function bindTakes(root) {
  const recBtn = $('#tkRec', root),
    timeEl = $('#tkTime', root),
    list = $('#tkList', root);
  let tick = 0;
  const paint = () => {
    const l = Takes.list();
    list.innerHTML = l.length
      ? l
          .map((t, i) => {
            const st = Takes.stats(t);
            if (!st) return '';
            const when = new Date(t.d).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            });
            const facts = [
              fmtTime(st.dur / 1000),
              `${st.n} notes`,
              `${midiName(st.lo, true)}–${midiName(st.hi, true)}`,
              st.vhi > 0 && `dynamics ${dynName(st.vlo)}–${dynName(st.vhi)}`,
              st.pedalPct && `pedal down ${Math.round(st.pedalPct * 100)}%`,
              st.gap > 2500 && `longest stop ${(st.gap / 1000).toFixed(1)}s`,
            ];
            return `<div class="take" data-id="${t.id}">
              <div class="row between">
                <b>${esc(t.name || when)}</b>
                <div class="row">
                  <button class="btn sm" type="button" data-play="${t.id}">▶ Play</button>
                  <button class="btn sm ghost" type="button" data-del="${t.id}" aria-label="Delete take">Delete</button>
                </div>
              </div>
              ${i === 0 ? `<div class="rollwrap">${Takes.roll(t)}</div>` : ''}
              <div class="small">${facts.filter(Boolean).join(' · ')}</div>
            </div>`;
          })
          .join('')
      : '<p class="small">No takes yet.</p>';
    list.querySelectorAll('[data-play]').forEach(
      b =>
        (b.onclick = () => {
          const t = Takes.list().find(x => x.id === b.dataset.play);
          if (!t) return;
          if (Takes.playing) {
            Takes.stop();
            paint();
            return;
          }
          b.textContent = '■ Stop';
          const start = Takes.play(t, paint);
          const svg = b.closest('.take').querySelector('svg.roll');
          if (svg) {
            const ph = svg.querySelector('.playhead');
            const W = svg.viewBox.baseVal.width;
            const dur = Takes.playing.dur;
            ph.setAttribute('opacity', 1);
            const anim = () => {
              if (!Takes.playing) {
                ph.setAttribute('opacity', 0);
                return;
              }
              const x = 30 + clamp((performance.now() - start) / dur, 0, 1) * (W - 30);
              ph.setAttribute('x1', x);
              ph.setAttribute('x2', x);
              requestAnimationFrame(anim);
            };
            requestAnimationFrame(anim);
          }
        }),
    );
    list.querySelectorAll('[data-del]').forEach(
      b =>
        (b.onclick = () => {
          const all = Takes.list();
          const i = all.findIndex(x => x.id === b.dataset.del);
          const [gone] = all.splice(i, 1);
          Takes.saveList(all);
          paint();
          toast('Take deleted', 6000, {
            label: 'Undo',
            run: () => {
              const a = Takes.list();
              a.splice(i, 0, gone);
              Takes.saveList(a);
              paint();
            },
          });
        }),
    );
  };
  recBtn.onclick = () => {
    if (Takes.rec) {
      clearInterval(tick);
      const t = Takes.stopRec();
      recBtn.textContent = '● Record';
      recBtn.classList.remove('bad');
      timeEl.textContent = '';
      if (!t) toast('Nothing was played, so nothing was saved.');
      paint();
      return;
    }
    AudioEngine.ensure();
    Takes.start();
    recBtn.textContent = '■ Stop';
    recBtn.classList.add('bad');
    const t0 = performance.now();
    tick = setInterval(() => {
      timeEl.textContent =
        '● ' +
        fmtTime((performance.now() - t0) / 1000) +
        (Takes.rec ? ` · ${Takes.rec.ev.filter(e => e[1] === 'n').length} notes` : '');
    }, 250);
  };
  paint();
  return () => {
    clearInterval(tick);
    if (Takes.rec) {
      const t = Takes.stopRec();
      if (t) toast('Take saved');
    }
    Takes.stop();
  };
}
