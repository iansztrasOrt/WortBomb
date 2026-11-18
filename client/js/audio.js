// Sonidos sintetizados con Web Audio (sin archivos): tic-tac, explosión, acierto, vida, pase, error.
import { store } from './ui.js';

let ctx = null;
let master = null;
const prefs = { muted: false, volume: 0.7, ...store.get('wortbomb.audio', {}) };

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyVolume();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function applyVolume() {
  if (master) master.gain.value = prefs.muted ? 0 : prefs.volume;
}

export const audio = {
  get muted() { return prefs.muted; },
  get volume() { return prefs.volume; },
  setMuted(m) { prefs.muted = m; applyVolume(); store.set('wortbomb.audio', prefs); },
  setVolume(v) { prefs.volume = Math.max(0, Math.min(1, v)); applyVolume(); store.set('wortbomb.audio', prefs); },
  unlock() { ensure(); },

  tone(freq, dur = 0.1, type = 'square', gain = 0.15, when = 0, slide = 0) {
    const c = ensure();
    if (!c || prefs.muted) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  noise(dur = 0.4, { gain = 0.5, from = 4000, to = 200, when = 0 } = {}) {
    const c = ensure();
    if (!c || prefs.muted) return;
    const t = c.currentTime + when;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 1.5;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    src.connect(f).connect(g).connect(master);
    src.start(t);
  },

  tick(hot = false) { this.tone(hot ? 1400 : 1000, 0.035, 'square', hot ? 0.09 : 0.06); },
  explode() {
    this.noise(1.1, { gain: 0.9, from: 2500, to: 60 });
    this.tone(90, 0.7, 'sine', 0.5, 0, -50);
  },
  ok() { this.tone(660, 0.09, 'triangle', 0.18); this.tone(990, 0.14, 'triangle', 0.18, 0.08); },
  pass() { this.noise(0.25, { gain: 0.18, from: 600, to: 3000 }); },
  error() { this.tone(170, 0.18, 'sawtooth', 0.1); this.tone(140, 0.2, 'sawtooth', 0.1, 0.09); },
  fuse() { this.noise(0.08, { gain: 0.05, from: 6000, to: 3000 }); },
  alarm() {
    for (let i = 0; i < 4; i += 1) {
      this.tone(880, 0.16, 'square', 0.12, i * 0.32);
      this.tone(660, 0.16, 'square', 0.12, i * 0.32 + 0.16);
    }
    this.noise(1.2, { gain: 0.4, from: 300, to: 60, when: 0.1 });
  },
  heartbeat() { this.tone(70, 0.12, 'sine', 0.35); this.tone(60, 0.14, 'sine', 0.3, 0.16); },
  countdownTick() { this.tone(520, 0.06, 'triangle', 0.1); },
  win() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.16, i * 0.12)); },
};
