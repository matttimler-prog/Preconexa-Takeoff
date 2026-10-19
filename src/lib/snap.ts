import type { Pt } from "./measure";
import { dist } from "./measure";

/** Constrain p relative to anchor to the nearest multiple of 45 degrees. */
export function constrainAngle(anchor: Pt, p: Pt): Pt {
  const dx = p.x - anchor.x, dy = p.y - anchor.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return p;
  const step = Math.PI / 4;
  const a = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: anchor.x + Math.cos(a) * len, y: anchor.y + Math.sin(a) * len };
}

/** Snap to the nearest candidate within radius (page units). */
export function snapToPoints(p: Pt, candidates: Pt[], radius: number): Pt {
  let best: Pt | null = null, bd = radius;
  for (const c of candidates) { const d = dist(p, c); if (d <= bd) { best = c; bd = d; } }
  return best ?? p;
}
