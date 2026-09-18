#!/usr/bin/env node
/**
 * Build the character data used by the site.
 *
 * Inputs (downloaded into a scratch folder, see README):
 *   - node_modules/hanzi-writer-data/*.json   stroke paths + medians (Make Me a Hanzi, via Hanzi Writer)
 *   - dictionary.txt                          Make Me a Hanzi dictionary (pinyin, definition, radical, decomposition)
 *   - STCharacters.txt / TSCharacters.txt     OpenCC simplified <-> traditional character tables
 *   - junda_utf8.txt                          Jun Da modern Chinese character frequency list (UTF-8)
 *
 * Outputs (into the site folder):
 *   - data/index.json     compact array of every character we have strokes for
 *   - data/strokes/<hex>.json  one stroke file per character, named by code point
 *
 * Usage: node scripts/build-data.mjs <scratch-folder> [site-folder]
 */
import fs from 'node:fs';
import path from 'node:path';

const [,, srcDir, outDirArg] = process.argv;
if (!srcDir) {
  console.error('usage: node scripts/build-data.mjs <scratch-folder> [site-folder]');
  process.exit(1);
}
const siteDir = outDirArg || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const strokesSrc = path.join(srcDir, 'node_modules', 'hanzi-writer-data');
const outData = path.join(siteDir, 'data');
const outStrokes = path.join(outData, 'strokes');
fs.mkdirSync(outStrokes, { recursive: true });

const readLines = (f) => fs.readFileSync(path.join(srcDir, f), 'utf8').split(/\r?\n/).filter(Boolean);

// 1. stroke files -----------------------------------------------------------
const strokeChars = new Set();
for (const file of fs.readdirSync(strokesSrc)) {
  if (!file.endsWith('.json')) continue;
  const ch = file.slice(0, -5);
  if ([...ch].length !== 1) continue;
  strokeChars.add(ch);
}
console.log('stroke files:', strokeChars.size);

// 2. dictionary -------------------------------------------------------------
const dict = new Map();
for (const line of readLines('dictionary.txt')) {
  const e = JSON.parse(line);
  dict.set(e.character, e);
}
console.log('dictionary entries:', dict.size);

// 3. simplified / traditional tables ---------------------------------------
const s2t = new Map(); // simplified -> [traditional...]
const t2s = new Map(); // traditional -> [simplified...]
for (const line of readLines('STCharacters.txt')) {
  if (line.startsWith('#')) continue;
  const [k, v] = line.split('\t');
  if (k && v) s2t.set(k, v.trim().split(/\s+/));
}
for (const line of readLines('TSCharacters.txt')) {
  if (line.startsWith('#')) continue;
  const [k, v] = line.split('\t');
  if (k && v) t2s.set(k, v.trim().split(/\s+/));
}
console.log('s2t:', s2t.size, 't2s:', t2s.size);

// 4. frequency ---------------------------------------------------------------
const freqRank = new Map();
for (const line of readLines('junda_utf8.txt')) {
  if (line.startsWith('/*')) continue;
  const cols = line.split('\t');
  const rank = Number(cols[0]);
  const ch = cols[1];
  if (!ch || !Number.isFinite(rank)) continue;
  if (!freqRank.has(ch)) freqRank.set(ch, rank);
}
console.log('frequency entries:', freqRank.size);

// 5. build index ---------------------------------------------------------------
// script flag: 0 = usable in both scripts, 1 = simplified-only, 2 = traditional-only,
//              3 = usable in neither according to OpenCC (rare variants; treated as both in the app)
const entries = [];
let copied = 0;
for (const ch of strokeChars) {
  const d = dict.get(ch) || {};
  const src = JSON.parse(fs.readFileSync(path.join(strokesSrc, ch + '.json'), 'utf8'));
  const strokeCount = src.strokes.length;
  const cp = ch.codePointAt(0).toString(16);
  fs.writeFileSync(path.join(outStrokes, cp + '.json'), JSON.stringify(src));
  copied++;

  const s2tList = s2t.get(ch) || [];
  const t2sList = t2s.get(ch) || [];
  const tradForms = s2tList.filter((t) => t !== ch);
  const simpForms = t2sList.filter((s) => s !== ch);
  // A character is usable in traditional text unless OpenCC says it must be converted to something else
  // (i.e. it is a key in STCharacters and none of its values is itself). Same idea for simplified.
  const validTrad = !(s2tList.length && !s2tList.includes(ch));
  const validSimp = !(t2sList.length && !t2sList.includes(ch));
  let flag = 0;
  if (validSimp && !validTrad) flag = 1;
  else if (validTrad && !validSimp) flag = 2;
  else if (!validSimp && !validTrad) flag = 3;

  // Infer traditional-derived frequency: if a traditional char has no rank, borrow its simplified form's rank.
  let rank = freqRank.get(ch) ?? null;
  if (rank == null && simpForms.length) {
    const ranks = simpForms.map((s) => freqRank.get(s)).filter((r) => r != null);
    if (ranks.length) rank = Math.min(...ranks);
  }

  entries.push({
    c: ch,
    p: (d.pinyin || []).slice(0, 4),
    d: d.definition || '',
    r: d.radical || '',
    k: d.decomposition || '',
    n: strokeCount,
    f: rank,
    s: flag,
    t: tradForms.length ? tradForms.join('') : undefined,
    m: simpForms.length ? simpForms.join('') : undefined,
  });
}
entries.sort((a, b) => (a.f ?? 99999) - (b.f ?? 99999) || a.c.localeCompare(b.c));
fs.writeFileSync(path.join(outData, 'index.json'), JSON.stringify(entries));

const stats = {
  total: entries.length,
  withPinyin: entries.filter((e) => e.p.length).length,
  withDefinition: entries.filter((e) => e.d).length,
  ranked: entries.filter((e) => e.f != null).length,
  shared: entries.filter((e) => e.s === 0).length,
  simplifiedOnly: entries.filter((e) => e.s === 1).length,
  traditionalOnly: entries.filter((e) => e.s === 2).length,
  neither: entries.filter((e) => e.s === 3).length,
  copied,
  indexBytes: fs.statSync(path.join(outData, 'index.json')).size,
};
console.log(stats);
