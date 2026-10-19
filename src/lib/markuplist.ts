import type { Kind, Takeoff } from "./takeoff";
import { UNITS, quantity, scaleFor } from "./takeoff";

export type Row = { id: string; page: number; layer: string; kind: Kind; label: string; qty: number | null; unit: string; status: string; comment: string; locked: boolean };
export type SortKey = "label" | "page" | "layer" | "kind" | "qty" | "status";
export const STATUSES = ["To do", "Ordered", "Installed", "Existing", "Done"];

/** One row per markup, with its quantity at the scale that applies to it. */
export function markupRows(t: Takeoff, includeMarkups = true): Row[] {
  return t.measurements.filter((m) => includeMarkups || m.kind !== "markup").map((m) => ({
    id: m.id, page: m.page, layer: t.layers.find((l) => l.id === m.layerId)?.name ?? "?", kind: m.kind, label: m.label,
    qty: m.kind === "markup" ? null : quantity(m, scaleFor(t, m)), unit: UNITS[m.kind], status: m.status ?? "", comment: m.comment ?? "", locked: !!m.locked,
  }));
}

/** Stable sort; empty quantities go last whichever way you sort. */
export function sortRows(rows: Row[], key: SortKey, dir: 1 | -1): Row[] {
  const cmp = (a: Row, b: Row): number => {
    if (key === "qty") { if (a.qty == null || b.qty == null) return a.qty == null ? (b.qty == null ? 0 : 1) : -1; return (a.qty - b.qty) * dir; }
    if (key === "page") return (a.page - b.page) * dir;
    return String(a[key]).localeCompare(String(b[key]), undefined, { numeric: true, sensitivity: "base" }) * dir;
  };
  return rows.map((r, i) => ({ r, i })).sort((x, y) => cmp(x.r, y.r) || x.i - y.i).map((x) => x.r);
}

export type Group = { label: string; kind: Kind; items: number; qty: number | null; unit: string; pages: number[] };
/** Rows collapsed by item name and type. */
export function groupRows(rows: Row[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const kind: Kind = r.kind === "cutout" ? "area" : r.kind, k = `${kind}\u0000${r.label.toLowerCase()}`;
    const g = map.get(k) ?? { label: r.label, kind, items: 0, qty: 0 as number | null, unit: UNITS[kind], pages: [] };
    g.items += 1; g.qty = g.qty == null || r.qty == null ? (r.kind === "markup" ? g.qty : null) : g.qty + (r.kind === "cutout" ? -Math.abs(r.qty) : r.qty);
    if (!g.pages.includes(r.page)) g.pages.push(r.page);
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function rowsCsv(rows: Row[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`, lines = ["page,layer,type,label,quantity,unit,status,comment"];
  for (const r of rows) lines.push([r.page, esc(r.layer), r.kind, esc(r.label), r.qty == null ? "" : r.qty.toFixed(2), r.unit, esc(r.status), esc(r.comment)].join(","));
  return lines.join("\n");
}
