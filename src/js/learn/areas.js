/* What there is to learn: the areas, their units in tiers, and what each item is.
   An item id says what it is: r:<unit> reading, t:sc|ar:<type>:<key> technique, h:<unit> theory,
   p:<piece>:<section>|full a piece, i:pat|imp:<palette> improvisation.
   Each area's units are ordered and grouped in tiers: tier 1 is the foundation, and a session only
   works on the first unfinished unit of an area, so deeper material waits until the basics hold. */
import { Store } from '../core/store.js';
import { pcOfName, prettyKey } from '../music/theory.js';
import { PAL_BY_ID, PALETTES, READ_UNITS, RHY_UNITS } from '../music/drills.js';
import { Library } from '../music/library.js';
import { THEORY_BY_ID, THEORY_UNITS } from './theory.js';

// the areas you can focus on (and switch off in Settings)
export const AREAS = [
  { id: 'reading', n: 'Reading', d: 'Notes on the treble and bass staff: find them right away.' },
  { id: 'sight', n: 'Sight-reading', d: 'Reading in time: both hands, rhythms, then real music.' },
  { id: 'technique', n: 'Technique', d: 'Scales and arpeggios: fingering, evenness, hands together.' },
  { id: 'theory', n: 'Theory', d: 'Keys, intervals, chords and progressions, heard and played.' },
  { id: 'pieces', n: 'Pieces', d: 'The music you are working on, section by section.' },
  { id: 'improv', n: 'Improvisation', d: "The masters' harmony under your hands, then your own melodies." },
];
export const AREA_BY = Object.fromEntries(AREAS.map(a => [a.id, a]));

export const TIER_NAMES = ['', 'Foundations', 'Developing', 'Fluent'];

/* ---------- units per area, in tiers ---------- */
const r = units => units.map(u => 'r:' + u);
const READING = {
  treble: [r(['r1', 'r3', 'r5']), r(['r8t', 'r9t', 'r10t']), r(['r11'])],
  bass: [r(['r2', 'r4', 'r6']), r(['r8b', 'r9b', 'r10b']), r(['r11b'])],
};
const SIGHT = [r(['r7', 'ry1', 'ry2']), r(['r12', 'r13', 'ry3']), r(['r14', 'ry4', 'r15'])];
// sight-reading starts once both clefs are readable up to an octave
export const SIGHT_NEEDS = ['r:r3', 'r:r4'];

const TECH_TIERS = [
  [
    ['C', 'A'],
    ['G', 'E'],
    ['F', 'D'],
  ],
  [
    ['D', 'B'],
    ['Bb', 'G'],
    ['A', 'F#'],
    ['Eb', 'C'],
  ],
  [
    ['E', 'C#'],
    ['Ab', 'F'],
    ['B', 'G#'],
    ['Db', 'Bb'],
    ['F#', 'Eb'],
  ],
].map(pairs =>
  pairs.flatMap(([M, m]) => [`t:sc:major:${M}`, `t:sc:harmonic:${m}`, `t:ar:major:${M}`, `t:ar:minor:${m}`]),
);

const THEORY_TIERS = [1, 2, 3].map(t => THEORY_UNITS.filter(u => u.tier === t).map(u => 'h:' + u.id));

const IMPROV_TIERS = [['satie', 'penta'], ['chopin', 'debussy'], ['rach']].map(ids =>
  ids.filter(id => PAL_BY_ID[id]).flatMap(id => [`i:pat:${id}`, `i:imp:${id}`]),
);

// the ordered units of a skill, grouped in tiers (pieces are ordered per piece, see piecesOrder)
export function skillTiers(skill) {
  if (skill === 'treble' || skill === 'bass') return READING[skill];
  if (skill === 'sight') return SIGHT;
  if (skill === 'theory') return THEORY_TIERS;
  if (skill === 'improv') return IMPROV_TIERS;
  if (skill === 'technique') return TECH_TIERS;
  return [];
}
export const skillOrder = skill => skillTiers(skill).flat();

// pieces you are working on: [{pid, daily}]
export const workingPieces = () => (Store.s.piece.working || []).filter(w => Library.get(w.pid));

// the sections of one piece (repeats share an item), then the whole piece
export function pieceOrder(pid) {
  if (!Library.get(pid)) return [];
  return Library.sections(pid)
    .filter(s => s.n > 0)
    .map(s => `p:${pid}:${s.k}`)
    .filter(id => sectionOriginal(id) === id)
    .concat([`p:${pid}:full`]);
}

export function sectionOriginal(id) {
  const p = id.split(':');
  if (p[0] !== 'p' || p[2] === 'full') return id;
  const s = Library.sections(p[1])[+p[2]];
  return s && s.same >= 0 ? `p:${p[1]}:${s.same}` : id;
}

// technique starts in the key of the first piece you are working on: technique that serves your music
export function techniqueOrder() {
  const all = TECH_TIERS.flat();
  const w = workingPieces()[0];
  const P = w && Library.get(w.pid);
  if (!P) return all;
  const sig = (P.keys && P.keys[0] && P.keys[0][1]) || 0;
  const inKey = id => {
    const d = itemDef(id);
    const pc = pcOfName(d.key);
    const majorSigs = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1 };
    // a minor key shares its signature with the major key a minor 3rd above
    return majorSigs[d.type === 'major' ? pc : (pc + 3) % 12] === sig;
  };
  const first = all.filter(inKey).slice(0, 4);
  return first.concat(all.filter(x => !first.includes(x)));
}

/* ---------- item definitions ---------- */
export function itemDef(id) {
  const p = id.split(':');
  if (p[0] === 't') return techniqueDef(id, p);
  if (p[0] === 'r') return readingDef(id, p[1]);
  if (p[0] === 'h') return theoryDef(id, p[1]);
  if (p[0] === 'i') return improvDef(id, p);
  if (p[0] === 'p') return pieceDef(id, p);
  return null;
}

function techniqueDef(id, p) {
  const kind = p[1] === 'sc' ? 'scale' : 'arp';
  const type = p[2];
  const key = p[3];
  const minor = type !== 'major';
  const nm = prettyKey(key) + (minor ? ' minor' : ' major');
  return {
    id,
    area: 'technique',
    skill: 'technique',
    kind,
    type,
    key,
    title: kind === 'scale' ? `${nm} scale` : `${nm} arpeggio`,
    sub:
      kind === 'scale' ? (minor ? 'Harmonic minor · 2 octaves' : '2 octaves') : 'Root position · 2 octaves',
    phases: ['probe', 'rh', 'lh', 'ht'],
    npb: 2,
    start: kind === 'scale' ? 52 : 48,
    target: kind === 'scale' ? 80 : 72,
    review: true,
  };
}

// note-reading units train speed of recognition (paced, no metronome); sight-reading units are played in time
function readingDef(id, u) {
  const tier = (tiers, x) => tiers.findIndex(t => t.includes(x)) + 1;
  const skill = ['treble', 'bass'].find(sk => skillOrder(sk).includes(id)) || 'sight';
  const base = { id, area: skill === 'sight' ? 'sight' : 'reading', skill, unit: u, review: true };
  if (RHY_UNITS[u]) {
    const U = RHY_UNITS[u];
    return {
      ...base,
      kind: 'rhythm',
      title: U.t,
      sub: 'Tap the rhythm on any key',
      phases: [],
      start: 60,
      target: U.level >= 4 ? 66 : U.level === 3 ? 76 : 84,
      about: U.d,
      tier: tier(SIGHT, id),
    };
  }
  const U = READ_UNITS[u];
  if (!U) return null;
  const inTime = skill === 'sight' && (U.real || U.ht);
  const slow = U.dyads || U.triads || U.ht;
  return {
    ...base,
    kind: 'read',
    title: U.t,
    sub: U.real ? 'Two new bars every time' : 'A new line every time',
    phases: [],
    paced: !inTime, // wait mode with a speed goal per note, instead of the metronome
    pace: slow ? { start: 2600, target: 1300 } : { start: 1800, target: 800 },
    start: U.real ? 36 : 40,
    target: U.real ? (U.real === 'ht' ? 50 : 56) : 60,
    about: U.d,
    tier: tier(skill === 'sight' ? SIGHT : READING[skill], id),
  };
}

function theoryDef(id, u) {
  const U = THEORY_BY_ID[u];
  if (!U) return null;
  return {
    id,
    area: 'theory',
    skill: 'theory',
    kind: 'theory',
    unit: u,
    title: U.t,
    sub: `Theory · tier ${U.tier}`,
    phases: [],
    goal: U.goal,
    about: U.about,
    use: U.use,
    tier: U.tier,
    review: true,
  };
}

function improvDef(id, p) {
  const P = PAL_BY_ID[p[2]] || PALETTES[0];
  const base = { id, area: 'improv', skill: 'improv', pal: P.id, title: P.t, about: P.how };
  if (p[1] === 'pat')
    return {
      ...base,
      kind: 'pattern',
      sub: 'Learn the left-hand pattern',
      phases: ['lh'],
      start: Math.round(P.bpm * 0.7),
      target: P.bpm,
      review: true,
    };
  return {
    ...base,
    kind: 'improv',
    sub: 'Improvise over it',
    phases: [],
    start: P.bpm,
    target: P.bpm,
    review: false,
    minutes: 8,
  };
}

function pieceDef(id, p) {
  const pid = p[1];
  const P = Library.get(pid);
  if (!P) return null;
  const base = { id, area: 'pieces', skill: 'pieces', pid, title: P.t, about: P.tip, level: P.lvl || 1 };
  if (p[2] === 'full')
    return {
      ...base,
      kind: 'full',
      sub: 'The whole piece',
      phases: [],
      start: Math.max(30, Math.round(P.bpm * 0.85)),
      target: P.bpm,
      review: true,
    };
  const k = +p[2];
  const sec = Library.sections(pid)[k];
  if (!sec || !sec.n) return null;
  const tgt = Library.tempoAt(pid, sec.a);
  const label = P.pickup
    ? sec.a === 0
      ? `bars 1–${sec.z - 1}`
      : `bars ${sec.a}–${sec.z - 1}`
    : `bars ${sec.a + 1}–${sec.z}`;
  const hands = ['rh', 'lh'].filter(h =>
    Library.range(pid, sec.a, sec.z).some(n => n.h === (h === 'rh' ? 0 : 1)),
  );
  return {
    ...base,
    kind: 'section',
    k,
    sec,
    sub: `Section ${k + 1} of ${Library.sections(pid).length} · ${label}`,
    phases: hands.length === 2 ? ['rh', 'lh', 'ht'] : hands.length === 1 ? [hands[0]] : ['ht'],
    start: Math.max(30, Math.round(tgt * 0.55)),
    target: tgt,
    review: false,
    nbars: sec.z - sec.a,
  };
}
