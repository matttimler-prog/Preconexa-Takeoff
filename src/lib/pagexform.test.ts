import { describe, expect, it } from "vitest";
import { displayToUser, displayTransform } from "./pagexform";

// A portrait page 200 wide, 300 tall, with its crop box starting at (10, 20).
const box = { x: 10, y: 20, width: 200, height: 300 };
const same = (a: { x: number; y: number }, x: number, y: number) => { expect(a.x).toBeCloseTo(x, 6); expect(a.y).toBeCloseTo(y, 6); };

describe("rotated page transform", () => {
  it("rotation 0: top-left of the display is the top-left of the page", () => {
    same(displayToUser(0, box, 0, 0), 10, 320);
    same(displayToUser(0, box, 200, 300), 210, 20);
  });
  it("rotation 90 shows the page turned clockwise (display is 300 wide, 200 tall)", () => {
    expect(displayTransform(90, box).width).toBe(300);
    // Display top-left is the page's bottom-left; display top-right is the page's top-left.
    same(displayToUser(90, box, 0, 0), 10, 20);
    same(displayToUser(90, box, 300, 0), 10, 320);
    same(displayToUser(90, box, 0, 200), 210, 20);
  });
  it("rotation 180 is the opposite corner", () => {
    same(displayToUser(180, box, 0, 0), 210, 20);
    same(displayToUser(180, box, 200, 300), 10, 320);
  });
  it("rotation 270 shows the page turned counter-clockwise", () => {
    same(displayToUser(270, box, 0, 0), 210, 320);
    same(displayToUser(270, box, 300, 0), 210, 20);
    same(displayToUser(270, box, 0, 200), 10, 320);
  });
  it("accepts rotations like -90 and 450", () => {
    same(displayToUser(-90, box, 0, 0), 210, 320);
    same(displayToUser(450, box, 0, 0), 10, 20);
  });
});
