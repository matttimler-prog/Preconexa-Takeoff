import { describe, expect, it } from "vitest";
import { deleteLayer, quantity, toCsv, Takeoff } from "./takeoff";

const t: Takeoff = {
  layers: [{ id: "a", name: "Power", color: "#f00", visible: true }, { id: "b", name: "Lights", color: "#0f0", visible: true }],
  feetPerUnit: { 1: 1 / 9 },
  measurements: [
    { id: "1", layerId: "a", kind: "length", page: 1, label: "Feeder", pts: [{ x: 0, y: 0 }, { x: 90, y: 0 }] },
    { id: "2", layerId: "b", kind: "count", page: 1, label: "2x4", pts: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] },
    { id: "3", layerId: "a", kind: "length", page: 2, label: "Uncal", pts: [{ x: 0, y: 0 }, { x: 5, y: 0 }] },
  ],
};
describe("takeoff", () => {
  it("quantities", () => {
    expect(quantity(t.measurements[0], t.feetPerUnit[1])).toBeCloseTo(10);
    expect(quantity(t.measurements[1], undefined)).toBe(3);
    expect(quantity(t.measurements[2], t.feetPerUnit[2])).toBeNull();
  });
  it("csv flags uncalibrated pages", () => { expect(toCsv(t)).toContain("UNCALIBRATED"); });
  it("deleting a layer removes only its measurements", () => {
    const r = deleteLayer(t, "a");
    expect(r.layers.map((l) => l.id)).toEqual(["b"]);
    expect(r.measurements.map((m) => m.id)).toEqual(["2"]);
  });
});
