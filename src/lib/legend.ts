import type { Takeoff } from "./takeoff";

export type LegendRow = { label: string; total: number; color: string };
/** Counts by item name across all pages, for the live legend. */
export function legendRows(t: Takeoff): LegendRow[] {
  const map = new Map<string, LegendRow>();
  for (const m of t.measurements) {
    if (m.kind !== "count") continue;
    const k = m.label.trim().toLowerCase(), color = m.color ?? t.layers.find((l) => l.id === m.layerId)?.color ?? "#2563eb";
    const r = map.get(k) ?? { label: m.label, total: 0, color };
    r.total += m.pts.length; map.set(k, r);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}
/** Size of the legend box for a text size, in the same units. */
export function legendSize(rows: LegendRow[], fs: number): { w: number; h: number; rowH: number } {
  const rowH = fs * 1.6, longest = Math.max("Legend".length, ...rows.map((r) => r.label.length + 5));
  return { w: longest * fs * 0.58 + fs * 3, h: (rows.length + 1) * rowH + fs * 0.6, rowH };
}
