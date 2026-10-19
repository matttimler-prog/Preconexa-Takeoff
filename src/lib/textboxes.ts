import { mulM } from "./pdfgeom";

/** A text run from pdf.js getTextContent(). */
export type TextItem = { str: string; transform: number[]; width: number; height?: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type TBox = Rect & { str: string };

/** Boxes (page units, y down) for each text run, using the viewport transform at scale 1. Rotated or vertical text is skipped. */
export function textBoxes(items: TextItem[], vt: number[]): TBox[] {
  const out: TBox[] = [], sx = Math.hypot(vt[0], vt[1]);
  for (const it of items) {
    if (!it.str || !it.str.trim() || !it.transform || it.transform.length < 6) continue;
    const m = mulM(vt, it.transform), fh = Math.hypot(m[2], m[3]);
    if (!(fh > 0) || Math.abs(m[1]) > Math.abs(m[0]) * 0.2) continue;
    out.push({ x: m[4], y: m[5] - fh * 0.82, w: Math.max(0, it.width * sx), h: fh * 1.02, str: it.str });
  }
  return out;
}

const hits = (b: Rect, a: { x: number; y: number }, c: { x: number; y: number }) =>
  b.x < Math.max(a.x, c.x) && b.x + b.w > Math.min(a.x, c.x) && b.y < Math.max(a.y, c.y) && b.y + b.h > Math.min(a.y, c.y);

/** Text boxes that the dragged rectangle touches. */
export const boxesInRect = (boxes: TBox[], a: { x: number; y: number }, b: { x: number; y: number }): TBox[] => boxes.filter((t) => hits(t, a, b));

/** Merge boxes that sit on the same line into one rectangle per line, top to bottom. */
export function lineRects(boxes: Rect[]): Rect[] {
  const sorted = [...boxes].sort((p, q) => p.y - q.y || p.x - q.x), lines: Rect[] = [];
  for (const b of sorted) {
    const l = lines.find((r) => { const ov = Math.min(r.y + r.h, b.y + b.h) - Math.max(r.y, b.y); return ov > 0.5 * Math.min(r.h, b.h); });
    if (!l) { lines.push({ x: b.x, y: b.y, w: b.w, h: b.h }); continue; }
    const x0 = Math.min(l.x, b.x), y0 = Math.min(l.y, b.y), x1 = Math.max(l.x + l.w, b.x + b.w), y1 = Math.max(l.y + l.h, b.y + b.h);
    l.x = x0; l.y = y0; l.w = x1 - x0; l.h = y1 - y0;
  }
  return lines.sort((p, q) => p.y - q.y || p.x - q.x);
}

/** Rectangles for every occurrence of `query` (case-insensitive) inside single text runs. */
export function searchBoxes(boxes: TBox[], query: string): Rect[] {
  const q = query.trim().toLowerCase(), out: Rect[] = [];
  if (!q) return out;
  for (const b of boxes) {
    const s = b.str.toLowerCase(), n = Math.max(1, b.str.length);
    for (let i = s.indexOf(q); i >= 0; i = s.indexOf(q, i + q.length)) out.push({ x: b.x + (b.w * i) / n, y: b.y, w: (b.w * q.length) / n, h: b.h });
  }
  return out;
}

/** Web addresses printed on the sheet, with the box each one occupies. */
export function findUrls(boxes: TBox[]): { url: string; rect: Rect }[] {
  const out: { url: string; rect: Rect }[] = [];
  for (const b of boxes) {
    const re = /(https?:\/\/[^\s)>\]]+|www\.[^\s)>\]]+)/gi, n = Math.max(1, b.str.length);
    let m: RegExpExecArray | null;
    while ((m = re.exec(b.str))) {
      const url = m[1].replace(/[.,;:]+$/, "");
      out.push({ url: /^www\./i.test(url) ? `https://${url}` : url, rect: { x: b.x + (b.w * m.index) / n, y: b.y, w: (b.w * url.length) / n, h: b.h } });
    }
  }
  return out;
}

/** Only web addresses are opened from a link markup, never script or file addresses. */
export function safeUrl(s: string): string | null {
  const t = s.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (/^www\./i.test(t)) return `https://${t}`;
  return null;
}
/** A link markup's target: a page number ("5", "page 5") or a web address. */
export function parseLinkTarget(s: string): { page: number } | { url: string } | null {
  const t = s.trim(), pg = /^(?:page\s*)?(\d{1,5})$/i.exec(t);
  if (pg) return { page: Number(pg[1]) };
  const u = safeUrl(t);
  return u ? { url: u } : null;
}
