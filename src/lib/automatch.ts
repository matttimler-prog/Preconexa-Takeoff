import type { Raster } from "./rasterfill";

/** Find copies of a sample symbol on a rendered sheet (pure pixel maths, no DOM). */
export type Box = { x: number; y: number; w: number; h: number };
export type Match = Box & { score: number; rot: number };
export type MatchOpts = { threshold?: number; rotations?: boolean; maxMatches?: number };

/** Ink image: 0 = white paper, 1 = black ink. */
export function inkOf(img: Raster): Float32Array {
  const n = img.w * img.h, out = new Float32Array(n), d = img.data;
  for (let i = 0; i < n; i++) {
    const j = i * 4, a = d[j + 3] / 255;
    const g = (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) * a + 255 * (1 - a);
    out[i] = 1 - g / 255;
  }
  return out;
}

export type Img = { a: Float32Array; w: number; h: number };

export function cropImg(src: Img, b: Box): Img {
  const x0 = Math.max(0, Math.round(b.x)), y0 = Math.max(0, Math.round(b.y));
  const w = Math.min(src.w - x0, Math.round(b.w)), h = Math.min(src.h - y0, Math.round(b.h));
  const a = new Float32Array(Math.max(0, w * h));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = src.a[(y0 + y) * src.w + x0 + x];
  return { a, w: Math.max(0, w), h: Math.max(0, h) };
}

/** Box-average downsample by an integer factor. */
export function downsample(src: Img, f: number): Img {
  if (f <= 1) return src;
  const w = Math.floor(src.w / f), h = Math.floor(src.h / f), a = new Float32Array(w * h), inv = 1 / (f * f);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let dy = 0; dy < f; dy++) { const row = (y * f + dy) * src.w + x * f; for (let dx = 0; dx < f; dx++) s += src.a[row + dx]; }
    a[y * w + x] = s * inv;
  }
  return { a, w, h };
}

/** Rotate 90 degrees clockwise. */
export function rot90(src: Img): Img {
  const w = src.h, h = src.w, a = new Float32Array(w * h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) a[x * w + (src.h - 1 - y)] = src.a[y * src.w + x];
  return { a, w, h };
}

function integrals(src: Img) {
  const W = src.w + 1, s = new Float64Array(W * (src.h + 1)), s2 = new Float64Array(W * (src.h + 1));
  for (let y = 0; y < src.h; y++) {
    let r = 0, r2 = 0;
    for (let x = 0; x < src.w; x++) {
      const v = src.a[y * src.w + x]; r += v; r2 += v * v;
      s[(y + 1) * W + x + 1] = s[y * W + x + 1] + r; s2[(y + 1) * W + x + 1] = s2[y * W + x + 1] + r2;
    }
  }
  return { s, s2, W };
}

/** Plain normalised cross-correlation of the template at every position (coarse search). */
export function nccMap(src: Img, t: Img): { map: Float32Array; w: number; h: number } {
  const w = src.w - t.w + 1, h = src.h - t.h + 1;
  if (w <= 0 || h <= 0) return { map: new Float32Array(0), w: 0, h: 0 };
  const n = t.w * t.h; let mean = 0; for (let i = 0; i < n; i++) mean += t.a[i]; mean /= n;
  const tz = new Float32Array(n); let tss = 0;
  for (let i = 0; i < n; i++) { tz[i] = t.a[i] - mean; tss += tz[i] * tz[i]; }
  const map = new Float32Array(w * h);
  if (tss < 1e-6) return { map, w, h };
  const I = integrals(src);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const A = y * I.W + x, B = y * I.W + x + t.w, C = (y + t.h) * I.W + x, D = (y + t.h) * I.W + x + t.w;
    const S = I.s[D] - I.s[B] - I.s[C] + I.s[A], S2 = I.s2[D] - I.s2[B] - I.s2[C] + I.s2[A];
    const vs = S2 - (S * S) / n; if (vs < 1e-6) continue;
    let num = 0;
    for (let ty = 0; ty < t.h; ty++) { const so = (y + ty) * src.w + x, to = ty * t.w; for (let tx = 0; tx < t.w; tx++) num += src.a[so + tx] * tz[to + tx]; }
    map[y * w + x] = num / Math.sqrt(vs * tss);
  }
  return { map, w, h };
}

/** Template pixels near the symbol's own ink; lines passing by elsewhere in the box are ignored. */
export function inkMask(t: Img, radius: number): { idx: Int32Array; tz: Float32Array; ss: number; sum: number } {
  const keep = new Uint8Array(t.w * t.h);
  let mx = 0; for (let i = 0; i < t.a.length; i++) if (t.a[i] > mx) mx = t.a[i];
  const cut = Math.max(0.05, 0.55 * mx);
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (t.a[y * t.w + x] > cut) {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < t.h && xx >= 0 && xx < t.w) keep[yy * t.w + xx] = 1;
    }
  }
  const list: number[] = []; for (let i = 0; i < keep.length; i++) if (keep[i]) list.push(i);
  const idx = Int32Array.from(list), tz = new Float32Array(idx.length); let mean = 0;
  for (let i = 0; i < idx.length; i++) mean += t.a[idx[i]]; mean /= Math.max(1, idx.length);
  let ss = 0, sum = 0; for (let i = 0; i < idx.length; i++) { tz[i] = t.a[idx[i]] - mean; ss += tz[i] * tz[i]; sum += t.a[idx[i]]; }
  return { idx, tz, ss, sum };
}

export function maskedScore(src: Img, t: Img, m: ReturnType<typeof inkMask>, x: number, y: number): number {
  if (x < 0 || y < 0 || x + t.w > src.w || y + t.h > src.h) return -1;
  const n = m.idx.length; let s = 0, s2 = 0, num = 0;
  for (let i = 0; i < n; i++) {
    const k = m.idx[i], v = src.a[(y + Math.floor(k / t.w)) * src.w + x + (k % t.w)];
    s += v; s2 += v * v; num += v * m.tz[i];
  }
  const vs = s2 - (s * s) / n; if (vs < 1e-6) return 0;
  // Penalise a window with much more (or less) ink than the sample: that is a different, busier thing.
  const r = m.sum > 0 ? s / m.sum : 1, pen = r > 1.6 ? 1.6 / r : r < 0.5 ? r / 0.5 : 1;
  return (num / Math.sqrt(vs * m.ss)) * pen;
}

function searchOne(src: Img, t: Img, thr: number, rot: number): Match[] {
  const f = Math.max(1, Math.min(8, Math.round(Math.min(t.w, t.h) / 8)));
  const cs = downsample(src, f), ct = downsample(t, f);
  if (ct.w < 3 || ct.h < 3) return [];
  const rad = Math.max(1, Math.round(Math.min(t.w, t.h) * 0.03));
  const mask = inkMask(t, rad), cmask = inkMask(ct, Math.max(1, Math.round(rad / f)));
  if (mask.idx.length < 12 || mask.ss < 1e-6 || cmask.idx.length < 6 || cmask.ss < 1e-9) return [];
  const w = cs.w - ct.w + 1, h = cs.h - ct.h + 1; if (w <= 0 || h <= 0) return [];
  const map = new Float32Array(w * h), coarseThr = Math.max(0.3, thr - 0.2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) map[y * w + x] = maskedScore(cs, ct, cmask, x, y);
  const cands: { x: number; y: number; c: number }[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = map[y * w + x]; if (v < coarseThr) continue;
    let top = true;
    for (let dy = -1; dy <= 1 && top; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx; if ((dx || dy) && yy >= 0 && yy < h && xx >= 0 && xx < w && map[yy * w + xx] > v) { top = false; break; }
    }
    if (top) cands.push({ x, y, c: v });
  }
  cands.sort((a, b) => b.c - a.c);
  const out: Match[] = [];
  for (const c of cands.slice(0, 6000)) {
    let best = -1, bx = 0, by = 0;
    for (let dy = -f; dy <= f; dy++) for (let dx = -f; dx <= f; dx++) {
      const sc = maskedScore(src, t, mask, c.x * f + dx, c.y * f + dy);
      if (sc > best) { best = sc; bx = c.x * f + dx; by = c.y * f + dy; }
    }
    if (best >= thr) out.push({ x: bx, y: by, w: t.w, h: t.h, score: best, rot });
  }
  return out;
}

/** Non-maximum suppression: keep the best match among overlapping ones. */
export function suppress(ms: Match[], minDist: number): Match[] {
  const sorted = [...ms].sort((a, b) => b.score - a.score), keep: Match[] = [];
  for (const m of sorted) {
    const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
    if (!keep.some((k) => Math.hypot(k.x + k.w / 2 - cx, k.y + k.h / 2 - cy) < minDist)) keep.push(m);
  }
  return keep;
}

/** 3x3 box blur, so thin strokes match even when they land on different pixel phases. */
export function blur3(src: Img): Img {
  const { w, h } = src, a = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w) { s += src.a[yy * w + xx]; n++; } }
    a[y * w + x] = s / n;
  }
  return { a, w, h };
}

/** The sample symbol as a reusable template (blurred ink), cut from a rendered sheet. */
export function templateFrom(img: Raster, box: Box): Img {
  return cropImg(blur3({ a: inkOf(img), w: img.w, h: img.h }), box);
}

/** Search a sheet for copies of a template (rotated copies too when opts.rotations). */
export function findMatchesTpl(img: Raster, tpl: Img, opts: MatchOpts = {}): Match[] {
  const thr = opts.threshold ?? 0.7, full: Img = blur3({ a: inkOf(img), w: img.w, h: img.h });
  let t = tpl;
  if (t.w < 6 || t.h < 6) return [];
  const all: Match[] = [], rots = opts.rotations ? [0, 90, 180, 270] : [0];
  for (const r of rots) {
    all.push(...searchOne(full, t, thr, r));
    t = rot90(t);
  }
  return suppress(all, 0.6 * Math.min(tpl.w, tpl.h)).slice(0, opts.maxMatches ?? 5000);
}

export function findMatches(img: Raster, tpl: Box, opts: MatchOpts = {}): Match[] {
  return findMatchesTpl(img, templateFrom(img, tpl), opts);
}
