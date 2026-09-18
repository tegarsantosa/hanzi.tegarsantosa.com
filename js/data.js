// Character index, search, random pools, related-character suggestions and stroke-data loading.
// Everything runs in the browser; data/index.json and data/strokes/*.json are static files.

const IDC_RE = /[\u2FF0-\u2FFF？?]/g; // ideographic description characters + unknown-part marker
const CDN = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/';

let INDEX = [];
const BY_CHAR = new Map();
const POOLS = new Map();
const STROKE_CACHE = new Map();

export const LEVELS = {
  common: { cap: 500, label: 'Common' },
  everyday: { cap: 1500, label: 'Everyday' },
  advanced: { cap: 3500, label: 'Advanced' },
  all: { cap: Infinity, label: 'Everything' },
};

export async function loadIndex() {
  const res = await fetch('data/index.json');
  if (!res.ok) throw new Error('Could not load character index');
  INDEX = await res.json();
  BY_CHAR.clear();
  for (const e of INDEX) BY_CHAR.set(e.c, e);
  return INDEX;
}

export const allEntries = () => INDEX;
export const getEntry = (c) => BY_CHAR.get(c);

/** Is this entry usable in the given script? ('simp' | 'trad') */
export function validIn(e, script) {
  if (!e) return false;
  if (e.s === 3) return true; // unknown to OpenCC: allow everywhere
  return script === 'trad' ? e.s !== 1 : e.s !== 2;
}

/** Return the best entry for the chosen script (converts 马 -> 馬 in traditional mode, etc). */
export function toScript(e, script) {
  if (!e || validIn(e, script)) return e;
  const alts = script === 'trad' ? e.t : e.m;
  if (alts) {
    for (const ch of alts) {
      const x = BY_CHAR.get(ch);
      if (x && validIn(x, script)) return x;
    }
  }
  return e;
}

export function isCJK(ch) {
  const cp = ch.codePointAt(0);
  return (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x20000 && cp <= 0x2a6df)
    || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0x2e80 && cp <= 0x2fdf) || (cp >= 0x31c0 && cp <= 0x31ef);
}

// ---- pinyin helpers -------------------------------------------------------
const TONE_MARKS = {
  ā: ['a', 1], á: ['a', 2], ǎ: ['a', 3], à: ['a', 4],
  ē: ['e', 1], é: ['e', 2], ě: ['e', 3], è: ['e', 4],
  ī: ['i', 1], í: ['i', 2], ǐ: ['i', 3], ì: ['i', 4],
  ō: ['o', 1], ó: ['o', 2], ǒ: ['o', 3], ò: ['o', 4],
  ū: ['u', 1], ú: ['u', 2], ǔ: ['u', 3], ù: ['u', 4],
  ǖ: ['v', 1], ǘ: ['v', 2], ǚ: ['v', 3], ǜ: ['v', 4], ü: ['v', 0],
  ń: ['n', 2], ň: ['n', 3], ǹ: ['n', 4], ḿ: ['m', 2],
};
const PY_CACHE = new Map();
/** "nǐ" -> { plain: "ni", num: "ni3" } */
export function pinyinForms(p) {
  let f = PY_CACHE.get(p);
  if (f) return f;
  let plain = '';
  let tone = 0;
  for (const ch of p.toLowerCase()) {
    const m = TONE_MARKS[ch];
    if (m) { plain += m[0]; if (m[1]) tone = m[1]; }
    else plain += ch;
  }
  f = { plain, num: tone ? plain + tone : plain + '5' };
  PY_CACHE.set(p, f);
  return f;
}
function normalizeQuery(q) {
  // accept "nǐ", "ni3", "ni", "nv", "nü"
  let s = q.toLowerCase().replace(/ü/g, 'v').replace(/u:/g, 'v').trim();
  const m = s.match(/^([a-z]+)([1-5])?$/);
  if (!m) return null;
  return { plain: m[1], tone: m[2] ? Number(m[2]) : 0 };
}

// ---- search ----------------------------------------------------------------
/**
 * Search by character(s), pinyin, or English.
 * Returns { chars: [entries...] } when the query contains hanzi (in order, for word practice),
 * or { matches: [entries...] } for pinyin / English queries.
 */
export function search(q, script, limit = 18) {
  q = q.trim();
  if (!q) return { matches: [] };
  const hanzi = [...q].filter(isCJK);
  if (hanzi.length) {
    const chars = hanzi.map((c) => BY_CHAR.get(c)).filter(Boolean).map((e) => toScript(e, script));
    return { chars, unknown: hanzi.filter((c) => !BY_CHAR.has(c)) };
  }
  const py = normalizeQuery(q);
  const ql = q.toLowerCase();
  const scored = [];
  for (const e of INDEX) {
    if (!validIn(e, script)) continue;
    let score = 0;
    if (py) {
      for (const p of e.p) {
        const f = pinyinForms(p);
        if (py.tone) {
          if (f.num === py.plain + py.tone) score = Math.max(score, 100);
        } else if (f.plain === py.plain) score = Math.max(score, 90);
        else if (f.plain.startsWith(py.plain) && py.plain.length >= 2) score = Math.max(score, 40);
      }
    }
    if (!score && ql.length >= 2 && e.d) {
      const d = e.d.toLowerCase();
      if (d === ql) score = 80;
      else if (new RegExp(`(^|[^a-z])${ql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(d)) score = 60;
      else if (d.includes(ql) && ql.length >= 3) score = 25;
    }
    if (score) scored.push({ e, score, f: e.f ?? 99999 });
  }
  scored.sort((a, b) => b.score - a.score || a.f - b.f);
  return { matches: scored.slice(0, limit).map((x) => x.e) };
}

// ---- random -------------------------------------------------------------------
function pool(script, level) {
  const key = script + ':' + level;
  let p = POOLS.get(key);
  if (!p) {
    const cap = (LEVELS[level] || LEVELS.all).cap;
    p = INDEX.filter((e) => validIn(e, script) && e.p.length && e.d && e.n >= 1
      && (cap === Infinity || (e.f != null && e.f <= cap)));
    POOLS.set(key, p);
  }
  return p;
}
export function poolSize(script, level) { return pool(script, level).length; }
export function randomEntry(script, level, recent = []) {
  const p = pool(script, level);
  if (!p.length) return null;
  const avoid = new Set(recent);
  for (let i = 0; i < 12; i++) {
    const e = p[Math.floor(Math.random() * p.length)];
    if (!avoid.has(e.c)) return e;
  }
  return p[Math.floor(Math.random() * p.length)];
}

// ---- related characters (recommendations after a searched character) ----------
export function components(e) {
  if (!e?.k) return [];
  return [...e.k.replace(IDC_RE, '')].filter((c) => c !== e.c && BY_CHAR.has(c));
}
export function relatedEntries(e, script, limit = 6) {
  const out = [];
  const seen = new Set([e.c]);
  const push = (x, why) => {
    if (!x || seen.has(x.c) || !validIn(x, script) || !x.p.length || !x.d) return;
    seen.add(x.c);
    out.push({ e: x, why });
  };
  const byFreq = (a, b) => (a.f ?? 99999) - (b.f ?? 99999);

  // 1. characters that contain this one as a component
  const containing = INDEX.filter((x) => x.k && x.k.includes(e.c) && x.c !== e.c).sort(byFreq);
  containing.slice(0, 3).forEach((x) => push(toScript(x, script), 'contains'));
  // 2. its own components
  components(e).map((c) => toScript(BY_CHAR.get(c), script)).forEach((x) => push(x, 'part'));
  // 3. same radical, common
  if (e.r) INDEX.filter((x) => x.r === e.r && x.c !== e.c).sort(byFreq).slice(0, 4).forEach((x) => push(toScript(x, script), 'radical'));
  // 4. homophones
  if (e.p[0]) {
    const f0 = pinyinForms(e.p[0]).num;
    INDEX.filter((x) => x.c !== e.c && x.p.some((p) => pinyinForms(p).num === f0)).sort(byFreq).slice(0, 2)
      .forEach((x) => push(toScript(x, script), 'sounds'));
  }
  return out.slice(0, limit);
}

// ---- stroke data --------------------------------------------------------------
export function loadStrokes(ch) {
  if (STROKE_CACHE.has(ch)) return STROKE_CACHE.get(ch);
  const cp = ch.codePointAt(0).toString(16);
  const p = (async () => {
    try {
      const r = await fetch(`data/strokes/${cp}.json`);
      if (r.ok) return await r.json();
      throw new Error('local miss');
    } catch {
      const r = await fetch(CDN + encodeURIComponent(ch) + '.json');
      if (!r.ok) throw new Error(`No stroke data for ${ch}`);
      return await r.json();
    }
  })();
  p.catch(() => STROKE_CACHE.delete(ch));
  STROKE_CACHE.set(ch, p);
  return p;
}
export const charDataLoader = (ch, onLoad, onError) => loadStrokes(ch).then(onLoad, onError);
