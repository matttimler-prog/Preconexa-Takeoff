import type { Pt } from "./measure";
import type { Measurement } from "./takeoff";

/**
 * Turns the markups already stored in a PDF (the standard annotation types, which is what Bluebeam, Acrobat and most
 * other PDF editors write) into our own editable markups. Only the standard PDF annotation format is read.
 * Bluebeam's private measurement data is not available this way, so a measurement is re-measured here with this
 * sheet's own scale, and the original text is kept in the comment so the two can be compared.
 */
export type RawAnnot = {
  subtype?: string;
  rect?: ArrayLike<number>;
  color?: ArrayLike<number> | null;
  contents?: string;
  contentsObj?: { str?: string };
  title?: string;
  vertices?: unknown;
  lineCoordinates?: ArrayLike<number>;
  inkLists?: unknown;
  quadPoints?: unknown;
  borderStyle?: { width?: number };
  hidden?: boolean;
};

export type ImportOpts = {
  page: number;
  layerId: string;
  /** PDF user-space point to page-unit point (the page viewport at scale 1). */
  toPage: (x: number, y: number) => Pt;
  newId: () => string;
  /** Turn polylines/polygons whose text looks like a quantity into length/area measurements. Default true. */
  asMeasurements?: boolean;
};

export type ImportResult = { items: Measurement[]; skipped: Record<string, number> };

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
export function colorOf(c: ArrayLike<number> | null | undefined, fallback = "#ef4444"): string {
  if (!c || c.length < 3) return fallback;
  const mx = Math.max(c[0], c[1], c[2]);
  const k = mx <= 1 ? 255 : 1; // 0..1 floats or 0..255 bytes
  return `#${hex2(c[0] * k)}${hex2(c[1] * k)}${hex2(c[2] * k)}`;
}

/** Points from either [{x,y}, ...] or a flat [x, y, x, y, ...] list. */
export function pointsOf(v: unknown): { x: number; y: number }[] {
  if (!v || typeof v !== "object") return [];
  const arr = Array.from(v as ArrayLike<unknown>);
  if (!arr.length) return [];
  if (typeof arr[0] === "number") {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < arr.length; i += 2) out.push({ x: arr[i] as number, y: arr[i + 1] as number });
    return out;
  }
  if (Array.isArray(arr[0]) || (arr[0] && typeof arr[0] === "object" && !("x" in (arr[0] as object)))) {
    return arr.flatMap((a) => pointsOf(a)); // nested groups
  }
  return arr.filter((p): p is { x: number; y: number } => !!p && typeof (p as { x?: unknown }).x === "number" && typeof (p as { y?: unknown }).y === "number");
}

/** Groups of four corner points (highlight and underline style annotations). */
export function quadsOf(v: unknown): { x: number; y: number }[][] {
  const all = pointsOf(v), out: { x: number; y: number }[][] = [];
  for (let i = 0; i + 3 < all.length; i += 4) out.push(all.slice(i, i + 4));
  return out;
}

const QTY = /(\d+\s*'|\d+(\.\d+)?\s*(lf|sf|ft|sq\.?\s?ft|ea|cf|in|")\b)/i;

export function annotationsToMarkups(raw: RawAnnot[], o: ImportOpts): ImportResult {
  const items: Measurement[] = [], skipped: Record<string, number> = {};
  const skip = (s: string) => { skipped[s] = (skipped[s] ?? 0) + 1; };
  const asMeas = o.asMeasurements !== false;
  const P = (p: { x: number; y: number }) => o.toPage(p.x, p.y);
  const bbox = (ps: Pt[]): [Pt, Pt] => [{ x: Math.min(...ps.map((p) => p.x)), y: Math.min(...ps.map((p) => p.y)) }, { x: Math.max(...ps.map((p) => p.x)), y: Math.max(...ps.map((p) => p.y)) }];
  const rectPts = (a: RawAnnot): [Pt, Pt] | null => {
    const r = a.rect; if (!r || r.length < 4) return null;
    return bbox([o.toPage(r[0], r[1]), o.toPage(r[2], r[3])]);
  };
  const add = (a: RawAnnot, m: Partial<Measurement> & Pick<Measurement, "kind" | "pts" | "label">) => {
    const w = a.borderStyle?.width;
    items.push({ id: o.newId(), layerId: o.layerId, page: o.page, color: colorOf(a.color), ...(w && w > 0 ? { lineWidth: Math.min(8, w) } : {}), ...m });
  };

  for (const a of raw) {
    const st = a.subtype ?? "";
    if (a.hidden) { skip("hidden"); continue; }
    const text = (a.contentsObj?.str ?? a.contents ?? "").trim();
    const label = text.split("\n")[0].slice(0, 60) || a.title || st;
    try {
      switch (st) {
        case "Line": {
          const c = a.lineCoordinates; if (!c || c.length < 4) { skip("Line"); break; }
          const p0 = o.toPage(c[0], c[1]), p1 = o.toPage(c[2], c[3]);
          // pdf.js hands back the end points sorted, so a slanted line's direction can't be told apart.
          const slanted = Math.abs(p0.x - p1.x) > 1 && Math.abs(p0.y - p1.y) > 1;
          add(a, { kind: "markup", shape: "line", pts: [p0, p1], label, ...(slanted ? { comment: "Imported slanted line: it may be mirrored. Check it against the drawing." } : {}) });
          break;
        }
        case "PolyLine": case "Polygon": {
          const ps = pointsOf(a.vertices).map(P); if (ps.length < 2) { skip(st); break; }
          const looksQty = asMeas && QTY.test(text);
          if (looksQty) add(a, { kind: st === "Polygon" ? "area" : "length", shape: st === "Polygon" ? "polygon" : "polyline", pts: ps, label: st === "Polygon" ? "Imported area" : "Imported length", comment: `Original label in the PDF: ${text}` });
          else add(a, { kind: "markup", shape: st === "Polygon" ? "polygon" : "polyline", pts: ps, label });
          break;
        }
        case "Square": case "Circle": {
          const r = rectPts(a); if (!r) { skip(st); break; }
          add(a, { kind: "markup", shape: st === "Square" ? "rect" : "ellipse", pts: [r[0], r[1]], label });
          break;
        }
        case "Ink": {
          const lists = Array.isArray(a.inkLists) ? (a.inkLists as unknown[]) : [];
          let n = 0;
          for (const l of lists) {
            let ps = pointsOf(l).map(P); if (ps.length < 2) continue;
            if (ps.length > 600) { const k = Math.ceil(ps.length / 600); ps = ps.filter((_, i) => i % k === 0 || i === ps.length - 1); }
            add(a, { kind: "markup", shape: "pen", pts: ps, label }); n++;
          }
          if (!n) skip("Ink");
          break;
        }
        case "Highlight": case "Underline": case "StrikeOut": case "Squiggly": {
          const shape = st === "Highlight" ? "highlight" : st === "Underline" ? "underline" : st === "StrikeOut" ? "strike" : "squiggly";
          const quads = quadsOf(a.quadPoints);
          if (quads.length) for (const q of quads) { const [lo, hi] = bbox(q.map(P)); add(a, { kind: "markup", shape, pts: [lo, hi], label }); }
          else { const r = rectPts(a); if (r) add(a, { kind: "markup", shape, pts: [r[0], r[1]], label }); else skip(st); }
          break;
        }
        case "FreeText": {
          const r = rectPts(a); if (!r || !text) { skip(st); break; }
          add(a, { kind: "markup", shape: "text", pts: [r[0]], label: "Text", text });
          break;
        }
        case "Text": {
          const r = rectPts(a); if (!r) { skip(st); break; }
          add(a, { kind: "markup", shape: "note", pts: [r[0]], label: "Note", text: text || "(empty note)" });
          break;
        }
        default: skip(st || "unknown");
      }
    } catch { skip(st || "unreadable"); }
  }
  return { items, skipped };
}

/** One sentence for the status line after an import. */
export function importSummary(r: ImportResult): string {
  const n = r.items.length;
  const ignorable = new Set(["Link", "Popup", "Widget", "hidden"]);
  const odd = Object.entries(r.skipped).filter(([k]) => !ignorable.has(k));
  const oddN = odd.reduce((s, [, v]) => s + v, 0);
  if (!n && !oddN) return "No markups were found in this PDF.";
  const tail = oddN ? ` ${oddN} item(s) of a type this tool can't edit were left as they are in the PDF (${odd.map(([k, v]) => `${v} ${k}`).join(", ")}).` : "";
  return `Imported ${n} markup${n === 1 ? "" : "s"} you can now edit.${tail}`;
}
