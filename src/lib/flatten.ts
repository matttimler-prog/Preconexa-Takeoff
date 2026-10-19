import type { Pt } from "./measure";
import type { Measurement, Takeoff } from "./takeoff";
import { measureLabel, scaleFor, shapeOf } from "./takeoff";
import { angleArc, arrowHead, circleOf, cloudPath, labelAnchor, outline, textBox } from "./shapes";

/** Neutral drawing instructions in page units (y down, origin top-left). The PDF exporter maps these onto pdf-lib calls. */
export type Op =
  | { t: "poly"; pts: { x: number; y: number }[]; closed: boolean; stroke?: string; width: number; fill?: string; opacity?: number; dash?: number[] }
  | { t: "ellipse"; cx: number; cy: number; rx: number; ry: number; stroke?: string; width: number; fill?: string; opacity?: number }
  | { t: "path"; d: string; stroke?: string; width: number; fill?: string; opacity?: number }
  | { t: "text"; x: number; y: number; size: number; text: string; color: string; angle: number; align: "left" | "center"; bold?: boolean }
  | { t: "box"; x: number; y: number; w: number; h: number; stroke?: string; width: number; fill?: string; opacity?: number }
  | { t: "image"; x: number; y: number; w: number; h: number; dataUrl: string };

const FS = 11; // text size on the sheet, in page units
const DEFAULT_COLOR = "#2563eb";

/** How a scale in feet-per-page-unit reads on the sheet, e.g. "8.00 ft per paper inch". */
export const vpScaleText = (vpScale: number) => `${(vpScale * 72).toFixed(2)} ft per paper inch`;

const rows = (s: string) => (s || " ").split("\n");

/** Everything to draw on one page, in measurement order, for visible layers only. */
export function flattenPage(t: Takeoff, page: number, opts?: { labels?: boolean }): Op[] {
  const ops: Op[] = [];
  const showLabels = opts?.labels !== false;
  for (const m of t.measurements) {
    if (m.page !== page || !m.pts.length) continue;
    const layer = t.layers.find((l) => l.id === m.layerId);
    if (!layer?.visible) continue;
    const color = m.color ?? layer.color ?? DEFAULT_COLOR;
    drawMarkup(ops, m, color);
    if (showLabels && !m.hideLabel && m.kind !== "count" && m.kind !== "markup") {
      const text = measureLabel(m, scaleFor(t, m));
      const an = text ? labelAnchor(shapeOf(m), m.pts) : null;
      if (text && an) {
        // Nudge above the line along the reading direction (same as the white label box in the viewer).
        const a = (an.angle * Math.PI) / 180, off = an.onLine ? FS * 1.2 : 0;
        ops.push({ t: "text", x: an.pt.x + Math.sin(a) * off, y: an.pt.y - Math.cos(a) * off + (an.onLine ? 0 : FS * 0.35), size: FS, text, color: "#111111", angle: an.angle, align: "center", bold: true });
      }
    }
  }
  return ops;
}

function drawMarkup(ops: Op[], m: Measurement, color: string): void {
  const sh = shapeOf(m), pts = m.pts, lw = m.lineWidth ?? 2, p0 = pts[0];
  const o = outline(sh, pts);
  const filled = m.kind === "area" || m.kind === "volume";
  const fillOpts = filled ? { fill: color, opacity: 0.2 } : m.kind === "cutout" ? { fill: "#ef4444", opacity: 0.2 } : {};
  const dash = m.kind === "cutout" ? [6, 3] : undefined;
  const stroked = (pp: Pt[], closed: boolean): Op => ({ t: "poly", pts: pp, closed, stroke: color, width: lw, dash, ...(closed ? fillOpts : {}) });

  if (m.kind === "count") { drawCount(ops, m, color); return; }

  switch (sh) {
    case "text": case "typewriter": case "note": case "stamp": case "callout": {
      drawTextual(ops, m, sh, color);
      return;
    }
    case "arrow": {
      if (pts.length < 2) { ops.push(stroked(pts, false)); return; }
      const a = pts[0], b = pts[pts.length - 1];
      ops.push(stroked([a, b], false));
      ops.push({ t: "poly", pts: arrowHead(a, b, 12), closed: true, stroke: color, width: 1, fill: color });
      return;
    }
    case "dimension": {
      ops.push(stroked(pts, false));
      if (pts.length >= 2) {
        const [a, b] = pts, t = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2, nx = Math.cos(t) * 7, ny = Math.sin(t) * 7;
        ops.push({ t: "poly", pts: [{ x: a.x - nx, y: a.y - ny }, { x: a.x + nx, y: a.y + ny }], closed: false, stroke: color, width: lw });
        ops.push({ t: "poly", pts: [{ x: b.x - nx, y: b.y - ny }, { x: b.x + nx, y: b.y + ny }], closed: false, stroke: color, width: lw });
      }
      return;
    }
    case "cloud": {
      if (pts.length < 3) { ops.push(stroked(pts, false)); return; }
      ops.push({ t: "path", d: cloudPath(pts), stroke: color, width: lw, ...fillOpts });
      if (m.text) ops.push(...textLines(m.text, { x: p0.x, y: p0.y - FS * 0.5 }, color, "left", false));
      return;
    }
    case "highlight":
      if (pts.length >= 2) ops.push({ t: "poly", pts: o.pts, closed: true, fill: "#facc15", opacity: 0.45, width: 0 });
      return;
    case "hltext":
      if (pts.length >= 2) ops.push({ t: "poly", pts: o.pts, closed: true, fill: "#facc15", opacity: 0.4, width: 0 });
      return;
    case "underline": case "strike": case "squiggly": {
      if (pts.length < 2) return;
      const x0 = Math.min(pts[0].x, pts[1].x), x1 = Math.max(pts[0].x, pts[1].x), y0 = Math.min(pts[0].y, pts[1].y), y1 = Math.max(pts[0].y, pts[1].y);
      if (sh === "underline") ops.push({ t: "poly", pts: [{ x: x0, y: y1 }, { x: x1, y: y1 }], closed: false, stroke: color, width: lw });
      else if (sh === "strike") { const y = (y0 + y1) / 2; ops.push({ t: "poly", pts: [{ x: x0, y }, { x: x1, y }], closed: false, stroke: color, width: lw }); }
      else {
        const zz: Pt[] = [], step = 3, amp = 1.5;
        for (let x = x0, i = 0; x <= x1; x += step, i++) zz.push({ x, y: y1 + (i % 2 ? amp : -amp) });
        if (zz.length > 1) ops.push({ t: "poly", pts: zz, closed: false, stroke: color, width: Math.max(0.75, lw / 2) });
      }
      return;
    }
    case "link": {
      if (pts.length < 2) return;
      const [a, b] = pts;
      ops.push({ t: "box", x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), stroke: "#2563eb", width: 1 });
      return;
    }
    case "image": {
      if (pts.length < 2 || !m.image || !m.image.startsWith("data:image/")) return;
      const [a, b] = pts;
      ops.push({ t: "image", x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), dataUrl: m.image });
      return;
    }
    case "viewport": {
      if (pts.length < 2) return;
      const [a, b] = pts, x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      ops.push({ t: "box", x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), stroke: "#7c3aed", width: 1 });
      if (m.vpScale != null) ops.push({ t: "text", x: x + 3, y: y + FS + 1, size: FS * 0.8, text: `scale: ${vpScaleText(m.vpScale)}`, color: "#7c3aed", angle: 0, align: "left" });
      return;
    }
    case "rect": case "ellipse": {
      if (pts.length < 2) { ops.push(stroked(pts, false)); return; }
      const [a, b] = pts;
      if (sh === "rect") ops.push({ t: "poly", pts: o.pts, closed: true, stroke: color, width: lw, dash, ...fillOpts });
      else ops.push({ t: "ellipse", cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, rx: Math.abs(b.x - a.x) / 2, ry: Math.abs(b.y - a.y) / 2, stroke: color, width: lw, ...fillOpts });
      return;
    }
    case "circle": case "diameter": {
      const k = circleOf(sh, pts);
      if (!k) { ops.push(stroked(pts, false)); return; }
      ops.push({ t: "ellipse", cx: k.c.x, cy: k.c.y, rx: k.r, ry: k.r, stroke: color, width: lw });
      ops.push({ t: "poly", pts: pts.slice(0, 2), closed: false, stroke: color, width: lw });
      return;
    }
    case "angle": {
      ops.push(stroked(pts, false));
      if (pts.length >= 3) {
        const [a, v, b] = pts, r = Math.min(Math.hypot(a.x - v.x, a.y - v.y), Math.hypot(b.x - v.x, b.y - v.y)) * 0.4;
        ops.push({ t: "poly", pts: angleArc(a, v, b, Math.min(r, 40)), closed: false, stroke: color, width: lw });
      }
      return;
    }
    case "polygon":
      ops.push(pts.length < 3 ? stroked(pts, false) : stroked(pts, true));
      return;
    case "arc": case "pen": case "line": case "polyline":
    default:
      ops.push(stroked(o.pts, false));
  }
}

function textLines(text: string, at: Pt, color: string, align: "left" | "center", bold: boolean): Op[] {
  return rows(text).map((r, i) => ({ t: "text", x: at.x, y: at.y + FS * 1.15 + FS * 1.25 * i, size: FS, text: r, color, angle: 0, align, bold }) as Op);
}

function drawTextual(ops: Op[], m: Measurement, sh: string, color: string): void {
  const pts = m.pts, p0 = pts[0], text = m.text ?? "";
  if (sh === "typewriter") { ops.push(...textLines(text, { x: p0.x, y: p0.y - FS * 0.4 }, color, "left", false)); return; }
  if (sh === "note") {
    const s = 16;
    ops.push({ t: "box", x: p0.x, y: p0.y, w: s, h: s, stroke: "#a16207", width: 1, fill: "#fde047" });
    if (text) ops.push(...textLines(text, { x: p0.x + s + 3, y: p0.y }, "#111111", "left", false));
    return;
  }
  if (sh === "stamp") {
    const label = text.toUpperCase(), b = textBox(label, p0, FS * 1.3);
    ops.push({ t: "box", x: b.x, y: b.y, w: b.w, h: b.h, stroke: color, width: 2 });
    ops.push(...textLines(label, { x: b.x + (FS * 1.3 * 0.4), y: b.y + (FS * 1.3 - FS) * 0.5 }, color, "left", true));
    return;
  }
  if (sh === "callout") {
    if (pts.length < 2) return;
    const b = textBox(text, pts[1], FS);
    ops.push({ t: "poly", pts: [pts[0], { x: b.x, y: b.y + b.h / 2 }], closed: false, stroke: color, width: m.lineWidth ?? 2 });
    ops.push({ t: "box", x: b.x, y: b.y, w: b.w, h: b.h, stroke: color, width: m.lineWidth ?? 2, fill: "#ffffff" });
    ops.push(...textLines(text, { x: b.x + FS * 0.4, y: b.y }, "#111111", "left", false));
    return;
  }
  // text box
  const b = textBox(text, p0, FS);
  ops.push({ t: "box", x: b.x, y: b.y, w: b.w, h: b.h, stroke: color, width: 1, fill: "#ffffff", opacity: 0.88 });
  ops.push(...textLines(text, { x: b.x + FS * 0.4, y: b.y }, color, "left", false));
}

function drawCount(ops: Op[], m: Measurement, color: string): void {
  for (const p of m.pts) {
    const sy = m.symbol;
    if (!sy) { ops.push({ t: "ellipse", cx: p.x, cy: p.y, rx: 4, ry: 4, stroke: color, width: 1, fill: color }); continue; }
    const s = sy.size / 2;
    if (sy.shape === "image") {
      if (sy.image && sy.image.startsWith("data:image/")) ops.push({ t: "image", x: p.x - s, y: p.y - s, w: sy.size, h: sy.size, dataUrl: sy.image });
      else ops.push({ t: "ellipse", cx: p.x, cy: p.y, rx: 4, ry: 4, stroke: color, width: 1, fill: color });
      continue;
    }
    switch (sy.shape) {
      case "circle": ops.push({ t: "ellipse", cx: p.x, cy: p.y, rx: s, ry: s, stroke: color, width: 1.5, fill: "#ffffff" }); break;
      case "square": ops.push({ t: "box", x: p.x - s, y: p.y - s, w: sy.size, h: sy.size, stroke: color, width: 1.5, fill: "#ffffff" }); break;
      case "triangle": ops.push({ t: "poly", pts: [{ x: p.x, y: p.y - s }, { x: p.x + s, y: p.y + s }, { x: p.x - s, y: p.y + s }], closed: true, stroke: color, width: 1.5, fill: "#ffffff" }); break;
      case "diamond": ops.push({ t: "poly", pts: [{ x: p.x, y: p.y - s }, { x: p.x + s, y: p.y }, { x: p.x, y: p.y + s }, { x: p.x - s, y: p.y }], closed: true, stroke: color, width: 1.5, fill: "#ffffff" }); break;
      default:
        ops.push({ t: "poly", pts: [{ x: p.x - s, y: p.y }, { x: p.x + s, y: p.y }], closed: false, stroke: color, width: 2 });
        ops.push({ t: "poly", pts: [{ x: p.x, y: p.y - s }, { x: p.x, y: p.y + s }], closed: false, stroke: color, width: 2 });
    }
    if (sy.text && sy.shape !== "cross") ops.push({ t: "text", x: p.x, y: p.y + sy.size * 0.2, size: sy.size * 0.6, text: sy.text, color, angle: 0, align: "center", bold: true });
  }
}
