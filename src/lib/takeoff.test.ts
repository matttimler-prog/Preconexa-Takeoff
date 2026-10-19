import { describe, expect, it } from "vitest";
import { deleteLayer, measureLabel, quantity, scaleFor, toCsv } from "./takeoff";
import type { Measurement, Takeoff } from "./takeoff";

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

import { ensureLayer, setScale, summarize } from "./takeoff";
describe("summaries and scale", () => {
  it("subtotals by layer+label and propagates uncalibrated", () => {
    const m = (id: string, label: string, page: number, pts: { x: number; y: number }[], kind: "length" | "count" = "length") =>
      ({ id, layerId: "a", kind, page, label, pts });
    const t2: Takeoff = { layers: [{ id: "a", name: "Power", color: "#000", visible: true }], feetPerUnit: { 1: 1 },
      measurements: [m("1", "EMT", 1, [{ x: 0, y: 0 }, { x: 10, y: 0 }]), m("2", "EMT", 1, [{ x: 0, y: 0 }, { x: 5, y: 0 }]), m("3", "EMT", 2, [{ x: 0, y: 0 }, { x: 5, y: 0 }]), m("4", "Rec", 2, [{ x: 1, y: 1 }], "count")] };
    const s = summarize(t2);
    expect(s.find((r) => r.label === "EMT")).toMatchObject({ items: 3, qty: null, unit: "LF" });
    expect(s.find((r) => r.label === "Rec")).toMatchObject({ items: 1, qty: 1, unit: "EA" });
    const t3 = setScale(t2, [2], 1);
    expect(summarize(t3).find((r) => r.label === "EMT")!.qty).toBeCloseTo(20);
  });
  it("ensureLayer reuses by name and adds when missing", () => {
    const base: Takeoff = { layers: [{ id: "a", name: "Power", color: "#000", visible: true }], measurements: [], feetPerUnit: {} };
    expect(ensureLayer(base, "power", "#fff").layerId).toBe("a");
    const r = ensureLayer(base, "Lighting", "#fff"); expect(r.takeoff.layers.length).toBe(2);
  });
});

describe("scale notes", () => {
  it("records and clears the note per page", () => {
    const base: Takeoff = { layers: [], measurements: [], feetPerUnit: {} };
    const a = setScale(base, [1, 2], 0.1, "auto-detected");
    expect(a.scaleNote).toEqual({ 1: "auto-detected", 2: "auto-detected" });
    expect(setScale(a, [1], 0.2).scaleNote).toEqual({ 2: "auto-detected" });
  });
});

describe("new measurement kinds", () => {
  const P = (x: number, y: number) => ({ x, y });
  const base = (o: Partial<Measurement>): Measurement => ({ id: "m", layerId: "l1", kind: "length", page: 1, label: "x", pts: [], ...o });
  const f = 0.1; // feet per page unit
  it("perimeter, rect area, volume, diameter, radius, angle", () => {
    expect(quantity(base({ kind: "perimeter", shape: "rect", pts: [P(0, 0), P(100, 50)] }), f)).toBeCloseTo(30, 9);
    expect(quantity(base({ kind: "area", shape: "rect", pts: [P(0, 0), P(100, 50)] }), f)).toBeCloseTo(50, 9);
    expect(quantity(base({ kind: "volume", shape: "rect", pts: [P(0, 0), P(100, 50)], depth: 0.5 }), f)).toBeCloseTo(25, 9);
    expect(quantity(base({ kind: "volume", pts: [P(0, 0), P(1, 0), P(1, 1)] }), f)).toBeNull();
    expect(quantity(base({ kind: "diameter", shape: "diameter", pts: [P(0, 0), P(100, 0)] }), f)).toBeCloseTo(10, 9);
    expect(quantity(base({ kind: "radius", shape: "circle", pts: [P(0, 0), P(30, 0)] }), f)).toBeCloseTo(3, 9);
    expect(quantity(base({ kind: "radius", shape: "arc", pts: [P(10, 0), P(0, 10), P(-10, 0)] }), f)).toBeCloseTo(1, 9);
    expect(quantity(base({ kind: "angle", shape: "angle", pts: [P(1, 0), P(0, 0), P(0, 1)] }), undefined)).toBeCloseTo(90, 9);
    expect(quantity(base({ kind: "markup", shape: "cloud", pts: [P(0, 0)] }), f)).toBeNull();
  });
  it("cutouts subtract from the area in the summary", () => {
    const t: Takeoff = { layers: [{ id: "l1", name: "Floor", color: "#000", visible: true }], feetPerUnit: { 1: f }, measurements: [
      base({ id: "a", kind: "area", label: "Slab", shape: "rect", pts: [P(0, 0), P(100, 100)] }),
      base({ id: "c", kind: "cutout", label: "Slab", shape: "rect", pts: [P(0, 0), P(10, 10)] })] };
    const s = summarize(t);
    expect(s.length).toBe(1); expect(s[0].qty).toBeCloseTo(100 - 1, 9); expect(s[0].unit).toBe("SF");
  });
  it("labels read like a dimension and never lie about a missing scale", () => {
    expect(measureLabel(base({ pts: [P(0, 0), P(125, 0)] }), f)).toBe("12'-6\"");
    expect(measureLabel(base({ pts: [P(0, 0), P(125, 0)] }), undefined)).toBe("set scale");
    expect(measureLabel(base({ kind: "area", shape: "rect", pts: [P(0, 0), P(100, 50)] }), f)).toBe("50.0 SF");
    expect(measureLabel(base({ kind: "volume", shape: "rect", pts: [P(0, 0), P(1, 1)] }), f)).toBe("needs depth");
    expect(measureLabel(base({ kind: "count", pts: [P(0, 0)] }), f)).toBeNull();
  });
  it("plain markups stay out of summaries and CSV", () => {
    const t: Takeoff = { layers: [{ id: "l1", name: "L", color: "#000", visible: true }], feetPerUnit: { 1: f }, measurements: [base({ kind: "markup", shape: "cloud", pts: [P(0, 0), P(1, 1), P(2, 0)] })] };
    expect(summarize(t).length).toBe(0); expect(toCsv(t).split("\n").length).toBe(1);
  });
  it("csv is in drawing order and carries page position", () => {
    const t: Takeoff = { layers: [{ id: "l1", name: "L", color: "#000", visible: true }], feetPerUnit: { 1: f, 2: f }, measurements: [
      base({ id: "b", page: 2, label: "p2", pts: [P(0, 0), P(10, 0)] }), base({ id: "c", page: 1, label: "low", pts: [P(0, 400), P(10, 400)] }), base({ id: "d", page: 1, label: "high", pts: [P(0, 10), P(10, 10)] })] };
    const rows = toCsv(t).split("\n").slice(1).map((r) => r.split(",")[5]);
    expect(rows).toEqual(['"high"', '"low"', '"p2"']);
    expect(toCsv(t).split("\n")[0]).toContain("x_in");
  });
});

describe("viewport scales", () => {
  const P = (x: number, y: number) => ({ x, y });
  const m = (o: Partial<Measurement>): Measurement => ({ id: "m", layerId: "l1", kind: "length", page: 1, label: "x", pts: [], ...o });
  const t: Takeoff = { layers: [{ id: "l1", name: "L", color: "#000", visible: true }], feetPerUnit: { 1: 0.1 }, measurements: [
    m({ id: "v1", kind: "markup", shape: "viewport", pts: [P(0, 0), P(200, 200)], vpScale: 0.05 }),
    m({ id: "v2", kind: "markup", shape: "viewport", pts: [P(0, 0), P(100, 100)], vpScale: 0.02 }),
    m({ id: "in2", pts: [P(10, 10), P(60, 10)] }), m({ id: "in1", pts: [P(150, 150), P(190, 150)] }), m({ id: "out", pts: [P(300, 300), P(340, 300)] }),
    m({ id: "other", page: 2, pts: [P(10, 10), P(60, 10)] })] };
  it("uses the smallest viewport containing the markup, else the page scale", () => {
    expect(scaleFor(t, t.measurements[2])).toBe(0.02);
    expect(scaleFor(t, t.measurements[3])).toBe(0.05);
    expect(scaleFor(t, t.measurements[4])).toBe(0.1);
    expect(scaleFor(t, t.measurements[5])).toBeUndefined();
  });
  it("quantities inside a viewport use its scale", () => {
    expect(quantity(t.measurements[2], 0.02)).toBeCloseTo(1, 9);
  });
});
