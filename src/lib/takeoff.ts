import type { Pt } from "./measure";
import { polygonArea, polylineLength, toFeet, toSqFeet } from "./measure";
import type { SymbolDef } from "./toolchest";

export type Kind = "length" | "area" | "count";
export type Layer = { id: string; name: string; color: string; visible: boolean };
export type Measurement = {
  id: string; layerId: string; kind: Kind; page: number; label: string; pts: Pt[];
  color?: string; lineWidth?: number; symbol?: SymbolDef; locked?: boolean;
};
export type Takeoff = { layers: Layer[]; measurements: Measurement[]; feetPerUnit: Record<number, number>; scaleNote?: Record<number, string> };

/** Quantity in feet, sq ft, or each. Returns null if the page is not calibrated (count never needs it). */
export function quantity(m: Measurement, feetPerUnit: number | undefined): number | null {
  if (m.kind === "count") return m.pts.length;
  if (!feetPerUnit) return null;
  return m.kind === "length" ? toFeet(polylineLength(m.pts), feetPerUnit) : toSqFeet(polygonArea(m.pts), feetPerUnit);
}

export function totalsByLayer(t: Takeoff) {
  const rows: { layer: string; kind: Kind; label: string; qty: number | null; unit: string }[] = [];
  for (const m of t.measurements) {
    const layer = t.layers.find((l) => l.id === m.layerId);
    rows.push({ layer: layer?.name ?? "?", kind: m.kind, label: m.label, qty: quantity(m, t.feetPerUnit[m.page]),
      unit: m.kind === "length" ? "LF" : m.kind === "area" ? "SF" : "EA" });
  }
  return rows;
}

export function toCsv(t: Takeoff): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = ["layer,type,label,quantity,unit"];
  for (const r of totalsByLayer(t)) lines.push([esc(r.layer), r.kind, esc(r.label), r.qty == null ? "UNCALIBRATED" : r.qty.toFixed(2), r.unit].join(","));
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
    const layer = t.layers.find((l) => l.id === m.layerId)?.name ?? "?";
    const key = `${layer}\u0000${m.kind}\u0000${m.label}`;
    const q = quantity(m, t.feetPerUnit[m.page]);
    const cur = map.get(key) ?? { layer, kind: m.kind, label: m.label, items: 0, qty: 0, unit: m.kind === "length" ? "LF" : m.kind === "area" ? "SF" : "EA" };
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
