import type { Pt } from "./measure";
import type { Kind, Measurement, Takeoff } from "./takeoff";
import { UNITS, quantity, scaleFor, shapeOf } from "./takeoff";
import { areaOf, outline } from "./shapes";

export type SpaceRow = { space: string; page: number; label: string; kind: Kind; items: number; qty: number | null; unit: string };

const inPoly = (p: Pt, pts: Pt[]) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if ((pts[i].y > p.y) !== (pts[j].y > p.y) && p.x < ((pts[j].x - pts[i].x) * (p.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) c = !c;
  }
  return c;
};
/** One point that stands for an item when deciding which room it is in. */
export function anchorOf(m: Measurement): Pt {
  if (m.kind === "count" || m.pts.length === 1) return m.pts[0];
  const o = outline(shapeOf(m), m.pts).pts, pts = o.length ? o : m.pts;
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}

/** Items grouped by the space (room/zone area) that contains them. The smallest containing space wins. */
export function spaceReport(t: Takeoff): SpaceRow[] {
  const spaces = t.measurements.filter((m) => m.isSpace && m.pts.length >= 2).map((m) => {
    const o = outline(shapeOf(m), m.pts); return { m, poly: o.pts, area: Math.abs(areaOf(shapeOf(m), m.pts)) };
  }).filter((s) => s.poly.length >= 3);
  const map = new Map<string, SpaceRow>();
  for (const m of t.measurements) {
    if (m.isSpace || m.kind === "markup") continue;
    const p = anchorOf(m);
    const home = spaces.filter((s) => s.m.page === m.page && inPoly(p, s.poly)).sort((a, b) => a.area - b.area)[0];
    if (!home) continue;
    const kind: Kind = m.kind === "cutout" ? "area" : m.kind, space = home.m.label || "Space";
    const key = `${space}\u0000${m.page}\u0000${kind}\u0000${m.label}`, q = quantity(m, scaleFor(t, m));
    const cur = map.get(key) ?? { space, page: m.page, label: m.label, kind, items: 0, qty: 0 as number | null, unit: UNITS[kind] };
    cur.items += 1; cur.qty = cur.qty == null || q == null ? null : cur.qty + q; map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.space.localeCompare(b.space) || a.label.localeCompare(b.label));
}

export function spacesCsv(t: Takeoff): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`, lines = ["space,page,type,label,items,quantity,unit"];
  for (const r of spaceReport(t)) lines.push([esc(r.space), r.page, r.kind, esc(r.label), r.items, r.qty == null ? "UNCALIBRATED" : r.qty.toFixed(2), r.unit].join(","));
  return lines.join("\n");
}
