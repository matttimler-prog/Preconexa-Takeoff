import { describe, expect, it } from "vitest";
import { toPreconexaJson } from "./exportjson";
import type { Takeoff } from "./takeoff";

const t: Takeoff = {
  layers: [{ id: "L", name: "Power", color: "#f00", visible: true }],
  feetPerUnit: { 1: 1 / 12 }, // 72 page units = 6 ft
  costs: { "2\" emt": 3.5 },
  measurements: [
    { id: "a", layerId: "L", kind: "length", page: 1, label: "2\" EMT", pts: [{ x: 0, y: 0 }, { x: 72, y: 0 }] },
    { id: "b", layerId: "L", kind: "length", page: 1, label: "2\" EMT", pts: [{ x: 0, y: 10 }, { x: 72, y: 10 }] },
    { id: "c", layerId: "L", kind: "count", page: 2, label: "Duplex", pts: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] },
    { id: "d", layerId: "L", kind: "length", page: 2, label: "MC", pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    { id: "n", layerId: "L", kind: "markup", page: 1, label: "note", pts: [{ x: 0, y: 0 }] },
  ],
};

describe("preconexa export", () => {
  const j = toPreconexaJson(t, "Test job", new Date("2026-10-27T12:00:00Z"));
  it("has the schema, project and time", () => {
    expect(j.schema).toBe("preconexa-takeoff/1"); expect(j.project).toBe("Test job"); expect(j.exportedAt).toBe("2026-10-27T12:00:00.000Z");
  });
  it("leaves plain markups out", () => { expect(j.items.length).toBe(4); });
  it("totals and prices by label", () => {
    const emt = j.summary.find((r) => r.label === "2\" EMT")!;
    expect(emt.items).toBe(2); expect(emt.quantity).toBeCloseTo(12, 5); expect(emt.unitCost).toBe(3.5);
    expect(emt.extendedCost).toBeCloseTo(42, 5);
  });
  it("counts need no scale", () => { expect(j.summary.find((r) => r.label === "Duplex")!.quantity).toBe(3); });
  it("reports uncalibrated pages instead of guessing", () => {
    expect(j.summary.find((r) => r.label === "MC")!.quantity).toBeNull();
    expect(j.warnings.join(" ")).toContain("Page(s) 2");
    expect(j.pages.find((p) => p.page === 2)!.feetPerUnit).toBeNull();
  });
});
