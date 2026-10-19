import { describe, expect, it } from "vitest";
import { canRedo, canUndo, newHistory, push, redo, undo } from "./history";
describe("history", () => {
  it("undo/redo and clears redo on new push", () => {
    let h = newHistory(0); h = push(h, 1); h = push(h, 2);
    expect(h.present).toBe(2); expect(canUndo(h)).toBe(true);
    h = undo(h); expect(h.present).toBe(1); expect(canRedo(h)).toBe(true);
    h = redo(h); expect(h.present).toBe(2);
    h = undo(undo(h)); expect(h.present).toBe(0); expect(undo(h).present).toBe(0);
    h = push(h, 9); expect(canRedo(h)).toBe(false);
  });
  it("ignores identical pushes and caps size", () => {
    let h = newHistory(0); h = push(h, 0); expect(h.past.length).toBe(0);
    for (let i = 1; i <= 150; i++) h = push(h, i, 100);
    expect(h.past.length).toBe(100);
  });
});
