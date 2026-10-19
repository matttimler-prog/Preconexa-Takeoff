import { describe, expect, it } from "vitest";
import { constrainAngle, snapToPoints } from "./snap";
describe("snap", () => {
  it("constrains to 45 degree steps and keeps length", () => {
    const r = constrainAngle({ x: 0, y: 0 }, { x: 100, y: 8 });
    expect(r.x).toBeCloseTo(100.3, 0); expect(r.y).toBeCloseTo(0, 5);
    const d = constrainAngle({ x: 0, y: 0 }, { x: 50, y: 60 });
    expect(d.x).toBeCloseTo(d.y, 5);
    expect(constrainAngle({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
  });
  it("snaps to nearest point inside radius only", () => {
    const c = [{ x: 10, y: 10 }, { x: 30, y: 30 }];
    expect(snapToPoints({ x: 12, y: 11 }, c, 5)).toEqual({ x: 10, y: 10 });
    expect(snapToPoints({ x: 20, y: 20 }, c, 5)).toEqual({ x: 20, y: 20 });
  });
});
