// Turning a multi-instrument MIDI file into a piano part, and reading its mode and chords.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { writeMidi } from '../src/js/music/midiwrite.js';
import { parseMidiFile } from '../src/js/music/midiread.js';
import { buffer, gameSong, PPQ } from './songs.js';
import {
  byHands,
  guessRoles,
  isPianoFile,
  pianoAsWritten,
  pianoReduction,
  readParts,
} from '../src/js/music/arrange.js';
import { barChords, describeMusic, findMode, roman } from '../src/js/music/harmony.js';
import { fromBase64, importMidi } from '../src/js/music/midifile.js';

const byName = (parts, name) => parts.find(p => p.name === name);
const bars = n => [...Array(n + 1)].map((_, k) => k * PPQ * 4);

test('the parts of a file: each instrument, and who plays the melody, the bass and the harmony', () => {
  const { parts } = readParts(gameSong().parsed);
  expect(parts.map(p => p.name).sort()).toEqual(
    ['Acoustic bass', 'Drums', 'Flute', 'Orchestral harp', 'String ensemble 1'].sort(),
  );
  const roles = guessRoles(parts);
  expect(roles[byName(parts, 'Flute').id]).toBe('melody');
  expect(roles[byName(parts, 'Acoustic bass').id]).toBe('bass');
  expect(roles[byName(parts, 'String ensemble 1').id]).toBe('harmony');
  expect(roles[byName(parts, 'Orchestral harp').id]).toBe('harmony');
  expect(roles[byName(parts, 'Drums').id]).toBe('skip');
  expect(isPianoFile(parts)).toBe(false);
});

test('Simple: the melody exactly as written in the right hand, the bass in the left', () => {
  const song = gameSong();
  const { parts } = readParts(song.parsed);
  const notes = pianoReduction(parts, guessRoles(parts), { style: 'simple', beat: PPQ });
  const rh = notes.filter(n => n.h === 0).map(n => [n.t, n.m]);
  const lh = notes.filter(n => n.h === 1).map(n => [n.t, n.m]);
  expect(rh).toEqual(song.melody.map(n => [n.b * PPQ, n.m]));
  expect(lh).toEqual(song.bass.map(n => [n.b * PPQ, n.m]));
});

test('Full: melody and bass kept; harmony only from notes that really sound, within reach of each hand', () => {
  const song = gameSong();
  const { parts } = readParts(song.parsed);
  const notes = pianoReduction(parts, guessRoles(parts), { style: 'full', beat: PPQ });
  const has = (t, m, h) => notes.some(n => n.t === t && n.m === m && n.h === h);
  song.melody.forEach(n => expect(has(n.b * PPQ, n.m, 0)).toBe(true));
  song.bass.forEach(n => expect(has(n.b * PPQ, n.m, 1)).toBe(true));
  // harmony was added, in the rhythm of the harp (eighth notes)
  expect(notes.length).toBeGreaterThan(song.melody.length + song.bass.length + 20);
  const source = song.all.flat();
  const soundingPcs = t =>
    new Set(source.filter(n => n.b * PPQ <= t && t < (n.b + n.d) * PPQ).map(n => n.m % 12));
  for (const n of notes) expect(soundingPcs(n.t).has(n.m % 12)).toBe(true);
  // per hand: at most three notes struck together, within an octave
  const groups = new Map();
  notes.forEach(n =>
    (groups.get(n.t + ':' + n.h) || groups.set(n.t + ':' + n.h, []).get(n.t + ':' + n.h)).push(n.m),
  );
  for (const ms of groups.values()) {
    expect(ms.length).toBeLessThanOrEqual(3);
    expect(Math.max(...ms) - Math.min(...ms)).toBeLessThanOrEqual(12);
  }
  // the left hand stays under the right hand
  for (const n of notes.filter(x => x.h === 1)) {
    const rhNow = notes.filter(x => x.h === 0 && x.t <= n.t && n.t < x.t + x.d);
    rhNow.forEach(r => expect(n.m).toBeLessThan(r.m));
  }
});

test('by hand: the parts you choose for each hand', () => {
  const { parts } = readParts(gameSong().parsed);
  const notes = byHands(parts, {
    [byName(parts, 'Flute').id]: 'rh',
    [byName(parts, 'Acoustic bass').id]: 'lh',
  });
  expect(notes.filter(n => n.h === 0)).toHaveLength(16);
  expect(notes.filter(n => n.h === 1)).toHaveLength(16);
});

test('a piano file keeps its own two hands', () => {
  const file = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'waltz.mid'));
  const { parts } = readParts(parseMidiFile(buffer(file)));
  expect(isPianoFile(parts)).toBe(true);
  const notes = pianoAsWritten(parts);
  expect(notes.filter(n => n.h === 0)).toHaveLength(12);
  expect(notes.filter(n => n.h === 1)).toHaveLength(4);
});

test('the mode and the chords: A Mixolydian, I and ♭VII', () => {
  const song = gameSong();
  const notes = song.all.flat().map(n => ({ t: n.b * PPQ, d: n.d * PPQ, m: n.m }));
  const mode = findMode(notes, bars(8));
  expect(mode).toMatchObject({ tonic: 9, mode: 'Mixolydian' });
  const chords = barChords(notes, bars(8)).map(b =>
    b.chords.map(c => roman(c.root, c.type, mode.tonic)).join(' '),
  );
  expect(chords).toEqual(['I', '♭VII', 'I', '♭VII', 'I', '♭VII', 'I', 'I']);
});

test('numerals read against the major scale of the home note', () => {
  expect(roman(5, 'maj', 9)).toBe('♭VI'); // F in A minor
  expect(roman(4, 'maj', 9)).toBe('V'); // E major in A minor (harmonic minor)
  expect(roman(4, 'min', 9)).toBe('v'); // E minor in A minor (the folk sound)
  expect(roman(2, 'min7', 9)).toBe('iv7');
  expect(roman(11, 'dim', 0)).toBe('vii°');
});

test('importing a file in one step: a piano piece that keeps the file', () => {
  const bytes = writeMidi({ bpm: 100, beats: 4, tracks: [] });
  expect(() => importMidi(buffer(bytes), 'empty.mid')).toThrow(/No notes/);
  const file = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'waltz.mid'));
  const waltz = importMidi(buffer(file), 'my_waltz.mid');
  expect(waltz).toMatchObject({ t: 'my waltz', c: 'mine', arr: { style: 'written' } });
  expect(new Uint8Array(fromBase64(waltz.orig))).toEqual(new Uint8Array(file));
});

test('describing the music: home, mode and the chords of each section by numeral and name', () => {
  const song = gameSong();
  const notes = song.all.flat().map(n => ({ t: n.b, d: n.d, m: n.m }));
  const beats = [...Array(9)].map((_, k) => k * 4);
  const M = describeMusic(notes, beats, 2, [
    [0, 4],
    [4, 8],
  ]);
  expect(M).toMatchObject({ home: 'A', mode: 'Mixolydian', homeType: 'maj' });
  expect(M.info.how).toMatch(/♭VII/);
  expect(M.sections[0].bars.map(b => b.map(c => c.num + ' ' + c.name).join())).toEqual([
    'I A',
    '♭VII G',
    'I A',
    '♭VII G',
  ]);
});

test('Full keeps one accompaniment pattern: off-beat chords stay chords, an arpeggio stays broken', () => {
  // a waltz: bass on 1, string chords on 2 and 3, a sustained pad, a flute tune
  const chords = [
    [50, 53, 57],
    [46, 50, 53],
    [48, 52, 55],
    [50, 53, 57],
  ];
  const tune = [74, 77, 76, 74, 74, 72, 72, 74, 76, 77, 77, 77].map((m, i) => ({ b: i, m, d: 0.95, v: 0.8 }));
  const strings = chords.flatMap((c, k) =>
    [1, 2].flatMap(x => c.map(m => ({ b: k * 3 + x, m: m + 12, d: 0.4 }))),
  );
  const pad = chords.flatMap((c, k) => c.map(m => ({ b: k * 3, m, d: 3 })));
  const bass = chords.map((c, k) => ({ b: k * 3, m: c[0] - 12, d: 0.9 }));
  const file = writeMidi({
    bpm: 132,
    beats: 3,
    tracks: [
      { name: 'Flute', ch: 0, program: 73, notes: tune },
      { name: 'Strings', ch: 1, program: 48, notes: strings },
      { name: 'Pad', ch: 2, program: 89, notes: pad },
      { name: 'Bass', ch: 3, program: 32, notes: bass },
    ],
  });
  const { parts } = readParts(parseMidiFile(buffer(file)));
  const notes = pianoReduction(parts, guessRoles(parts), { style: 'full', beat: PPQ, bar: PPQ * 3 });
  const lh = t => notes.filter(n => n.h === 1 && n.t === t * PPQ).map(n => n.m);
  for (let k = 0; k < 4; k++) {
    expect(lh(k * 3)).toEqual([chords[k][0] - 12]); // the bass alone on 1
    for (const x of [1, 2]) {
      const c = lh(k * 3 + x);
      expect(c).toHaveLength(3); // a full chord on 2 and on 3
      expect(new Set(c.map(m => m % 12))).toEqual(new Set(chords[k].map(m => m % 12)));
    }
  }
  // the harp in the game song: one left-hand note at a time, in eighth notes
  const song = readParts(gameSong().parsed).parts;
  const arp = pianoReduction(song, guessRoles(song), { style: 'full', beat: PPQ });
  const at = new Map();
  arp.filter(n => n.h === 1).forEach(n => at.set(n.t, (at.get(n.t) || 0) + 1));
  expect([...at.values()].filter(c => c > 2)).toHaveLength(0);
  expect(at.size).toBeGreaterThanOrEqual(48);
});
