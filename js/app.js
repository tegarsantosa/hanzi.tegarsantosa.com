// App shell: boot, routing, setup screen, progress view, 28-strokes view.

import { loadIndex, search, LEVELS, poolSize, getEntry, toScript, loadStrokes } from './data.js';
import { STROKES, strokeNameFor, strokeSVG, fitStrokeSVGs, classifyStroke, analyzeStroke } from './strokes.js';
import { toast, shake } from './fx.js';
import {
  loadSettings, saveSettings, loadProgress, streak, exportProgress, importProgress, clearProgress, handwritingSVG,
} from './storage.js';
import { initPractice, startSession, stopSession, isActive, setSessionScript } from './practice.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let settings = loadSettings();
let picked = [];
let progressSort = 'recent';

async function boot() {
  applyScript(settings.script);
  try {
    await loadIndex();
  } catch (e) {
    $('#loading p').textContent = 'Could not load the character data. Please refresh.';
    return;
  }
  wireHeader();
  wireHome();
  wireProgress();
  renderStrokesView();
  initPractice({
    practiceGrid: $('.practice-grid'), padWrap: $('#pad-wrap'), strokeLabel: $('#stroke-label'),
    repDots: $('#rep-dots'), modeBadge: $('#mode-badge'),
    charPreview: $('#char-preview'), charPinyin: $('#char-pinyin'), charMeaning: $('#char-meaning'),
    charMeta: $('#char-meta'), charVariants: $('#char-variants'),
    hintBtn: $('#hint-btn'), restartBtn: $('#restart-btn'), skipBtn: $('#skip-btn'), replayBtn: $('#replay-btn'),
    donePanel: $('#done-panel'), doneChar: $('#done-char'), doneTitle: $('#done-title'), doneSub: $('#done-sub'),
    relatedWrap: $('#related-wrap'), related: $('#related'), nextBtn: $('#next-btn'), againBtn: $('#again-btn'),
  }, {
    onQueueEmpty: () => { location.hash = '#/'; },
    onCharacterDone: () => renderHomeStats(),
  });
  $('#back-btn').addEventListener('click', () => { location.hash = '#/'; });
  window.addEventListener('hashchange', route);
  route();
  const ld = $('#loading');
  ld.classList.add('fade');
  setTimeout(() => ld.remove(), 450);
}

// ---------------------------------------------------------------- header / script
function wireHeader() {
  $$('.script-toggle button').forEach((b) => b.addEventListener('click', () => setScript(b.dataset.script)));
  const modal = $('#about-modal');
  const openAbout = () => { modal.hidden = false; document.body.classList.add('modal-open'); $('[data-about-close]', modal).focus(); };
  const closeAbout = () => { modal.hidden = true; document.body.classList.remove('modal-open'); };
  $('[data-about-open]').addEventListener('click', openAbout);
  $$('[data-about-close]', modal).forEach((b) => b.addEventListener('click', closeAbout));
  modal.addEventListener('click', (e) => { if (e.target === modal) closeAbout(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeAbout(); });
}
function applyScript(s) {
  document.documentElement.dataset.script = s;
  $$('.script-toggle button').forEach((b) => b.classList.toggle('active', b.dataset.script === s));
}
function setScript(s) {
  if (settings.script === s) return;
  settings.script = s;
  saveSettings(settings);
  applyScript(s);
  updatePoolCount();
  picked = picked.map((e) => toScript(e, s));
  renderPicked();
  refreshSearch();
  renderStrokesView();
  if (isActive()) {
    setSessionScript(s);
    toast(s === 'trad' ? 'Traditional from the next character' : 'Simplified from the next character');
  }
}
const sessionCfg = () => ({
  mode: settings.mode, script: settings.script, reps: settings.reps,
  guidance: settings.guidance, guideType: settings.guideType, level: settings.level,
});
function launch(cfg) {
  showView('practice');
  location.hash = '#/practice';
  startSession(cfg);
}

// ---------------------------------------------------------------- routing
function route() {
  const h = location.hash || '#/';
  const name = h.startsWith('#/practice') ? 'practice'
    : h.startsWith('#/progress') ? 'progress'
      : h.startsWith('#/strokes') ? 'strokes' : 'home';
  if (name === 'practice' && !isActive()) { location.replace('#/'); return; }
  if (name !== 'practice' && isActive()) stopSession();
  showView(name);
  if (name === 'progress') renderProgress();
  if (name === 'home') renderHomeStats();
}
function showView(name) {
  $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + name; });
  const navName = name === 'practice' ? 'home' : name;
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === navName));
  window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------- home / setup
function wireHome() {
  $$('.mode-card').forEach((b) => b.addEventListener('click', () => {
    settings.mode = b.dataset.mode; saveSettings(settings); syncHome();
    if (settings.mode === 'search') $('#search-input').focus();
  }));
  $$('#level-chips button').forEach((b) => b.addEventListener('click', () => {
    settings.level = b.dataset.level; saveSettings(settings); syncHome();
  }));
  $$('.stepper button').forEach((b) => b.addEventListener('click', () => {
    settings.reps = Math.min(10, Math.max(1, settings.reps + Number(b.dataset.step)));
    saveSettings(settings); syncHome();
  }));
  $$('#guidance-seg button').forEach((b) => b.addEventListener('click', () => {
    settings.guidance = b.dataset.guidance === 'yes'; saveSettings(settings); syncHome();
  }));
  $$('.guide-card').forEach((b) => b.addEventListener('click', () => {
    settings.guideType = b.dataset.guide; saveSettings(settings); syncHome();
  }));
  const input = $('#search-input');
  let t = 0;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(refreshSearch, 120); });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (picked.length) { start(); return; }
    const first = $('#search-results .result');
    if (first) { first.click(); start(); }
  });
  $('#picked-clear').addEventListener('click', () => { picked = []; renderPicked(); });
  $('#start-btn').addEventListener('click', start);
  syncHome();
  updatePoolCount();
}
function syncHome() {
  $$('.mode-card').forEach((b) => b.classList.toggle('active', b.dataset.mode === settings.mode));
  $('#random-options').hidden = settings.mode !== 'random';
  $('#search-options').hidden = settings.mode !== 'search';
  $$('#level-chips button').forEach((b) => b.classList.toggle('active', b.dataset.level === settings.level));
  $('#reps-out').textContent = settings.reps;
  $$('#guidance-seg button').forEach((b) => b.classList.toggle('active', (b.dataset.guidance === 'yes') === settings.guidance));
  $('#guide-type-row').classList.toggle('disabled', !settings.guidance);
  $$('.guide-card').forEach((b) => b.classList.toggle('active', b.dataset.guide === settings.guideType));
  const btn = $('#start-btn');
  if (settings.mode === 'random') btn.textContent = 'Start writing ✍️';
  else btn.textContent = picked.length ? `Write ${picked.map((e) => e.c).join('')} ✍️` : 'Pick a character first';
}
function updatePoolCount() {
  $('#pool-count').textContent = poolSize(settings.script, 'all').toLocaleString() + ' chars';
}
function refreshSearch() {
  const q = $('#search-input').value;
  const box = $('#search-results');
  box.innerHTML = '';
  if (!q.trim()) return;
  const res = search(q, settings.script);
  if (res.chars) {
    if (res.chars.length > 1) box.appendChild(resultButton({ word: res.chars }));
    res.chars.forEach((e) => box.appendChild(resultButton({ entry: e })));
    if (res.unknown?.length) box.insertAdjacentHTML('beforeend', `<div class="none">No stroke data for ${res.unknown.join(' ')}</div>`);
  } else if (!res.matches.length) {
    box.innerHTML = '<div class="none">Nothing found. Try pinyin like “hao3” or an English word.</div>';
  } else {
    res.matches.forEach((e) => box.appendChild(resultButton({ entry: e })));
  }
}
function resultButton({ entry, word }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'result' + (word ? ' word' : '');
  if (word) {
    b.innerHTML = `<span class="rc hanzi">${word.map((e) => e.c).join('')}</span>`
      + `<span class="rt"><span class="rp">Whole word</span><span class="rd">${word.length} characters, in order</span></span><span class="badge">word</span>`;
    b.addEventListener('click', () => { picked = [...word]; renderPicked(); });
  } else {
    b.innerHTML = `<span class="rc hanzi">${entry.c}</span>`
      + `<span class="rt"><span class="rp">${entry.p.join(' / ') || '—'}</span><span class="rd">${entry.d || ''}</span></span>`;
    b.addEventListener('click', () => {
      if (picked.length >= 12) { toast('That is plenty for one round'); return; }
      picked.push(entry);
      renderPicked();
    });
  }
  return b;
}
function renderPicked() {
  const wrap = $('#search-picked');
  wrap.hidden = !picked.length;
  $('.picked-chars', wrap).innerHTML = picked.map((e) => `<span class="hanzi">${e.c}</span>`).join('');
  syncHome();
}
function start() {
  let queue = [];
  if (settings.mode === 'search') {
    if (!picked.length) {
      const res = search($('#search-input').value, settings.script);
      if (res.chars?.length) picked = res.chars;
      else if (res.matches?.length === 1) picked = [res.matches[0]];
    }
    if (!picked.length) { shake($('.search-box')); $('#search-input').focus(); return; }
    queue = [...picked];
  }
  launch({ ...sessionCfg(), queue });
}
function renderHomeStats() {
  const p = loadProgress();
  const chars = Object.entries(p.chars);
  const box = $('#home-stats');
  if (!chars.length) { box.hidden = true; return; }
  box.hidden = false;
  const recent = chars.sort((a, b) => (b[1].last || '').localeCompare(a[1].last || '')).slice(0, 8);
  box.innerHTML = `<span>You have written <strong>${chars.length}</strong> character${chars.length > 1 ? 's' : ''}`
    + ` · <strong>${p.totals.reps}</strong> repetitions</span>`
    + `<div class="mini-chars">${recent.map(([c]) => `<span class="hanzi">${c}</span>`).join('')}</div>`
    + '<a class="btn small" href="#/progress">See all ⭐</a>';
}

// ---------------------------------------------------------------- progress
function wireProgress() {
  $('#export-btn').addEventListener('click', exportProgress);
  $('#import-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const n = await importProgress(f);
      toast(`Imported ${n} character${n === 1 ? '' : 's'}`);
      renderProgress();
    } catch (err) { toast(err.message || 'Import failed'); }
  });
  $('#clear-progress').addEventListener('click', () => {
    if (!confirm('Delete everything you have saved in this browser?')) return;
    clearProgress();
    renderProgress();
    renderHomeStats();
    toast('Cleared');
  });
  $$('#progress-sort button').forEach((b) => b.addEventListener('click', () => {
    progressSort = b.dataset.sort;
    $$('#progress-sort button').forEach((x) => x.classList.toggle('active', x === b));
    renderProgress();
  }));
}
function relDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function renderProgress() {
  const p = loadProgress();
  const chars = Object.entries(p.chars);
  const st = streak(p.days);
  $('#stats-row').innerHTML = [
    [chars.length, 'characters'], [p.totals.reps, 'repetitions'], [p.totals.strokes, 'strokes'], [st, 'day streak'],
  ].map(([v, l]) => `<div class="clay stat"><b>${Number(v).toLocaleString()}</b><span>${l}</span></div>`).join('');
  const grid = $('#learned-grid');
  grid.innerHTML = '';
  $('#learned-empty').hidden = chars.length > 0;
  chars.sort(progressSort === 'recent'
    ? (a, b) => (b[1].last || '').localeCompare(a[1].last || '')
    : (a, b) => b[1].n - a[1].n || (b[1].last || '').localeCompare(a[1].last || ''));
  for (const [c, r] of chars) {
    const e = getEntry(c);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'learned';
    b.title = `${c} · ${e?.d || ''} · write it again`;
    const pic = r.w && r.w.length
      ? `<span class="ghost-glyph hanzi">${c}</span>${handwritingSVG(r.w)}`
      : `<span class="glyph hanzi">${c}</span>`;
    b.innerHTML = `<span class="lc">${pic}</span><span class="lp">${e?.p?.[0] || ''}</span>`
      + `<span class="ld">${relDate(r.last)}</span><span class="count">${r.n}×</span>`;
    b.addEventListener('click', () => { if (e) launch({ ...sessionCfg(), mode: 'search', queue: [e] }); });
    grid.appendChild(b);
  }
}

// ---------------------------------------------------------------- 28 strokes
function renderStrokesView() {
  const grid = $('#strokes-grid');
  grid.innerHTML = STROKES.map((s, i) => {
    const ex = toScript(getEntry(s.ex), settings.script) || getEntry(s.ex);
    return `<div class="clay stroke-card" data-i="${i}">`
      + `<span class="idx">${String(i + 1).padStart(2, '0')}</span>`
      + `<span class="glyph hanzi" data-glyph>${s.g}</span>`
      + `<span class="zh hanzi">${strokeNameFor(s, settings.script)}</span>`
      + `<span class="py">${s.py}</span><span class="en">${s.en}</span>`
      + `<button type="button" class="ex" data-char="${ex?.c || s.ex}">as in <b class="hanzi">${ex?.c || s.ex}</b> · write it</button>`
      + '</div>';
  }).join('');
  $$('#strokes-grid .ex').forEach((b) => b.addEventListener('click', () => {
    const e = getEntry(b.dataset.char);
    if (e) launch({ ...sessionCfg(), mode: 'search', queue: [e] });
  }));
  // Replace the font glyphs with the real stroke shapes from the example characters (no font dependency).
  STROKES.forEach(async (s, i) => {
    try {
      const d = await loadStrokes(s.ex);
      const path = d.strokes[s.exi];
      const slot = grid.querySelector(`[data-i="${i}"] [data-glyph]`);
      if (path && slot) { slot.innerHTML = strokeSVG(path, 56, '#1d4ed8'); fitStrokeSVGs(slot); }
    } catch { /* keep the font glyph */ }
  });
}

// expose a few things for quick console checks
window.__hanzi = { classifyStroke, analyzeStroke, loadStrokes, STROKES };

boot();
