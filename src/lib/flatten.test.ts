import { describe, expect, it } from "vitest";
import { flattenPage } from "./flatten";
import type { Measurement, Takeoff } from "./takeoff";

const P = (x: number, y: number) => ({ x, y });
const m = (o: Partial<Measurement>): Measurement => ({ id: "m", layerId: "l1", kind: "length", page: 1, label: "x", pts: [], ...o });
const take = (ms: Measurement[], visible = true): Takeoff => ({ layers: [{ id: "l1", name: "L", color: "#112233", visible }], feetPerUnit: { 1: 0.1 }, measurements: ms });
const types = (t: Takeoff, page = 1, labels?: boolean) => flattenPage(t, page, labels === undefined ? undefined : { labels }).map((o) => o.t);

describe("flatten", () => {
  it("hidden layers produce nothing", () => {
    expect(flattenPage(take([m({ pts: [P(0, 0), P(10, 0)] })], false), 1).length).toBe(0);
  });
  it("a length line gives a poly and a label with the dimension", () => {
    const ops = flattenPage(take([m({ pts: [P(0, 0), P(125, 0)] })]), 1);
    expect(ops.map((o) => o.t)).toEqual(["poly", "text"]);
    const txt = ops[1] as { text: string; color: string };
    expect(txt.text).toBe("12'-6\"");
    expect((ops[0] as { stroke: string }).stroke).toBe("#112233");
  });
  it("an area rect has a fill", () => {
    const ops = flattenPage(take([m({ kind: "area", shape: "rect", pts: [P(0, 0), P(100, 50)] })]), 1);
    const poly = ops[0] as { t: string; fill?: string; closed: boolean };
    expect(poly.t).toBe("poly"); expect(poly.closed).toBe(true); expect(poly.fill).toBe("#112233");
    expect(ops[1].t).toBe("text");
  });
  it("a cloud becomes a path", () => {
    const ops = flattenPage(take([m({ kind: "markup", shape: "cloud", pts: [P(0, 0), P(100, 0), P(100, 50), P(0, 50)] })]), 1);
    expect(ops[0].t).toBe("path"); expect((ops[0] as { d: string }).d.startsWith("M0,0A")).toBe(true);
  });
  it("counts produce one mark per point", () => {
    const ops = flattenPage(take([m({ kind: "count", shape: "point", pts: [P(5, 5), P(20, 20)], symbol: { shape: "circle", text: "R", size: 14 } })]), 1);
    expect(ops.filter((o) => o.t === "ellipse").length).toBe(2);
    expect(ops.filter((o) => o.t === "text").length).toBe(2);
  });
  it("images become image ops and non-image data is ignored", () => {
    const img = "data:image/png;base64,AAAA";
    const ops = flattenPage(take([m({ kind: "markup", shape: "image", pts: [P(0, 0), P(40, 20)], image: img })]), 1);
    expect(ops).toEqual([{ t: "image", x: 0, y: 0, w: 40, h: 20, dataUrl: img }]);
    expect(flattenPage(take([m({ kind: "markup", shape: "image", pts: [P(0, 0), P(40, 20)], image: "javascript:x" })]), 1).length).toBe(0);
  });
  it("only the requested page is drawn", () => {
    const t = take([m({ id: "a", pts: [P(0, 0), P(10, 0)] }), m({ id: "b", page: 2, pts: [P(0, 0), P(10, 0)] })]);
    expect(types(t, 2).length).toBe(2); expect(types(t, 3).length).toBe(0);
  });
  it("labels:false drops measurement text but keeps geometry; hideLabel does too", () => {
    const t = take([m({ pts: [P(0, 0), P(125, 0)] })]);
    expect(types(t, 1, false)).toEqual(["poly"]);
    expect(types(take([m({ pts: [P(0, 0), P(125, 0)], hideLabel: true })]))).toEqual(["poly"]);
  });
  it("text-line marks, links, stamps and viewports", () => {
    const rect = [P(10, 10), P(110, 22)];
    expect(types(take([m({ kind: "markup", shape: "underline", pts: rect })]))).toEqual(["poly"]);
    expect(types(take([m({ kind: "markup", shape: "hltext", pts: rect })]))).toEqual(["poly"]);
    expect(types(take([m({ kind: "markup", shape: "link", pts: rect })]))).toEqual(["box"]);
    const st = flattenPage(take([m({ kind: "markup", shape: "stamp", pts: [P(5, 5)], text: "Approved" })]), 1);
    expect(st[0].t).toBe("box"); expect((st[1] as { text: string }).text).toBe("APPROVED");
    const vp = flattenPage(take([m({ kind: "markup", shape: "viewport", pts: rect, vpScale: 8 / 72 })]), 1);
    expect(vp.map((o) => o.t)).toEqual(["box", "text"]); expect((vp[1] as { text: string }).text).toContain("8.00 ft per paper inch");
  });
});
