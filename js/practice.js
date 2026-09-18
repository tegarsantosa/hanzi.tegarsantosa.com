// Practice engine: builds writing pads with Hanzi Writer, runs the quiz for each repetition,
// handles the two guidance styles, celebrations, saving and the "what next" panel.

import { randomEntry, loadStrokes, relatedEntries, charDataLoader, LEVELS, getEntry } from './data.js';
import { classifyStroke, strokeNameFor, strokeSVG, fitStrokeSVGs } from './strokes.js';
import { cheer, bigCheer, spark, shake, confetti, toast } from './fx.js';
import { recordCompletion, compressPaths, handwritingSVG } from './storage.js';
import { sfx } from './sound.js';

const HW = window.HanziWriter;
const COLORS = {
  stroke: '#1d4ed8', outline: '#c7d9fb', drawing: '#0f2557',
  highlight: '#f59e0b', complete: '#22c55e', radical: '#2563eb',
};
const WHY = { contains: 'contains it', part: 'a part of it', radical: 'same radical', sounds: 'sounds alike' };
const GRID_SVG = `<svg class="grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <line x1="0" y1="0" x2="100" y2="100" stroke="#dbeafe" stroke-width="0.7" stroke-dasharray="1.6 2.4"/>
  <line x1="100" y1="0" x2="0" y2="100" stroke="#dbeafe" stroke-width="0.7" stroke-dasharray="1.6 2.4"/>
  <line x1="50" y1="0" x2="50" y2="100" stroke="#bfdbfe" stroke-width="0.9" stroke-dasharray="2.2 2.2"/>
  <line x1="0" y1="50" x2="100" y2="50" stroke="#bfdbfe" stroke-width="0.9" stroke-dasharray="2.2 2.2"/>
</svg>`;

let el = {};
let hooks = {};
let S = null;             // session state
let writers = [];         // live writers for the current repetition
let previewWriter = null;
let currentWriter = null;
let currentStrokeIdx = 0;
let autoTimer = 0;
let countdownTimer = 0;
let resizeTimer = 0;

export function initPractice(refs, h) {
  el = refs;
  hooks = h || {};
  el.hintBtn.addEventListener('click', hint);
  el.restartBtn.addEventListener('click', () => S && startRep());
  el.skipBtn.addEventListener('click', skip);
  el.replayBtn.addEventListener('click', replay);
  el.charPreview.addEventListener('click', replay);
  el.nextBtn.addEventListener('click', () => advance());
  el.againBtn.addEventListener('click', () => {
    if (!S) return;
    clearTimers();
    S.queue.unshift(S.current);
    nextCharacter();
  });
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(onResize, 150);
  });
}

export const isActive = () => !!S;
export function setSessionScript(script) { if (S) S.script = script; }

export async function startSession(cfg) {
  clearTimers();
  destroyWriters();
  S = {
    mode: cfg.mode, script: cfg.script, reps: Math.max(1, cfg.reps | 0), guidance: !!cfg.guidance,
    guideType: cfg.guideType === 'steps' ? 'steps' : 'realtime', level: cfg.level || 'common',
    queue: [...(cfg.queue || [])], recent: [], current: null, data: null,
    rep: 0, charStrokes: 0, charMistakes: 0, repMistakes: 0, paths: [], lastPaths: null,
    stepCells: [], nextSuggestion: null,
  };
  el.modeBadge.textContent = S.mode === 'random'
    ? `🎲 Random Mode (${(LEVELS[S.level] || LEVELS.all).label})`
    : `🔍 Search Mode${S.queue.length > 1 ? ` (${S.queue.length} characters)` : ''}`;
  el.replayBtn.hidden = !S.guidance;
  el.hintBtn.textContent = '💡 Show hint';
  await nextCharacter();
}

export function stopSession() {
  clearTimers();
  destroyWriters();
  destroyPreview();
  el.padWrap.innerHTML = '';
  S = null;
}

// ---------------------------------------------------------------------------
async function nextCharacter() {
  if (!S) return;
  clearTimers();
  el.donePanel.hidden = true;
  el.writeCard.classList.remove('showing-done');
  let entry = S.queue.shift();
  if (!entry && S.mode === 'random') entry = randomEntry(S.script, S.level, S.recent);
  if (!entry) { hooks.onQueueEmpty?.(); return; }
  S.recent.push(entry.c);
  if (S.recent.length > 60) S.recent.shift();
  S.current = entry;
  S.rep = 0; S.charStrokes = 0; S.charMistakes = 0; S.lastPaths = null;
  el.strokeLabel.innerHTML = '<span class="sn">Loading…</span>';
  let data;
  try { data = await loadStrokes(entry.c); }
  catch { toast(`No stroke data for ${entry.c}, skipping`); return nextCharacter(); }
  if (!S || S.current !== entry) return; // session changed while loading
  S.data = data;
  renderInfo(entry);
  startRep();
}

function renderInfo(e) {
  destroyPreview();
  const size = el.charPreview.clientWidth || 150;
  previewWriter = HW.create(el.charPreview, e.c, {
    width: size, height: size, padding: Math.round(size * 0.1),
    showCharacter: true, showOutline: false,
    strokeColor: COLORS.stroke, radicalColor: COLORS.radical,
    strokeAnimationSpeed: 1.3, delayBetweenStrokes: 220, charDataLoader,
  });
  el.charPinyin.textContent = e.p.join(' | ') || '—';
  el.charMeaning.textContent = e.d || '';
  el.charMeta.innerHTML = `<span><b>${e.n}</b> strokes</span>`
    + (e.r ? `<span>radical <b class="hanzi">${e.r}</b></span>` : '')
    + (e.f ? `<span>rank <b>#${e.f.toLocaleString()}</b></span>` : '');
  const vs = [];
  if (e.t) for (const c of e.t) if (getEntry(c)) vs.push({ c, label: 'traditional' });
  if (e.m) for (const c of e.m) if (getEntry(c)) vs.push({ c, label: 'simplified' });
  el.charVariants.innerHTML = vs.map((v) =>
    `<button type="button" data-char="${v.c}" title="Write ${v.c} instead"><span class="v hanzi">${v.c}</span>${v.label}</button>`).join('');
  el.charVariants.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const x = getEntry(b.dataset.char);
    if (x && S) { clearTimers(); S.queue.unshift(x); nextCharacter(); }
  }));
  renderRepDots();
}

function renderRepDots() {
  el.repDots.innerHTML = '';
  for (let i = 0; i < S.reps; i++) {
    const d = document.createElement('span');
    d.className = 'rep-dot' + (i < S.rep ? ' done' : i === S.rep ? ' current' : '');
    d.textContent = i < S.rep ? '⭐' : '';
    el.repDots.appendChild(d);
  }
}

// ---------------------------------------------------------------------------
function startRep() {
  if (!S || !S.data) return;
  clearTimers();
  destroyWriters();
  el.padWrap.innerHTML = '';
  S.repMistakes = 0;
  S.paths = [];
  renderRepDots();
  if (S.guidance && S.guideType === 'steps') buildSteps();
  else buildSinglePad();
}

function makePad(size) {
  const pad = document.createElement('div');
  pad.className = 'pad';
  pad.style.width = pad.style.height = size + 'px';
  pad.innerHTML = GRID_SVG + '<div class="writer"></div>';
  return pad;
}
function padSize() {
  const w = el.padWrap.clientWidth || 360;
  return Math.max(240, Math.min(w - 8, 400));
}
const STEP_GAP = 16;      // must match .steps gap
const STEP_PAD = 10;      // must match .steps horizontal padding
/** Box size so that exactly 2.5 boxes are visible: previous, active, and half of the next one. */
function stepSize() {
  const w = el.padWrap.clientWidth || 360;
  return Math.max(104, Math.floor((w - 2 * STEP_PAD - 2 * STEP_GAP) / 2.5));
}
function writerOptions(size, extra, padFrac = 0.09) {
  return {
    width: size, height: size, padding: Math.round(size * padFrac),
    showOutline: true, showCharacter: false,
    strokeColor: COLORS.stroke, outlineColor: COLORS.outline, drawingColor: COLORS.drawing,
    drawingWidth: Math.max(5, Math.round(size * 0.05)),
    highlightColor: COLORS.highlight, highlightCompleteColor: COLORS.complete, radicalColor: null,
    strokeHighlightSpeed: 1.6, strokeAnimationSpeed: 1.3, delayBetweenStrokes: 200,
    charDataLoader, ...extra,
  };
}

/** Realtime guidance and no-guidance both use one big square. */
function buildSinglePad() {
  const size = padSize();
  const pad = makePad(size);
  el.padWrap.appendChild(pad);
  const n = S.data.strokes.length;
  const w = HW.create(pad.querySelector('.writer'), S.current.c, writerOptions(size, { showOutline: S.guidance }));
  writers.push(w);
  currentWriter = w;
  currentStrokeIdx = 0;
  setStrokeLabel(0, n);
  w.quiz({
    showHintAfterMisses: S.guidance ? false : 3, // with guidance the hint comes only from the button
    leniency: 1.15,
    highlightOnComplete: true,
    onMistake: () => onMistake(pad),
    onCorrectStroke: (d) => {
      onCorrect(pad, d, true);
      if (d.strokesRemaining > 0) {
        currentStrokeIdx = d.strokeNum + 1;
        setStrokeLabel(currentStrokeIdx, n, null, null, d.strokeNum);
      } else {
        setStrokeLabel(d.strokeNum, n, null, null, d.strokeNum);
      }
    },
    onComplete: () => setTimeout(() => onRepComplete(pad), 380),
  });
}

/** Step-by-step: one box per stroke, laid out horizontally. Box k asks for strokes 1..k+1. */
function buildSteps() {
  const n = S.data.strokes.length;
  const size = stepSize();
  const outer = document.createElement('div');
  outer.className = 'steps-outer';
  const strip = document.createElement('div');
  strip.className = 'steps';
  S.stepCells = [];
  for (let k = 0; k < n; k++) {
    const cell = makePad(size);
    cell.classList.add('pending');
    const num = document.createElement('span');
    num.className = 'step-num';
    num.textContent = k + 1;
    cell.appendChild(num);
    strip.appendChild(cell);
    S.stepCells.push(cell);
  }
  outer.appendChild(strip);
  const hint = document.createElement('div');
  hint.className = 'steps-hint';
  hint.textContent = n > 1 ? `${n} boxes | every box adds one stroke` : 'Just one stroke';
  outer.appendChild(hint);
  el.padWrap.appendChild(outer);
  activateStep(0);
}
function activateStep(k) {
  if (!S) return;
  const n = S.data.strokes.length;
  const size = stepSize();
  const cell = S.stepCells[k];
  const strip = cell.parentElement;
  cell.classList.remove('pending');
  cell.classList.add('active');
  // keep one finished box on the left, the active box in the middle, and half of the next one peeking on the right
  const cellLeft = cell.offsetLeft - strip.offsetLeft - STEP_PAD;
  strip.scrollTo({ left: Math.max(0, cellLeft - (size + STEP_GAP)), behavior: 'smooth' });
  const partial = {
    strokes: S.data.strokes.slice(0, k + 1),
    medians: S.data.medians.slice(0, k + 1),
    radStrokes: (S.data.radStrokes || []).filter((i) => i <= k),
  };
  // small boxes: keep only a thin margin so the character fills the square
  const w = HW.create(cell.querySelector('.writer'), S.current.c,
    writerOptions(size, { charDataLoader: (c, onLoad) => onLoad(partial) }, 0.03));
  writers.push(w);
  currentWriter = w;
  currentStrokeIdx = 0;
  const last = k === n - 1;
  if (last) S.paths = [];
  setStrokeLabel(0, k + 1, k, n);
  w.quiz({
    showHintAfterMisses: false, // hint only from the button
    leniency: 1.2,
    highlightOnComplete: last,
    onMistake: () => onMistake(cell),
    onCorrectStroke: (d) => {
      onCorrect(cell, d, last);
      if (d.strokesRemaining > 0) {
        currentStrokeIdx = d.strokeNum + 1;
        setStrokeLabel(currentStrokeIdx, k + 1, k, n, d.strokeNum);
      } else {
        setStrokeLabel(d.strokeNum, k + 1, k, n, d.strokeNum);
      }
    },
    onComplete: () => {
      cell.classList.remove('active');
      cell.classList.add('done');
      if (!last) autoTimer = setTimeout(() => activateStep(k + 1), 420);
      else setTimeout(() => onRepComplete(cell), 380);
    },
  });
}

/** i = stroke the user writes next; wrote = stroke just completed (its name is shown as information) */
function setStrokeLabel(i, n, box = null, boxes = null, wrote = null) {
  if (!S) return;
  const parts = [];
  if (box != null) parts.push(`<span class="sn">Box ${box + 1} / ${boxes}</span>`);
  parts.push(`<span class="sn">Stroke ${i + 1} / ${n}</span>`);
  if (S.guidance && wrote != null) {
    const st = classifyStroke(S.data.medians[wrote], S.current.c, wrote);
    if (st) {
      parts.push(`<span class="sname" title="${st.en}">${strokeSVG(S.data.strokes[wrote], 26, '#b45309')}`
        + `<span class="hanzi">${strokeNameFor(st, S.script)}</span><span class="py">${st.py}</span></span>`);
    }
  }
  el.strokeLabel.innerHTML = parts.join('');
  fitStrokeSVGs(el.strokeLabel);
}

function onMistake(pad) {
  if (!S) return;
  S.repMistakes++;
  S.charMistakes++;
  shake(pad);
  sfx.miss();
}
function onCorrect(pad, d, collect) {
  if (!S) return;
  S.charStrokes++;
  sfx.stroke();
  if (collect) S.paths.push(d.drawnPath.points);
  const nums = d.drawnPath.pathString.match(/-?[\d.]+/g);
  if (nums && nums.length >= 2) spark(pad, +nums[nums.length - 2], +nums[nums.length - 1]);
}

function onRepComplete(pad) {
  if (!S) return;
  S.rep++;
  if (S.paths.length) S.lastPaths = S.paths;
  const perfect = S.repMistakes === 0;
  renderRepDots();
  pad.classList.add('glow');
  if (S.rep < S.reps) {
    sfx.rep();
    cheer(pad, { perfect });
    autoTimer = setTimeout(startRep, 1050);
  } else {
    finishCharacter(pad);
  }
}

function finishCharacter(pad) {
  const e = S.current;
  const r = pad.getBoundingClientRect();
  confetti({ origin: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
  sfx.done();
  cheer(pad, { big: true });
  const res = recordCompletion({
    char: e.c, script: S.script, reps: S.reps,
    strokes: S.charStrokes, mistakes: S.charMistakes, paths: S.lastPaths,
  });
  if (!res.saved) toast('Progress could not be saved in this browser');
  hooks.onCharacterDone?.(e, res.progress);
  autoTimer = setTimeout(() => showDone(e), 950);
}

function showDone(e, { skipped = false } = {}) {
  if (!S) return;
  el.writeCard.classList.add('showing-done');
  el.donePanel.hidden = false;
  el.doneChar.innerHTML = S.lastPaths && !skipped ? handwritingSVG(compressPaths(S.lastPaths), { width: 72 }) : '';
  if (!el.doneChar.innerHTML) el.doneChar.textContent = e.c;
  el.doneTitle.textContent = skipped ? 'Skipped' : bigCheer();
  const perfect = S.charMistakes === 0;
  el.doneSub.textContent = skipped
    ? `${e.c} | ${e.p.join(' / ')} | maybe next time`
    : `${e.c} | ${e.p.join(' / ')} | written ${S.reps}×${perfect ? ' | flawless 🌟' : ''}`;
  el.relatedWrap.hidden = true;
  el.related.innerHTML = '';
  el.againBtn.hidden = skipped;
  S.nextSuggestion = null;
  const hasQueue = S.queue.length > 0;
  if (S.mode === 'random' || hasQueue) {
    el.nextBtn.textContent = hasQueue ? `Next: ${S.queue[0].c} →` : 'Next →';
    countdown(hasQueue ? 6 : 9, advance);
  } else {
    const rel = relatedEntries(e, S.script, 6);
    if (rel.length) {
      el.relatedWrap.hidden = false;
      el.related.innerHTML = rel.map((r) =>
        `<button type="button" data-char="${r.e.c}" title="${r.e.d}"><span class="rc hanzi">${r.e.c}</span>`
        + `<span class="rp">${r.e.p[0] || ''}</span><span class="rw">${WHY[r.why]}</span></button>`).join('');
      el.related.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        const x = getEntry(b.dataset.char);
        if (x) { S.queue.push(x); advance(); }
      }));
      S.nextSuggestion = rel[0].e;
    }
    el.nextBtn.textContent = rel.length ? `Next: ${rel[0].e.c} →` : '🎲 Surprise me';
  }
}

function countdown(secs, fn) {
  let cd = el.donePanel.querySelector('.countdown');
  if (!cd) { cd = document.createElement('span'); cd.className = 'countdown'; el.donePanel.appendChild(cd); }
  let left = secs;
  const tick = () => {
    if (left <= 0) { cd.textContent = ''; fn(); return; }
    cd.textContent = `next in ${left}s`;
    left--;
    countdownTimer = setTimeout(tick, 1000);
  };
  tick();
}

function advance() {
  if (!S) return;
  clearTimers();
  if (!S.queue.length && S.mode !== 'random') {
    S.queue.push(S.nextSuggestion || randomEntry(S.script, 'everyday', S.recent));
  }
  nextCharacter();
}

function hint() {
  if (!S || !currentWriter) return;
  currentWriter.highlightStroke(currentStrokeIdx);
}
function skip() {
  if (!S) return;
  clearTimers();
  if (!S.queue.length && S.mode !== 'random') { showDone(S.current, { skipped: true }); return; }
  nextCharacter();
}
function replay() {
  if (!S || !S.guidance || !previewWriter) return;
  previewWriter.animateCharacter();
}
function onResize() {
  if (!S || !currentWriter || (S.guidance && S.guideType === 'steps')) return;
  const pad = el.padWrap.querySelector('.pad');
  if (!pad) return;
  const size = padSize();
  if (Math.abs(size - pad.clientWidth) < 12) return;
  pad.style.width = pad.style.height = size + 'px';
  currentWriter.updateDimensions({ width: size, height: size, padding: Math.round(size * 0.09) });
}

function destroyWriters() {
  for (const w of writers) { try { w.cancelQuiz(); } catch { /* ignore */ } }
  writers = [];
  currentWriter = null;
}
function destroyPreview() {
  previewWriter = null;
  el.charPreview.innerHTML = '';
}
function clearTimers() {
  clearTimeout(autoTimer);
  clearTimeout(countdownTimer);
  autoTimer = 0; countdownTimer = 0;
  const cd = el.donePanel?.querySelector('.countdown');
  if (cd) cd.textContent = '';
}
