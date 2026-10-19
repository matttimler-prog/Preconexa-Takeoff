import { describe, expect, it } from "vitest";
import { findMatches } from "./automatch";
import type { Raster } from "./rasterfill";

const blank = (w: number, h: number): Raster => ({ w, h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
const dot = (r: Raster, x: number, y: number, v = 0) => { if (x < 0 || y < 0 || x >= r.w || y >= r.h) return; const i = (y * r.w + x) * 4; r.data[i] = r.data[i + 1] = r.data[i + 2] = v; };
const line = (r: Raster, x0: number, y0: number, x1: number, y1: number) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) dot(r, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n)); };
const ring = (r: Raster, cx: number, cy: number, rad: number) => { for (let a = 0; a < 360; a += 2) dot(r, Math.round(cx + rad * Math.cos((a * Math.PI) / 180)), Math.round(cy + rad * Math.sin((a * Math.PI) / 180))); };
/** circle with a cross */
const glyph = (r: Raster, cx: number, cy: number) => { ring(r, cx, cy, 8); line(r, cx - 8, cy, cx + 8, cy); line(r, cx, cy - 8, cx, cy + 8); };
const box = (r: Raster, cx: number, cy: number) => { line(r, cx - 8, cy - 8, cx + 8, cy - 8); line(r, cx + 8, cy - 8, cx + 8, cy + 8); line(r, cx + 8, cy + 8, cx - 8, cy + 8); line(r, cx - 8, cy + 8, cx - 8, cy - 8); line(r, cx - 8, cy - 8, cx + 8, cy + 8); };
/** asymmetric L-with-tick */
const ell = (r: Raster, cx: number, cy: number) => { line(r, cx - 8, cy - 8, cx - 8, cy + 8); line(r, cx - 8, cy + 8, cx + 8, cy + 8); line(r, cx - 8, cy - 8, cx - 2, cy - 8); };

describe("findMatches", () => {
  const at = [[40, 40], [120, 70], [200, 150], [60, 160], [260, 40]];
  it("finds every copy of the sample and ignores a different symbol", () => {
    const r = blank(320, 200);
    for (const [x, y] of at) glyph(r, x, y);
    box(r, 160, 110); line(r, 0, 100, 320, 100);
    const ms = findMatches(r, { x: 30, y: 30, w: 20, h: 20 }, { threshold: 0.7 });
    expect(ms.length).toBe(5);
    for (const [x, y] of at) expect(ms.some((m) => Math.abs(m.x + m.w / 2 - x) <= 2 && Math.abs(m.y + m.h / 2 - y) <= 2)).toBe(true);
  });
  it("still finds a copy that has a wall line running into it", () => {
    const r = blank(320, 200);
    glyph(r, 40, 40); glyph(r, 200, 120); line(r, 208, 120, 320, 120);
    const ms = findMatches(r, { x: 30, y: 30, w: 20, h: 20 }, { threshold: 0.65 });
    expect(ms.length).toBe(2);
  });
  it("finds rotated copies only when rotations are on", () => {
    const r = blank(200, 120); ell(r, 40, 40);
    // a 90 degree clockwise copy: (x,y) -> (-y,x)
    line(r, 100 + 8, 60 - 8, 100 - 8, 60 - 8); line(r, 100 - 8, 60 - 8, 100 - 8, 60 + 8); line(r, 100 + 8, 60 - 8, 100 + 8, 60 - 2);
    const off = findMatches(r, { x: 30, y: 30, w: 20, h: 20 }, { threshold: 0.7 });
    const on = findMatches(r, { x: 30, y: 30, w: 20, h: 20 }, { threshold: 0.7, rotations: true });
    expect(off.length).toBe(1);
    expect(on.length).toBe(2);
  });
  it("returns nothing for a blank sample", () => {
    const r = blank(100, 100); glyph(r, 50, 50);
    expect(findMatches(r, { x: 0, y: 0, w: 20, h: 20 }).length).toBe(0);
  });
});
