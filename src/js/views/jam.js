/* Jam: a loop station. Pick a beat, record a layer on the piano (or on the screen), record another on top,
   and keep going. Sketches stay on this device, and save as a MIDI file for any music program. */
import { IN_CLAUDE } from '../env.js';
import { Log } from '../core/log.js';
import { $, $$, clamp, esc, toast } from '../core/util.js';
import { AudioEngine } from '../core/audio.js';
import { Input } from '../core/input.js';
import { bindSegs, closeBtn, closeSheet, openSheet, seg } from '../core/ui.js';
import { saveFile } from '../core/files.js';
import { kbSVG } from '../music/render.js';
import {
  BEAT_BY,
  beatPattern,
  BEATS,
  cleanLoop,
  GRIDS,
  loopBeats,
  loopToMidi,
  MAX_LAYERS,
  newLoop,
  setMeter,
  stepsPerBar,
} from '../music/loop.js';
import { DRUMS, SOUND_BY, SOUNDS } from '../music/instruments.js';
import { Transport } from '../music/transport.js';
import { Sounds } from '../music/sounds.js';

/* ---------- sketches, kept on this device (and in backup files) ---------- */
const CURRENT = 'dacapo.jam'; // the sketch on the Jam screen
const LIST = 'dacapo.sketches';
const MAX_SKETCHES = 20;

export const Sketches = {
  read(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch (e) {
      return fallback;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      Log.warn('sketch not saved', String(e));
      return false;
    }
  },
  list() {
    const l = this.read(LIST, []);
    return Array.isArray(l) ? l : [];
  },
  current() {
    return cleanLoop(this.read(CURRENT, null));
  },
  keep(L) {
    this.write(CURRENT, L);
  },
  save(L) {
    const l = this.list().filter(x => x.id !== L.id);
    l.unshift({ ...L, saved: Date.now() });
    if (!this.write(LIST, l.slice(0, MAX_SKETCHES))) toast('This browser is full; the sketch was not saved.');
  },
  remove(id) {
    this.write(
      LIST,
      this.list().filter(x => x.id !== id),
    );
  },
  // restoring a backup: sketches from the file are added to the ones here
  merge(list) {
    if (!Array.isArray(list)) return;
    const have = new Set(this.list().map(x => x.id));
    this.write(
      LIST,
      [...this.list(), ...list.filter(x => x && x.id && !have.has(x.id))].slice(0, MAX_SKETCHES),
    );
  },
};

const SOUND_CHOICES = [...SOUNDS.map(s => [s.id, s.n]), ['drums', 'Drum pads']];
const soundName = id => (id === 'drums' ? 'Drums' : SOUND_BY[id].n);

/* ---------- the screen ---------- */
export function drawJam(body) {
  const L = Sketches.current();
  const ui = { sound: 'piano', play: 'keys', raf: 0 };
  const keep = () => Sketches.keep(L);
  if (!Transport.playing) Transport.L = L;
  // the screen keys play the sound you record with
  Input.touchSound = {
    on: (m, vel) => Sounds.start(ui.sound === 'drums' ? 'piano' : ui.sound, m, vel),
    off: h => Sounds.stop(h),
  };

  body.innerHTML = `
    <div class="card jam">
      <div class="row between">
        <div class="row">
          <button class="btn cover" type="button" id="jPlay">Play</button>
          <button class="btn rec" type="button" id="jRec" aria-pressed="false">Record</button>
        </div>
        <div class="row tempo">
          <button class="btn sm" type="button" data-bpm="-5" aria-label="Slower">−</button>
          <b class="mono" id="jBpm"></b>
          <button class="btn sm" type="button" data-bpm="5" aria-label="Faster">+</button>
        </div>
      </div>
      <div class="jam-bar" id="jBar" aria-hidden="true"></div>
      <div class="small" id="jMsg" aria-live="polite"></div>
      <div class="stack" style="gap:6px">
        <span class="small">Record with</span>
        <div class="chips" id="jSounds"></div>
      </div>
      <details class="jam-more">
        <summary class="small">Loop settings</summary>
        <div class="stack" style="gap:10px;margin-top:10px">
          <div class="row"><span class="small">Bars</span>${seg(
            'jBars',
            [1, 2, 4, 8].map(n => [n, n]),
            L.bars,
          )}</div>
          <div class="row"><span class="small">Meter</span>${seg(
            'jMeter',
            [
              [4, '4/4'],
              [3, '3/4'],
            ],
            L.beats,
          )}</div>
          <label class="row"><span class="small">Swing</span>
            <input type="range" id="jSwing" min="50" max="75" value="${Math.round(L.swing * 100)}"></label>
          <label class="toggle"><input type="checkbox" id="jClick" ${L.click ? 'checked' : ''}>
            <span><b>Click</b><span class="small">A metronome with the loop (there is always one bar of
              count-in before recording from a stop).</span></span></label>
        </div>
      </details>
    </div>

    <div class="card">
      <div class="cardhead"><h2 class="h2">Drums</h2><span class="small">One bar, repeated</span></div>
      <div class="chips" id="jBeats"></div>
      <div class="drumgrid scrollx" id="jGrid"></div>
    </div>

    <div class="card">
      <div class="cardhead"><h2 class="h2">Layers</h2><span class="small" id="jCount"></span></div>
      <div class="stack" style="gap:0" id="jLayers"></div>
      <div class="row">
        <button class="btn sm ghost" type="button" id="jUndo">Undo last layer</button>
        <button class="btn sm ghost" type="button" id="jClear">Clear all</button>
      </div>
    </div>

    <div class="card">
      <div class="cardhead">
        <h2 class="h2">Play here</h2>
        ${seg(
          'jPlayOn',
          [
            ['keys', 'Keys'],
            ['pads', 'Drum pads'],
          ],
          ui.play,
        )}
      </div>
      <div id="jHere"></div>
    </div>

    <div class="card">
      <div class="cardhead"><h2 class="h2">Sketches</h2></div>
      <div class="row">
        <input class="input" id="jName" placeholder="Name this sketch" maxlength="40" value="${esc(L.name)}">
      </div>
      <div class="row">
        <button class="btn sm cover" type="button" id="jSave">Save</button>
        <button class="btn sm" type="button" id="jMidi">Save as MIDI file</button>
        <button class="btn sm ghost" type="button" id="jOpen">Open…</button>
        <button class="btn sm ghost" type="button" id="jNew">New</button>
      </div>
      <p class="small">A MIDI file opens in any music program (GarageBand, FL Studio, MuseScore…) with
        each layer on its own track, played four times.${IN_CLAUDE ? ' The Claude app cannot save MIDI files: open DaCapo in your browser for that.' : ''}</p>
    </div>`;

  /* ---------- painting ---------- */
  const msg = t => ($('#jMsg', body).textContent = t);
  function paintTransport() {
    $('#jBpm', body).textContent = `♩ ${L.bpm}`;
    const play = $('#jPlay', body);
    play.textContent = Transport.playing ? 'Stop' : 'Play';
    const rec = $('#jRec', body);
    const on = !!(Transport.armed || Transport.rec);
    rec.setAttribute('aria-pressed', String(on));
    rec.textContent = Transport.rec ? 'Recording' : Transport.armed ? 'Waiting…' : 'Record';
    rec.disabled = L.layers.length >= MAX_LAYERS && !on;
    $('#jSounds', body).innerHTML = SOUND_CHOICES.map(
      ([id, n]) =>
        `<button type="button" class="chip" data-sound="${id}" aria-pressed="${ui.sound === id}">${esc(n)}</button>`,
    ).join('');
    $$('[data-sound]', body).forEach(b => {
      b.onclick = () => {
        ui.sound = b.dataset.sound;
        if (ui.sound === 'drums' && ui.play !== 'pads') setPlayOn('pads');
        paintTransport();
      };
    });
  }
  function paintBar() {
    const n = L.bars;
    const ticks = Array.from(
      { length: n * L.beats },
      (_, i) => `<i class="${i % L.beats ? '' : 'bar'}"></i>`,
    );
    $('#jBar', body).innerHTML = `${ticks.join('')}<b id="jHead"></b>`;
  }
  function paintBeats() {
    $('#jBeats', body).innerHTML = BEATS.filter(b => b.beats === L.beats || b.id === 'none')
      .map(
        b =>
          `<button type="button" class="chip" data-beat="${b.id}" aria-pressed="${L.beat === b.id}">${esc(b.n)}</button>`,
      )
      .join('');
    $$('[data-beat]', body).forEach(b => {
      b.onclick = () => {
        const B = BEAT_BY[b.dataset.beat];
        L.beat = B.id;
        L.drums = beatPattern(B.id);
        L.swing = B.swing;
        $('#jSwing', body).value = Math.round(L.swing * 100);
        changed();
        paintBeats();
        paintGrid();
      };
    });
  }
  function paintGrid() {
    const n = stepsPerBar(L);
    const cell = (d, i) => {
      const v = L.drums[d.id][i];
      return `<button type="button" class="cell${i % 4 ? '' : ' beat'}${v ? (v > 0.6 ? ' on' : ' soft') : ''}"
        data-d="${d.id}" data-i="${i}" aria-label="${esc(d.n)}, step ${i + 1}" aria-pressed="${!!v}"></button>`;
    };
    $('#jGrid', body).innerHTML = DRUMS.map(
      d => `<div class="drumrow"><span class="small">${esc(d.n)}</span>
        <div class="cells" style="--n:${n}">${Array.from({ length: n }, (_, i) => cell(d, i)).join('')}</div></div>`,
    ).join('');
    $$('#jGrid .cell', body).forEach(c => {
      c.onclick = () => {
        const row = L.drums[c.dataset.d];
        const i = +c.dataset.i;
        // off → on → soft → off
        row[i] = row[i] === 0 ? 0.9 : row[i] > 0.6 ? 0.45 : 0;
        if (row[i]) Sounds.drum(c.dataset.d, AudioEngine.ensure().currentTime, row[i]);
        L.beat = 'custom';
        changed();
        paintGrid();
        paintBeats();
      };
    });
  }
  function paintLayers() {
    $('#jCount', body).textContent = `${L.layers.length} of ${MAX_LAYERS}`;
    const len = loopBeats(L);
    const past = layer => layer.notes.filter(x => x.b >= len).length;
    const roll = layer => {
      const ms = layer.notes.map(x => x.m);
      const lo = Math.min(...ms);
      const span = Math.max(12, Math.max(...ms) - lo + 1);
      const bars = Array.from({ length: L.bars - 1 }, (_, i) => {
        const x = ((i + 1) * L.beats * 100) / len;
        return `<line x1="${x}" x2="${x}" y1="0" y2="24" class="barline"/>`;
      }).join('');
      const notes = layer.notes
        .filter(x => x.b < len)
        .map(x => {
          const y = 22 - ((x.m - lo) / span) * 20;
          return `<rect x="${((x.b / len) * 100).toFixed(2)}" y="${y.toFixed(1)}" width="${Math.max(0.6, (x.d / len) * 100).toFixed(2)}" height="2.2" rx="0.8"/>`;
        })
        .join('');
      return `<svg class="layer-roll" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">${bars}${notes}</svg>`;
    };
    const row = (layer, k) => `
      <div class="listrow layer${layer.mute ? ' muted' : ''}">
        <div class="grow">
          <div class="row between">
            <b>${k + 1}. ${esc(soundName(layer.sound))}</b>
            <span class="small">${layer.notes.length} notes${past(layer) ? ` · ${past(layer)} past the end of the loop` : ''}</span>
          </div>
          ${roll(layer)}
          <div class="row">
            ${layer.sound === 'drums' ? '' : `<select class="input sm" data-lsound="${k}" aria-label="Sound">${SOUNDS.map(s => `<option value="${s.id}" ${s.id === layer.sound ? 'selected' : ''}>${esc(s.n)}</option>`).join('')}</select>`}
            <select class="input sm" data-lgrid="${k}" aria-label="Snap to grid">${GRIDS.map(([id, n]) => `<option value="${id}" ${id === layer.grid ? 'selected' : ''}>Snap: ${esc(n)}</option>`).join('')}</select>
            <button class="btn sm ghost" type="button" data-lmute="${k}" aria-pressed="${layer.mute}">${layer.mute ? 'Unmute' : 'Mute'}</button>
            <button class="btn sm ghost" type="button" data-ldel="${k}" aria-label="Delete layer ${k + 1}">Delete</button>
          </div>
        </div>
      </div>`;
    $('#jLayers', body).innerHTML = L.layers.length
      ? L.layers.map(row).join('')
      : `<p class="small">No layers yet. Press Record and play: one pass of the loop becomes a layer.
          Then record another on top.</p>`;
    $$('[data-lsound]', body).forEach(s => {
      s.onchange = () => {
        L.layers[+s.dataset.lsound].sound = s.value;
        changed();
      };
    });
    $$('[data-lgrid]', body).forEach(s => {
      s.onchange = () => {
        L.layers[+s.dataset.lgrid].grid = s.value;
        changed();
      };
    });
    $$('[data-lmute]', body).forEach(b => {
      b.onclick = () => {
        const layer = L.layers[+b.dataset.lmute];
        layer.mute = !layer.mute;
        changed();
        paintLayers();
      };
    });
    $$('[data-ldel]', body).forEach(b => {
      b.onclick = () => {
        L.layers.splice(+b.dataset.ldel, 1);
        changed();
        paintLayers();
        paintTransport();
      };
    });
    $('#jUndo', body).disabled = !L.layers.length;
    $('#jClear', body).disabled = !L.layers.length;
  }
  function setPlayOn(v) {
    ui.play = v;
    $$('[data-seg="jPlayOn"] [data-v]', body).forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.v === v)),
    );
    paintHere();
  }
  function paintHere() {
    const here = $('#jHere', body);
    if (ui.play === 'keys') {
      here.innerHTML = `<div class="kbwrap scrollx">${kbSVG({ from: 48, to: 76, h: 120 })}</div>
        <p class="small">Or play your piano: everything you play is recorded while Record is on.</p>`;
      return;
    }
    here.innerHTML = `<div class="pads">${DRUMS.map(d => `<button type="button" class="pad" data-pad="${d.gm}">${esc(d.n)}</button>`).join('')}</div>
      <p class="small">Choose "Drum pads" under Record with, then tap along to record a drum layer.</p>`;
    $$('[data-pad]', here).forEach(p => {
      p.addEventListener('pointerdown', e => {
        e.preventDefault();
        Transport.pad(+p.dataset.pad);
        p.classList.add('hit');
        setTimeout(() => p.classList.remove('hit'), 90);
      });
    });
  }
  // the playhead: where the loop is, as you hear it
  function animate() {
    const head = $('#jHead', body);
    const pos = Transport.position();
    if (head) {
      head.hidden = !pos || pos.beat < 0;
      if (pos && pos.beat >= 0) head.style.left = `${(pos.inLoop / loopBeats(L)) * 100}%`;
    }
    if (pos && pos.beat < 0) msg(`Count-in: ${Math.ceil(-pos.beat)}`);
    ui.raf = requestAnimationFrame(animate);
  }

  function changed() {
    Transport.changed();
    keep();
  }

  /* ---------- controls ---------- */
  $('#jPlay', body).onclick = () => {
    AudioEngine.ensure();
    if (Transport.playing) Transport.stop();
    else Transport.play(L);
    paintTransport();
  };
  $('#jRec', body).onclick = () => {
    AudioEngine.ensure();
    if (Transport.armed || Transport.rec) {
      Transport.disarm();
      msg('Recording cancelled.');
      return paintTransport();
    }
    if (!Transport.playing) {
      Transport.play(L, { countIn: L.beats });
      msg('One bar of count-in, then play.');
    } else msg('Recording starts at the top of the loop.');
    Transport.arm(ui.sound);
    paintTransport();
  };
  $$('[data-bpm]', body).forEach(b => {
    b.onclick = () => {
      Transport.setTempo(clamp(L.bpm + +b.dataset.bpm, 40, 200));
      keep();
      paintTransport();
    };
  });
  bindSegs(body, {
    jBars: v => {
      L.bars = +v;
      changed();
      paintBar();
      paintLayers();
    },
    jMeter: v => {
      setMeter(L, +v);
      L.beat = 'custom';
      changed();
      paintBar();
      paintBeats();
      paintGrid();
      paintLayers();
    },
    jPlayOn: v => setPlayOn(v),
  });
  $('#jSwing', body).oninput = e => {
    L.swing = +e.target.value / 100;
    changed();
  };
  $('#jClick', body).onchange = e => {
    L.click = e.target.checked;
    keep();
  };
  $('#jUndo', body).onclick = () => {
    L.layers.pop();
    changed();
    paintLayers();
    paintTransport();
  };
  $('#jClear', body).onclick = () => {
    const before = L.layers.slice();
    L.layers = [];
    changed();
    paintLayers();
    paintTransport();
    toast('Layers cleared', 6000, {
      label: 'Undo',
      run: () => {
        L.layers = before;
        changed();
        paintLayers();
        paintTransport();
      },
    });
  };
  $('#jName', body).oninput = e => {
    L.name = e.target.value.trim();
    keep();
  };
  $('#jSave', body).onclick = () => {
    if (!L.name) L.name = `Sketch ${new Date().toLocaleDateString()}`;
    $('#jName', body).value = L.name;
    Sketches.save(L);
    keep();
    toast('Sketch saved');
  };
  $('#jMidi', body).onclick = () => {
    if (!L.layers.length && !DRUMS.some(d => L.drums[d.id].some(Boolean)))
      return toast('Nothing to save yet: add a beat or record a layer.');
    const file = (L.name || 'dacapo-sketch').replace(/[^\w-]+/g, '-').toLowerCase();
    saveFile(`${file}.mid`, loopToMidi(L), 'audio/midi');
  };
  $('#jOpen', body).onclick = () => openSketchSheet(load);
  $('#jNew', body).onclick = () => {
    const had = L.layers.length > 0;
    if (had) Sketches.save(L.name ? L : { ...L, name: `Sketch ${new Date().toLocaleDateString()}` });
    load(newLoop());
    toast(had ? 'Started a new sketch; the last one was saved.' : 'New sketch');
  };
  // replace the loop on screen (the same object, so the transport and handlers keep it)
  function load(next) {
    Transport.stop();
    Object.keys(L).forEach(k => delete L[k]);
    Object.assign(L, cleanLoop(next));
    Transport.L = L;
    keep();
    $('#jName', body).value = L.name;
    $('#jSwing', body).value = Math.round(L.swing * 100);
    $('#jClick', body).checked = L.click;
    $$('[data-seg="jBars"] [data-v]', body).forEach(b =>
      b.setAttribute('aria-pressed', String(+b.dataset.v === L.bars)),
    );
    $$('[data-seg="jMeter"] [data-v]', body).forEach(b =>
      b.setAttribute('aria-pressed', String(+b.dataset.v === L.beats)),
    );
    paintAll();
  }

  const offT = Transport.on((kind, data) => {
    if (kind === 'recording')
      msg(`Recording ${soundName(Transport.rec.sound).toLowerCase()}: one pass of the loop.`);
    else if (kind === 'recorded') {
      msg(
        data
          ? `Layer ${L.layers.length} recorded. Record another on top, or listen.`
          : 'Nothing was played; no layer added.',
      );
      keep();
      paintLayers();
    } else if (kind === 'stop') msg('');
    paintTransport();
  });

  function paintAll() {
    paintTransport();
    paintBar();
    paintBeats();
    paintGrid();
    paintLayers();
    paintHere();
  }
  paintAll();
  animate();
  msg('Choose a beat (or none), then press Record and play.');

  return () => {
    cancelAnimationFrame(ui.raf);
    offT();
    Transport.stop(true);
    Input.touchSound = null;
    keep();
  };
}

function openSketchSheet(onOpen) {
  const list = Sketches.list();
  const when = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const row = x => `<div class="listrow">
      <div class="grow">
        <div class="ttl">${esc(x.name || 'Untitled')}</div>
        <div class="small">${when(x.saved)} · ${(x.layers || []).length} layers · ♩ ${x.bpm}</div>
      </div>
      <button class="btn sm" type="button" data-open="${esc(x.id)}">Open</button>
      <button class="btn sm ghost" type="button" data-del="${esc(x.id)}" aria-label="Delete">Delete</button>
    </div>`;
  openSheet(
    `<div class="sheethead"><h2 class="h2">Your sketches</h2>${closeBtn}</div>
     <div class="stack" style="gap:0">${list.length ? list.map(row).join('') : '<p class="small">No saved sketches yet.</p>'}</div>
     <p class="small">Sketches are kept on this device, and in backup files.</p>`,
    sheet => {
      $$('[data-open]', sheet).forEach(b => {
        b.onclick = () => {
          const x = Sketches.list().find(s => s.id === b.dataset.open);
          closeSheet();
          if (x) onOpen(x);
        };
      });
      $$('[data-del]', sheet).forEach(b => {
        b.onclick = () => {
          Sketches.remove(b.dataset.del);
          openSketchSheet(onOpen);
        };
      });
    },
    { label: 'Your sketches' },
  );
}
