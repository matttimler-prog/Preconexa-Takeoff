import type { Pt } from "./measure";
import { dist, polygonArea, polylineLength } from "./measure";
import { centroid } from "./geom";

/** How a markup's points are interpreted. Quantity kinds live in takeoff.ts; this file is pure geometry. */
export type Shape =
  | "polyline" | "polygon" | "rect" | "ellipse" | "arc" | "line" | "arrow" | "cloud" | "text" | "callout"
  | "pen" | "highlight" | "dimension" | "point" | "note" | "angle" | "circle" | "diameter";

export const CLOSED: Shape[] = ["polygon", "rect", "ellipse", "cloud", "highlight", "circle", "diameter"];
export const isClosed = (s: Shape) => CLOSED.includes(s);

export function circleFrom3(a: Pt, b: Pt, c: Pt): { c: Pt; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
  const ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { c: { x: ux, y: uy }, r: Math.hypot(a.x - ux, a.y - uy) };
}
const TAU = Math.PI * 2;
const norm = (x: number) => ((x % TAU) + TAU) % TAU;

/** Signed sweep (radians) of the arc from a through b to c. */
export function arcSweep(a: Pt, b: Pt, c: Pt): { c: Pt; r: number; start: number; sweep: number } | null {
  const k = circleFrom3(a, b, c); if (!k) return null;
  const ang = (p: Pt) => Math.atan2(p.y - k.c.y, p.x - k.c.x);
  const ta = ang(a), dAB = norm(ang(b) - ta), dAC = norm(ang(c) - ta);
  const sweep = dAB < dAC ? dAC : dAC - TAU;
  return { ...k, start: ta, sweep };
}
export function arcPoints(a: Pt, b: Pt, c: Pt, n = 40): Pt[] {
  const s = arcSweep(a, b, c); if (!s) return [a, b, c];
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) { const t = s.start + (s.sweep * i) / n; out.push({ x: s.c.x + s.r * Math.cos(t), y: s.c.y + s.r * Math.sin(t) }); }
  return out;
}
export const rectPoints = (a: Pt, b: Pt): Pt[] => [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];
export function ellipsePoints(a: Pt, b: Pt, n = 64): Pt[] {
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: cx + rx * Math.cos((TAU * i) / n), y: cy + ry * Math.sin((TAU * i) / n) }));
}
export function circlePoints(c: Pt, r: number, n = 64): Pt[] {
  return Array.from({ length: n }, (_, i) => ({ x: c.x + r * Math.cos((TAU * i) / n), y: c.y + r * Math.sin((TAU * i) / n) }));
}
/** Center and radius for circle-type shapes (circle: center+edge, diameter: two ends). */
export function circleOf(shape: Shape, pts: Pt[]): { c: Pt; r: number } | null {
  if (pts.length < 2) return null;
  if (shape === "circle") return { c: pts[0], r: dist(pts[0], pts[1]) };
  if (shape === "diameter") return { c: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, r: dist(pts[0], pts[1]) / 2 };
  return null;
}

/** The drawn path of a shape as points, and whether it closes. Used for hit tests, snapping and quantities. */
export function outline(shape: Shape, pts: Pt[]): { pts: Pt[]; closed: boolean } {
  switch (shape) {
    case "rect": case "highlight": return pts.length >= 2 ? { pts: rectPoints(pts[0], pts[1]), closed: true } : { pts, closed: false };
    case "ellipse": return pts.length >= 2 ? { pts: ellipsePoints(pts[0], pts[1]), closed: true } : { pts, closed: false };
    case "arc": return pts.length >= 3 ? { pts: arcPoints(pts[0], pts[1], pts[2]), closed: false } : { pts, closed: false };
    case "circle": case "diameter": { const k = circleOf(shape, pts); return k ? { pts: circlePoints(k.c, k.r), closed: true } : { pts, closed: false }; }
    case "polygon": case "cloud": return { pts, closed: true };
    case "text": case "note": case "point": return { pts: pts.slice(0, 1), closed: false };
    default: return { pts, closed: false };
  }
}

const ramanujan = (a: number, b: number) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
/** Area in page units squared (0 for open shapes). */
export function areaOf(shape: Shape, pts: Pt[]): number {
  if (shape === "rect" && pts.length >= 2) return Math.abs((pts[1].x - pts[0].x) * (pts[1].y - pts[0].y));
  if (shape === "ellipse" && pts.length >= 2) return Math.PI * (Math.abs(pts[1].x - pts[0].x) / 2) * (Math.abs(pts[1].y - pts[0].y) / 2);
  const k = circleOf(shape, pts); if (k) return Math.PI * k.r * k.r;
  return isClosed(shape) ? polygonArea(pts) : 0;
}
/** Perimeter (or arc length) in page units. */
export function perimeterOf(shape: Shape, pts: Pt[]): number {
  if (shape === "ellipse" && pts.length >= 2) return ramanujan(Math.abs(pts[1].x - pts[0].x) / 2, Math.abs(pts[1].y - pts[0].y) / 2);
  const k = circleOf(shape, pts); if (k) return TAU * k.r;
  if (shape === "arc" && pts.length >= 3) { const s = arcSweep(pts[0], pts[1], pts[2]); return s ? s.r * Math.abs(s.sweep) : polylineLength(pts); }
  const o = outline(shape, pts);
  return polylineLength(o.closed && o.pts.length > 1 ? [...o.pts, o.pts[0]] : o.pts);
}
/** Interior angle at v between a and b, in degrees (0 to 180). */
export function angleDeg(a: Pt, v: Pt, b: Pt): number {
  const x1 = a.x - v.x, y1 = a.y - v.y, x2 = b.x - v.x, y2 = b.y - v.y;
  const m = Math.hypot(x1, y1) * Math.hypot(x2, y2); if (m === 0) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, (x1 * x2 + y1 * y2) / m))) * 180) / Math.PI;
}
/** Small arc drawn at the vertex of an angle. */
export function angleArc(a: Pt, v: Pt, b: Pt, r: number, n = 20): Pt[] {
  const t1 = Math.atan2(a.y - v.y, a.x - v.x), t2 = Math.atan2(b.y - v.y, b.x - v.x);
  let d = norm(t2 - t1); if (d > Math.PI) d -= TAU;
  return Array.from({ length: n + 1 }, (_, i) => ({ x: v.x + r * Math.cos(t1 + (d * i) / n), y: v.y + r * Math.sin(t1 + (d * i) / n) }));
}
export function arrowHead(a: Pt, b: Pt, size: number): Pt[] {
  const t = Math.atan2(b.y - a.y, b.x - a.x), w = Math.PI / 7;
  return [b, { x: b.x - size * Math.cos(t - w), y: b.y - size * Math.sin(t - w) }, { x: b.x - size * Math.cos(t + w), y: b.y - size * Math.sin(t + w) }];
}
/** Scalloped cloud outline through the polygon's corners; bumps point outward. Returns an SVG path. */
export function cloudPath(pts: Pt[], scallop = 14): string {
  if (pts.length < 3) return "";
  const cw = polygonSigned(pts) > 0 ? 1 : 0;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], len = dist(a, b);
    const n = Math.max(1, Math.round(len / scallop)), r = len / n / 2 * 1.05;
    for (let k = 1; k <= n; k++) d += `A${r.toFixed(3)},${r.toFixed(3)} 0 0 ${cw} ${(a.x + ((b.x - a.x) * k) / n).toFixed(3)},${(a.y + ((b.y - a.y) * k) / n).toFixed(3)}`;
  }
  return d + "Z";
}
const polygonSigned = (pts: Pt[]) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + (p.x * q.y - q.x * p.y); }, 0);

/** Where a measurement's text box goes: a point and a reading angle (degrees, never upside down). */
export function labelAnchor(shape: Shape, pts: Pt[]): { pt: Pt; angle: number; onLine: boolean } | null {
  if (!pts.length) return null;
  if (shape === "angle" && pts.length >= 3) return { pt: pts[1], angle: 0, onLine: false };
  const k = circleOf(shape, pts);
  if (k) return { pt: k.c, angle: 0, onLine: false };
  if (shape === "arc" && pts.length >= 3) return { pt: pts[1], angle: 0, onLine: false };
  if (isClosed(shape) && pts.length >= 2) {
    const o = outline(shape, pts);
    return { pt: shape === "rect" || shape === "ellipse" ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : centroid(o.pts), angle: 0, onLine: false };
  }
  if (pts.length < 2) return { pt: pts[0], angle: 0, onLine: false };
  let best = 0, bl = -1;
  for (let i = 0; i + 1 < pts.length; i++) { const l = dist(pts[i], pts[i + 1]); if (l > bl) { bl = l; best = i; } }
  const a = pts[best], b = pts[best + 1];
  let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
  return { pt: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, angle: ang, onLine: true };
}

/** Box (page units) around a text markup anchored at its top-left, from a rough width estimate. */
export function textBox(text: string, at: Pt, fs: number): { x: number; y: number; w: number; h: number } {
  const lines = (text || " ").split("\n");
  const w = Math.max(...lines.map((l) => l.length), 1) * fs * 0.58 + fs * 0.8;
  return { x: at.x, y: at.y, w, h: lines.length * fs * 1.25 + fs * 0.5 };
}
