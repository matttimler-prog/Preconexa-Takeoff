import { describe, expect, it } from "vitest";
import { dilate, floodFill, regionPolygon, simplify, traceContour, wallMask } from "./rasterfill";
import type { Raster } from "./rasterfill";

const white = (w: number, h: number): Raster => ({ w, h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
const rect = (img: Raster, x: number, y: number, w: number, h: number, v = 0) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { const k = (j * img.w + i) * 4; img.data[k] = v; img.data[k + 1] = v; img.data[k + 2] = v; img.data[k + 3] = 255; }
};
/** Outer 40..160 x 30..120, wall 3px thick => inner x 43..157, y 33..117 (115 x 85 = 9775 px). */
const room = (): Raster => {
  const im = white(200, 150);
  rect(im, 40, 30, 121, 3); rect(im, 40, 118, 121, 3); rect(im, 40, 30, 3, 91); rect(im, 158, 30, 3, 91);
  return im;
};
const bbox = (pts: { x: number; y: number }[]) => ({ x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) });

describe("raster fill primitives", () => {
  it("wallMask marks dark and coloured ink, not paper or transparent pixels", () => {
    const im = white(4, 1);
    rect(im, 0, 0, 1, 1, 0); rect(im, 1, 0, 1, 1, 200);
    im.data[8] = 230; im.data[9] = 30; im.data[10] = 30; // red ink at pixel 2
    im.data[15] = 0; // pixel 3 transparent
    expect(Array.from(wallMask(im))).toEqual([1, 0, 1, 0]);
  });
  it("dilate grows a pixel into a (2r+1) square and stays inside the image", () => {
    const m = new Uint8Array(7 * 7); m[3 * 7 + 3] = 1;
    const d = dilate(m, 7, 7, 2);
    expect(d.reduce((a, b) => a + b, 0)).toBe(25);
    expect(d[1 * 7 + 1]).toBe(1); expect(d[0]).toBe(0);
    const edge = new Uint8Array(5 * 5); edge[0] = 1;
    expect(dilate(edge, 5, 5, 1).reduce((a, b) => a + b, 0)).toBe(4);
  });
  it("floodFill is 4-connected, stops at walls, reports border contact", () => {
    const w = 6, h = 6, blocked = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) blocked[y * w + 3] = 1; // full vertical wall
    const f = floodFill(blocked, w, h, 0, 0)!;
    expect(f.count).toBe(18); expect(f.touchesBorder).toBe(true); expect(f.mask[0 * w + 4]).toBe(0);
    expect(floodFill(blocked, w, h, 3, 2)).toBeNull();
    expect(floodFill(blocked, w, h, -1, 0)).toBeNull();
    const diag = new Uint8Array(9); diag[1] = 1; diag[3] = 1; // pixel 0 is walled in from 4-neighbours
    expect(floodFill(diag, 3, 3, 0, 0)!.count).toBe(1);
  });
  it("traceContour returns the four corners of a rectangle", () => {
    const w = 8, h = 6, m = new Uint8Array(w * h);
    for (let y = 1; y < 3; y++) for (let x = 2; x < 5; x++) m[y * w + x] = 1;
    expect(traceContour(m, w, h)).toEqual([{ x: 2, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 3 }, { x: 2, y: 3 }]);
    expect(traceContour(new Uint8Array(4), 2, 2)).toEqual([]);
  });
  it("traceContour follows an L shape", () => {
    const w = 6, h = 6, m = new Uint8Array(w * h);
    for (let x = 1; x < 4; x++) m[1 * w + x] = 1;
    m[2 * w + 1] = 1;
    expect(traceContour(m, w, h).length).toBe(6);
  });
  it("simplify drops collinear points and keeps the corners", () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 10, y: 10 }, { x: 5, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 5 }];
    const s = simplify(pts, 0.5);
    expect(s.length).toBe(4);
    const b = bbox(s); expect(b.x0).toBe(0); expect(b.x1).toBe(10); expect(b.y0).toBe(0); expect(b.y1).toBe(10);
    expect(simplify([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }], 1).length).toBe(3);
  });
});

describe("regionPolygon", () => {
  it("outlines a closed room on the inner edge of its walls", () => {
    const r = regionPolygon(room(), 100, 75)!;
    expect(r).toBeTruthy();
    expect(r.touchesBorder).toBe(false);
    const b = bbox(r.pts);
    expect(Math.abs(b.x0 - 43)).toBeLessThan(3); expect(Math.abs(b.x1 - 158)).toBeLessThan(3);
    expect(Math.abs(b.y0 - 33)).toBeLessThan(3); expect(Math.abs(b.y1 - 118)).toBeLessThan(3);
    expect(Math.abs(r.areaPx - 9775)).toBeLessThan(60);
    expect(r.pts.length).toBe(4);
  });
  it("a 2px door gap still closes with the default gap of 3", () => {
    const im = room(); rect(im, 40, 70, 3, 2, 255);
    const r = regionPolygon(im, 100, 75)!;
    expect(r.touchesBorder).toBe(false);
    const b = bbox(r.pts);
    expect(Math.abs(b.x0 - 43)).toBeLessThan(4); expect(Math.abs(b.x1 - 158)).toBeLessThan(3);
  });
  it("a 12px opening leaks out of the room", () => {
    const im = room(); rect(im, 40, 60, 3, 12, 255);
    expect(regionPolygon(im, 100, 75)!.touchesBorder).toBe(true);
  });
  it("a click on the wall snaps to the nearby room interior; far or out-of-range clicks return null", () => {
    const r = regionPolygon(room(), 42, 50)!;
    expect(r).toBeTruthy(); expect(r.touchesBorder).toBe(false);
    expect(Math.abs(bbox(r.pts).x0 - 43)).toBeLessThan(3);
    expect(regionPolygon(room(), -1, 5)).toBeNull();
    expect(regionPolygon(room(), 100, 400)).toBeNull();
    const solid = white(40, 40); rect(solid, 0, 0, 40, 40);
    expect(regionPolygon(solid, 20, 20)).toBeNull();
  });
  it("an interior column is an island: the outer outline ignores it and its pixels are not counted", () => {
    const im = room(); rect(im, 90, 60, 10, 10);
    const r = regionPolygon(im, 60, 50)!;
    expect(r.touchesBorder).toBe(false);
    const b = bbox(r.pts);
    expect(Math.abs(b.x0 - 43)).toBeLessThan(3); expect(Math.abs(b.x1 - 158)).toBeLessThan(3);
    expect(Math.abs(r.areaPx - (9775 - 100))).toBeLessThan(80);
  });
  it("fills a 3000 x 2400 sheet quickly", () => {
    const im = white(3000, 2400);
    rect(im, 200, 200, 2601, 6); rect(im, 200, 2194, 2601, 6); rect(im, 200, 200, 6, 2000); rect(im, 2795, 200, 6, 2000);
    const t0 = Date.now();
    const r = regionPolygon(im, 1500, 1200)!;
    const ms = Date.now() - t0;
    expect(r.touchesBorder).toBe(false);
    expect(Math.abs(r.areaPx - 2589 * 1988)).toBeLessThan(2000);
    expect(ms).toBeLessThan(2500);
  });
});
