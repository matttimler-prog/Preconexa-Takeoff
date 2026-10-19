import { describe, expect, it } from "vitest";
import { detectScales, parseScaleText, sheetInfo } from "./scaledetect";
describe("scale text", () => {
  it("parses typed scales", () => {
    expect(parseScaleText(`1/8" = 1'-0"`)).toBe(8);
    expect(parseScaleText(`1/8=1'`)).toBe(8);
    expect(parseScaleText(`3/32 in = 1 ft`)).toBeCloseTo(32 / 3, 6);
    expect(parseScaleText(`1" = 20'`)).toBe(20);
    expect(parseScaleText(`SCALE: 1/4" = 1'-0"`)).toBe(4);
    expect(parseScaleText(`1 1/2" = 1'-0"`)).toBeCloseTo(2 / 3, 6);
    expect(parseScaleText("1:48")).toBe(4);
    expect(parseScaleText("1:100")).toBeCloseTo(100 / 12, 6);
    expect(parseScaleText("nonsense")).toBeNull();
    expect(parseScaleText("")).toBeNull();
  });
});
describe("scale detection", () => {
  it("finds a scale split across text items", () => {
    const r = detectScales(["FLOOR PLAN", "SCALE:", `1/8"`, "=", `1'-0"`]);
    expect(r.candidates.length).toBe(1); expect(r.candidates[0].feetPerPaperInch).toBe(8); expect(r.candidates[0].count).toBe(1);
  });
  it("counts repeats and lists several distinct scales", () => {
    const r = detectScales([`1/8" = 1'-0"`, "PLAN", `1/4" = 1'-0"`, "DETAIL", `1/4" = 1'-0"`, "DETAIL 2", `3" = 1'-0"`]);
    expect(r.candidates.map((c) => c.feetPerPaperInch)).toEqual([4, 1 / 3, 8]);
    expect(r.candidates[0].count).toBe(2);
  });
  it("reads curly quotes and engineering scales and ratios", () => {
    expect(detectScales([`SCALE: 1″ = 20′`]).candidates[0].feetPerPaperInch).toBe(20);
    expect(detectScales(["SCALE: 1:48"]).candidates[0].feetPerPaperInch).toBe(4);
  });
  it("ignores time-like text and flags not-to-scale", () => {
    expect(detectScales(["Meeting 1:30 PM", "A = 5 units"]).candidates.length).toBe(0);
    expect(detectScales(["DETAIL - NOT TO SCALE"]).nts).toBe(true);
  });
  it("identifies sheet sizes and reduced prints", () => {
    expect(sheetInfo(36 * 72, 24 * 72)).toMatchObject({ label: "ARCH D 24 × 36", trusted: true });
    expect(sheetInfo(11 * 72, 17 * 72)).toMatchObject({ label: "Tabloid 11 × 17", trusted: false });
  });
});
