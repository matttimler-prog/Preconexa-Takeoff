import { describe, expect, it } from "vitest";
import { clampZoom, commandForKey, fitWidthZoom, resolveWheel, stepAccumulator, zoomAt, MAX_ZOOM, MIN_ZOOM } from "./nav";

const w = (o: Partial<{ deltaY: number; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ deltaY: 100, ctrlKey: false, altKey: false, shiftKey: false, ...o });
const key = (k: string, o: Partial<{ shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => ({ key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...o });

describe("wheel", () => {
  it("zoom mode: wheel zooms; up zooms in, down zooms out", () => {
    const down = resolveWheel("zoom", w({ deltaY: 100 })); const up = resolveWheel("zoom", w({ deltaY: -100 }));
    expect(down.type).toBe("zoom"); expect(up.type).toBe("zoom");
    expect((down as { factor: number }).factor).toBeLessThan(1); expect((up as { factor: number }).factor).toBeGreaterThan(1);
  });
  it("page mode: wheel changes page, ctrl+wheel still zooms, alt scrolls", () => {
    expect(resolveWheel("page", w({ deltaY: 100 }))).toEqual({ type: "page", dir: 1 });
    expect(resolveWheel("page", w({ deltaY: -100 }))).toEqual({ type: "page", dir: -1 });
    expect(resolveWheel("page", w({ ctrlKey: true })).type).toBe("zoom");
    expect(resolveWheel("zoom", w({ altKey: true })).type).toBe("scroll");
  });
  it("accumulator flips one page per threshold", () => {
    let r = stepAccumulator(0, 30); expect(r.step).toBe(0);
    r = stepAccumulator(r.acc, 40); expect(r.step).toBe(1); expect(r.acc).toBe(0);
    expect(stepAccumulator(0, -120).step).toBe(-1);
  });
});
describe("zoomAt", () => {
  it("keeps the content point under the cursor fixed", () => {
    const v = { zoom: 1, scrollLeft: 100, scrollTop: 50 };
    const cx = 200, cy = 120;
    const before = { x: (v.scrollLeft + cx) / v.zoom, y: (v.scrollTop + cy) / v.zoom };
    const n = zoomAt(v, cx, cy, 2);
    expect(n.zoom).toBe(2);
    expect((n.scrollLeft + cx) / n.zoom).toBeCloseTo(before.x); expect((n.scrollTop + cy) / n.zoom).toBeCloseTo(before.y);
  });
  it("clamps zoom", () => {
    expect(zoomAt({ zoom: MAX_ZOOM, scrollLeft: 0, scrollTop: 0 }, 0, 0, 5).zoom).toBe(MAX_ZOOM);
    expect(clampZoom(0.0001)).toBe(MIN_ZOOM);
    expect(fitWidthZoom(1024, 612)).toBeCloseTo((1024 - 24) / 612);
  });
});
describe("hotkeys", () => {
  it("maps tools and navigation", () => {
    expect(commandForKey(key("v"))).toBe("tool:select");
    expect(commandForKey(key("V", { shiftKey: true }))).toBe("tool:pan");
    expect(commandForKey(key("l"))).toBe("tool:length");
    expect(commandForKey(key("N", { shiftKey: true }))).toBe("tool:polylength");
    expect(commandForKey(key("A", { shiftKey: true, altKey: true }))).toBe("tool:area");
    expect(commandForKey(key("C", { shiftKey: true, altKey: true }))).toBe("tool:count");
    expect(commandForKey(key("w"))).toBe("wheel:toggle");
    expect(commandForKey(key("ArrowRight", { ctrlKey: true }))).toBe("page:next");
    expect(commandForKey(key("ArrowLeft", { ctrlKey: true }))).toBe("page:prev");
    expect(commandForKey(key("Home"))).toBe("page:first");
    expect(commandForKey(key("z", { ctrlKey: true }))).toBe("undo");
    expect(commandForKey(key("z", { ctrlKey: true, shiftKey: true }))).toBe("redo");
    expect(commandForKey(key("y", { ctrlKey: true }))).toBe("redo");
    expect(commandForKey(key("q"))).toBeNull();
  });
});
