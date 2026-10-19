import { describe, expect, it } from "vitest";
import { groupRows, markupRows, rowsCsv, sortRows } from "./markuplist";
import type { Measurement, Takeoff } from "./takeoff";
const P = (x: number, y: number) => ({ x, y });
const m = (o: Partial<Measurement>): Measurement => ({ id: Math.random().toString(36), layerId: "l1", kind: "count", page: 1, label: "x", pts: [P(0, 0)], ...o });
const t: Takeoff = { layers: [{ id: "l1", name: "Power", color: "#000", visible: true }], feetPerUnit: { 1: 1 / 72, 2: 1 / 72 }, measurements: [
  m({ label: "Duplex", page: 2 }), m({ label: "duplex", status: "Ordered", comment: 'say "hi"' }),
  m({ kind: "length", shape: "line", label: "Wire", pts: [P(0, 0), P(144, 0)] }), m({ kind: "markup", shape: "rect", label: "Note" })] };
describe("markup list", () => {
  it("rows carry quantity, unit, status and layer name; markups can be left out", () => {
    const r = markupRows(t);
    expect(r.length).toBe(4); expect(r.find((x) => x.label === "Wire")?.qty).toBeCloseTo(2, 6);
    expect(r[1].status).toBe("Ordered"); expect(r[0].layer).toBe("Power");
    expect(markupRows(t, false).length).toBe(3);
  });
  it("sorts by quantity with empty values last, and by page both ways", () => {
    const r = markupRows(t);
    expect(sortRows(r, "qty", -1).map((x) => x.label)).toEqual(["Wire", "Duplex", "duplex", "Note"]);
    expect(sortRows(r, "qty", 1)[3].label).toBe("Note");
    expect(sortRows(r, "page", -1)[0].page).toBe(2);
  });
  it("groups by name ignoring case", () => {
    const g = groupRows(markupRows(t));
    expect(g.find((x) => x.label.toLowerCase() === "duplex")).toMatchObject({ items: 2, qty: 2, unit: "EA" });
  });
  it("escapes csv", () => { expect(rowsCsv(markupRows(t))).toContain('"say ""hi"""'); });
});
