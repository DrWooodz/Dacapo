/* Hearing a mood: its scale, its chords (each voiced nearest the one before, the root below), and a short
   phrase (the progression under the scale rising, then the color note and home). */
import { AudioEngine } from '../core/audio.js';
import { midiOf } from '../music/theory.js';
import { moodRun, moodScale, voiceProgression } from '../music/moods.js';
import { earPhrase } from '../music/moodtools.js';

export function hearScale(mood, pc) {
  AudioEngine.ensure();
  AudioEngine.stopAll();
  AudioEngine.seq(
    moodRun(mood, pc, 'rh', 1).steps.map(s => s.midis[0]),
    0.32,
    0.6,
    0.55,
  );
}

export function hearChords(mood, pc, chords, { bar = 1.8, melody = false } = {}) {
  AudioEngine.ensure();
  AudioEngine.stopAll();
  const V = voiceProgression(mood, pc, chords);
  const scale = moodScale(mood, pc).map(midiOf);
  const t0 = AudioEngine.now() + 0.1;
  V.forEach((v, i) => {
    const t = t0 + i * bar;
    AudioEngine.note(v.root, t, bar, 0.45);
    AudioEngine.chord(v.right, t, bar, 0.28);
    // a few scale notes above, stepping toward a chord tone
    if (melody)
      [0, 1, 2].forEach(j =>
        AudioEngine.note(scale[(i * 2 + j * 2) % scale.length] + 12, t + j * (bar / 3), bar / 3, 0.4),
      );
  });
}

export function hearPhrase(mood, pc) {
  AudioEngine.ensure();
  AudioEngine.stopAll();
  const t0 = AudioEngine.now() + 0.1;
  earPhrase(mood, pc).forEach(n => AudioEngine.note(n.m, t0 + n.t, n.d, n.v));
}
