import type { Pt } from "./measure";
import type { Seg } from "./snapindex";

export type Matrix = number[]; // [a,b,c,d,e,f]
export type OpList = { fnArray: number[]; argsArray: unknown[] };
export type OpsTable = Record<string, number>;

/** m1 applied after m2 (same convention as canvas.transform). */
export const mulM = (m1: Matrix, m2: Matrix): Matrix => [
  m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];
export const applyM = (m: Matrix, x: number, y: number): Pt => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

// Path command codes used by newer pdf.js builds inside constructPath data.
const D = { move: 0, line: 1, curve: 2, quad: 3, close: 4 };

/**
 * Pull straight edges and centre points out of a page's operator list, in page units (viewTransform = viewport.transform at scale 1).
 * Handles both pdf.js constructPath layouts. Curves contribute their end points only; closed all-curve subpaths (circles) contribute a centre.
 */
export function extractGeometry(list: OpList, OPS: OpsTable, viewTransform: Matrix, maxSegs = 400000): { segs: Seg[]; centers: Pt[] } {
  const segs: Seg[] = [], centers: Pt[] = [];
  let ctm = viewTransform; const stack: Matrix[] = [];
  let pend: Seg[] = [], pendCenters: Pt[] = [];
  const paint = new Set([OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].filter((v) => v !== undefined));
  const commit = () => { for (const s of pend) if (segs.length < maxSegs) segs.push(s); centers.push(...pendCenters); pend = []; pendCenters = []; };

  const addPath = (kinds: string[], c: number[]) => {
    let ci = 0, cur: Pt | null = null, start: Pt | null = null;
    let curveEnds: Pt[] = [], curveOnly = true, nonClose = 0;
    const flush = () => {
      if (curveOnly && curveEnds.length >= 3 && nonClose === curveEnds.length) {
        const n = curveEnds.length; pendCenters.push({ x: curveEnds.reduce((s, p) => s + p.x, 0) / n, y: curveEnds.reduce((s, p) => s + p.y, 0) / n });
      }
      curveEnds = []; curveOnly = true; nonClose = 0;
    };
    const seg = (a: Pt, b: Pt) => { if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1e-6) pend.push([a.x, a.y, b.x, b.y]); };
    for (const k of kinds) {
      if (k === "move") { flush(); cur = start = applyM(ctm, c[ci], c[ci + 1]); ci += 2; }
      else if (k === "line") { const p = applyM(ctm, c[ci], c[ci + 1]); ci += 2; if (cur) seg(cur, p); cur = p; curveOnly = false; nonClose++; }
      else if (k === "curve") { const p = applyM(ctm, c[ci + 4], c[ci + 5]); ci += 6; cur = p; curveEnds.push(p); nonClose++; }
      else if (k === "curve2" || k === "curve3" || k === "quad") { const p = applyM(ctm, c[ci + 2], c[ci + 3]); ci += 4; cur = p; curveEnds.push(p); nonClose++; }
      else if (k === "rect") {
        const [x, y, w, h] = [c[ci], c[ci + 1], c[ci + 2], c[ci + 3]]; ci += 4;
        const p1 = applyM(ctm, x, y), p2 = applyM(ctm, x + w, y), p3 = applyM(ctm, x + w, y + h), p4 = applyM(ctm, x, y + h);
        seg(p1, p2); seg(p2, p3); seg(p3, p4); seg(p4, p1);
        pendCenters.push({ x: (p1.x + p3.x) / 2, y: (p1.y + p3.y) / 2 }); cur = start = p1; curveOnly = false; nonClose++;
      }
      else if (k === "close") { if (cur && start) seg(cur, start); cur = start; }
    }
    flush();
  };

  const oldKinds: Record<number, string> = { [OPS.moveTo]: "move", [OPS.lineTo]: "line", [OPS.curveTo]: "curve", [OPS.curveTo2]: "curve2", [OPS.curveTo3]: "curve3", [OPS.closePath]: "close", [OPS.rectangle]: "rect" };

  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i], a = list.argsArray[i] as unknown[] | null;
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) { const m = stack.pop(); if (m) ctm = m; }
    else if (fn === OPS.transform && a) ctm = mulM(ctm, a as number[]);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (a && Array.isArray(a[0])) ctm = mulM(ctm, a[0] as number[]); }
    else if (fn === OPS.paintFormXObjectEnd) { const m = stack.pop(); if (m) ctm = m; }
    else if (fn === OPS.constructPath && a) {
      if (Array.isArray(a[0])) { // older layout: [opCodes[], coords[], minMax]
        addPath((a[0] as number[]).map((o) => oldKinds[o] ?? "?"), a[1] as number[]);
      } else if (typeof a[0] === "number") { // newer layout: [paintOp, [pathData], minMax]
        const raw = a[1] as ArrayLike<unknown> | undefined;
        const data = ((typeof raw?.[0] === "number" ? raw : raw?.[0]) ?? []) as ArrayLike<number>;
        const kinds: string[] = [], coords: number[] = [];
        for (let k = 0; k < data.length;) {
          const code = data[k++];
          if (code === D.move) { kinds.push("move"); coords.push(data[k], data[k + 1]); k += 2; }
          else if (code === D.line) { kinds.push("line"); coords.push(data[k], data[k + 1]); k += 2; }
          else if (code === D.curve) { kinds.push("curve"); coords.push(data[k], data[k + 1], data[k + 2], data[k + 3], data[k + 4], data[k + 5]); k += 6; }
          else if (code === D.quad) { kinds.push("quad"); coords.push(data[k], data[k + 1], data[k + 2], data[k + 3]); k += 4; }
          else if (code === D.close) kinds.push("close");
          else break;
        }
        addPath(kinds, coords);
        if (paint.has(a[0] as number)) commit(); else { pend = []; pendCenters = []; }
      }
    }
    else if (paint.has(fn)) commit();
    else if (fn === OPS.endPath) { pend = []; pendCenters = []; }
  }
  return { segs, centers };
}
