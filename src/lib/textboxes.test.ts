import { describe, expect, it } from "vitest";
import { boxesInRect, findUrls, lineRects, parseLinkTarget, safeUrl, searchBoxes, textBoxes } from "./textboxes";

const VT = [1, 0, 0, -1, 0, 792]; // PDF y-up to page y-down
const item = (str: string, x: number, y: number, w: number, fs = 10) => ({ str, transform: [fs, 0, 0, fs, x, y], width: w });
describe("text boxes", () => {
  it("places boxes in page coordinates and skips blanks and rotated text", () => {
    const b = textBoxes([item("Hello", 100, 700, 30), item("  ", 0, 0, 5), { str: "up", transform: [0, 10, -10, 0, 50, 50], width: 20 }], VT);
    expect(b.length).toBe(1);
    expect(b[0].x).toBe(100); expect(b[0].w).toBe(30);
    expect(b[0].y).toBeCloseTo(92 - 8.2, 6); expect(b[0].h).toBeCloseTo(10.2, 6);
  });
  it("picks the boxes a drag touches", () => {
    const b = textBoxes([item("one", 100, 700, 30), item("two", 100, 650, 30)], VT);
    expect(boxesInRect(b, { x: 90, y: 80 }, { x: 140, y: 95 }).length).toBe(1);
    expect(boxesInRect(b, { x: 90, y: 80 }, { x: 140, y: 150 }).length).toBe(2);
    expect(boxesInRect(b, { x: 300, y: 300 }, { x: 310, y: 310 }).length).toBe(0);
  });
  it("merges boxes on one line and separates lines", () => {
    const b = textBoxes([item("alpha", 100, 700, 30), item("beta", 140, 700, 25), item("gamma", 100, 680, 35)], VT);
    const r = lineRects(b);
    expect(r.length).toBe(2); expect(r[0].x).toBe(100); expect(r[0].w).toBe(65); expect(r[1].w).toBe(35);
  });
  it("finds search matches inside a run", () => {
    const b = textBoxes([item("PANEL LP-1 SCHEDULE", 100, 700, 190)], VT);
    const r = searchBoxes(b, "lp-1");
    expect(r.length).toBe(1); expect(r[0].x).toBeCloseTo(100 + (190 * 6) / 19, 6); expect(r[0].w).toBeCloseTo((190 * 4) / 19, 6);
    expect(searchBoxes(b, "").length).toBe(0); expect(searchBoxes(b, "zzz").length).toBe(0);
  });
  it("finds printed web addresses", () => {
    const b = textBoxes([item("See www.example.com/specs, or https://a.b/c.", 100, 700, 200)], VT);
    const u = findUrls(b);
    expect(u.length).toBe(2); expect(u[0].url).toBe("https://www.example.com/specs"); expect(u[1].url).toBe("https://a.b/c");
  });
  it("only opens web addresses and page numbers", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull(); expect(safeUrl("file:///c:/x")).toBeNull();
    expect(safeUrl("https://x.com")).toBe("https://x.com"); expect(safeUrl("www.x.com")).toBe("https://www.x.com");
    expect(parseLinkTarget("5")).toEqual({ page: 5 }); expect(parseLinkTarget("Page 12")).toEqual({ page: 12 });
    expect(parseLinkTarget("https://x.com")).toEqual({ url: "https://x.com" }); expect(parseLinkTarget("nope")).toBeNull();
  });
});
