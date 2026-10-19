import type { Pt } from "./measure";
import { dist } from "./measure";

export function nearestOnSegment(p: Pt, a: Pt, b: Pt): { pt: Pt; t: number; d: number } {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  const pt = { x: a.x + dx * t, y: a.y + dy * t };
  return { pt, t, d: dist(p, pt) };
}

/** Insert a vertex on the segment nearest p (closed = polygon, last segment wraps). */
export function insertPoint(pts: Pt[], p: Pt, closed: boolean): Pt[] {
  if (pts.length < 2) return pts;
  let best = -1, bd = Infinity, bp = pts[0];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const r = nearestOnSegment(p, pts[i], pts[(i + 1) % pts.length]);
    if (r.d < bd) { bd = r.d; best = i; bp = r.pt; }
  }
  if (best < 0) return pts;
  return [...pts.slice(0, best + 1), bp, ...pts.slice(best + 1)];
}

/** Remove vertex i, keeping at least `min` points; null if not allowed. */
export function removePoint(pts: Pt[], i: number, min: number): Pt[] | null {
  if (pts.length <= min || i < 0 || i >= pts.length) return null;
  return pts.filter((_, k) => k !== i);
}

export const translate = (pts: Pt[], dx: number, dy: number): Pt[] => pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));

export function centroid(pts: Pt[]): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const f = p.x * q.y - q.x * p.y; a += f; cx += (p.x + q.x) * f; cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-9) return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  return { x: cx / (3 * a), y: cy / (3 * a) };
}
