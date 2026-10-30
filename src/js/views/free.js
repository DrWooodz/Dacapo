/* Free play: play anything. DaCapo names what it hears, keeps a loop going (Jam), plays ear games (Echo),
   backs your improvising, records you, and keeps time. */
import { Log } from '../core/log.js';
import { $, $$, clamp, esc } from '../core/util.js';
import { AudioEngine, Metro } from '../core/audio.js';
import { Input } from '../core/input.js';
import { bindSegs, onUnmount, seg, UI } from '../core/ui.js';
import { prettyKey, spellerFor } from '../music/theory.js';
import { kbSVG, staffSVG } from '../music/render.js';
import { detectChord, detectKey, dynName, groupSteps, Live } from '../music/analysis.js';
import { PALETTES } from '../music/drills.js';
import { Player } from '../learn/player.js';
import { drawJam } from './jam.js';
import { drawEcho } from './echo.js';
import { bindConnect, connectNotice } from './practice.js';
import { bindTakes, takesCardHTML } from './takes.js';

export const freeView = (page, params) => {
  const st = Object.assign({ tab: 'live', pal: 'satie' }, UI.freeState || {}, params);
  UI.freeState = st;
  const tabs = [
    ['live', 'Listen'],
    ['jam', 'Jam'],
    ['echo', 'Echo'],
    ['improv', 'Improvise'],
    ['takes', 'Record'],
    ['metro', 'Metronome'],
  ];
  page.innerHTML = `
    <div class="stack">
      <span class="eyebrow">Free play</span>
      <h1 class="h1">Just <em>play</em>.</h1>
    </div>
    ${seg('ftab', tabs, st.tab, 'wrap')}
    <div id="fBody" class="stack" style="gap:16px"></div>`;
  let off = null;
  const cleanup = () => {
    if (off) {
      try {
        off();
      } catch (e) {
        Log.err(e, 'free cleanup');
      }
      off = null;
    }
  };
  onUnmount(cleanup);
  bindSegs(page, {
    ftab: v => {
      st.tab = v;
      draw();
    },
  });
  const body = $('#fBody', page);
  const draw = () => {
    cleanup();
    const draws = {
      live: drawLive,
      jam: () => drawJam(body),
      echo: () => drawEcho(body),
      improv: drawImprov,
      takes: drawTakes,
      metro: drawMetro,
    };
    off = (draws[st.tab] || drawLive)();
  };
  draw();

  function drawLive() {
    body.innerHTML = `${connectNotice()}
      <div class="card">
        <div class="readout">
          <div class="stack" style="gap:2px;min-width:0">
            <div class="chordname" id="lvChord">–</div>
            <div class="small" id="lvLong">Play a chord or a few notes</div>
          </div>
          <div class="stack" style="align-items:flex-end;gap:4px">
            <span class="tag" id="lvPedal">Pedal up</span>
            <span class="small mono" id="lvVel"></span>
          </div>
        </div>
        <div class="kbwrap scrollx" id="lvKbWrap">
          <div class="kb88" id="lvKb">${kbSVG({ from: 21, to: 108, h: 120 })}</div>
        </div>
        <div class="staffwrap" id="lvStaff"></div>
        <p class="small" id="lvKey"></p>
      </div>`;
    bindConnect();
    const wrap = $('#lvKbWrap', body);
    const kb = () => $('#lvKb svg', body);
    requestAnimationFrame(() => {
      const k = kb() && kb().querySelector('[data-m="60"]');
      if (k && wrap.scrollWidth > wrap.clientWidth)
        wrap.scrollLeft =
          k.getBoundingClientRect().left -
          wrap.getBoundingClientRect().left -
          wrap.clientWidth / 2 +
          wrap.scrollLeft;
    });
    let keyNow = null,
      lastChord = null,
      raf = 0,
      keyT = 0;
    // spell notes in the detected key once it is reasonably clear
    const keySig = () => (keyNow && keyNow.conf > 0.04 ? keyNow.best.sig : 0);
    const speller = () => spellerFor(keySig());
    const paint = () => {
      const svg = kb();
      if (!svg) return;
      svg.querySelectorAll('.held,.sus').forEach(e => e.classList.remove('held', 'sus'));
      Live.sustained.forEach(m => {
        const e = svg.querySelector(`[data-m="${m}"]`);
        if (e) e.classList.add('sus');
      });
      Input.held.forEach((_, m) => {
        const e = svg.querySelector(`[data-m="${m}"]`);
        if (e) {
          e.classList.remove('sus');
          e.classList.add('held');
        }
      });
      $('#lvPedal', body).textContent = Input.pedal ? 'Pedal down' : 'Pedal up';
      $('#lvPedal', body).className = 'tag ' + (Input.pedal ? 'lh' : '');
      const sounding = [...new Set([...Input.held.keys(), ...Live.sustained])];
      if (sounding.length) lastChord = detectChord(sounding, speller());
      $('#lvChord', body).textContent = lastChord ? lastChord.name : '–';
      $('#lvLong', body).textContent = lastChord ? lastChord.long : 'Play a chord or a few notes';
      $('#lvStaff', body).innerHTML = recentStaff();
    };
    // your last notes on a grand staff, the newest highlighted
    const recentStaff = () => {
      const steps = groupSteps(Live.hist.slice(-40)).slice(-14);
      if (!steps.length)
        return `<p class="small" style="padding:10px">Your last notes are written here, so you can see
          what you played on the staff.</p>`;
      const sp = speller();
      const items = steps.map((g, k) => ({
        notes: g.ms.map(m => ({
          n: sp(m),
          st: m >= 60 ? 't' : 'b',
          cls: k === steps.length - 1 ? 'cur' : '',
        })),
      }));
      const svg = staffSVG({ clef: 'grand', sig: keySig(), items, spacing: 30, minW: 320, bottom: 40 }).svg;
      return `<div style="max-width:720px;margin:0 auto">${svg}</div>`;
    };
    const paintKey = () => {
      keyNow = detectKey(Live.hist.slice(-60).map(h => h.m));
      const e = $('#lvKey', body);
      if (!e) return;
      if (!keyNow) {
        e.textContent = 'Play for a little while and I will work out the key.';
        return;
      }
      const { best, second, conf } = keyNow;
      const how = conf > 0.08 ? 'Clearly' : conf > 0.03 ? 'Probably' : 'Possibly';
      const or = conf <= 0.08 ? ` (or ${prettyKey(second.k)} ${second.mode})` : '';
      e.textContent = `${how} in ${prettyKey(best.k)} ${best.mode}${or}, from your last ${Math.min(60, Live.hist.length)} notes.`;
    };
    const sched = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        paint();
      });
    };
    const o1 = Input.on(ev => {
      sched();
      if (ev.src === 'midi')
        $('#lvVel', body).textContent = `${dynName(ev.vel)} · ${Math.round(ev.vel * 127)}`;
      clearTimeout(keyT);
      keyT = setTimeout(paintKey, 600);
    });
    const o2 = Input.onOff(sched);
    paint();
    paintKey();
    return () => {
      o1();
      o2();
      cancelAnimationFrame(raf);
      clearTimeout(keyT);
    };
  }
  function drawImprov() {
    const chip = p =>
      `<button type="button" class="chip" data-pal="${p.id}" aria-pressed="${p.id === st.pal}">${esc(p.t.split(':')[0])}</button>`;
    body.innerHTML = `
      <div class="card">
        <div class="chips">${PALETTES.map(chip).join('')}</div>
        <p class="small">Improvise over a backing in the style of each composer. Time you spend here counts
          toward that style in your improvisation skill.</p>
      </div>
      ${connectNotice()}
      <div id="fImp" style="position:relative"></div>`;
    bindConnect();
    body.querySelectorAll('[data-pal]').forEach(b => {
      b.onclick = () => {
        st.pal = b.dataset.pal;
        draw();
      };
    });
    const pl = Player.mount($('#fImp', body), { id: `i:imp:${st.pal}`, role: 'focus' });
    return () => pl.destroy();
  }
  function drawTakes() {
    body.innerHTML = `${connectNotice()}<div class="card" id="fTakes">${takesCardHTML()}</div>`;
    bindConnect();
    return bindTakes($('#fTakes', body));
  }
  function drawMetro() {
    let bpm = Metro.bpm || 72;
    let beats = Metro.beats || 4;
    const meters = ['2', '3', '4', '6'].map(n => [n, n]);
    body.innerHTML = `
      <div class="card">
        <div class="cardhead"><h2 class="h2">Metronome</h2></div>
        <div class="row between">
          <div class="chordname mono" id="mBpm">${bpm}</div>
          <div class="row">
            <button class="btn" type="button" data-d="-1">−</button>
            <button class="btn" type="button" data-d="1">+</button>
            <button class="btn" type="button" id="mTap">Tap</button>
          </div>
        </div>
        <input type="range" id="mRange" min="30" max="220" value="${bpm}">
        <div class="row"><span class="small">Beats per bar</span>${seg('mBeats', meters, beats)}</div>
        <div class="beats" id="mDots">${'<i></i>'.repeat(beats)}</div>
        <button class="btn cover big" type="button" id="mGo">${Metro.running ? 'Stop' : 'Start'}</button>
      </div>`;
    const set = v => {
      bpm = clamp(Math.round(v), 30, 220);
      $('#mBpm', body).textContent = bpm;
      $('#mRange', body).value = bpm;
      if (Metro.running) Metro.start({ bpm, beats, sub: 1 });
    };
    body.querySelectorAll('[data-d]').forEach(b => (b.onclick = () => set(bpm + +b.dataset.d)));
    $('#mRange', body).oninput = e => set(+e.target.value);
    $('#mTap', body).onclick = () => {
      Metro.tap();
      set(Metro.bpm);
    };
    bindSegs(body, {
      mBeats: v => {
        beats = +v;
        $('#mDots', body).innerHTML = '<i></i>'.repeat(beats);
        if (Metro.running) Metro.start({ bpm, beats, sub: 1 });
      },
    });
    $('#mGo', body).onclick = e => {
      AudioEngine.ensure();
      if (Metro.running) {
        Metro.stop();
        e.target.textContent = 'Start';
      } else {
        Metro.start({ bpm, beats, sub: 1 });
        e.target.textContent = 'Stop';
      }
    };
    const offB = Metro.on((k, q) => {
      if (k !== 'beat') return;
      $$('#mDots i', body).forEach((d, j) => {
        d.classList.toggle('on', j === q.beat);
        d.classList.toggle('acc', q.beat === 0);
      });
    });
    return () => {
      offB();
      Metro.stop();
    };
  }
};
