// Small, dependency-free effects: confetti, floating cheers, sparkles, toasts.

const CHEERS_OK = ['好!', 'Nice!', '真好!', '加油!', '很好!', 'Good!'];
const CHEERS_PERFECT = ['太棒了!', '完美!', '漂亮!', '厉害!', 'Perfect!', '好棒!', 'Wow!'];
const CHEERS_BIG = ['太棒了!', '你真棒!', '完美!', '厉害!', '好极了!', 'Amazing!', '漂亮!'];
const EMOJI = ['🎉', '✨', '🌟', '🎊', '💫', '🙌', '👏'];
const COLORS = ['#3b82f6', '#60a5fa', '#93c5fd', '#fbbf24', '#fb7185', '#34d399', '#a78bfa', '#ffffff'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Floating one-word cheer over an element (the writing pad). */
export function cheer(anchor, { perfect = false, big = false } = {}) {
  const el = document.createElement('div');
  el.className = 'cheer' + (perfect || big ? ' gold' : '');
  const words = big ? CHEERS_BIG : perfect ? CHEERS_PERFECT : CHEERS_OK;
  el.textContent = `${pick(words)} ${pick(EMOJI)}`;
  const host = anchor.closest('.pad-wrap') || anchor;
  host.style.position = host.style.position || 'relative';
  host.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}
export const bigCheer = () => pick(CHEERS_BIG);

/** Tiny sparkle ring at (x, y) inside an element. */
export function spark(host, x, y) {
  const s = document.createElement('span');
  s.className = 'spark';
  s.style.left = x + 'px';
  s.style.top = y + 'px';
  s.style.background = pick(['#fbbf24', '#60a5fa', '#34d399', '#fb7185']);
  host.appendChild(s);
  setTimeout(() => s.remove(), 600);
}

export function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth; // restart animation
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 450);
}

export function toast(msg) {
  const layer = document.getElementById('toast-layer');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  layer.appendChild(t);
  setTimeout(() => t.remove(), 3100);
}

// ---- confetti -------------------------------------------------------------------
let canvas, ctx, particles = [], raf = 0;
function ensureCanvas() {
  if (canvas) return;
  canvas = document.getElementById('confetti');
  ctx = canvas.getContext('2d');
  const resize = () => {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
  };
  resize();
  window.addEventListener('resize', resize);
}
export function confetti({ count = 140, origin } = {}) {
  ensureCanvas();
  const dpr = devicePixelRatio;
  const ox = (origin?.x ?? window.innerWidth / 2) * dpr;
  const oy = (origin?.y ?? window.innerHeight * 0.4) * dpr;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (6 + Math.random() * 12) * dpr;
    particles.push({
      x: ox, y: oy,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6 * dpr,
      g: 0.28 * dpr, drag: 0.985,
      w: (6 + Math.random() * 8) * dpr, h: (4 + Math.random() * 6) * dpr,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      color: pick(COLORS), life: 1, decay: 0.008 + Math.random() * 0.008,
      shape: Math.random() < 0.25 ? 'circle' : 'rect',
    });
  }
  if (!raf) tick();
}
function tick() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag;
    p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= p.decay;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  raf = particles.length ? requestAnimationFrame(tick) : 0;
  if (!raf) ctx.clearRect(0, 0, canvas.width, canvas.height);
}
