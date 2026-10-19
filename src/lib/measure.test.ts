import { describe, expect, it } from "vitest";
import { calibrate, dist, fmtFeetInches, parseArchScale, polygonArea, polylineLength, toFeet, toSqFeet } from "./measure";

describe("measure", () => {
  it("distance and polyline length", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }])).toBe(11);
    expect(polylineLength([{ x: 1, y: 1 }])).toBe(0);
  });
  it("polygon area, either winding", () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(polygonArea(sq)).toBe(100);
    expect(polygonArea([...sq].reverse())).toBe(100);
    expect(polygonArea(sq.slice(0, 2))).toBe(0);
  });
  it("calibration from two points", () => {
    const k = calibrate({ x: 0, y: 0 }, { x: 144, y: 0 }, 16);
    expect(toFeet(144, k)).toBeCloseTo(16);
    expect(toSqFeet(144 * 144, k)).toBeCloseTo(256);
    expect(() => calibrate({ x: 1, y: 1 }, { x: 1, y: 1 }, 5)).toThrow();
    expect(() => calibrate({ x: 0, y: 0 }, { x: 1, y: 1 }, 0)).toThrow();
  });
  it("parses printed architectural scales", () => {
    // 1/8" = 1'-0": 9 page units (1/8 in) = 1 ft
    expect(parseArchScale(`1/8" = 1'-0"`)).toBeCloseTo(1 / 9);
    expect(parseArchScale(`1/4"=1'`)).toBeCloseTo(1 / 18);
    expect(parseArchScale(`1"=20'`)).toBeCloseTo(20 / 72);
    expect(parseArchScale("nonsense")).toBeNull();
  });
  it("formats feet-inches", () => {
    expect(fmtFeetInches(10.5)).toBe(`10'-6"`);
    expect(fmtFeetInches(0.999)).toBe(`1'-0"`);
  });
});

import { parseDistance } from "./measure";
describe("parseDistance", () => {
  it("reads the ways people actually type a length", () => {
    expect(parseDistance("20")).toBe(20);
    expect(parseDistance("20.5")).toBe(20.5);
    expect(parseDistance("20'")).toBe(20);
    expect(parseDistance("20 ft")).toBe(20);
    expect(parseDistance(`20'-6"`)).toBeCloseTo(20.5, 6);
    expect(parseDistance(`20' 6"`)).toBeCloseTo(20.5, 6);
    expect(parseDistance(`6"`)).toBeCloseTo(0.5, 6);
    expect(parseDistance("240 in")).toBeCloseTo(20, 6);
    expect(parseDistance(`10' 6 1/2"`)).toBeCloseTo(10 + 6.5 / 12, 6);
    expect(parseDistance("5 m")).toBeCloseTo(16.4042, 3);
    expect(parseDistance("1500mm")).toBeCloseTo(4.92126, 4);
    expect(parseDistance("150 cm")).toBeCloseTo(4.92126, 4);
    expect(parseDistance("  12 FT ")).toBe(12);
  });
  it("rejects nonsense, zero and negatives", () => {
    expect(parseDistance("")).toBeNull();
    expect(parseDistance("abc")).toBeNull();
    expect(parseDistance("0")).toBeNull();
    expect(parseDistance("-5")).toBeNull();
    expect(parseDistance("20 apples")).toBeNull();
  });
});
