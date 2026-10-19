import { SCALE_PRESETS } from "./measure";

export type ScaleCandidate = { text: string; feetPerPaperInch: number; count: number };

const normalize = (s: string) =>
  s.replace(/[“”″‟]/g, '"').replace(/[‘’′]/g, "'").replace(/''/g, '"').replace(/\s+/g, " ").trim();

const num = (s: string) => {
  const m = s.trim().match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
  if (m) return Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]);
  return Number(s);
};

export const canonicalScale = (feetPerPaperInch: number): string => {
  const hit = SCALE_PRESETS.find((p) => Math.abs(p.feetPerPaperInch - feetPerPaperInch) < 1e-6);
  return hit ? hit.label : `1" = ${+feetPerPaperInch.toFixed(3)}'`;
};

/** Typed scale text -> feet per paper inch. Accepts 1/8" = 1'-0", 1/8=1', 3/32 in = 1 ft, 1" = 20', 1:48, "scale 1/4" = 1'". */
export function parseScaleText(input: string): number | null {
  const s = normalize(input).toLowerCase().replace(/^scale\s*[:\-]?\s*/, "");
  const ratio = s.match(/^1\s*:\s*(\d+(?:\.\d+)?)$/);
  if (ratio) { const f = Number(ratio[1]) / 12; return f > 0 ? f : null; }
  const m = s.match(/^((?:\d+\s+)?\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*(?:"|in\b|inch(?:es)?)?\s*=\s*(\d+(?:\.\d+)?)\s*(?:'|ft\b|feet\b|foot\b)?(?:\s*-?\s*(\d+(?:\.\d+)?)\s*(?:"|in\b|inch(?:es)?)?)?$/);
  if (!m) return null;
  const paper = num(m[1]), real = Number(m[2]) + (m[3] ? Number(m[3]) / 12 : 0);
  if (!(paper > 0) || !(real > 0)) return null;
  const f = real / paper;
  return plausible(f) ? f : null;
}

// real feet per paper inch must be sensible: 1 ft per 12 paper inches up to 2000 ft per inch
const plausible = (f: number) => f >= 1 / 12 - 1e-9 && f <= 2000;

/** Look through a page's text for printed scales. Items may be split ("SCALE:", "1/8\"", "=", "1'-0\"") so they are joined first. */
export function detectScales(items: string[]): { candidates: ScaleCandidate[]; nts: boolean } {
  const text = normalize(items.join(" "));
  const counts = new Map<string, ScaleCandidate>();
  const add = (f: number) => {
    if (!plausible(f)) return;
    const key = canonicalScale(f);
    const c = counts.get(key);
    if (c) c.count++; else counts.set(key, { text: key, feetPerPaperInch: f, count: 1 });
  };
  const arch = /((?:\d+\s+)?\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*(?:"|in\b|inch(?:es)?)?\s*=\s*(\d+(?:\.\d+)?)\s*(?:'|ft\b|feet\b|foot\b)(?:\s*-?\s*(\d+(?:\.\d+)?)\s*(?:"|in\b|inch(?:es)?)?)?/gi;
  let m: RegExpExecArray | null;
  while ((m = arch.exec(text))) {
    const paper = num(m[1]), real = Number(m[2]) + (m[3] ? Number(m[3]) / 12 : 0);
    if (paper > 0 && real > 0 && paper <= 12) add(real / paper);
  }
  const ratio = /scale\s*[:\-]?\s*1\s*:\s*(\d+(?:\.\d+)?)/gi;
  while ((m = ratio.exec(text))) add(Number(m[1]) / 12);
  const candidates = [...counts.values()].sort((a, b) => b.count - a.count || a.feetPerPaperInch - b.feetPerPaperInch);
  return { candidates, nts: /not to scale|\bnts\b/i.test(text) };
}

const SHEETS: { label: string; w: number; h: number; full: boolean }[] = [
  { label: "ARCH E 36 × 48", w: 36, h: 48, full: true }, { label: "ARCH E1 30 × 42", w: 30, h: 42, full: true },
  { label: "ARCH D 24 × 36", w: 24, h: 36, full: true }, { label: "ARCH C 18 × 24", w: 18, h: 24, full: false },
  { label: "Tabloid 11 × 17", w: 11, h: 17, full: false }, { label: "Letter 8.5 × 11", w: 8.5, h: 11, full: false },
];
/** Sheet size in inches and whether printed scales can be trusted at this size. */
export function sheetInfo(wPts: number, hPts: number): { wIn: number; hIn: number; label: string; trusted: boolean } {
  const a = wPts / 72, b = hPts / 72, lo = Math.min(a, b), hi = Math.max(a, b);
  const hit = SHEETS.find((s) => Math.abs(s.w - lo) < 0.6 && Math.abs(s.h - hi) < 0.6);
  return { wIn: +hi.toFixed(1), hIn: +lo.toFixed(1), label: hit?.label ?? `${hi.toFixed(1)} × ${lo.toFixed(1)}`, trusted: hit ? hit.full : true };
}
