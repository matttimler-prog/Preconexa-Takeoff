import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { calibrate, dist, parseArchScale, Pt } from "./lib/measure";
import { deleteLayer, Kind, Measurement, quantity, Takeoff, toCsv } from "./lib/takeoff";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
type Tool = "pan" | "calibrate" | Kind;
const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];
const uid = () => Math.random().toString(36).slice(2, 9);
const download = (name: string, text: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text])); a.download = name; a.click();
};

export function App() {
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1.25);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tool, setTool] = useState<Tool>("pan");
  const [draft, setDraft] = useState<Pt[]>([]);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [activeLayer, setActiveLayer] = useState("l1");
  const [t, setT] = useState<Takeoff>({ layers: [{ id: "l1", name: "Layer 1", color: COLORS[0], visible: true }], measurements: [], feetPerUnit: {} });
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    (async () => {
      const p = await doc.getPage(page);
      const vp = p.getViewport({ scale: zoom });
      const c = canvas.current!;
      c.width = vp.width; c.height = vp.height; setSize({ w: vp.width, h: vp.height });
      if (!cancelled) await p.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
    })();
    return () => { cancelled = true; };
  }, [doc, page, zoom]);

  const toPage = (e: React.MouseEvent): Pt => {
    const r = (e.currentTarget as Element).getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }; // PDF page units
  };
  const fpu = t.feetPerUnit[page];
  const mine = t.measurements.filter((m) => m.page === page);

  const commit = (kind: Kind, pts: Pt[]) => {
    if (!pts.length) return;
    const label = prompt("Label for this item (e.g. 2x4 troffer, 3/4 EMT)") || kind;
    setT((s) => ({ ...s, measurements: [...s.measurements, { id: uid(), layerId: activeLayer, kind, page, label, pts } as Measurement] }));
    setDraft([]);
  };
  const click = (e: React.MouseEvent) => {
    if (tool === "pan") return;
    const p = toPage(e);
    if (tool === "count") return commit("count", [p]);
    if (tool === "calibrate") {
      const pts = [...draft, p];
      if (pts.length < 2) return setDraft(pts);
      const printed = prompt(`Known distance between the two points.\nEnter feet (e.g. 20) or the sheet's printed scale to skip (e.g. 1/8" = 1'-0")`);
      const arch = printed ? parseArchScale(printed) : null;
      const feet = Number(printed);
      try {
        const k = arch ?? calibrate(pts[0], pts[1], feet);
        setT((s) => ({ ...s, feetPerUnit: { ...s.feetPerUnit, [page]: k } }));
      } catch (err) { alert(String(err)); }
      setDraft([]); setTool("pan");
      return;
    }
    setDraft([...draft, p]);
  };
  const finish = () => { if (tool === "length" && draft.length > 1) commit("length", draft); if (tool === "area" && draft.length > 2) commit("area", draft); };

  const layerName = (id: string) => t.layers.find((l) => l.id === id);
  const rows = useMemo(() => t.measurements.map((m) => ({ m, q: quantity(m, t.feetPerUnit[m.page]) })), [t]);

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ flex: 1, overflow: "auto", background: "#e5e7eb" }}>
        {!doc && <p style={{ padding: 24 }}>Open a PDF print to begin.</p>}
        <div style={{ position: "relative", width: size.w, height: size.h }}>
          <canvas ref={canvas} />
          <svg width={size.w} height={size.h} style={{ position: "absolute", inset: 0, cursor: tool === "pan" ? "default" : "crosshair" }}
            onClick={click} onDoubleClick={finish} onMouseMove={(e) => setCursor(toPage(e))}>
            {mine.map((m) => {
              const l = layerName(m.layerId); if (!l?.visible) return null;
              const pts = m.pts.map((p) => `${p.x * zoom},${p.y * zoom}`).join(" ");
              return m.kind === "count"
                ? <circle key={m.id} cx={m.pts[0].x * zoom} cy={m.pts[0].y * zoom} r={6} fill={l.color} />
                : m.kind === "area" ? <polygon key={m.id} points={pts} fill={l.color + "33"} stroke={l.color} strokeWidth={2} />
                : <polyline key={m.id} points={pts} fill="none" stroke={l.color} strokeWidth={2} />;
            })}
            {draft.length > 0 && <polyline points={[...draft, ...(cursor ? [cursor] : [])].map((p) => `${p.x * zoom},${p.y * zoom}`).join(" ")} fill="none" stroke="#000" strokeDasharray="4" />}
          </svg>
        </div>
      </div>
      <aside style={{ width: 340, padding: 12, overflow: "auto", borderLeft: "1px solid #ccc", fontSize: 14 }}>
        <input type="file" accept="application/pdf" onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          setDoc(await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise); setPage(1);
        }} />
        {doc && <p>Page <button onClick={() => setPage(Math.max(1, page - 1))}>‹</button> {page}/{doc.numPages} <button onClick={() => setPage(Math.min(doc.numPages, page + 1))}>›</button>
          {" "}Zoom <button onClick={() => setZoom(zoom / 1.2)}>−</button><button onClick={() => setZoom(zoom * 1.2)}>+</button></p>}
        <p><b>Scale:</b> {fpu ? `calibrated (${(fpu * 72).toFixed(2)} ft per paper inch)` : "NOT calibrated — use Calibrate"}</p>
        <div>{(["pan", "calibrate", "length", "area", "count"] as Tool[]).map((k) =>
          <button key={k} onClick={() => { setTool(k); setDraft([]); }} style={{ fontWeight: tool === k ? 700 : 400, marginRight: 4 }}>{k}</button>)}</div>
        <small>Click points. Double-click to finish length/area. Count: one click per item.</small>
        <h4>Layers</h4>
        {t.layers.map((l) => (
          <div key={l.id}>
            <input type="radio" checked={activeLayer === l.id} onChange={() => setActiveLayer(l.id)} />
            <input type="checkbox" checked={l.visible} onChange={() => setT({ ...t, layers: t.layers.map((x) => x.id === l.id ? { ...x, visible: !x.visible } : x) })} />
            <span style={{ color: l.color }}> ■ </span>{l.name}
            <button onClick={() => { if (t.layers.length > 1 && confirm(`Delete layer "${l.name}" and its measurements?`)) { const n = deleteLayer(t, l.id); setT(n); setActiveLayer(n.layers[0].id); } }}>delete</button>
          </div>))}
        <button onClick={() => { const name = prompt("Layer name"); if (name) { const id = uid(); setT({ ...t, layers: [...t.layers, { id, name, color: COLORS[t.layers.length % COLORS.length], visible: true }] }); setActiveLayer(id); } }}>+ layer</button>
        <h4>Quantities</h4>
        <table><tbody>{rows.map(({ m, q }) => (
          <tr key={m.id}><td>{layerName(m.layerId)?.name}</td><td>{m.label}</td>
            <td>{q == null ? "uncalibrated" : q.toFixed(1)} {m.kind === "length" ? "LF" : m.kind === "area" ? "SF" : "EA"}</td>
            <td><button onClick={() => setT({ ...t, measurements: t.measurements.filter((x) => x.id !== m.id) })}>×</button></td></tr>))}</tbody></table>
        <p><button onClick={() => download("takeoff.csv", toCsv(t))}>Export CSV</button>{" "}
          <button onClick={() => download("takeoff.json", JSON.stringify(t, null, 1))}>Save JSON</button></p>
      </aside>
    </div>
  );
}
