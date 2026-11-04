/* General MIDI: the standard names of the 128 instruments a MIDI file can ask for (program numbers 0-127),
   and what kind of part each usually plays. Game music of the early 2000s (Old School RuneScape among it)
   is written for exactly this set. */

// prettier-ignore
const GM_NAMES = [
  'Acoustic grand piano', 'Bright piano', 'Electric grand piano', 'Honky-tonk piano',
  'Electric piano 1', 'Electric piano 2', 'Harpsichord', 'Clavinet',
  'Celesta', 'Glockenspiel', 'Music box', 'Vibraphone',
  'Marimba', 'Xylophone', 'Tubular bells', 'Dulcimer',
  'Drawbar organ', 'Percussive organ', 'Rock organ', 'Church organ',
  'Reed organ', 'Accordion', 'Harmonica', 'Tango accordion',
  'Nylon guitar', 'Steel guitar', 'Jazz guitar', 'Clean electric guitar',
  'Muted guitar', 'Overdriven guitar', 'Distortion guitar', 'Guitar harmonics',
  'Acoustic bass', 'Fingered bass', 'Picked bass', 'Fretless bass',
  'Slap bass 1', 'Slap bass 2', 'Synth bass 1', 'Synth bass 2',
  'Violin', 'Viola', 'Cello', 'Contrabass',
  'Tremolo strings', 'Pizzicato strings', 'Orchestral harp', 'Timpani',
  'String ensemble 1', 'String ensemble 2', 'Synth strings 1', 'Synth strings 2',
  'Choir aahs', 'Voice oohs', 'Synth voice', 'Orchestra hit',
  'Trumpet', 'Trombone', 'Tuba', 'Muted trumpet',
  'French horn', 'Brass section', 'Synth brass 1', 'Synth brass 2',
  'Soprano sax', 'Alto sax', 'Tenor sax', 'Baritone sax',
  'Oboe', 'English horn', 'Bassoon', 'Clarinet',
  'Piccolo', 'Flute', 'Recorder', 'Pan flute',
  'Blown bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
  'Square lead', 'Sawtooth lead', 'Calliope lead', 'Chiff lead',
  'Charang lead', 'Voice lead', 'Fifths lead', 'Bass and lead',
  'New age pad', 'Warm pad', 'Polysynth pad', 'Choir pad',
  'Bowed pad', 'Metallic pad', 'Halo pad', 'Sweep pad',
  'Rain', 'Soundtrack', 'Crystal', 'Atmosphere',
  'Brightness', 'Goblins', 'Echoes', 'Sci-fi',
  'Sitar', 'Banjo', 'Shamisen', 'Koto',
  'Kalimba', 'Bagpipe', 'Fiddle', 'Shanai',
  'Tinkle bell', 'Agogo', 'Steel drums', 'Woodblock',
  'Taiko drum', 'Melodic tom', 'Synth drum', 'Reverse cymbal',
  'Guitar fret noise', 'Breath noise', 'Seashore', 'Bird tweet',
  'Telephone ring', 'Helicopter', 'Applause', 'Gunshot',
];

// the instrument's name, or the drum kit for MIDI channel 10
export const gmName = (program, channel) => (channel === 9 ? 'Drums' : GM_NAMES[program] || GM_NAMES[0]);

// what a program usually plays: 'bass', 'lead' (melodic solo instruments), 'pad' (sustained), 'keys'
// (pianos, guitars, harps: chords and lines), 'perc' (pitched percussion), 'fx' (drums and effects)
export function gmFamily(p) {
  if (p >= 32 && p <= 39) return 'bass';
  if (p === 43 || p === 58 || p === 70) return 'bass'; // contrabass, tuba, bassoon
  if ((p >= 40 && p <= 42) || (p >= 56 && p <= 57) || (p >= 59 && p <= 60)) return 'lead';
  if ((p >= 64 && p <= 87) || p === 22 || p === 110 || p === 111 || p === 104) return 'lead';
  if (
    (p >= 44 && p <= 45) ||
    (p >= 48 && p <= 55) ||
    (p >= 88 && p <= 95) ||
    (p >= 16 && p <= 21) ||
    p === 23
  )
    return 'pad';
  if (p >= 96 && p <= 103) return 'pad'; // the 'synth effects' are mostly used as atmospheric pads
  if (p >= 112) return 'fx';
  if ((p >= 8 && p <= 15) || p === 47 || p === 108) return 'perc';
  return 'keys';
}
