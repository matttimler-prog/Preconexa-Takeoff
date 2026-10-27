/** Dynamic Fill: flood-fill a rendered plan from a click and return the room outline. Pure typed-array code, no DOM. */
export type Raster = { w: number; h: number; data: Uint8ClampedArray }; // RGBA like canvas ImageData
type P = { x: number; y: number };

/** 1 = wall (dark ink, or strongly coloured ink that is not near-white); 0 = paper. Transparent pixels count as paper. */
export function wallMask(img: Raster, threshold = 170): Uint8Array {
  const n = img.w * img.h, out = new Uint8Array(n), d = img.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (d[j + 3] < 128) continue;
    const r = d[j], g = d[j + 1], b = d[j + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    if (lum < threshold || (mx - mn > 90 && lum < 215)) out[i] = 1;
  }
  return out;
}

/** Square dilation by r pixels using two separable running-count passes. */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h), cum = new Int32Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) cum[x + 1] = cum[x] + mask[row + x];
    for (let x = 0; x < w; x++) tmp[row + x] = cum[Math.min(w, x + r + 1)] - cum[Math.max(0, x - r)] > 0 ? 1 : 0;
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) cum[y + 1] = cum[y] + tmp[y * w + x];
    for (let y = 0; y < h; y++) out[y * w + x] = cum[Math.min(h, y + r + 1)] - cum[Math.max(0, y - r)] > 0 ? 1 : 0;
  }
  return out;
}

/** 4-connected flood fill over unblocked pixels. Null if the start is blocked or outside the image. */
export function floodFill(blocked: Uint8Array, w: number, h: number, sx: number, sy: number): { mask: Uint8Array; touchesBorder: boolean; count: number } | null {
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || blocked[sy * w + sx]) return null;
  const mask = new Uint8Array(w * h), q = new Int32Array(w * h);
  let head = 0, tail = 0, touches = false;
  q[tail++] = sy * w + sx; mask[sy * w + sx] = 1;
  while (head < tail) {
    const i = q[head++], x = i % w, y = (i - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
    if (x > 0 && !mask[i - 1] && !blocked[i - 1]) { mask[i - 1] = 1; q[tail++] = i - 1; }
    if (x < w - 1 && !mask[i + 1] && !blocked[i + 1]) { mask[i + 1] = 1; q[tail++] = i + 1; }
    if (y > 0 && !mask[i - w] && !blocked[i - w]) { mask[i - w] = 1; q[tail++] = i - w; }
    if (y < h - 1 && !mask[i + w] && !blocked[i + w]) { mask[i + w] = 1; q[tail++] = i + w; }
  }
  return { mask, touchesBorder: touches, count: tail };
}

const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]; // right, down, left, up

/** Outer boundary of the filled region as a pixel-corner polygon (vertices only where the outline turns). Holes are ignored. */
export function traceContour(mask: Uint8Array, w: number, h: number): P[] {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] ? 1 : 0);
  let sx = -1, sy = -1;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { sx = i % w; sy = (i - sx) / w; break; }
  if (sx < 0) return [];
  const pts: P[] = [];
  let x = sx, y = sy, d = 3; // arrive at the start corner heading up
  const limit = 4 * (w + 1) * (h + 1) + 8;
  for (let step = 0; step < limit; step++) {
    let fl: number, fr: number;
    if (d === 0) { fl = at(x, y - 1); fr = at(x, y); }
    else if (d === 1) { fl = at(x, y); fr = at(x - 1, y); }
    else if (d === 2) { fl = at(x - 1, y); fr = at(x - 1, y - 1); }
    else { fl = at(x - 1, y - 1); fr = at(x, y - 1); }
    const nd = fl ? (d + 3) % 4 : fr ? d : (d + 1) % 4;
    if (nd !== d) pts.push({ x, y });
    d = nd; x += DX[d]; y += DY[d];
    if (x === sx && y === sy && d === 3) break;
  }
  return pts;
}

/** Ramer-Douglas-Peucker for a closed ring (collinear points and wiggles under eps are dropped). */
export function simplify(pts: P[], eps: number): P[] {
  const n = pts.length;
  if (n < 4) return pts.slice();
  let far = 0, fd = -1;
  for (let i = 1; i < n; i++) { const dd = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y); if (dd > fd) { fd = dd; far = i; } }
  const keep = new Uint8Array(n); keep[0] = 1; keep[far] = 1;
  const seg = (a: number, b: number) => { // points strictly between ring indices a..b (b may wrap to n)
    const stack: number[][] = [[a, b]];
    while (stack.length) {
      const [i0, i1] = stack.pop() as number[];
      const p = pts[i0 % n], q = pts[i1 % n], dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
      let best = -1, bd = -1;
      for (let i = i0 + 1; i < i1; i++) {
        const r = pts[i % n];
        const dd = len === 0 ? Math.hypot(r.x - p.x, r.y - p.y) : Math.abs(dy * (r.x - p.x) - dx * (r.y - p.y)) / len;
        if (dd > bd) { bd = dd; best = i; }
      }
      if (best >= 0 && bd > eps) { keep[best % n] = 1; stack.push([i0, best], [best, i1]); }
    }
  };
  seg(0, far); seg(far, n);
  const out: P[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/** Room outline (pixel coordinates) for a click at (sx, sy). Null if the click is out of range or nothing fillable is near it. */
export function regionPolygon(img: Raster, sx: number, sy: number, opts: { gap?: number; threshold?: number; simplifyEps?: number; holes?: { minArea: number; minSide: number } } = {}): { pts: P[]; touchesBorder: boolean; areaPx: number; holes: P[][] } | null {
  const { w, h } = img, gap = opts.gap ?? 3, eps = opts.simplifyEps ?? 1.2;
  sx = Math.round(sx); sy = Math.round(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const walls = wallMask(img, opts.threshold ?? 170), closed = dilate(walls, w, h, gap);
  let fx = -1, fy = -1;
  for (let r = 0; r <= gap + 2 && fx < 0; r++) {
    for (let dy = -r; dy <= r && fx < 0; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = sx + dx, y = sy + dy;
      if (x >= 0 && y >= 0 && x < w && y < h && !closed[y * w + x]) { fx = x; fy = y; break; }
    }
  }
  if (fx < 0) return null;
  const fill = floodFill(closed, w, h, fx, fy); if (!fill) return null;
  const grown = dilate(fill.mask, w, h, gap);
  let area = 0;
  for (let i = 0; i < grown.length; i++) { if (walls[i]) grown[i] = 0; else if (grown[i]) area++; }
  const ring = simplify(traceContour(grown, w, h), eps);
  if (ring.length < 3) return null;
  return { pts: ring, touchesBorder: fill.touchesBorder, areaPx: area, holes: opts.holes ? holeRings(grown, w, h, opts.holes.minArea, opts.holes.minSide, eps) : [] };
}

/**
 * Islands inside a filled region (columns, solid blocks): areas that are not filled but can't be reached from the
 * image border without crossing the fill. Each comes back as its own outline. Small specks (text loops) are dropped by
 * minArea (pixels) and minSide (the smaller side of the island's bounding box, pixels).
 */
export function holeRings(mask: Uint8Array, w: number, h: number, minArea: number, minSide: number, eps = 1.2): P[][] {
  const outside = new Uint8Array(w * h), q = new Int32Array(w * h);
  let head = 0, tail = 0;
  const seed = (i: number) => { if (!mask[i] && !outside[i]) { outside[i] = 1; q[tail++] = i; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (head < tail) {
    const i = q[head++], x = i % w, y = (i - x) / w;
    if (x > 0) seed(i - 1); if (x < w - 1) seed(i + 1); if (y > 0) seed(i - w); if (y < h - 1) seed(i + w);
  }
  const seen = new Uint8Array(w * h), rings: P[][] = [];
  for (let s0 = 0; s0 < w * h; s0++) {
    if (mask[s0] || outside[s0] || seen[s0]) continue;
    const comp = new Uint8Array(w * h), stack = [s0]; seen[s0] = 1;
    let n = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
    while (stack.length) {
      const i = stack.pop() as number, x = i % w, y = (i - x) / w;
      comp[i] = 1; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) if (j >= 0 && !mask[j] && !outside[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
    if (n < minArea || Math.min(x1 - x0 + 1, y1 - y0 + 1) < minSide) continue;
    const ring = simplify(traceContour(comp, w, h), eps);
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}
