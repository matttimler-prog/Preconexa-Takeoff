/** Pure takeoff math. All points are in PDF page units (1/72 in at scale 1), so zoom never affects results. */
export type Pt = { x: number; y: number };

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

export function polylineLength(pts: Pt[]): number {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += dist(pts[i - 1], pts[i]);
  return t;
}

/** Shoelace formula; absolute value, polygon is implicitly closed. */
export function polygonArea(pts: Pt[]): number {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Calibrate from two clicked points and the known real distance (feet). Returns feet per page unit. */
export function calibrate(a: Pt, b: Pt, realFeet: number): number {
  const d = dist(a, b);
  if (d <= 0 || !(realFeet > 0)) throw new Error("Calibration needs two distinct points and a positive distance");
  return realFeet / d;
}

/** Parse a printed scale like `1/8" = 1'-0"`, `3/32"=1'`, or `1"=20'` into feet per page unit (72 units = 1 paper inch). */
export function parseArchScale(text: string): number | null {
  const m = text.replace(/\s+/g, "").match(/^(\d+(?:\.\d+)?)(?:\/(\d+))?"=(\d+(?:\.\d+)?)'(?:-?(\d+(?:\.\d+)?)"?)?$/);
  if (!m) return null;
  const paperIn = Number(m[1]) / (m[2] ? Number(m[2]) : 1);
  const realFt = Number(m[3]) + (m[4] ? Number(m[4]) / 12 : 0);
  if (!(paperIn > 0) || !(realFt > 0)) return null;
  return realFt / (paperIn * 72);
}

export const toFeet = (pageUnits: number, feetPerUnit: number) => pageUnits * feetPerUnit;
export const toSqFeet = (pageUnits2: number, feetPerUnit: number) => pageUnits2 * feetPerUnit * feetPerUnit;

export function fmtFeetInches(ft: number): string {
  const totalIn = Math.round(ft * 12);
  return `${Math.floor(totalIn / 12)}'-${totalIn % 12}"`;
}

/** Common printed scales (paper inches -> feet), usable with full-size sheets. */
export const SCALE_PRESETS: { label: string; feetPerPaperInch: number }[] = [
  ["1/16\" = 1'-0\"", 16], ["3/32\" = 1'-0\"", 32 / 3], ["1/8\" = 1'-0\"", 8], ["3/16\" = 1'-0\"", 16 / 3],
  ["1/4\" = 1'-0\"", 4], ["3/8\" = 1'-0\"", 8 / 3], ["1/2\" = 1'-0\"", 2], ["3/4\" = 1'-0\"", 4 / 3], ["1\" = 1'-0\"", 1],
  ["1\" = 10'", 10], ["1\" = 20'", 20], ["1\" = 30'", 30], ["1\" = 40'", 40], ["1\" = 50'", 50], ["1\" = 100'", 100],
].map(([label, f]) => ({ label: label as string, feetPerPaperInch: f as number }));

export const presetFeetPerUnit = (feetPerPaperInch: number) => feetPerPaperInch / 72;

/**
 * Parse a typed real-world distance into feet. A bare number means feet.
 * Accepts: 20, 20.5, 20', 20 ft, 20'-6", 20' 6", 10' 6 1/2", 6", 240 in, 5 m, 1500 mm, 150 cm.
 */
export function parseDistance(text: string): number | null {
  const s = text.trim().toLowerCase().replace(/[“”″]/g, '"').replace(/[‘’′]/g, "'");
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) { const v = Number(s); return v > 0 ? v : null; }
  const re = /(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?\s*(feet|foot|ft|'|inches|inch|in|"|mm|cm|m)(?![a-z])/g;
  const toFeet: Record<string, number> = { feet: 1, foot: 1, ft: 1, "'": 1, inches: 1 / 12, inch: 1 / 12, in: 1 / 12, '"': 1 / 12, mm: 0.00328084, cm: 0.0328084, m: 3.28084 };
  let total = 0, used = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const frac = m[2] && m[3] && Number(m[3]) ? Number(m[2]) / Number(m[3]) : 0;
    total += (Number(m[1]) + frac) * toFeet[m[4]];
    used += m[0].length;
  }
  const leftovers = s.replace(re, "").replace(/[\s,\-]/g, "");
  return used > 0 && leftovers === "" && total > 0 ? total : null;
}
