// Backtest: node --experimental-strip-types run.mjs DIR [dpi]
// DIR holds plan.pdf and truth.json (from gen_synthetic.py) - or your own truth file in the same format.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { findMatches } from "../../src/lib/automatch.ts";

const dir = process.argv[2], dpi = Number(process.argv[3] ?? 86), k = dpi / 72;
execFileSync("pdftoppm", ["-r", String(dpi), "-gray", "-singlefile", `${dir}/plan.pdf`, `${dir}/page`]);
const pgm = readFileSync(`${dir}/page.pgm`);
let p = 0; const tok = () => { while (pgm[p] <= 32) p++; let s = ""; while (pgm[p] > 32) s += String.fromCharCode(pgm[p++]); return s; };
tok(); const w = +tok(), h = +tok(); tok(); p++;
const data = new Uint8ClampedArray(w * h * 4);
for (let i = 0; i < w * h; i++) { const v = pgm[p + i]; data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
const truth = JSON.parse(readFileSync(`${dir}/truth.json`, "utf8"));
for (const rotations of [false, true]) for (const thr of [0.6, 0.7, 0.8]) {
  console.log(`\n== threshold ${thr}, rotations ${rotations ? "on" : "off"}  (${w}x${h}px)`);
  for (const [name, pts] of Object.entries(truth.symbols)) {
    const [sx, sy, sw, sh] = truth.sample[name], t0 = Date.now();
    const ms = findMatches({ w, h, data }, { x: sx * k, y: sy * k, w: sw * k, h: sh * k }, { threshold: thr, rotations });
    const tol = 8 * k; let tp = 0; const used = new Set();
    for (const [x, y] of pts) { const j = ms.findIndex((m, i) => !used.has(i) && Math.hypot(m.x + m.w / 2 - x * k, m.y + m.h / 2 - y * k) < tol); if (j >= 0) { used.add(j); tp++; } }
    const fp = ms.length - tp, recall = tp / pts.length, prec = ms.length ? tp / ms.length : 0;
    console.log(`${name.padEnd(8)} truth ${String(pts.length).padStart(3)}  found ${String(ms.length).padStart(3)}  hit ${String(tp).padStart(3)}  false ${String(fp).padStart(3)}  recall ${(recall * 100).toFixed(0)}%  precision ${(prec * 100).toFixed(0)}%  ${Date.now() - t0} ms`);
  }
}
