/* Your piano played through this device: what you play on the piano sounds here with the Jam's sounds,
   one sound for the whole keyboard or one for each side of a split point (bass on the left, flute on the
   right, say). The piano sounds too unless its own volume is turned down. Settings are kept with the
   other settings: {on, split (the lowest key of the right side; 0 for no split), left, right}. */
import { Store } from '../core/store.js';
import { Input } from '../core/input.js';
import { Sounds } from './sounds.js';

export const Thru = {
  offs: [],
  held: new Map(),
  pedal: false,
  sustained: new Map(), // keys released while the pedal is down: they ring until it comes up
  get cfg() {
    return Store.s.settings.thru;
  },
  // the sound a key plays: the right side's, or the left side's below the split
  soundFor(m) {
    const c = this.cfg;
    return c.split && m < c.split ? c.left : c.right;
  },
  // listen while a screen wants it (the Jam); returns the function that stops listening
  listen() {
    this.stop();
    this.offs = [Input.on(ev => this.noteOn(ev)), Input.onOff(ev => this.noteOff(ev))];
    return () => this.stop();
  },
  stop() {
    this.offs.forEach(f => f());
    this.offs = [];
    this.held.forEach(h => Sounds.stop(h));
    this.sustained.forEach(h => Sounds.stop(h));
    this.held.clear();
    this.sustained.clear();
    this.pedal = false;
  },
  // only the piano's notes: the screen keys already sound by themselves
  noteOn(ev) {
    if (!this.cfg.on || ev.src !== 'midi' || ev.m == null) return;
    Sounds.stop(this.held.get(ev.m));
    Sounds.stop(this.sustained.get(ev.m));
    this.sustained.delete(ev.m);
    this.held.set(ev.m, Sounds.start(this.soundFor(ev.m), ev.m, ev.vel));
  },
  noteOff(ev) {
    if (ev.src !== 'midi') return;
    if (ev.pedal != null) {
      this.pedal = ev.pedal;
      if (!ev.pedal) {
        this.sustained.forEach(h => Sounds.stop(h));
        this.sustained.clear();
      }
      return;
    }
    const h = this.held.get(ev.m);
    this.held.delete(ev.m);
    if (this.pedal && h) this.sustained.set(ev.m, h);
    else Sounds.stop(h);
  },
};
