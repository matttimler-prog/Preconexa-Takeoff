/** Beta log for auto count: numbers only (no drawing pixels, no sheet text), kept on this device until exported. */
export type ScoreBand = { lo: number; hi: number; included: number; excluded: number };
export type AutoCountEntry = {
  id: string; at: string; label: string; scope: "page" | "all";
  threshold: number; rotations: boolean;
  shown: number; included: number; excluded: number;
  /** Copies the user says the search missed (null = not answered). */
  missed: number | null;
  includedScores: number[]; excludedScores: number[];
};

export const entryId = () => `ac_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function buildEntry(a: { label: string; scope: "page" | "all"; threshold: number; rotations: boolean; matches: { score: number; off?: boolean }[]; missed: number | null; at?: Date; id?: string }): AutoCountEntry {
  const shown = a.matches.filter((m) => m.score >= a.threshold), inc = shown.filter((m) => !m.off), exc = shown.filter((m) => m.off);
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return {
    id: a.id ?? entryId(), at: (a.at ?? new Date()).toISOString(), label: a.label.trim() || "Counted item", scope: a.scope,
    threshold: a.threshold, rotations: a.rotations, shown: shown.length, included: inc.length, excluded: exc.length,
    missed: a.missed != null && Number.isFinite(a.missed) && a.missed >= 0 ? Math.floor(a.missed) : null,
    includedScores: inc.map((m) => r(m.score)), excludedScores: exc.map((m) => r(m.score)),
  };
}

export type Summary = {
  runs: number; shown: number; included: number; excluded: number; missed: number;
  precision: number | null; recall: number | null;
  /** Threshold that would have scored best on this log (F1), or null when there is too little data. */
  suggestedThreshold: number | null;
  byLabel: { label: string; runs: number; included: number; excluded: number; missed: number; precision: number | null }[];
};

const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : null);

export function summarize(entries: AutoCountEntry[]): Summary {
  let shown = 0, included = 0, excluded = 0, missed = 0;
  const by = new Map<string, Summary["byLabel"][number]>();
  for (const e of entries) {
    shown += e.shown; included += e.included; excluded += e.excluded; missed += e.missed ?? 0;
    const k = e.label.toLowerCase(), row = by.get(k) ?? { label: e.label, runs: 0, included: 0, excluded: 0, missed: 0, precision: null };
    row.runs++; row.included += e.included; row.excluded += e.excluded; row.missed += e.missed ?? 0; by.set(k, row);
  }
  for (const r of by.values()) r.precision = ratio(r.included, r.included + r.excluded);
  // Suggest a threshold: replay the log at each candidate cut-off; copies below the run's own cut-off were never shown, so only raise it.
  const scored: { t: number; f1: number }[] = [];
  const usable = entries.filter((e) => e.shown > 0);
  if (usable.length >= 3) {
    for (let pct = 50; pct <= 95; pct++) {
      const t = pct / 100;
      let tp = 0, fp = 0, fn = 0;
      for (const e of usable) {
        if (t < e.threshold - 1e-9) continue;
        const keepI = e.includedScores.filter((s) => s >= t - 1e-9).length, keepE = e.excludedScores.filter((s) => s >= t - 1e-9).length;
        tp += keepI; fp += keepE; fn += (e.missed ?? 0) + (e.included - keepI);
      }
      scored.push({ t, f1: tp ? (2 * tp) / (2 * tp + fp + fn) : 0 });
    }
  }
  // Many cut-offs can tie; pick the middle of the best plateau so the suggestion is not on a knife edge.
  const top = scored.length ? Math.max(...scored.map((x) => x.f1)) : 0;
  const plateau = scored.filter((x) => top > 0 && x.f1 >= top - 1e-9);
  const best = plateau.length ? plateau[Math.floor((plateau.length - 1) / 2)] : null;
  return {
    runs: entries.length, shown, included, excluded, missed,
    precision: ratio(included, included + excluded), recall: ratio(included, included + missed),
    suggestedThreshold: best ? best.t : null, byLabel: [...by.values()].sort((a, b) => b.runs - a.runs),
  };
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
export function logCsv(entries: AutoCountEntry[]): string {
  const head = "at,label,scope,threshold,rotations,shown,included,excluded,missed,included_scores,excluded_scores";
  return [head, ...entries.map((e) => [e.at, q(e.label), e.scope, e.threshold, e.rotations, e.shown, e.included, e.excluded, e.missed ?? "", q(e.includedScores.join(" ")), q(e.excludedScores.join(" "))].join(","))].join("\n");
}
