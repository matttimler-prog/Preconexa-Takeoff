import { describe, expect, it } from "vitest";
import { legendRows, legendSize } from "./legend";
import type { Takeoff } from "./takeoff";
const t: Takeoff = { layers: [{ id: "l1", name: "L", color: "#111111", visible: true }], feetPerUnit: {}, measurements: [
  { id: "a", layerId: "l1", kind: "count", page: 1, label: "Duplex", pts: [{ x: 0, y: 0 }] },
  { id: "b", layerId: "l1", kind: "count", page: 2, label: "duplex", pts: [{ x: 0, y: 0 }] },
  { id: "c", layerId: "l1", kind: "count", page: 1, label: "Switch", pts: [{ x: 0, y: 0 }], color: "#222222" },
  { id: "d", layerId: "l1", kind: "length", page: 1, label: "Wire", pts: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }] };
describe("legend", () => {
  it("totals counts by name across pages, ignores other kinds", () => {
    const r = legendRows(t);
    expect(r.map((x) => `${x.label}:${x.total}`)).toEqual(["Duplex:2", "Switch:1"]);
    expect(r[1].color).toBe("#222222");
  });
  it("sizes the box from its rows", () => {
    const s = legendSize(legendRows(t), 10);
    expect(s.h).toBeGreaterThan(40); expect(s.w).toBeGreaterThan(60);
  });
});
