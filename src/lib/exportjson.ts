import type { Takeoff } from "./takeoff";
import { UNITS, costKey, extended, quantity, scaleFor, summarize } from "./takeoff";

/**
 * A plain JSON file with the takeoff's quantities, for loading into Preconexa estimates (or any other system).
 * Nothing is guessed: a quantity on an uncalibrated sheet is null, and the file says which pages are uncalibrated.
 */
export type PreconexaExport = {
  schema: "preconexa-takeoff/1";
  exportedAt: string;
  project: string;
  pages: { page: number; feetPerUnit: number | null; scaleNote: string | null }[];
  warnings: string[];
  summary: { layer: string; kind: string; label: string; items: number; quantity: number | null; unit: string; unitCost: number | null; extendedCost: number | null }[];
  items: { id: string; page: number; layer: string; kind: string; label: string; quantity: number | null; unit: string; status: string | null; comment: string | null }[];
};

export function toPreconexaJson(t: Takeoff, project: string, now: Date = new Date()): PreconexaExport {
  const pagesUsed = [...new Set(t.measurements.filter((m) => m.kind !== "markup").map((m) => m.page))].sort((a, b) => a - b);
  const pages = pagesUsed.map((p) => ({ page: p, feetPerUnit: t.feetPerUnit[p] ?? null, scaleNote: t.scaleNote?.[p] ?? null }));
  const warnings: string[] = [];
  const noScale = pages.filter((p) => p.feetPerUnit == null).map((p) => p.page);
  if (noScale.length) warnings.push(`Page(s) ${noScale.join(", ")} have no scale set, so their lengths and areas are null.`);
  const noDepth = t.measurements.filter((m) => m.kind === "volume" && m.depth == null).length;
  if (noDepth) warnings.push(`${noDepth} volume item(s) have no depth, so their quantity is null.`);
  const round = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
  const summary = summarize(t).map((r) => ({
    layer: r.layer, kind: r.kind, label: r.label, items: r.items, quantity: round(r.qty), unit: r.unit,
    unitCost: t.costs?.[costKey(r.label)] ?? null, extendedCost: round(extended(t, r)),
  }));
  const items = t.measurements.filter((m) => m.kind !== "markup").map((m) => ({
    id: m.id, page: m.page, layer: t.layers.find((l) => l.id === m.layerId)?.name ?? "?", kind: m.kind, label: m.label,
    quantity: round(quantity(m, scaleFor(t, m))), unit: UNITS[m.kind], status: m.status ?? null, comment: m.comment ?? null,
  }));
  return { schema: "preconexa-takeoff/1", exportedAt: now.toISOString(), project, pages, warnings, summary, items };
}
