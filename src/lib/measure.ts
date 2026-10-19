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
