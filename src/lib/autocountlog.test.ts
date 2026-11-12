import { describe, expect, it } from "vitest";
import { buildEntry, logCsv, summarize } from "./autocountlog";

const m = (score: number, off = false) => ({ score, off });
describe("auto count beta log", () => {
  it("records only what was shown at the chosen sensitivity", () => {
    const e = buildEntry({ label: " duplex ", scope: "page", threshold: 0.7, rotations: true, matches: [m(0.9), m(0.75, true), m(0.6), m(0.72)], missed: 2 });
    expect(e).toMatchObject({ label: "duplex", shown: 3, included: 2, excluded: 1, missed: 2 });
    expect(e.excludedScores).toEqual([0.75]);
  });
  it("treats a blank or negative miss answer as unanswered", () => {
    expect(buildEntry({ label: "x", scope: "all", threshold: 0.7, rotations: false, matches: [], missed: null }).missed).toBeNull();
    expect(buildEntry({ label: "x", scope: "all", threshold: 0.7, rotations: false, matches: [], missed: -3 }).missed).toBeNull();
  });
  it("summarises precision, recall and per-label rows", () => {
    const a = buildEntry({ label: "Duplex", scope: "page", threshold: 0.6, rotations: false, matches: [m(0.9), m(0.8), m(0.65, true)], missed: 1 });
    const b = buildEntry({ label: "duplex", scope: "page", threshold: 0.6, rotations: false, matches: [m(0.95), m(0.62, true)], missed: 0 });
    const s = summarize([a, b]);
    expect(s).toMatchObject({ runs: 2, included: 3, excluded: 2, missed: 1 });
    expect(s.precision).toBe(0.6); expect(s.recall).toBe(0.75);
    expect(s.byLabel).toHaveLength(1);
  });
  it("suggests a higher threshold when the false hits sit just above the cut-off", () => {
    const runs = [0, 1, 2, 3].map(() => buildEntry({ label: "t", scope: "page", threshold: 0.5, rotations: false, matches: [m(0.92), m(0.88), m(0.55, true), m(0.58, true)], missed: 0 }));
    const s = summarize(runs);
    expect(s.suggestedThreshold).not.toBeNull();
    expect(s.suggestedThreshold!).toBeGreaterThan(0.58);
    expect(s.suggestedThreshold!).toBeLessThanOrEqual(0.88);
  });
  it("gives no suggestion on thin data and escapes CSV", () => {
    expect(summarize([buildEntry({ label: "x", scope: "page", threshold: 0.7, rotations: false, matches: [m(0.9)], missed: 0 })]).suggestedThreshold).toBeNull();
    expect(logCsv([buildEntry({ label: 'a "b", c', scope: "page", threshold: 0.7, rotations: false, matches: [m(0.9)], missed: 0 })])).toContain('"a ""b"", c"');
  });
});
