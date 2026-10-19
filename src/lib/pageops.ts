/** Page-level PDF operations (new files; the open document is never changed). Uses pdf-lib, loaded on demand. */
export async function extractPages(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(bytes), out = await PDFDocument.create();
  const copied = await out.copyPages(src, pages.map((p) => p - 1));
  copied.forEach((p) => out.addPage(p));
  return out.save();
}
export async function deletePages(bytes: Uint8Array, pages: number[], total: number): Promise<Uint8Array> {
  const drop = new Set(pages), keep: number[] = [];
  for (let i = 1; i <= total; i++) if (!drop.has(i)) keep.push(i);
  if (!keep.length) throw new Error("That would delete every page.");
  return extractPages(bytes, keep);
}
export async function rotatePages(bytes: Uint8Array, pages: number[], deg: number): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes), all = doc.getPages();
  for (const n of pages) { const pg = all[n - 1]; if (pg) pg.setRotation(degrees((((pg.getRotation().angle + deg) % 360) + 360) % 360)); }
  return doc.save();
}
export async function mergePdfs(a: Uint8Array, b: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (const bytes of [a, b]) {
    const src = await PDFDocument.load(bytes), copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((p) => out.addPage(p));
  }
  return out.save();
}
/** Header/footer text and page numbers on the chosen pages. Tokens: {n} page number, {total} page count. */
export async function stampPages(bytes: Uint8Array, pages: number[], opts: { header?: string; footer?: string }): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes), font = await doc.embedFont(StandardFonts.Helvetica), all = doc.getPages();
  const fill = (s: string, n: number) => s.replace(/\{n\}/g, String(n)).replace(/\{total\}/g, String(all.length));
  for (const n of pages) {
    const pg = all[n - 1]; if (!pg) continue;
    const { width, height } = pg.getSize(), size = Math.max(8, Math.min(14, width / 60));
    const put = (txt: string, y: number) => { const w = font.widthOfTextAtSize(txt, size); pg.drawText(txt, { x: (width - w) / 2, y, size, font, color: rgb(0.1, 0.1, 0.1) }); };
    if (opts.header) put(fill(opts.header, n), height - size * 2);
    if (opts.footer) put(fill(opts.footer, n), size * 1.2);
  }
  return doc.save();
}
