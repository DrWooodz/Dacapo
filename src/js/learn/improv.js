/* Improvising over a backing: the loop, and how often strong-beat notes land on chord tones. */
import { Log } from '../core/log.js';
import { esc, fmtTime } from '../core/util.js';
import { AudioEngine } from '../core/audio.js';
import { Input } from '../core/input.js';
import { kbSVG } from '../music/render.js';
import { mms, PAL_BY_ID, palChords } from '../music/drills.js';
import { criterion, itemState, recordImprov } from './curriculum.js';

/* ---------- improvisation over a backing loop ---------- */
export const Improv = {
  start(P, root, onEvent) {
    const Pal = PAL_BY_ID[P.def.pal];
    const chords = palChords(Pal);
    const scale = mms(Pal.scale);
    const pcs = new Set(scale.map(m => ((m % 12) + 12) % 12));
    const strong = Pal.meter === 4 ? [0, 2] : [0];
    const bpm = Pal.bpm;
    let timer = null,
      nextBar = 0,
      barIdx = 0,
      cur = 0;
    const bars = [],
      played = [];
    let ui = [];
    let activeMs = 0,
      lastNote = 0;
    const stage = root.querySelector('.pl-stage');
    const go = root.querySelector('#plGo');
    const info = root.querySelector('#plInfo');
    const chordChips = chords.map((c, i) => `<span class="chip" data-c="${i}">${esc(c.n)}</span>`).join('');
    stage.innerHTML = `<div class="improv-chords" id="ipChords">${chordChips}</div>
      <p class="small improv-how">${esc(Pal.how)}</p>`;
    const paint = () => {
      const marks = {};
      for (let k = 36; k <= 88; k++) if (pcs.has(k % 12)) marks[k] = { cls: 'tone' };
      const ch = chords[cur];
      for (let k = 36; k <= 88; k++) if (ch.pcs.has(k % 12)) marks[k] = { cls: 'rh', f: '•' };
      const kb = root.querySelector('#plKb');
      if (kb) kb.innerHTML = kbSVG({ from: 48, to: 84, marks, h: 110 });
      root
        .querySelectorAll('#ipChords [data-c]')
        .forEach((el, i) => el.setAttribute('aria-pressed', String(i === cur)));
    };
    const scheduleBar = (t, ch) => {
      const spb = 60 / bpm;
      const meter = Pal.meter;
      if (Pal.pat === 'oompah') {
        AudioEngine.note(ch.bass, t, spb * 2.5, 0.55);
        AudioEngine.chord(ch.tones, t + spb, spb * 2, 0.38);
      } else if (Pal.pat === 'arp') {
        const seq = [ch.bass, ...ch.tones, ch.tones[1], ch.tones[0], ch.tones[2], ch.tones[1]];
        seq.forEach((x, i) => AudioEngine.note(x, t + (i * spb) / 2, spb * 1.5, i === 0 ? 0.5 : 0.32));
      } else if (Pal.pat === 'bells') {
        AudioEngine.chord([ch.bass, ch.bass + 12], t, spb * 3, 0.6);
        AudioEngine.chord(ch.tones, t, spb * 2, 0.4);
        AudioEngine.chord(ch.tones, t + spb * 2, spb * 2, 0.32);
      } else {
        AudioEngine.note(ch.bass, t, spb * meter, 0.45);
        AudioEngine.chord(ch.tones, t, spb * meter, 0.3);
      }
    };
    const analyze = () => {
      const now = performance.now();
      const spbMs = 60000 / bpm;
      let land = 0,
        ct = 0,
        n = 0;
      bars
        .filter(b => b.end < now)
        .forEach(b => {
          n++;
          strong.forEach(sb => {
            const bt = b.start + sb * spbMs;
            const hit = played.filter(p => Math.abs(p.t - bt) < 150);
            if (hit.length) {
              land++;
              if (hit.some(p => b.pcs.has(p.m % 12))) ct++;
            }
          });
        });
      return { land, ct, bars: n, pct: land ? Math.round((ct / land) * 100) : null };
    };
    const paintInfo = () => {
      const a = analyze();
      if (info)
        info.textContent =
          `${fmtTime(activeMs / 1000)} played` + (a.pct != null ? ` · ${a.pct}% on chord tones` : '');
    };
    const stop = silent => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      ui.forEach(clearTimeout);
      ui = [];
      go.textContent = 'Start backing';
      const a = analyze();
      const counted = activeMs > 0;
      const res = counted ? recordImprov(P.id, activeMs, a.pct, a.bars) : null;
      activeMs = 0;
      bars.length = 0;
      played.length = 0;
      Log.ev('improv stop', { pct: a.pct, bars: a.bars, res });
      if (!silent) {
        const it = itemState(P.id) || {};
        const m = root.querySelector('#plMsg');
        if (m) {
          m.className = 'feedback pl-msg ' + (res === 'done' ? 'ok' : '');
          m.textContent =
            res === 'done'
              ? 'Integrated: you can improvise in this style. New palette next.'
              : counted
                ? `Saved. ${criterion(P.id)}.`
                : 'Practice only: connect your piano to count the time.';
        }
        onEvent({ type: 'improv', res, mins: it.mins });
      }
      root.querySelector('#plCrit').textContent = criterion(P.id);
    };
    const start = () => {
      AudioEngine.ensure();
      lastNote = 0; // time between two sittings is not playing time
      go.textContent = 'Stop backing';
      nextBar = AudioEngine.now() + 0.2;
      barIdx = 0;
      Log.ev('improv start', { pal: Pal.id, bpm });
      const tick = () => {
        while (nextBar < AudioEngine.ctx.currentTime + 0.3) {
          const i = barIdx % chords.length;
          const ch = chords[i];
          scheduleBar(nextBar, ch);
          const st = AudioEngine.toPerf(nextBar);
          bars.push({ start: st, end: st + (60000 / bpm) * Pal.meter, pcs: ch.pcs });
          ui.push(
            setTimeout(
              () => {
                cur = i;
                if (!P.dead) {
                  paint();
                  paintInfo();
                }
              },
              Math.max(0, (nextBar - AudioEngine.ctx.currentTime) * 1000),
            ),
          );
          if (ui.length > 24) ui.splice(0, 12);
          nextBar += (60 / bpm) * Pal.meter;
          barIdx++;
        }
        if (activeMs >= 3 * 60000 && !P.goalSent) {
          P.goalSent = true;
          onEvent({ type: 'goal', why: 'time' });
        }
      };
      timer = setInterval(Log.guard('improv tick', tick), 60);
      tick();
    };
    P.offs.push(
      Input.on(ev => {
        if (!timer) return;
        played.push({ t: ev.t, m: ev.m });
        // only playing on the piano counts toward the minutes (the screen keys are for trying it out)
        if (ev.src !== 'touch') {
          const now = Date.now();
          if (lastNote && now - lastNote < 8000) activeMs += now - lastNote;
          lastNote = now;
        }
        const e = root.querySelector(`#plKb [data-m="${ev.m}"]`);
        if (e) {
          e.classList.add('held');
          setTimeout(() => e.classList.remove('held'), 250);
        }
      }),
    );
    go.hidden = false;
    go.textContent = 'Start backing';
    go.onclick = Log.guard('improv go', () => (timer ? stop() : start()));
    root.querySelector('#plHear').hidden = true;
    root.querySelector('#plMsg').textContent = Input.live
      ? 'Start the backing, then improvise with your right hand.'
      : 'Start the backing and improvise. Connect your piano to count the time.';
    root.querySelector('#plCue').innerHTML =
      `<span>Aim</span> Land on a chord tone (blue keys) on ${strong.length > 1 ? 'beats 1 and 3' : 'beat 1'}.
        Gold keys are the scale.`;
    paint();
    P.improv = { stop: () => stop(true) };
  },
};
