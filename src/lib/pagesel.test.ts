import { describe, expect, it } from "vitest";
import { parsePages } from "./pagesel";
describe("parsePages", () => {
  it("reads ranges, lists, all, odd, even", () => {
    expect(parsePages("2-4, 8", 10)).toEqual([2, 3, 4, 8]);
    expect(parsePages("all", 3)).toEqual([1, 2, 3]);
    expect(parsePages("odd", 5)).toEqual([1, 3, 5]);
    expect(parsePages("even", 5)).toEqual([2, 4]);
    expect(parsePages("3 1 3", 5)).toEqual([1, 3]);
  });
  it("rejects nonsense and out-of-range pages", () => {
    expect(parsePages("", 5)).toBeNull();
    expect(parsePages("0", 5)).toBeNull();
    expect(parsePages("6", 5)).toBeNull();
    expect(parsePages("4-2", 5)).toBeNull();
    expect(parsePages("a-b", 5)).toBeNull();
  });
});
