import { describe, expect, it } from "vitest";
import { applyM, extractGeometry, mulM } from "./pdfgeom";
const OPS = { save: 10, restore: 11, transform: 12, moveTo: 13, lineTo: 14, curveTo: 15, curveTo2: 16, curveTo3: 17, closePath: 18, rectangle: 19, stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27, endPath: 28, clip: 29, constructPath: 91, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75 };
const V = [1, 0, 0, -1, 0, 792]; // PDF y-up -> page y-down
describe("pdf geometry", () => {
  it("matrix helpers", () => {
    expect(applyM(V, 10, 20)).toEqual({ x: 10, y: 772 });
    expect(applyM(mulM(V, [2, 0, 0, 2, 10, 10]), 5, 5)).toEqual({ x: 20, y: 772 });
  });
  it("old layout: stroked line and rectangle, clip path ignored", () => {
    const list = { fnArray: [OPS.constructPath, OPS.stroke, OPS.constructPath, OPS.clip, OPS.endPath, OPS.constructPath, OPS.fill],
      argsArray: [[[OPS.moveTo, OPS.lineTo], [0, 0, 100, 0]], null, [[OPS.rectangle], [0, 0, 612, 792]], null, null, [[OPS.rectangle], [10, 10, 20, 20]], null] };
    const g = extractGeometry(list, OPS, V);
    expect(g.segs.length).toBe(5); // 1 line + 4 rect edges; the clip rectangle was dropped
    expect(g.segs[0]).toEqual([0, 792, 100, 792]);
    expect(g.centers).toEqual([{ x: 20, y: 772 }]);
  });
  it("new layout: path data with the paint op inside constructPath", () => {
    const data = [0, 0, 0, 1, 50, 0, 1, 50, 50, 4];
    const list = { fnArray: [OPS.constructPath], argsArray: [[OPS.stroke, [data], null]] };
    const g = extractGeometry(list, OPS, V);
    expect(g.segs.length).toBe(3);
  });
  it("applies save/transform/restore and form xobject matrices", () => {
    const list = { fnArray: [OPS.save, OPS.transform, OPS.constructPath, OPS.stroke, OPS.restore, OPS.paintFormXObjectBegin, OPS.constructPath, OPS.stroke, OPS.paintFormXObjectEnd, OPS.constructPath, OPS.stroke],
      argsArray: [null, [2, 0, 0, 2, 0, 0], [[OPS.moveTo, OPS.lineTo], [0, 0, 10, 0]], null, null, [[1, 0, 0, 1, 100, 0], null], [[OPS.moveTo, OPS.lineTo], [0, 0, 10, 0]], null, null, [[OPS.moveTo, OPS.lineTo], [0, 0, 10, 0]], null] };
    const g = extractGeometry(list, OPS, V);
    expect(g.segs[0]).toEqual([0, 792, 20, 792]); expect(g.segs[1]).toEqual([100, 792, 110, 792]); expect(g.segs[2]).toEqual([0, 792, 10, 792]);
  });
  it("finds the center of a closed four-curve circle", () => {
    const c = (x: number, y: number) => [x, y, x, y, x, y];
    const list = { fnArray: [OPS.constructPath, OPS.stroke], argsArray: [[[OPS.moveTo, OPS.curveTo, OPS.curveTo, OPS.curveTo, OPS.curveTo, OPS.closePath], [10, 0, ...c(20, 10), ...c(10, 20), ...c(0, 10), ...c(10, 0)]], null] };
    const g = extractGeometry(list, OPS, [1, 0, 0, 1, 0, 0]);
    expect(g.centers.length).toBe(1); expect(g.centers[0].x).toBeCloseTo(10, 6); expect(g.centers[0].y).toBeCloseTo(10, 6);
  });
});
