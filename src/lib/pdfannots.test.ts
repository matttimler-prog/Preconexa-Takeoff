import { describe, expect, it } from "vitest";
import { annotationsToMarkups, colorOf, importSummary, pointsOf, quadsOf } from "./pdfannots";
import type { RawAnnot } from "./pdfannots";

// A 100x200 page, PDF y-up: y' = 200 - y
const toPage = (x: number, y: number) => ({ x, y: 200 - y });
let n = 0;
const base = { page: 2, layerId: "L1", toPage, newId: () => `m${++n}` };

describe("pdf annotation import", () => {
  it("reads colors from bytes or fractions", () => {
    expect(colorOf([255, 0, 0])).toBe("#ff0000");
    expect(colorOf([0, 0.5, 1])).toBe("#0080ff");
    expect(colorOf(null)).toBe("#ef4444");
  });
  it("reads points from objects and flat lists", () => {
    expect(pointsOf([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    expect(pointsOf([1, 2, 3, 4])).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    expect(quadsOf([[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]]).length).toBe(1);
  });
  it("flips the page y axis and keeps the page and layer", () => {
    const a: RawAnnot = { subtype: "Square", rect: [10, 20, 50, 60], color: [255, 0, 0] };
    const r = annotationsToMarkups([a], base);
    expect(r.items.length).toBe(1);
    const m = r.items[0];
    expect(m.shape).toBe("rect"); expect(m.page).toBe(2); expect(m.layerId).toBe("L1");
    expect(m.pts).toEqual([{ x: 10, y: 140 }, { x: 50, y: 180 }]);
    expect(m.color).toBe("#ff0000");
  });
  it("turns a polyline with a footage label into a length measurement and keeps the original text", () => {
    const a: RawAnnot = { subtype: "PolyLine", vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }], contents: "12' 6\"" };
    const m = annotationsToMarkups([a], base).items[0];
    expect(m.kind).toBe("length"); expect(m.shape).toBe("polyline");
    expect(m.comment).toContain("12' 6");
  });
  it("keeps a plain polygon as a markup", () => {
    const a: RawAnnot = { subtype: "Polygon", vertices: [0, 0, 10, 0, 10, 10], contents: "cloud around this" };
    const m = annotationsToMarkups([a], base).items[0];
    expect(m.kind).toBe("markup"); expect(m.shape).toBe("polygon");
  });
  it("area text on a polygon becomes an area measurement unless turned off", () => {
    const a: RawAnnot = { subtype: "Polygon", vertices: [0, 0, 10, 0, 10, 10], contents: "340 sf" };
    expect(annotationsToMarkups([a], base).items[0].kind).toBe("area");
    expect(annotationsToMarkups([a], { ...base, asMeasurements: false }).items[0].kind).toBe("markup");
  });
  it("makes one highlight per quad", () => {
    const q = (x: number) => [{ x, y: 10 }, { x: x + 5, y: 10 }, { x, y: 0 }, { x: x + 5, y: 0 }];
    const a: RawAnnot = { subtype: "Highlight", quadPoints: [...q(0), ...q(20)] };
    const r = annotationsToMarkups([a], base);
    expect(r.items.length).toBe(2);
    expect(r.items[0].shape).toBe("highlight");
  });
  it("imports text boxes and notes with their text", () => {
    const r = annotationsToMarkups([{ subtype: "FreeText", rect: [5, 5, 40, 20], contents: "RELOCATE PANEL" }, { subtype: "Text", rect: [1, 1, 5, 5], contents: "ask GC" }], base);
    expect(r.items[0].text).toBe("RELOCATE PANEL"); expect(r.items[0].shape).toBe("text");
    expect(r.items[1].shape).toBe("note");
  });
  it("downsamples very long pen strokes and skips empty ones", () => {
    const long = Array.from({ length: 2000 }, (_, i) => ({ x: i, y: i }));
    const r = annotationsToMarkups([{ subtype: "Ink", inkLists: [long, []] }], base);
    expect(r.items.length).toBe(1);
    expect(r.items[0].pts.length).toBeLessThan(700);
  });
  it("flags slanted lines because their direction can't be read", () => {
    const r = annotationsToMarkups([{ subtype: "Line", lineCoordinates: [0, 0, 30, 40] }, { subtype: "Line", lineCoordinates: [0, 0, 30, 0] }], base);
    expect(r.items[0].comment).toContain("mirrored");
    expect(r.items[1].comment === undefined).toBe(true);
  });
  it("counts what it can't import and writes an honest summary", () => {
    const r = annotationsToMarkups([{ subtype: "Stamp" }, { subtype: "Stamp" }, { subtype: "Link" }, { subtype: "Square", rect: [0, 0, 5, 5] }, { subtype: "Square", hidden: true, rect: [0, 0, 5, 5] }], base);
    expect(r.items.length).toBe(1);
    expect(r.skipped["Stamp"]).toBe(2);
    expect(importSummary(r)).toContain("2 Stamp");
    expect(importSummary({ items: [], skipped: {} })).toContain("No markups");
  });
});
