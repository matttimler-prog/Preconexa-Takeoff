import { describe, expect, it } from "vitest";
import { centroid, insertPoint, nearestOnSegment, removePoint, translate } from "./geom";
describe("geom", () => {
  it("nearest point on a segment clamps to the ends", () => {
    const r = nearestOnSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(r.pt).toEqual({ x: 5, y: 0 }); expect(r.d).toBe(3);
    expect(nearestOnSegment({ x: -4, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }).pt).toEqual({ x: 0, y: 0 });
  });
  it("inserts a point on the nearest segment, including the closing edge of a polygon", () => {
    const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(insertPoint(line, { x: 10, y: 6 }, false)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 10, y: 10 }]);
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const r = insertPoint(sq, { x: -1, y: 5 }, true);
    expect(r.length).toBe(5); expect(r[4]).toEqual({ x: 0, y: 5 });
  });
  it("removes a point only above the minimum", () => {
    const l = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }];
    expect(removePoint(l, 1, 2)!.length).toBe(2); expect(removePoint(l.slice(0, 2), 0, 2)).toBeNull();
  });
  it("translates and finds centroids", () => {
    expect(translate([{ x: 1, y: 1 }], 2, -1)).toEqual([{ x: 3, y: 0 }]);
    expect(centroid([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toEqual({ x: 5, y: 5 });
  });
});
