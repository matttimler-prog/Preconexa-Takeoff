import { describe, expect, it } from "vitest";
import { wordsToBoxes } from "./ocr";

describe("ocr words to boxes", () => {
  it("scales to page units and drops weak, empty and flat words", () => {
    const b = wordsToBoxes([
      { text: "PANEL", x0: 30, y0: 60, x1: 90, y1: 90, conf: 91 },
      { text: "  ", x0: 0, y0: 0, x1: 10, y1: 10, conf: 99 },
      { text: "xq", x0: 0, y0: 0, x1: 10, y1: 10, conf: 20 },
      { text: "flat", x0: 5, y0: 5, x1: 5, y1: 9, conf: 99 },
    ], 3);
    expect(b.length).toBe(1);
    expect(b[0]).toEqual({ x: 10, y: 20, w: 20, h: 10, str: "PANEL" });
  });
});
