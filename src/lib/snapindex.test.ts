import { describe, expect, it } from "vitest";
import { DEFAULT_SNAP, SnapIndex } from "./snapindex";
describe("snap index", () => {
  const idx = new SnapIndex([[0, 0, 100, 0], [100, 0, 100, 100]], [{ x: 50, y: 50 }]);
  it("snaps to an endpoint, preferring it over the edge", () => {
    const h = idx.query({ x: 98, y: 3 }, 10, DEFAULT_SNAP)!;
    expect(h.kind).toBe("end"); expect(h.pt).toEqual({ x: 100, y: 0 });
  });
  it("snaps to the edge in the middle of a wall", () => {
    const h = idx.query({ x: 30, y: 4 }, 10, DEFAULT_SNAP)!;
    expect(h.kind).toBe("edge"); expect(h.pt).toEqual({ x: 30, y: 0 });
  });
  it("snaps to midpoints and centers", () => {
    expect(idx.query({ x: 51, y: 2 }, 10, DEFAULT_SNAP)!.kind).toBe("mid");
    const c = idx.query({ x: 52, y: 49 }, 10, DEFAULT_SNAP)!; expect(c.kind).toBe("center"); expect(c.pt).toEqual({ x: 50, y: 50 });
  });
  it("respects radius and disabled kinds", () => {
    expect(idx.query({ x: 30, y: 40 }, 10, DEFAULT_SNAP)).toBeNull();
    expect(idx.query({ x: 30, y: 4 }, 10, { ...DEFAULT_SNAP, edge: false })).toBeNull();
    expect(idx.query({ x: 98, y: 3 }, 10, { ...DEFAULT_SNAP, end: false, mid: false })!.kind).toBe("edge");
  });
  it("finds long diagonals across many cells", () => {
    const d = new SnapIndex([[0, 0, 1000, 1000]], []);
    const h = d.query({ x: 503, y: 497 }, 8, DEFAULT_SNAP)!;
    expect(h.pt.x).toBeCloseTo(500, 6); expect(h.pt.y).toBeCloseTo(500, 6);
  });
});
