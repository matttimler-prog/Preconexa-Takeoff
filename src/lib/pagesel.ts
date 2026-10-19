/** "all", "odd", "even", "2-5, 8" -> sorted unique page numbers within 1..n, or null when it can't be read. */
export function parsePages(text: string, n: number): number[] | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const out = new Set<number>();
  for (const part of t.split(/[,;\s]+/).filter(Boolean)) {
    if (part === "all") { for (let i = 1; i <= n; i++) out.add(i); continue; }
    if (part === "odd" || part === "even") { for (let i = 1; i <= n; i++) if ((i % 2 === 1) === (part === "odd")) out.add(i); continue; }
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < a || b > n) return null;
    for (let i = a; i <= b; i++) out.add(i);
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}
