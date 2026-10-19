import { describe, expect, it } from "vitest";
import { TOOLS, TOOL_BY_ID, toolForPreset } from "./tools";
describe("tools", () => {
  it("every tool has a unique id and a hint", () => {
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length);
    for (const t of TOOLS) expect(t.hint.length).toBeGreaterThan(3);
  });
  it("covers the full markup and measure set", () => {
    for (const id of ["line", "arrow", "arc", "polyline", "dimension", "callout", "rect", "ellipse", "polygon", "cloud", "cloudplus", "text", "note", "pen", "highlight",
      "length", "polylength", "perimeter", "area", "volume", "cutout", "count", "diameter", "radius", "angle"]) expect(TOOL_BY_ID[id]).toBeTruthy();
  });
  it("presets arm the right tool", () => {
    expect(toolForPreset("length").id).toBe("polylength");
    expect(toolForPreset("length", "polyline").id).toBe("polylength");
    expect(toolForPreset("area").id).toBe("area");
    expect(toolForPreset("area", "rect").id).toBe("rectarea");
    expect(toolForPreset("count").id).toBe("count");
    expect(toolForPreset("markup", "cloud").id).toBe("cloud");
  });
});
