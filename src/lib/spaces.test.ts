import { describe, expect, it } from "vitest";
import { spaceReport, spacesCsv } from "./spaces";
import type { Measurement, Takeoff } from "./takeoff";
const P = (x: number, y: number) => ({ x, y });
const m = (o: Partial<Measurement>): Measurement => ({ id: Math.random().toString(36), layerId: "l1", kind: "count", page: 1, label: "x", pts: [P(0, 0)], ...o });
const room = (label: string, x0: number, y0: number, x1: number, y1: number): Measurement => m({ kind: "area", shape: "rect", label, isSpace: true, pts: [P(x0, y0), P(x1, y1)] });
const take = (ms: Measurement[]): Takeoff => ({ layers: [{ id: "l1", name: "L", color: "#000", visible: true }], measurements: ms, feetPerUnit: { 1: 1 / 72 } });
describe("spaceReport", () => {
  it("groups counts and lengths by the room that contains them", () => {
    const t = take([room("Kitchen", 0, 0, 100, 100), room("Hall", 100, 0, 200, 100),
      m({ label: "Duplex", pts: [P(10, 10)] }), m({ label: "Duplex", pts: [P(20, 20)] }), m({ label: "Duplex", pts: [P(150, 50)] }),
      m({ kind: "length", shape: "line", label: "Wire", pts: [P(110, 10), P(190, 10)] }), m({ label: "Outside", pts: [P(500, 500)] })]);
    const r = spaceReport(t);
    expect(r.find((x) => x.space === "Kitchen" && x.label === "Duplex")?.qty).toBe(2);
    expect(r.find((x) => x.space === "Hall" && x.label === "Duplex")?.qty).toBe(1);
    expect(r.find((x) => x.space === "Hall" && x.label === "Wire")?.qty).toBeCloseTo(80 / 72, 5);
    expect(r.some((x) => x.label === "Outside")).toBe(false);
  });
  it("the smallest containing space wins and other pages are ignored", () => {
    const t = take([room("Floor", 0, 0, 400, 400), room("Closet", 10, 10, 60, 60), m({ label: "Light", pts: [P(30, 30)] }), m({ label: "Light", page: 2, pts: [P(30, 30)] })]);
    const r = spaceReport(t);
    expect(r.length).toBe(1); expect(r[0].space).toBe("Closet");
  });
  it("writes a csv", () => {
    const t = take([room("Kitchen", 0, 0, 100, 100), m({ label: 'Say "hi"', pts: [P(5, 5)] })]);
    expect(spacesCsv(t)).toContain('"Kitchen",1,count,"Say ""hi""",1,1.00,EA');
  });
});
