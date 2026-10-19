import { describe, expect, it } from "vitest";
import { STAMPS, stampText, stampWithDate } from "./stamps";
describe("stamps", () => {
  it("has unique ids and colors", () => {
    expect(new Set(STAMPS.map((s) => s.id)).size).toBe(STAMPS.length);
    for (const s of STAMPS) expect(/^#[0-9a-f]{6}$/.test(s.color)).toBe(true);
  });
  it("dated stamps print the date", () => {
    const d = new Date(2026, 9, 5);
    expect(stampText(STAMPS.find((s) => s.date)!, d)).toBe("10/05/2026");
    expect(stampText(STAMPS[0], d)).toBe("Approved");
    expect(stampWithDate("Approved", d)).toBe("Approved\n10/05/2026");
  });
});
