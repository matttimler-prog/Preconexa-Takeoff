import { useState } from "react";
import { parseDistance } from "../lib/measure";

/** Spacing is typed in real distance when the page has a scale (20', 6 in), or in paper inches when it doesn't. */
export function ArrayDialog({ feetPerUnit, onApply, onClose }: { feetPerUnit?: number; onApply: (rows: number, cols: number, dx: number, dy: number) => void; onClose: () => void }) {
  const [rows, setRows] = useState("3"), [cols, setCols] = useState("3");
  const [sx, setSx] = useState(feetPerUnit ? "10'" : "1"), [sy, setSy] = useState(feetPerUnit ? "10'" : "1");
  const [err, setErr] = useState("");
  const dist = (s: string): number | null => {
    const neg = s.trim().startsWith("-"), body = s.trim().replace(/^-/, "");
    const v = feetPerUnit ? (() => { const ft = parseDistance(body); return ft == null ? null : ft / feetPerUnit; })() : (Number(body) > 0 ? Number(body) * 72 : null);
    return v == null ? null : neg ? -v : v;
  };
  const go = () => {
    const r = Math.floor(Number(rows)), c = Math.floor(Number(cols)), dx = dist(sx), dy = dist(sy);
    if (!(r >= 1 && c >= 1) || r * c > 2000) return setErr("Rows and columns must be whole numbers from 1 up (2000 copies at most).");
    if (r * c < 2) return setErr("Use at least 2 rows or 2 columns, or there is nothing to copy.");
    if (dx == null || dy == null) return setErr(feetPerUnit ? "Type spacing like 10', 6 in or 3'-6\"." : "Type spacing in paper inches, e.g. 1 or 0.5.");
    onApply(r, c, dx, dy);
  };
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Enter") go(); if (e.key === "Escape") onClose(); }}>
        <h3 style={{ margin: "0 0 8px" }}>Array the selected markup</h3>
        <div className="field"><span>Rows</span><input autoFocus value={rows} onChange={(e) => setRows(e.target.value)} /></div>
        <div className="field"><span>Columns</span><input value={cols} onChange={(e) => setCols(e.target.value)} /></div>
        <div className="field"><span>Row spacing</span><input value={sy} onChange={(e) => setSy(e.target.value)} /></div>
        <div className="field"><span>Column spacing</span><input value={sx} onChange={(e) => setSx(e.target.value)} /></div>
        <p className="muted" style={{ margin: "6px 0" }}>{feetPerUnit ? "Spacing is real distance on this page." : "This page has no scale, so spacing is in paper inches."} Rows go down and columns go right. Use a negative spacing to go the other way.</p>
        {err && <div className="note">{err}</div>}
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={go}>Create array</button></div>
      </div>
    </div>
  );
}
