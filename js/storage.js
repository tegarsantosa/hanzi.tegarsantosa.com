// Local-only persistence (localStorage). Everything here is temporary by nature:
// it lives in this browser profile and nowhere else. The UI says so.

const KEY = 'hanzi.progress.v1';
const SETTINGS_KEY = 'hanzi.settings.v1';
const DEFAULT_SETTINGS = { script: 'simp', mode: 'random', reps: 3, guidance: true, guideType: 'realtime', level: 'common' };

export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* private mode etc. */ }
}

const empty = () => ({ v: 1, chars: {}, totals: { reps: 0, strokes: 0 }, days: [] });
export function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p && p.chars && p.totals) return p;
  } catch { /* ignore */ }
  return empty();
}
function save(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); return true; }
  catch { return false; }
}
const today = () => new Date().toISOString().slice(0, 10);

/** Called when a character has been written the requested number of times. */
export function recordCompletion({ char, script, reps, strokes, mistakes, paths }) {
  const p = loadProgress();
  const rec = p.chars[char] || { n: 0, s: 0, m: 0, first: today() };
  rec.n += reps;
  rec.s += strokes;
  rec.m += mistakes;
  rec.last = new Date().toISOString();
  rec.sc = script;
  if (paths && paths.length) rec.w = compressPaths(paths);
  p.chars[char] = rec;
  p.totals.reps += reps;
  p.totals.strokes += strokes;
  if (!p.days.includes(today())) p.days.push(today());
  const saved = save(p);
  return { progress: p, saved };
}

/** Handwriting points (character space) -> flat rounded int arrays, at most 24 points per stroke. */
export function compressPaths(paths) {
  return paths.map((pts) => {
    if (!pts || !pts.length) return [];
    if (typeof pts[0] === 'number') return pts; // already compressed
    const step = Math.max(1, Math.ceil(pts.length / 24));
    const out = [];
    for (let i = 0; i < pts.length; i += step) out.push(Math.round(pts[i].x), Math.round(pts[i].y));
    const last = pts[pts.length - 1];
    if ((pts.length - 1) % step !== 0) out.push(Math.round(last.x), Math.round(last.y));
    return out;
  });
}

/** SVG markup of saved handwriting (compressed format). Character space is 1024 wide, y up from -124 to 900. */
export function handwritingSVG(w, { color = '#1d4ed8', width = 68 } = {}) {
  if (!w || !w.length) return '';
  const lines = w.map((pts) => {
    if (pts.length < 2) return '';
    if (pts.length === 2) return `<circle cx="${pts[0]}" cy="${pts[1]}" r="${width / 2}" fill="${color}"/>`;
    const d = [];
    for (let i = 0; i < pts.length; i += 2) d.push((i ? 'L' : 'M') + pts[i] + ' ' + pts[i + 1]);
    return `<path d="${d.join('')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  return `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g transform="translate(0,900) scale(1,-1)">${lines.join('')}</g></svg>`;
}

/** Consecutive days of practice ending today (or yesterday, so a streak survives until midnight). */
export function streak(days) {
  if (!days || !days.length) return 0;
  const set = new Set(days);
  const d = new Date();
  const key = (dt) => dt.toISOString().slice(0, 10);
  if (!set.has(key(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(key(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function exportProgress() {
  const p = loadProgress();
  const blob = new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `learn-hanzi-progress-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/** Merge a previously exported file into the current progress. Resolves with the number of characters merged. */
export async function importProgress(file) {
  const text = await file.text();
  const inc = JSON.parse(text);
  if (!inc || typeof inc !== 'object' || !inc.chars) throw new Error('Not a Learn Hanzi export');
  const p = loadProgress();
  let merged = 0;
  for (const [c, r] of Object.entries(inc.chars)) {
    if (!r || typeof r !== 'object') continue;
    const cur = p.chars[c];
    if (!cur) { p.chars[c] = r; merged++; continue; }
    cur.n += Number(r.n) || 0; cur.s += Number(r.s) || 0; cur.m += Number(r.m) || 0;
    if ((r.last || '') > (cur.last || '')) { cur.last = r.last; if (r.w) cur.w = r.w; }
    if ((r.first || '') < (cur.first || '')) cur.first = r.first;
    merged++;
  }
  p.totals.reps += Number(inc.totals?.reps) || 0;
  p.totals.strokes += Number(inc.totals?.strokes) || 0;
  for (const d of inc.days || []) if (!p.days.includes(d)) p.days.push(d);
  p.days.sort();
  if (!save(p)) throw new Error('Could not save');
  return merged;
}

export function clearProgress() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
