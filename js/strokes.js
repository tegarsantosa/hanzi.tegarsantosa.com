// The 28 standard strokes (汉字基本笔画) and a heuristic classifier that names
// a stroke from its median (centre-line) points. The classifier is approximate:
// it looks at the direction runs of the stroke, then matches them to a pattern.

export const STROKES = [
  { zh: '横', py: 'héng', g: '㇐', ex: '一', exi: 0, en: 'horizontal' },
  { zh: '竖', py: 'shù', g: '㇑', ex: '十', exi: 1, en: 'vertical' },
  { zh: '撇', py: 'piě', g: '㇒', ex: '人', exi: 0, en: 'left-falling' },
  { zh: '点', py: 'diǎn', g: '㇔', ex: '六', exi: 0, en: 'dot' },
  { zh: '捺', py: 'nà', g: '㇏', ex: '八', exi: 1, en: 'right-falling' },
  { zh: '提', py: 'tí', g: '㇀', ex: '打', exi: 2, en: 'rising' },
  { zh: '横钩', py: 'héng gōu', g: '㇖', ex: '皮', exi: 0, en: 'horizontal hook' },
  { zh: '竖钩', py: 'shù gōu', g: '㇚', ex: '小', exi: 0, en: 'vertical hook' },
  { zh: '竖提', py: 'shù tí', g: '㇙', ex: '民', exi: 2, en: 'vertical rising' },
  { zh: '横折', py: 'héng zhé', g: '㇕', ex: '口', exi: 1, en: 'horizontal turn' },
  { zh: '横撇', py: 'héng piě', g: '㇇', ex: '又', exi: 0, en: 'horizontal left-falling' },
  { zh: '撇折', py: 'piě zhé', g: '㇜', ex: '去', exi: 3, en: 'left-falling turn' },
  { zh: '撇点', py: 'piě diǎn', g: '㇛', ex: '女', exi: 0, en: 'left-falling dot' },
  { zh: '竖折', py: 'shù zhé', g: '㇗', ex: '山', exi: 1, en: 'vertical turn' },
  { zh: '竖弯', py: 'shù wān', g: '㇄', ex: '四', exi: 3, en: 'vertical bend' },
  { zh: '弯钩', py: 'wān gōu', g: '㇁', ex: '家', exi: 5, en: 'curved hook' },
  { zh: '斜钩', py: 'xié gōu', g: '㇂', ex: '我', exi: 4, en: 'slanted hook' },
  { zh: '卧钩', py: 'wò gōu', g: '㇃', ex: '心', exi: 1, en: 'lying hook' },
  { zh: '竖弯钩', py: 'shù wān gōu', g: '㇟', ex: '儿', exi: 1, en: 'vertical bend hook' },
  { zh: '横折钩', py: 'héng zhé gōu', g: '㇆', ex: '月', exi: 1, en: 'horizontal turn hook' },
  { zh: '横折提', py: 'héng zhé tí', g: '㇊', ex: '计', exi: 1, en: 'horizontal turn rising' },
  { zh: '横折弯', py: 'héng zhé wān', g: '㇍', ex: '朵', exi: 1, en: 'horizontal turn bend' },
  { zh: '横斜钩', py: 'héng xié gōu', g: '⺄', ex: '气', exi: 3, en: 'horizontal slanted hook' },
  { zh: '横折弯钩', py: 'héng zhé wān gōu', g: '㇈', ex: '九', exi: 1, en: 'horizontal turn bend hook' },
  { zh: '横折折撇', py: 'héng zhé zhé piě', g: '㇋', ex: '及', exi: 1, en: 'horizontal double-turn left-falling' },
  { zh: '横撇弯钩', py: 'héng piě wān gōu', g: '㇌', ex: '那', exi: 4, en: 'horizontal left-falling bend hook' },
  { zh: '横折折折钩', py: 'héng zhé zhé zhé gōu', g: '㇡', ex: '乃', exi: 0, en: 'horizontal triple-turn hook' },
  { zh: '竖折折钩', py: 'shù zhé zhé gōu', g: '㇉', ex: '弓', exi: 2, en: 'vertical double-turn hook' },
];
const BY_ZH = new Map(STROKES.map((s) => [s.zh, s]));

/** Inline SVG of a single stroke path (Make Me a Hanzi coordinates: 1024 wide, y up from -124 to 900). */
export function strokeSVG(pathD, size = 32, color = '#1d4ed8') {
  return `<svg class="stroke-glyph" width="${size}" height="${size}" viewBox="0 -124 1024 1024" aria-hidden="true">`
    + `<g transform="scale(1,-1) translate(0,-776)"><path d="${pathD}" fill="${color}"/></g></svg>`;
}
/** Zoom an inserted stroke SVG onto the stroke itself (square viewBox around its bounding box). */
export function fitStrokeSVGs(root) {
  root.querySelectorAll('svg.stroke-glyph:not([data-fit])').forEach((svg) => {
    const path = svg.querySelector('path');
    if (!path) return;
    let b;
    try { b = path.getBBox(); } catch { return; }
    if (!b || !b.width || !b.height) return;
    const side = Math.max(b.width, b.height) * 1.25;
    const cx = b.x + b.width / 2;
    const cy = 776 - (b.y + b.height / 2); // the <g> flips y: y' = 776 - y
    svg.setAttribute('viewBox', `${cx - side / 2} ${cy - side / 2} ${side} ${side}`);
    svg.dataset.fit = '1';
  });
}

const TRAD = { 横: '橫', 竖: '豎', 点: '點', 钩: '鈎', 弯: '彎', 卧: '臥' };
/** Traditional spelling of a stroke name, e.g. 横折钩 -> 橫折鈎 */
export function strokeNameFor(stroke, script) {
  if (!stroke) return '';
  return script === 'trad' ? [...stroke.zh].map((c) => TRAD[c] || c).join('') : stroke.zh;
}

// ---------------------------------------------------------------------------
// classifier
// ---------------------------------------------------------------------------
const deg = (rad) => (rad * 180) / Math.PI;
function angDiff(a, b) {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}
// angles: 0 = right, 90 = down (visual), -90 = up, ±180 = left
function prim(ang) {
  if (ang >= -22 && ang <= 22) return 'H';
  if (ang > -80 && ang < -22) return 'T';
  if (ang > 22 && ang < 74) return 'N';
  if (ang >= 74 && ang <= 106) return 'V';
  if (ang > 106 && ang <= 180) return 'P';
  return 'U'; // upward / up-left: hooks
}
const sum = (segs) => segs.reduce((a, s) => a + s.len, 0);
function finalize(r) {
  r.len = sum(r.segs);
  r.dx = r.segs.reduce((a, s) => a + s.dx, 0);
  r.dy = r.segs.reduce((a, s) => a + s.dy, 0);
  r.ang = deg(Math.atan2(r.dy, r.dx));
  r.endAng = r.segs[r.segs.length - 1].ang;
  return r;
}
function mergeInto(target, r) {
  target.segs.push(...r.segs);
  finalize(target);
}

function buildRuns(median) {
  const segs = [];
  for (let i = 1; i < median.length; i++) {
    const dx = median[i][0] - median[i - 1][0];
    const dy = -(median[i][1] - median[i - 1][1]); // data y points up; flip to visual
    const len = Math.hypot(dx, dy);
    if (len < 2) continue;
    segs.push({ ang: deg(Math.atan2(dy, dx)), len, dx, dy });
  }
  if (!segs.length) return { runs: [], total: 0 };
  const total = sum(segs);

  // 1. merge consecutive segments with similar direction
  let runs = [];
  for (const s of segs) {
    const last = runs[runs.length - 1];
    if (last && Math.abs(angDiff(last.endAng, s.ang)) < 26) { last.segs.push(s); last.endAng = s.ang; }
    else runs.push({ segs: [s], endAng: s.ang, turnIn: last ? Math.abs(angDiff(last.endAng, s.ang)) : 0 });
  }

  // 2. a long run that gradually bends more than 60° is really two directions (e.g. the 弯 in 九)
  const split = [];
  for (const r of runs) {
    const len = sum(r.segs);
    if (r.segs.length >= 3 && len >= total * 0.3) {
      const bend = angDiff(r.segs[0].ang, r.segs[r.segs.length - 1].ang);
      if (Math.abs(bend) >= 60) {
        let cum = 0;
        let idx = 0;
        for (let i = 1; i < r.segs.length; i++) {
          cum += angDiff(r.segs[i - 1].ang, r.segs[i].ang);
          if (Math.abs(cum) >= Math.abs(bend) / 2) { idx = i; break; }
        }
        if (idx > 0 && idx < r.segs.length) {
          split.push({ segs: r.segs.slice(0, idx), turnIn: r.turnIn });
          split.push({ segs: r.segs.slice(idx), turnIn: 30, bent: true }); // gradual
          continue;
        }
      }
    }
    split.push(r);
  }
  runs = split.map(finalize);

  // 3. fold the brush entry (a short dab, usually down-right, sometimes in two pieces) into the run that follows it
  for (let pass = 0; pass < 3 && runs.length >= 2; pass++) {
    const f = runs[0];
    const dab = f.ang > 15 && f.ang < 80;
    if (!(f.len < total * 0.08 || f.len < 30 || (dab && f.len < Math.max(total * 0.14, 75)))) break;
    const nxt = runs[1];
    nxt.segs.unshift(...f.segs);
    nxt.turnIn = 0;
    finalize(nxt);
    runs.shift();
  }
  // 4. absorb tiny runs into the previous run: interior corner dabs (< 8% or < 70 units)
  //    and a final exit flick (< 7% or < 40 units). Real hooks are longer than that.
  const cleaned = [];
  runs.forEach((r, i) => {
    const prev = cleaned[cleaned.length - 1];
    const isLast = i === runs.length - 1;
    const tinyInterior = !isLast && (r.len < total * 0.08 || (total >= 200 && r.len < 70));
    const tinyFinal = isLast && (r.len < total * 0.07 || r.len < 40);
    if (prev && (tinyInterior || tinyFinal)) { mergeInto(prev, r); return; }
    cleaned.push(r);
  });
  return { runs: cleaned, total };
}

/** Debug helper: direction runs of a stroke. */
export function analyzeStroke(median) {
  const { runs, total } = buildRuns(median);
  return {
    total: Math.round(total),
    runs: runs.map((r) => ({ p: prim(r.ang), ang: Math.round(r.ang), len: Math.round(r.len), turnIn: Math.round(r.turnIn), bent: !!r.bent })),
  };
}

/**
 * Name a stroke from its median points. Returns one of STROKES (or a generic fallback).
 * @param {number[][]} median  array of [x, y] in Make Me a Hanzi coordinates
 * @param {string} [char]  character (only used to pin the 28 reference examples)
 * @param {number} [index] stroke index within that character
 */
const EXAMPLE_OVERRIDES = new Map(STROKES.map((s) => [s.ex + ':' + s.exi, s]));
export function classifyStroke(median, char = null, index = null) {
  if (char != null && index != null) {
    const o = EXAMPLE_OVERRIDES.get(char + ':' + index);
    if (o) return o;
  }
  if (!median || median.length < 2) return BY_ZH.get('点');
  const { runs, total } = buildRuns(median);
  if (!runs.length) return BY_ZH.get('点');
  if (total < 130) return BY_ZH.get('点');

  const seq = [];
  runs.forEach((r, i) => {
    const isLast = i === runs.length - 1;
    // a short final segment heading upward is a hook, whatever its exact angle
    if (isLast && i > 0 && r.len < total * 0.3 && r.ang < -55) { seq.push('U'); return; }
    let p = prim(r.ang);
    // a stroke that begins by going up is a 提 (the rising stroke of 氵, 扌 ...)
    if (i === 0 && p === 'U') p = 'T';
    // context: a stroke that starts a little past vertical and then continues is a 撇 (女, 人)
    if (i === 0 && p === 'V' && r.ang > 96 && runs.length > 1) p = 'P';
    // context: the downward part right after a 横 is the 折, even when it leans left (口, 弓, 乃)
    if (i > 0 && p === 'P' && r.ang <= 120 && seq[i - 1] === 'H') p = 'V';
    seq.push(p);
  });
  // collapse repeats (H H V -> H V)
  const col = [];
  const colRuns = [];
  seq.forEach((p, i) => {
    if (col.length && col[col.length - 1] === p) mergeInto(colRuns[colRuns.length - 1], runs[i]);
    else { col.push(p); colRuns.push({ ...runs[i], segs: [...runs[i].segs] }); }
  });
  const key = col.join('');
  const first = colRuns[0];
  // short strokes without a hook are dots, unless they are a plain short 横 / 竖 / 提
  if (total < 250 && !key.includes('U') && !['H', 'V', 'T'].includes(key)) return BY_ZH.get('点');
  const short = (i, f = 0.32) => colRuns[i] && colRuns[i].len < total * f;
  const sharp = (i) => colRuns[i] && colRuns[i].turnIn >= 58;
  const steep = () => first.ang > 50;

  if (col.length === 1) {
    switch (key) {
      case 'H': return BY_ZH.get('横');
      case 'V': return BY_ZH.get('竖');
      case 'P': return BY_ZH.get(total < 200 ? '点' : '撇');
      case 'N': return BY_ZH.get(total < 250 ? '点' : '捺');
      case 'T': return BY_ZH.get('提');
      default: return BY_ZH.get('点');
    }
  }
  const TABLE = {
    VU: () => (Math.abs(first.dx) > Math.abs(first.dy) * 0.18 ? '弯钩' : '竖钩'),
    VT: '竖提',
    VH: () => (sharp(1) ? '竖折' : '竖弯'),
    VN: '竖弯',
    VHU: '竖弯钩', VHT: '竖弯钩', VNU: '斜钩', VNT: '斜钩', VNHU: '竖弯钩', VNH: '竖弯', VNHT: '竖弯钩',
    VHV: '竖折', VHVU: '竖折折钩', VHVH: '竖折', VHVT: '竖折折钩', VHPU: '竖折折钩', VHP: '竖折',
    VP: '撇', VPU: '弯钩', VPH: '竖折', VPN: '撇点',
    HV: '横折', HVU: '横折钩', HVT: '横折提', HVH: '横折弯', HVN: '横折弯',
    HVHU: '横折弯钩', HVHT: '横折弯钩', HVNT: '横折弯钩',
    HVNU: '横撇弯钩', HVNPU: '横撇弯钩', HPNPU: '横撇弯钩', HVNVU: '横撇弯钩', HPNVU: '横撇弯钩', HVNP: '横撇弯钩', HPNP: '横撇弯钩',
    HPHPU: '横折折折钩', HVHPU: '横折折折钩', HPHVU: '横折折折钩',
    HVHV: '横折折撇', HVHVU: '横折折折钩', HVHVT: '横折折折钩', HVHVH: '横折折折钩',
    HVP: () => (short(2, 0.2) ? '横折' : '横折折撇'),
    HVHP: '横折折撇', HVHVP: '横折折撇', HVPU: '横撇弯钩', HVPN: '横折折撇',
    HP: () => (short(1, 0.4) ? '横钩' : '横撇'),
    HPV: '横撇弯钩', HPVU: '横撇弯钩', HPNU: '横撇弯钩', HPU: '横撇弯钩', HPN: '横撇弯钩', HPNV: '横撇弯钩', HPNVU: '横撇弯钩', HPVN: '横撇弯钩', HPVNU: '横撇弯钩',
    HN: () => (short(1) ? '横钩' : '横斜钩'),
    HNU: '横斜钩', HNHU: '横斜钩', HNT: '横斜钩', HNV: '横斜钩', HNVU: '横斜钩', HNH: '横斜钩',
    HU: '横钩', HT: () => (short(0) ? '提' : '横'), TH: '横', HTV: '横折', HTVU: '横折钩',
    NU: () => (steep() ? '斜钩' : '卧钩'),
    NT: () => (steep() ? '斜钩' : '卧钩'),
    NH: '捺',
    NHU: '卧钩', NHT: '卧钩', NVU: '弯钩', NV: '竖', NVT: '竖提', NHV: '横折', NP: () => (total < 300 ? '点' : '撇点'),
    NPHPU: '竖折折钩', NPHVU: '竖折折钩', NHPU: '竖折折钩', NHVU: '竖折折钩', NPU: '弯钩',
    PH: '撇折', PT: '撇折', PN: () => (total < 300 ? '点' : '撇点'), PU: '弯钩', PHV: '撇折', PHU: '撇折', PV: '撇', PVU: '弯钩', PHT: '撇折',
    TU: '提', TV: '竖', TN: '点', UH: '横', UV: '竖', UP: '撇', TP: '横撇', TPV: '横撇弯钩',
  };
  let hit = TABLE[key];
  if (!hit) {
    // try dropping a trailing run, then a leading one
    hit = TABLE[key.slice(0, -1)] || TABLE[key.slice(1)];
  }
  if (typeof hit === 'function') hit = hit();
  return BY_ZH.get(hit) || { zh: '折笔', py: 'zhé bǐ', g: '㇕', en: 'compound stroke', generic: true };
}
