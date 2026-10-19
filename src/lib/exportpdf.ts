import type { Takeoff } from "./takeoff";
import { flattenPage } from "./flatten";
import type { Op } from "./flatten";

const hex = (c: string | undefined): [number, number, number] | null => {
  const m = /^#([0-9a-f]{6})$/i.exec(c ?? "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const svgPath = (pts: { x: number; y: number }[], closed: boolean) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(3)},${p.y.toFixed(3)}`).join("") + (closed ? "Z" : "");
const decode = (dataUrl: string): { bytes: Uint8Array; png: boolean } | null => {
  const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(dataUrl);
  if (!m) return null;
  const bin = atob(m[2]), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return { bytes: out, png: m[1].toLowerCase() === "png" };
};

/**
 * Draws the takeoff's markups into a copy of the original PDF.
 * Pages with a rotation are skipped (reported in skippedRotated) rather than drawn in the wrong place.
 */
export async function exportMarkedUpPdf(original: Uint8Array, t: Takeoff, opts?: { labels?: boolean }): Promise<{ bytes: Uint8Array; skippedRotated: number[] }> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
  const doc = await PDFDocument.load(original, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const col = (c: string | undefined) => { const k = hex(c); return k ? rgb(k[0], k[1], k[2]) : undefined; };
  const skippedRotated: number[] = [];

  doc.getPages().forEach((page, i) => {
    const ops: Op[] = flattenPage(t, i + 1, opts);
    if (!ops.length) return;
    if (page.getRotation().angle % 360 !== 0) { skippedRotated.push(i + 1); return; }
    const H = page.getHeight();
    for (const op of ops) {
      try {
        const stroke = "stroke" in op ? col(op.stroke) : undefined;
        const fill = "fill" in op ? col(op.fill) : undefined;
        switch (op.t) {
          case "poly": {
            if (op.pts.length < 2) break;
            const d = svgPath(op.pts, op.closed);
            page.drawSvgPath(d, {
              x: 0, y: H, borderColor: stroke, borderWidth: stroke ? op.width : 0, color: fill, opacity: op.opacity, borderOpacity: 1,
              borderDashArray: op.dash,
            });
            break;
          }
          case "path":
            page.drawSvgPath(op.d, { x: 0, y: H, borderColor: stroke, borderWidth: stroke ? op.width : 0, color: fill, opacity: op.opacity, borderOpacity: 1 });
            break;
          case "ellipse":
            page.drawEllipse({ x: op.cx, y: H - op.cy, xScale: Math.max(op.rx, 0.01), yScale: Math.max(op.ry, 0.01), borderColor: stroke, borderWidth: stroke ? op.width : 0, color: fill, opacity: op.opacity, borderOpacity: 1 });
            break;
          case "box":
            page.drawRectangle({ x: op.x, y: H - op.y - op.h, width: op.w, height: op.h, borderColor: stroke, borderWidth: stroke ? op.width : 0, color: fill, opacity: op.opacity, borderOpacity: 1 });
            break;
          case "text": {
            const f = op.bold ? bold : font, w = f.widthOfTextAtSize(op.text, op.size), a = (op.angle * Math.PI) / 180;
            // Page space is y-down, so a clockwise angle a moves "along the text" by (cos a, sin a); PDF space flips y.
            const shift = op.align === "center" ? -w / 2 : 0;
            const x = op.x + Math.cos(a) * shift, y = op.y + Math.sin(a) * shift;
            page.drawText(op.text, { x, y: H - y, size: op.size, font: f, color: col(op.color) ?? rgb(0, 0, 0), rotate: degrees(-op.angle) });
            break;
          }
          case "image": break; // drawn in the second pass (embedding is async)
        }
      } catch { /* one bad markup must not abort the export */ }
    }
  });

  // Images need async embedding, so draw them in a second pass.
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (page.getRotation().angle % 360 !== 0) continue;
    const H = page.getHeight();
    for (const op of flattenPage(t, i + 1, opts)) {
      if (op.t !== "image") continue;
      try {
        const d = decode(op.dataUrl); if (!d) continue;
        const img = d.png ? await doc.embedPng(d.bytes) : await doc.embedJpg(d.bytes);
        page.drawImage(img, { x: op.x, y: H - op.y - op.h, width: op.w, height: op.h });
      } catch { /* skip an unreadable picture */ }
    }
  }
  return { bytes: await doc.save(), skippedRotated };
}
