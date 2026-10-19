import { describe, expect, it } from "vitest";
import { angleDeg, areaOf, arcPoints, arcSweep, circleFrom3, cloudPath, labelAnchor, outline, perimeterOf, textBox } from "./shapes";

const P = (x: number, y: number) => ({ x, y });
describe("shapes", () => {
  it("rect and ellipse area and perimeter are exact", () => {
    expect(areaOf("rect", [P(0, 0), P(10, 5)])).toBe(50);
    expect(perimeterOf("rect", [P(0, 0), P(10, 5)])).toBe(30);
    expect(areaOf("ellipse", [P(0, 0), P(10, 10)])).toBeCloseTo(Math.PI * 25, 6);
    expect(perimeterOf("ellipse", [P(0, 0), P(10, 10)])).toBeCloseTo(Math.PI * 10, 4);
  });
  it("polygons use the shoelace area and closed perimeter", () => {
    const sq = [P(0, 0), P(4, 0), P(4, 4), P(0, 4)];
    expect(areaOf("polygon", sq)).toBe(16); expect(perimeterOf("polygon", sq)).toBe(16);
    expect(areaOf("polyline", sq)).toBe(0);
  });
  it("circle through three points and arc length", () => {
    const k = circleFrom3(P(1, 0), P(0, 1), P(-1, 0))!;
    expect(k.r).toBeCloseTo(1, 9); expect(k.c.x).toBeCloseTo(0, 9);
    expect(circleFrom3(P(0, 0), P(1, 1), P(2, 2))).toBeNull();
    const s = arcSweep(P(1, 0), P(0, 1), P(-1, 0))!; expect(Math.abs(s.sweep)).toBeCloseTo(Math.PI, 9);
    expect(perimeterOf("arc", [P(1, 0), P(0, 1), P(-1, 0)])).toBeCloseTo(Math.PI, 6);
  });
  it("arc passes through its middle point and ends on its ends", () => {
    const pts = arcPoints(P(1, 0), P(0, 1), P(-1, 0), 40);
    expect(pts[0].x).toBeCloseTo(1, 9); expect(pts[40].x).toBeCloseTo(-1, 9);
    expect(Math.min(...pts.map((p) => Math.hypot(p.x, p.y - 1)))).toBeLessThan(0.05);
    // the long way round: via (0,-1) the arc goes through the bottom
    const low = arcPoints(P(1, 0), P(0, -1), P(-1, 0), 40);
    expect(Math.min(...low.map((p) => Math.hypot(p.x, p.y + 1)))).toBeLessThan(0.05);
  });
  it("circle and diameter shapes", () => {
    expect(areaOf("circle", [P(0, 0), P(3, 4)])).toBeCloseTo(Math.PI * 25, 6);
    expect(perimeterOf("diameter", [P(0, 0), P(10, 0)])).toBeCloseTo(Math.PI * 10, 6);
  });
  it("angle between three points", () => {
    expect(angleDeg(P(1, 0), P(0, 0), P(0, 1))).toBeCloseTo(90, 9);
    expect(angleDeg(P(1, 0), P(0, 0), P(-1, 0))).toBeCloseTo(180, 9);
    expect(angleDeg(P(0, 0), P(0, 0), P(1, 1))).toBe(0);
  });
  it("outline closes rects and passes polylines through", () => {
    expect(outline("rect", [P(0, 0), P(2, 2)])).toMatchObject({ closed: true });
    expect(outline("rect", [P(0, 0), P(2, 2)]).pts.length).toBe(4);
    expect(outline("polyline", [P(0, 0), P(2, 2)]).closed).toBe(false);
  });
  it("cloud path scallops each edge and is empty for fewer than 3 points", () => {
    const d = cloudPath([P(0, 0), P(100, 0), P(100, 50), P(0, 50)], 20);
    expect(d.startsWith("M0,0A")).toBe(true); expect(d.endsWith("Z")).toBe(true);
    expect((d.match(/A/g) ?? []).length).toBe(5 + 3 + 5 + 3);
    expect(cloudPath([P(0, 0), P(1, 1)])).toBe("");
  });
  it("label anchor sits on the longest segment and never reads upside down", () => {
    const a = labelAnchor("polyline", [P(0, 0), P(10, 0), P(10, 100)])!;
    expect(a.pt).toEqual(P(10, 50)); expect(a.angle).toBe(90);
    expect(labelAnchor("line", [P(0, 0), P(-10, 1)])!.angle).toBeLessThan(90.001);
    const b = labelAnchor("line", [P(10, 0), P(0, 0)])!; expect(b.angle).toBe(0);
    expect(labelAnchor("rect", [P(0, 0), P(10, 20)])!.pt).toEqual(P(5, 10));
    expect(labelAnchor("polyline", [])).toBeNull();
  });
  it("text boxes grow with text", () => {
    expect(textBox("hello world", P(0, 0), 10).w).toBeGreaterThan(textBox("hi", P(0, 0), 10).w);
    expect(textBox("a\nb", P(0, 0), 10).h).toBeGreaterThan(textBox("a", P(0, 0), 10).h);
  });
});
