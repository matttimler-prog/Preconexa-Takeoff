import type { Takeoff } from "./takeoff";
import { flattenPage } from "./flatten";
import type { Op } from "./flatten";
import { displayTransform } from "./pagexform";

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
 * Rotated pages and pages whose crop box doesn't start at 0,0 are handled by wrapping the drawing in one transform
 * (see pagexform.ts). skippedRotated is kept for compatibility and is always empty now.
 */
export async function exportMarkedUpPdf(original: Uint8Array, t: Takeoff, opts?: { labels?: boolean; dropNative?: boolean }): Promise<{ bytes: Uint8Array; skippedRotated: number[] }> {
  const { PDFDocument, StandardFonts, rgb, degrees, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = await import("pdf-lib");
  const doc = await PDFDocument.load(original, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const col = (c: string | undefined) => { const k = hex(c); return k ? rgb(k[0], k[1], k[2]) : undefined; };
  const skippedRotated: number[] = [];
  if (opts?.dropNative) {
    // The PDF's own markups were imported as editable markups; leave the old copies out so nothing is drawn twice.
    // Links and form fields stay.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { PDFName } = (await import("pdf-lib")) as any;
    for (const page of doc.getPages()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const node: any = page.node, annots = node.Annots?.();
      if (!annots) continue;
      const keep = [];
      for (let i = 0; i < annots.size(); i++) {
        const ref = annots.get(i), d = doc.context.lookup(ref);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const st = String((d as any)?.get?.(PDFName.of("Subtype")) ?? "");
        if (st === "/Link" || st === "/Widget") keep.push(ref);
      }
      node.set(PDFName.of("Annots"), doc.context.obj(keep));
    }
  }
  const pageTransform = (page: { getRotation: () => { angle: number }; getCropBox: () => { x: number; y: number; width: number; height: number } }) => displayTransform(page.getRotation().angle, page.getCropBox());

  doc.getPages().forEach((page, i) => {
    const ops: Op[] = flattenPage(t, i + 1, opts);
    if (!ops.length) return;
    const dt = pageTransform(page);
    const H = dt.height;
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...dt.matrix));
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
    page.pushOperators(popGraphicsState());
  });

  // Images need async embedding, so draw them in a second pass.
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const dt = pageTransform(page), H = dt.height;
    const imgs = flattenPage(t, i + 1, opts).filter((op) => op.t === "image");
    if (!imgs.length) continue;
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...dt.matrix));
    for (const op of imgs) {
      if (op.t !== "image") continue;
      try {
        const d = decode(op.dataUrl); if (!d) continue;
        const img = d.png ? await doc.embedPng(d.bytes) : await doc.embedJpg(d.bytes);
        page.drawImage(img, { x: op.x, y: H - op.y - op.h, width: op.w, height: op.h });
      } catch { /* skip an unreadable picture */ }
    }
    page.pushOperators(popGraphicsState());
  }
  return { bytes: await doc.save(), skippedRotated };
}
