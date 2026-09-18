// Tiny synthesized sound effects (Web Audio, no files). Soft by design; can be switched off.
let ctx = null;
let enabled = true;

export const soundEnabled = () => enabled;
export function setSoundEnabled(v) { enabled = !!v; }

function ac() {
  if (!enabled) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}
function tone(freq, { type = 'sine', dur = 0.12, gain = 0.06, at = 0, slideTo = null } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sfx = {
  /** a correct stroke: short soft pluck */
  stroke() { tone(720, { type: 'triangle', dur: 0.09, gain: 0.045 }); },
  /** a wrong stroke: gentle low "hm" */
  miss() { tone(220, { type: 'sine', dur: 0.16, gain: 0.04, slideTo: 150 }); },
  /** one repetition done: two rising notes */
  rep() { tone(523, { dur: 0.14, gain: 0.05 }); tone(784, { dur: 0.18, gain: 0.05, at: 0.11 }); },
  /** whole character done: little arpeggio */
  done() { [523, 659, 784, 1046].forEach((f, i) => tone(f, { dur: 0.22, gain: 0.05, at: i * 0.085 })); },
  /** ui tap */
  tap() { tone(900, { type: 'triangle', dur: 0.045, gain: 0.025 }); },
};
