import type { Pt } from "./measure";
import { dist, fmtFeetInches, polylineLength, toFeet, toSqFeet } from "./measure";
import type { SymbolDef } from "./toolchest";
import type { Shape } from "./shapes";
import { angleDeg, areaOf, circleFrom3, circleOf, outline, perimeterOf } from "./shapes";
import { centroid } from "./geom";

/** What a markup measures. "markup" is a plain annotation with no quantity. */
export type Kind = "length" | "area" | "count" | "perimeter" | "volume" | "cutout" | "angle" | "radius" | "diameter" | "markup";
export const KINDS: Kind[] = ["length", "area", "count", "perimeter", "volume", "cutout", "angle", "radius", "diameter", "markup"];
export const UNITS: Record<Kind, string> = { length: "LF", perimeter: "LF", radius: "LF", diameter: "LF", area: "SF", cutout: "SF", volume: "CF", count: "EA", angle: "deg", markup: "" };
/** Default geometry for a kind when a markup has no explicit shape. */
export const DEFAULT_SHAPE: Record<Kind, Shape> = { length: "polyline", area: "polygon", count: "point", perimeter: "polygon", volume: "polygon", cutout: "polygon", angle: "angle", radius: "circle", diameter: "diameter", markup: "polyline" };
export const shapeOf = (m: { kind: Kind; shape?: Shape }): Shape => m.shape ?? DEFAULT_SHAPE[m.kind];
export type Layer = { id: string; name: string; color: string; visible: boolean };
export type Measurement = {
  id: string; layerId: string; kind: Kind; page: number; label: string; pts: Pt[];
  color?: string; lineWidth?: number; symbol?: SymbolDef; locked?: boolean;
  shape?: Shape; text?: string; depth?: number; hideLabel?: boolean;
  /** Embedded picture (data URL) for image markups. */
  image?: string;
  /** Markups with the same groupId select, move and lock together. */
  groupId?: string;
  /** For viewport markups: the scale (feet per page unit) that applies inside the box. */
  vpScale?: number;
};
export type Takeoff = { layers: Layer[]; measurements: Measurement[]; feetPerUnit: Record<number, number>; scaleNote?: Record<number, string>; bookmarks?: { id: string; name: string; page: number }[] };

/**
 * Quantity in the kind's unit (LF, SF, CF, EA, degrees). Null if the page is not calibrated.
 * Counts, angles and plain markups never need a scale. Cutouts are negative so they subtract from their area's total.
 */
export function quantity(m: Measurement, feetPerUnit: number | undefined): number | null {
  if (m.kind === "count") return m.pts.length;
  if (m.kind === "angle") return m.pts.length >= 3 ? angleDeg(m.pts[0], m.pts[1], m.pts[2]) : null;
  if (m.kind === "markup") return null;
  if (!feetPerUnit) return null;
  const sh = shapeOf(m);
  switch (m.kind) {
    case "length": { const o = outline(sh, m.pts); return toFeet(polylineLength(o.pts), feetPerUnit); }
    case "perimeter": return toFeet(perimeterOf(sh, m.pts), feetPerUnit);
    case "area": return toSqFeet(areaOf(sh, m.pts), feetPerUnit);
    case "cutout": return -toSqFeet(areaOf(sh, m.pts), feetPerUnit);
    case "volume": return m.depth == null ? null : toSqFeet(areaOf(sh, m.pts), feetPerUnit) * m.depth;
    case "diameter": return m.pts.length >= 2 ? toFeet(dist(m.pts[0], m.pts[1]), feetPerUnit) : null;
    case "radius": {
      if (sh === "arc" && m.pts.length >= 3) { const k = circleFrom3(m.pts[0], m.pts[1], m.pts[2]); return k ? toFeet(k.r, feetPerUnit) : null; }
      const k = circleOf("circle", m.pts); return k ? toFeet(k.r, feetPerUnit) : null;
    }
  }
  return null;
}

/** Text shown on the drawing for a measurement, or null when it shows nothing (counts, plain markups). */
export function measureLabel(m: Measurement, feetPerUnit: number | undefined): string | null {
  if (m.kind === "count" || m.kind === "markup") return null;
  const q = quantity(m, feetPerUnit);
  if (m.kind === "angle") return q == null ? null : `${q.toFixed(1)}°`;
  if (q == null) return m.kind === "volume" && !m.depth ? "needs depth" : "set scale";
  const pre = m.kind === "perimeter" ? "P: " : m.kind === "diameter" ? "Ø " : m.kind === "radius" ? "R " : "";
  if (UNITS[m.kind] === "LF") return pre + fmtFeetInches(q);
  return `${m.kind === "cutout" ? "−" : ""}${Math.abs(q).toFixed(1)} ${UNITS[m.kind]}`;
}

/**
 * The scale that applies to a markup: the smallest viewport box on its page that contains the markup's center
 * (a detail drawn at another scale), otherwise the page's scale.
 */
export function scaleFor(t: Takeoff, m: Measurement): number | undefined {
  const o = outline(shapeOf(m), m.pts);
  if (!o.pts.length) return t.feetPerUnit[m.page];
  const c = centroid(o.pts);
  let best: Measurement | null = null, bestA = Infinity;
  for (const v of t.measurements) {
    if (v.shape !== "viewport" || v.page !== m.page || v.vpScale == null || v.pts.length < 2 || v.id === m.id) continue;
    const [a, b] = v.pts, x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
    const area = (x1 - x0) * (y1 - y0);
    if (area < bestA) { best = v; bestA = area; }
  }
  return best?.vpScale ?? t.feetPerUnit[m.page];
}

export function totalsByLayer(t: Takeoff) {
  const rows: { layer: string; kind: Kind; label: string; qty: number | null; unit: string }[] = [];
  for (const m of t.measurements) {
    if (m.kind === "markup") continue;
    const layer = t.layers.find((l) => l.id === m.layerId);
    rows.push({ layer: layer?.name ?? "?", kind: m.kind, label: m.label, qty: quantity(m, scaleFor(t, m)),
      unit: UNITS[m.kind] });
  }
  return rows;
}

/** Every measurement, in drawing order (page, then top to bottom, left to right), with its position on the sheet in inches. */
export function toCsv(t: Takeoff): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = ["page,x_in,y_in,layer,type,label,quantity,unit"];
  const ms = t.measurements.filter((m) => m.kind !== "markup" && m.pts.length).map((m) => ({ m, at: { x: Math.min(...m.pts.map((p) => p.x)), y: Math.min(...m.pts.map((p) => p.y)) } }));
  ms.sort((a, b) => a.m.page - b.m.page || Math.round(a.at.y / 36) - Math.round(b.at.y / 36) || a.at.x - b.at.x);
  for (const { m, at } of ms) {
    const q = quantity(m, scaleFor(t, m));
    lines.push([m.page, (at.x / 72).toFixed(2), (at.y / 72).toFixed(2), esc(t.layers.find((l) => l.id === m.layerId)?.name ?? "?"), m.kind, esc(m.label),
      q == null ? (m.kind === "volume" && m.depth == null ? "NEEDS DEPTH" : "UNCALIBRATED") : q.toFixed(2), UNITS[m.kind]].join(","));
  }
  return lines.join("\n");
}

/** Deleting a layer deletes its measurements (nothing else is touched). */
export function deleteLayer(t: Takeoff, layerId: string): Takeoff {
  return { ...t, layers: t.layers.filter((l) => l.id !== layerId), measurements: t.measurements.filter((m) => m.layerId !== layerId) };
}

export type Summary = { layer: string; kind: Kind; label: string; items: number; qty: number | null; unit: string };

/** Subtotals by layer + label + kind. qty is null if any contributing item sits on an uncalibrated page. */
export function summarize(t: Takeoff): Summary[] {
  const map = new Map<string, Summary>();
  for (const m of t.measurements) {
    if (m.kind === "markup") continue;
    const layer = t.layers.find((l) => l.id === m.layerId)?.name ?? "?";
    const kind: Kind = m.kind === "cutout" ? "area" : m.kind; // cutouts subtract inside their area's row
    const key = `${layer}\u0000${kind}\u0000${m.label}`;
    const q = quantity(m, scaleFor(t, m));
    const cur = map.get(key) ?? { layer, kind, label: m.label, items: 0, qty: 0, unit: UNITS[kind] };
    cur.items += 1;
    cur.qty = cur.qty == null || q == null ? null : cur.qty + q;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.layer.localeCompare(b.layer) || a.label.localeCompare(b.label));
}

/** Find a layer by name (case-insensitive) or add it. */
export function ensureLayer(t: Takeoff, name: string, color: string): { takeoff: Takeoff; layerId: string } {
  const hit = t.layers.find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (hit) return { takeoff: t, layerId: hit.id };
  const id = `l_${Math.random().toString(36).slice(2, 8)}`;
  return { takeoff: { ...t, layers: [...t.layers, { id, name, color, visible: true }] }, layerId: id };
}

/** Apply one calibration to a set of pages (e.g. all pages of a same-scale set). */
export function setScale(t: Takeoff, pages: number[], feetPerUnit: number, note?: string): Takeoff {
  const next = { ...t.feetPerUnit }, notes = { ...(t.scaleNote ?? {}) };
  for (const p of pages) { next[p] = feetPerUnit; if (note) notes[p] = note; else delete notes[p]; }
  return { ...t, feetPerUnit: next, scaleNote: notes };
}

export function summaryCsv(t: Takeoff): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = ["layer,type,label,items,quantity,unit"];
  for (const r of summarize(t)) lines.push([esc(r.layer), r.kind, esc(r.label), r.items, r.qty == null ? "UNCALIBRATED" : r.qty.toFixed(2), r.unit].join(","));
  return lines.join("\n");
}
