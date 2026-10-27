import type { TBox } from "./textboxes";

/** One word the OCR engine read, in image pixels. */
export type OcrWord = { text: string; x0: number; y0: number; x1: number; y1: number; conf: number };

/**
 * Words read from a rendered sheet, turned into text boxes in page units (so search and the text markups work on scans).
 * Low-confidence words and empty ones are dropped; `s` is the render scale (pixels per page unit).
 */
export function wordsToBoxes(words: OcrWord[], s: number, minConf = 55): TBox[] {
  const out: TBox[] = [];
  for (const w of words) {
    const str = (w.text ?? "").trim();
    if (!str || !(w.conf >= minConf) || w.x1 <= w.x0 || w.y1 <= w.y0) continue;
    out.push({ x: w.x0 / s, y: w.y0 / s, w: (w.x1 - w.x0) / s, h: (w.y1 - w.y0) / s, str });
  }
  return out;
}

/**
 * Reads the text on a rendered sheet in the browser (tesseract.js, loaded only when you ask for it; it downloads its
 * language data the first time, so it needs an internet connection then). Accuracy on small drawing text is limited.
 */
export async function ocrCanvas(canvas: HTMLCanvasElement, onProgress?: (p: number) => void): Promise<OcrWord[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const T: any = await import("tesseract.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const worker: any = await T.createWorker("eng", 1, { logger: (m: { status?: string; progress?: number }) => { if (m.status === "recognizing text" && onProgress && typeof m.progress === "number") onProgress(m.progress); } });
  try {
    const r = await worker.recognize(canvas);
    const words = (r?.data?.words ?? []) as { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[];
    return words.map((w) => ({ text: w.text, conf: w.confidence, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }));
  } finally {
    try { await worker.terminate(); } catch { /* already closed */ }
  }
}
