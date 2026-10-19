import { Pt, polygonArea, polylineLength, toFeet, toSqFeet } from "./measure";

export type Kind = "length" | "area" | "count";
export type Layer = { id: string; name: string; color: string; visible: boolean };
export type Measurement = { id: string; layerId: string; kind: Kind; page: number; label: string; pts: Pt[] };
export type Takeoff = { layers: Layer[]; measurements: Measurement[]; feetPerUnit: Record<number, number> };

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
