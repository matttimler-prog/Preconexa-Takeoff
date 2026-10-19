import type { Pt } from "./measure";

export type Seg = [number, number, number, number];
export type SnapKind = "end" | "center" | "mid" | "edge";
export type SnapOpts = { end: boolean; center: boolean; mid: boolean; edge: boolean };
export type SnapHit = { pt: Pt; kind: SnapKind; score: number };
export const DEFAULT_SNAP: SnapOpts = { end: true, center: true, mid: true, edge: true };

// small bias so endpoints/centers win over midpoints, and midpoints over plain edges, when cursor distances are similar
const BIAS: Record<SnapKind, number> = { end: 0, center: 0, mid: 0.15, edge: 0.35 };

/** Spatial index over line segments and centre points, in page units. */
export class SnapIndex {
  private grid = new Map<number, number[]>();
  private cgrid = new Map<number, number[]>();
  segs: Seg[]; centers: Pt[]; private cell: number;
  constructor(segs: Seg[], centers: Pt[], cell = 40) {
    this.segs = segs; this.centers = centers; this.cell = cell;
    segs.forEach((s, i) => {
      const len = Math.hypot(s[2] - s[0], s[3] - s[1]);
      const n = Math.max(1, Math.ceil(len / (cell / 2)));
      const seen = new Set<number>();
      for (let k = 0; k <= n; k++) {
        const x = s[0] + ((s[2] - s[0]) * k) / n, y = s[1] + ((s[3] - s[1]) * k) / n;
        const key = this.key(x, y);
        if (!seen.has(key)) { seen.add(key); this.push(this.grid, key, i); }
      }
    });
    centers.forEach((c, i) => this.push(this.cgrid, this.key(c.x, c.y), i));
  }
  get size() { return this.segs.length; }
  private key(x: number, y: number) { return (Math.floor(x / this.cell) + 5000) * 20000 + (Math.floor(y / this.cell) + 5000); }
  private push(m: Map<number, number[]>, k: number, v: number) { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); }

  /** Best snap within radius r (page units), or null. Score is distance plus a small kind bias, lower wins. */
  query(p: Pt, r: number, opts: SnapOpts): SnapHit | null {
    let best: SnapHit | null = null;
    const offer = (pt: Pt, kind: SnapKind) => {
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d > r) return;
      const score = d + BIAS[kind] * r;
      if (!best || score < best.score) best = { pt, kind, score };
    };
    const span = Math.ceil(r / this.cell) + 1;
    const cx = Math.floor(p.x / this.cell), cy = Math.floor(p.y / this.cell);
    const seenSeg = new Set<number>();
    for (let gx = cx - span; gx <= cx + span; gx++) for (let gy = cy - span; gy <= cy + span; gy++) {
      const k = (gx + 5000) * 20000 + (gy + 5000);
      if (opts.center) for (const i of this.cgrid.get(k) ?? []) offer(this.centers[i], "center");
      for (const i of this.grid.get(k) ?? []) {
        if (seenSeg.has(i)) continue; seenSeg.add(i);
        const [x1, y1, x2, y2] = this.segs[i];
        if (opts.end) { offer({ x: x1, y: y1 }, "end"); offer({ x: x2, y: y2 }, "end"); }
        if (opts.mid) offer({ x: (x1 + x2) / 2, y: (y1 + y2) / 2 }, "mid");
        if (opts.edge) {
          const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
          const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / l2));
          offer({ x: x1 + dx * t, y: y1 + dy * t }, "edge");
        }
      }
    }
    return best;
  }
}
