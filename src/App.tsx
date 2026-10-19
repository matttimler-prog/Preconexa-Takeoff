import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { SymbolMark } from "./components/SymbolMark";
import { ToolChestPanel } from "./components/ToolChestPanel";
import { SCALE_PRESETS, calibrate, dist, parseArchScale, parseDistance, presetFeetPerUnit } from "./lib/measure";
import type { Pt } from "./lib/measure";
import { Command, SHORTCUT_HELP, View, WheelMode, commandForKey, fitWidthZoom, resolveWheel, stepAccumulator, zoomAt } from "./lib/nav";
import { constrainAngle, snapToPoints } from "./lib/snap";
import { History, newHistory, push, redo as redoH, undo as undoH, canRedo, canUndo } from "./lib/history";
import { Kind, Measurement, Takeoff, deleteLayer, ensureLayer, quantity, setScale, summarize, summaryCsv, toCsv } from "./lib/takeoff";
import { ToolChest, ToolPreset, addTool, defaultChest, newId } from "./lib/toolchest";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Tool = "select" | "pan" | "length" | "polylength" | "area" | "count" | "calibrate" | "capture";
const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];
const CHEST_KEY = "preconexa.chest.v1";
const empty = (): Takeoff => ({ layers: [{ id: "l1", name: "Layer 1", color: COLORS[0], visible: true }], measurements: [], feetPerUnit: {} });

const store = {
  get<T>(k: string): T | null { try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
};
const download = (name: string, text: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text])); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const kindOf = (t: Tool): Kind | null => (t === "length" || t === "polylength" ? "length" : t === "area" ? "area" : t === "count" ? "count" : null);
const HINT: Record<Tool, string> = {
  select: "Click a markup to select it. Delete removes it.", pan: "Drag to pan.",
  length: "Click two points.", polylength: "Click points. Double-click or Enter to finish.", area: "Click corners. Double-click or Enter to close.",
  count: "Click each item.", calibrate: "Click two ends of a known dimension.", capture: "Drag a box around a symbol on the print.",
};

export function App() {
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [fileKey, setFileKey] = useState("");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pageSize, setPageSize] = useState({ w: 612, h: 792 });
  const [wheelMode, setWheelMode] = useState<WheelMode>("zoom");
  const [tool, setTool] = useState<Tool>("select");
  const [preset, setPreset] = useState<ToolPreset | null>(null);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [hist, setHist] = useState<History<Takeoff>>(() => newHistory(empty()));
  const [activeLayer, setActiveLayer] = useState("l1");
  const [selected, setSelected] = useState<string | null>(null);
  const [chest, setChestState] = useState<ToolChest>(() => store.get<ToolChest>(CHEST_KEY) ?? defaultChest());
  const [tab, setTab] = useState<"tools" | "chest" | "qty" | "help">("tools");
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [capRect, setCapRect] = useState<{ a: Pt; b: Pt } | null>(null);
  const [allPages, setAllPages] = useState(true);

  const t = hist.present;
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const renderTask = useRef<pdfjs.RenderTask | null>(null);
  const anchor = useRef<View | null>(null);
  const needFit = useRef(false);
  const wheelAcc = useRef(0);
  const panStart = useRef<{ x: number; y: number; sl: number; st: number; moved: boolean } | null>(null);
  const loaded = useRef(false);

  const apply = useCallback((fn: (x: Takeoff) => Takeoff) => setHist((h) => push(h, fn(h.present))), []);
  const setChest = (c: ToolChest) => { setChestState(c); store.set(CHEST_KEY, c); };

  // ---- document loading, persistence ----
  const openDoc = async (f: File) => {
    const d = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
    const key = `preconexa.takeoff.v1:${f.name}:${f.size}`;
    const saved = store.get<Takeoff>(key);
    loaded.current = false;
    setHist(newHistory(saved ?? empty())); setActiveLayer((saved ?? empty()).layers[0].id);
    setFileKey(key); setDoc(d); setPage(1); setDraft([]); setSelected(null); needFit.current = true;
  };
  useEffect(() => {
    if (!fileKey) return;
    if (!loaded.current) { loaded.current = true; return; }
    const id = setTimeout(() => store.set(fileKey, t), 400);
    return () => clearTimeout(id);
  }, [t, fileKey]);

  // ---- page render ----
  useEffect(() => {
    if (!doc) return;
    let dead = false;
    (async () => {
      const p = await doc.getPage(page);
      const base = p.getViewport({ scale: 1 });
      if (dead) return;
      setPageSize({ w: base.width, h: base.height });
      if (needFit.current && scroller.current) { needFit.current = false; setZoom(fitWidthZoom(scroller.current.clientWidth, base.width)); }
    })();
    return () => { dead = true; };
  }, [doc, page]);
  useEffect(() => {
    if (!doc) return;
    let dead = false;
    (async () => {
      const p = await doc.getPage(page);
      const px = Math.min(zoom * (window.devicePixelRatio || 1), 8192 / Math.max(pageSize.w, pageSize.h));
      const vp = p.getViewport({ scale: px });
      const c = canvas.current; if (!c || dead) return;
      renderTask.current?.cancel();
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      const ctx = c.getContext("2d"); if (!ctx) return;
      const task = p.render({ canvasContext: ctx, viewport: vp });
      renderTask.current = task;
      try { await task.promise; } catch { /* cancelled by a newer render */ }
    })();
    return () => { dead = true; };
  }, [doc, page, zoom, pageSize.w, pageSize.h]);

  // keep the point under the cursor fixed while zooming
  useLayoutEffect(() => {
    const a = anchor.current, s = scroller.current;
    if (a && s && a.zoom === zoom) { s.scrollLeft = a.scrollLeft; s.scrollTop = a.scrollTop; anchor.current = null; }
  }, [zoom]);

  const pageCount = doc?.numPages ?? 0;
  const goPage = useCallback((n: number) => {
    if (!pageCount) return;
    const p = Math.min(pageCount, Math.max(1, n));
    if (p !== page) { setPage(p); setDraft([]); setSelected(null); if (scroller.current) { scroller.current.scrollTop = 0; } }
  }, [pageCount, page]);
  const zoomBy = (factor: number, cx?: number, cy?: number) => {
    const s = scroller.current; if (!s) return;
    const v = zoomAt({ zoom, scrollLeft: s.scrollLeft, scrollTop: s.scrollTop }, cx ?? s.clientWidth / 2, cy ?? s.clientHeight / 2, factor);
    anchor.current = v; setZoom(v.zoom);
  };

  // ---- measurements ----
  const fpu = t.feetPerUnit[page];
  const mine = useMemo(() => t.measurements.filter((m) => m.page === page), [t, page]);
  const layerOf = (id: string) => t.layers.find((l) => l.id === id);
  const colorOf = (m: Measurement) => m.color ?? layerOf(m.layerId)?.color ?? "#2563eb";

  const commit = (kind: Kind, pts: Pt[]) => {
    if (!pts.length) return;
    let label: string, color: string | undefined, lineWidth: number | undefined, symbol = preset?.symbol, layerName = preset?.layerName;
    if (preset && preset.kind === kind) { label = preset.label; color = preset.color; lineWidth = preset.lineWidth; }
    else { symbol = undefined; layerName = undefined; label = prompt("Label for this item (e.g. 2x4 troffer, 3/4 EMT)") || kind; }
    apply((x) => {
      let tk = x, layerId = activeLayer;
      if (layerName) { const r = ensureLayer(x, layerName, color ?? COLORS[x.layers.length % COLORS.length]); tk = r.takeoff; layerId = r.layerId; }
      return { ...tk, measurements: [...tk.measurements, { id: newId("m"), layerId, kind, page, label, pts, color, lineWidth, symbol }] };
    });
    setDraft([]);
  };
  const finish = () => {
    const pts = draft.filter((p, i) => i === 0 || dist(p, draft[i - 1]) > 0.5);
    const kind = kindOf(tool);
    if (kind === "length" && pts.length > 1) commit("length", pts);
    else if (kind === "area" && pts.length > 2) commit("area", pts);
    else if (tool === "calibrate") setDraft([]);
  };
  const pointFrom = (e: { clientX: number; clientY: number; shiftKey: boolean }): Pt => {
    const r = svg.current!.getBoundingClientRect();
    let p = { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
    if (e.shiftKey && draft.length) p = constrainAngle(draft[draft.length - 1], p);
    else p = snapToPoints(p, [...mine.flatMap((m) => m.pts), ...(draft.length > 2 ? [draft[0]] : [])], 8 / zoom);
    return p;
  };

  const onSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (panStart.current?.moved) return;
    if (tool === "select") { setSelected(null); return; }
    if (tool === "pan" || tool === "capture") return;
    const p = pointFrom(e);
    if (tool === "count") return commit("count", [p]);
    const pts = [...draft, p];
    if (tool === "length" && pts.length === 2) return commit("length", pts);
    if (tool === "calibrate") {
      if (pts.length < 2) return setDraft(pts);
      const entered = prompt("How long is the distance you just clicked?\nType it any way you like: 20, 20', 20'-6\", 240 in, 5 m\n(or type the sheet's printed scale, e.g. 1/8\" = 1'-0\")");
      setDraft([]);
      if (!entered || !entered.trim()) return;
      if (dist(pts[0], pts[1]) < 1) { alert("The two points are on top of each other. Click two separate points on the dimension you want to use."); return; }
      const k = entered.includes("=") ? parseArchScale(entered) : (() => { const ft = parseDistance(entered); return ft == null ? null : calibrate(pts[0], pts[1], ft); })();
      if (k == null) { alert(`Couldn't read "${entered}". Try something like 20, 20', 20'-6", 240 in or 5 m, or a scale like 1/8" = 1'-0".`); return; }
      apply((x) => setScale(x, allPages ? Array.from({ length: pageCount }, (_, i) => i + 1) : [page], k));
      setTool("select");
      return;
    }
    setDraft(pts);
  };

  // ---- symbol capture ----
  const capturePointer = (e: React.PointerEvent<SVGSVGElement>, kind: "down" | "move" | "up") => {
    if (tool !== "capture") return;
    const r = svg.current!.getBoundingClientRect();
    const p = { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
    if (kind === "down") { svg.current!.setPointerCapture(e.pointerId); setCapRect({ a: p, b: p }); }
    else if (kind === "move" && capRect) setCapRect({ a: capRect.a, b: p });
    else if (kind === "up" && capRect) {
      const { a } = capRect; setCapRect(null);
      const x = Math.min(a.x, p.x), y = Math.min(a.y, p.y), w = Math.abs(p.x - a.x), h = Math.abs(p.y - a.y);
      const c = canvas.current;
      if (!c || w < 4 || h < 4) return;
      const k = c.width / pageSize.w;
      const out = document.createElement("canvas"); const side = Math.min(96, Math.max(w, h) * k);
      const sc = side / Math.max(w * k, h * k);
      out.width = Math.max(1, Math.round(w * k * sc)); out.height = Math.max(1, Math.round(h * k * sc));
      out.getContext("2d")?.drawImage(c, x * k, y * k, w * k, h * k, 0, 0, out.width, out.height);
      const name = prompt("Name this symbol (e.g. Exit sign, Smoke detector)");
      if (!name) return;
      const target = chest.sets.find((s) => s.name === "My Symbols") ?? chest.sets[0];
      if (!target) return;
      const np: Omit<ToolPreset, "id"> = { name, kind: "count", color: "#2563eb", lineWidth: 2, label: name, layerName: "Symbols",
        symbol: { shape: "image", image: out.toDataURL("image/png"), size: Math.min(40, Math.max(14, Math.max(w, h))) } };
      setChest(addTool(chest, target.id, np));
      setTab("chest"); setTool("select");
    }
  };

  // ---- commands ----
  const run = (cmd: Command) => {
    switch (cmd) {
      case "tool:select": case "tool:pan": case "tool:calibrate": case "tool:capture": {
        const tt = cmd.slice(5) as Tool; setTool(tt); setDraft([]); if (tt !== "select") setPreset(null); if (tt === "calibrate") setPreset(null); break; }
      case "tool:length": case "tool:polylength": case "tool:area": case "tool:count": {
        const tt = cmd.slice(5) as Tool; setTool(tt); setDraft([]);
        if (preset && preset.kind !== kindOf(tt)) setPreset(null); break; }
      case "page:next": goPage(page + 1); break;
      case "page:prev": goPage(page - 1); break;
      case "page:first": goPage(1); break;
      case "page:last": goPage(pageCount); break;
      case "zoom:in": zoomBy(1.25); break;
      case "zoom:out": zoomBy(0.8); break;
      case "zoom:fit": if (scroller.current) { const z = fitWidthZoom(scroller.current.clientWidth, pageSize.w); anchor.current = { zoom: z, scrollLeft: 0, scrollTop: 0 }; setZoom(z); } break;
      case "wheel:toggle": setWheelMode((m) => (m === "zoom" ? "page" : "zoom")); break;
      case "undo": setHist(undoH); break;
      case "redo": setHist(redoH); break;
      case "delete": if (selected) { apply((x) => ({ ...x, measurements: x.measurements.filter((m) => m.id !== selected) })); setSelected(null); } break;
      case "backspace-point": setDraft((d) => d.slice(0, -1)); break;
      case "finish": finish(); break;
      case "cancel": if (draft.length || capRect) { setDraft([]); setCapRect(null); } else { setTool("select"); setPreset(null); } break;
    }
  };
  const arm = (p: ToolPreset) => { setPreset(p); setTool(p.kind === "count" ? "count" : p.kind === "area" ? "area" : "polylength"); setDraft([]); };

  // keyboard (re-bound every render so handlers see current state)
  useEffect(() => {
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (e.key === " ") { e.preventDefault(); setSpaceDown(true); return; }
      const cmd = commandForKey(e);
      if (cmd) { e.preventDefault(); run(cmd); }
    };
    const up = (e: KeyboardEvent) => { if (e.key === " ") setSpaceDown(false); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  });

  // wheel (needs a non-passive listener to prevent default scrolling)
  useEffect(() => {
    const s = scroller.current; if (!s) return;
    const onWheel = (e: WheelEvent) => {
      const a = resolveWheel(wheelMode, e);
      e.preventDefault();
      if (a.type === "scroll") { if (e.shiftKey) s.scrollLeft += e.deltaY || e.deltaX; else s.scrollTop += e.deltaY; return; }
      if (a.type === "zoom") { const r = s.getBoundingClientRect(); zoomBy(a.factor, e.clientX - r.left, e.clientY - r.top); return; }
      const r = stepAccumulator(wheelAcc.current, e.deltaY); wheelAcc.current = r.acc;
      if (r.step) goPage(page + r.step);
    };
    s.addEventListener("wheel", onWheel, { passive: false });
    return () => s.removeEventListener("wheel", onWheel);
  });

  // ---- panning: middle button (wheel press), Space+drag, or Pan tool ----
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = scroller.current; if (!s) return;
    if (e.button === 1 || (e.button === 0 && (spaceDown || tool === "pan"))) {
      e.preventDefault();
      panStart.current = { x: e.clientX, y: e.clientY, sl: s.scrollLeft, st: s.scrollTop, moved: false };
      s.setPointerCapture(e.pointerId); setPanning(true);
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = panStart.current, s = scroller.current; if (!p || !s) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) p.moved = true;
    s.scrollLeft = p.sl - dx; s.scrollTop = p.st - dy;
  };
  const endPan = () => { setPanning(false); setTimeout(() => { panStart.current = null; }, 0); };

  // ---- selection helpers ----
  const sel = t.measurements.find((m) => m.id === selected) ?? null;
  const patchSel = (patch: Partial<Measurement>) => apply((x) => ({ ...x, measurements: x.measurements.map((m) => (m.id === selected ? { ...m, ...patch } : m)) }));
  const addSelToChest = (setId: string) => {
    if (!sel) return;
    setChest(addTool(chest, setId, { name: sel.label, kind: sel.kind, color: colorOf(sel), lineWidth: sel.lineWidth ?? 2, label: sel.label, layerName: layerOf(sel.layerId)?.name, symbol: sel.symbol }));
    setTab("chest");
  };

  const cursorStyle = panning ? "grabbing" : spaceDown || tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair";
  const summary = useMemo(() => summarize(t), [t]);
  const scaleLabel = fpu ? (SCALE_PRESETS.find((p) => Math.abs(presetFeetPerUnit(p.feetPerPaperInch) - fpu) < 1e-6)?.label ?? `${(fpu * 72).toFixed(2)} ft per paper inch`) : "NOT calibrated";
  const b = (on: boolean) => ({ fontWeight: on ? 700 : 400, background: on ? "#dbeafe" : undefined });
  const TOOLS: [Tool, string][] = [["select", "Select (V)"], ["pan", "Pan (⇧V)"], ["length", "Length (L)"], ["polylength", "Polylength (⇧N)"], ["area", "Area (A)"], ["count", "Count (C)"], ["calibrate", "Calibrate (K)"], ["capture", "Capture symbol (⇧S)"]];

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <div ref={scroller} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPan} onPointerCancel={endPan}
          onAuxClick={(e) => e.preventDefault()} onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
          style={{ position: "absolute", inset: 0, overflow: "auto", background: "#e5e7eb", cursor: cursorStyle, touchAction: "none" }}>
          {!doc && <p style={{ padding: 24 }}>Open a PDF print to begin. Scroll to zoom, press <b>W</b> to make the wheel change pages, press the wheel and drag to move the page.</p>}
          <div style={{ position: "relative", width: pageSize.w * zoom, height: pageSize.h * zoom, margin: 12, display: doc ? "block" : "none", boxShadow: "0 1px 6px #0004", background: "#fff" }}>
            <canvas ref={canvas} style={{ width: pageSize.w * zoom, height: pageSize.h * zoom, display: "block" }} />
            <svg ref={svg} width={pageSize.w * zoom} height={pageSize.h * zoom} viewBox={`0 0 ${pageSize.w} ${pageSize.h}`}
              style={{ position: "absolute", inset: 0 }} onClick={onSvgClick} onDoubleClick={() => { if (tool === "polylength" || tool === "area") finish(); }}
              onPointerMove={(e) => { setCursor(pointFrom(e)); capturePointer(e, "move"); }} onPointerDown={(e) => capturePointer(e, "down")} onPointerUp={(e) => capturePointer(e, "up")}>
              {mine.map((m) => {
                const l = layerOf(m.layerId); if (!l?.visible) return null;
                const c = colorOf(m), isSel = m.id === selected, hit = tool === "select" ? "all" : "none";
                const pick = (e: React.MouseEvent) => { if (tool === "select") { e.stopPropagation(); setSelected(m.id); } };
                if (m.kind === "count") {
                  const p = m.pts[0];
                  return <g key={m.id} onClick={pick} style={{ pointerEvents: hit }}>{m.symbol ? <SymbolMark symbol={m.symbol} cx={p.x} cy={p.y} color={c} selected={isSel} /> : <circle cx={p.x} cy={p.y} r={6} fill={c} stroke={isSel ? "#000" : "none"} strokeWidth={2} vectorEffect="non-scaling-stroke" />}</g>;
                }
                const pts = m.pts.map((p) => `${p.x},${p.y}`).join(" ");
                return (
                  <g key={m.id} onClick={pick} style={{ pointerEvents: hit }}>
                    {m.kind === "area"
                      ? <polygon points={pts} fill={c + "33"} stroke={isSel ? "#000" : c} strokeWidth={isSel ? 3 : (m.lineWidth ?? 2)} vectorEffect="non-scaling-stroke" />
                      : <polyline points={pts} fill="none" stroke={isSel ? "#000" : c} strokeWidth={isSel ? 3 : (m.lineWidth ?? 2)} vectorEffect="non-scaling-stroke" />}
                    <polyline points={pts} fill="none" stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke" />
                    {isSel && m.pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#000" vectorEffect="non-scaling-stroke" />)}
                  </g>
                );
              })}
              {draft.length > 0 && <polyline points={[...draft, ...(cursor ? [cursor] : [])].map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#000" strokeDasharray="5 4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
              {tool === "count" && cursor && preset?.symbol && <g opacity={0.5}><SymbolMark symbol={preset.symbol} cx={cursor.x} cy={cursor.y} color={preset.color} /></g>}
              {capRect && <rect x={Math.min(capRect.a.x, capRect.b.x)} y={Math.min(capRect.a.y, capRect.b.y)} width={Math.abs(capRect.b.x - capRect.a.x)} height={Math.abs(capRect.b.y - capRect.a.y)} fill="#2563eb22" stroke="#2563eb" strokeDasharray="4" vectorEffect="non-scaling-stroke" />}
            </svg>
          </div>
        </div>
        <div style={{ position: "absolute", left: 12, bottom: 8, background: "#000a", color: "#fff", padding: "3px 8px", borderRadius: 4, fontSize: 12, pointerEvents: "none" }}>
          {doc ? `Page ${page}/${pageCount} · ${Math.round(zoom * 100)}% · Scale: ${scaleLabel} · Wheel: ${wheelMode === "zoom" ? "zoom" : "pages"} · ` : ""}{HINT[tool]}{preset ? ` [${preset.name}]` : ""}
        </div>
      </div>

      <aside style={{ width: 360, display: "flex", flexDirection: "column", borderLeft: "1px solid #ccc", minHeight: 0 }}>
        <div style={{ padding: 8, borderBottom: "1px solid #ddd" }}>
          <input type="file" accept="application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void openDoc(f); }} />
          {doc && <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => run("page:prev")}>‹</button>
            <input type="number" min={1} max={pageCount} value={page} onChange={(e) => goPage(Number(e.target.value))} style={{ width: 56 }} />
            <span>/ {pageCount}</span><button onClick={() => run("page:next")}>›</button>
            <button onClick={() => run("zoom:out")}>−</button><button onClick={() => run("zoom:in")}>+</button><button onClick={() => run("zoom:fit")}>Fit</button>
            <button style={b(wheelMode === "page")} title="W" onClick={() => run("wheel:toggle")}>Wheel: {wheelMode === "zoom" ? "Zoom" : "Pages"}</button>
          </div>}
          <div style={{ marginTop: 6 }}>
            <button disabled={!canUndo(hist)} onClick={() => run("undo")}>Undo</button>{" "}<button disabled={!canRedo(hist)} onClick={() => run("redo")}>Redo</button>{" "}
            <button onClick={() => download("takeoff-summary.csv", summaryCsv(t))}>CSV</button>{" "}
            <button onClick={() => download("takeoff-detail.csv", toCsv(t))}>Detail CSV</button>{" "}
            <button onClick={() => download("takeoff.json", JSON.stringify(t, null, 1))}>Save JSON</button>
          </div>
        </div>
        <div style={{ display: "flex" }}>{(["tools", "chest", "qty", "help"] as const).map((k) =>
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, ...b(tab === k), borderRadius: 0 }}>{k === "tools" ? "Tools" : k === "chest" ? "Tool Chest" : k === "qty" ? "Quantities" : "Keys"}</button>)}</div>

        <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
          {tab === "tools" && <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{TOOLS.map(([k, n]) => <button key={k} style={b(tool === k)} onClick={() => run(`tool:${k}` as Command)}>{n}</button>)}</div>
            <h4>Scale (page {page})</h4>
            <div><b>{scaleLabel}</b></div>
            <select value="" onChange={(e) => { const p = SCALE_PRESETS.find((x) => x.label === e.target.value); if (p) apply((x) => setScale(x, allPages ? Array.from({ length: pageCount }, (_, i) => i + 1) : [page], presetFeetPerUnit(p.feetPerPaperInch))); }}>
              <option value="">Set a standard scale…</option>{SCALE_PRESETS.map((p) => <option key={p.label}>{p.label}</option>)}
            </select>
            <label style={{ display: "block", marginTop: 4 }}><input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} /> Apply scale to all pages</label>
            <small>Standard scales assume the sheet prints at full size. Calibrate (K) against a known dimension to be sure.</small>
            <h4>Layers</h4>
            {t.layers.map((l) => (
              <div key={l.id}>
                <input type="radio" checked={activeLayer === l.id} onChange={() => setActiveLayer(l.id)} title="Active layer for new markups" />
                <input type="checkbox" checked={l.visible} title="Visible" onChange={() => apply((x) => ({ ...x, layers: x.layers.map((y) => (y.id === l.id ? { ...y, visible: !y.visible } : y)) }))} />
                <span style={{ color: l.color }}> ■ </span>{l.name}{" "}
                <button onClick={() => { if (t.layers.length > 1 && confirm(`Delete layer "${l.name}" and its markups?`)) { const n = deleteLayer(t, l.id); apply(() => n); setActiveLayer(n.layers[0].id); } }}>delete</button>
              </div>))}
            <button onClick={() => { const name = prompt("Layer name"); if (name) { const id = newId("l"); apply((x) => ({ ...x, layers: [...x.layers, { id, name, color: COLORS[x.layers.length % COLORS.length], visible: true }] })); setActiveLayer(id); } }}>+ layer</button>
            {sel && <>
              <h4>Selected markup</h4>
              <label>Label <input value={sel.label} onChange={(e) => patchSel({ label: e.target.value })} /></label><br />
              <label>Layer <select value={sel.layerId} onChange={(e) => patchSel({ layerId: e.target.value })}>{t.layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label><br />
              <label>Color <input type="color" value={colorOf(sel)} onChange={(e) => patchSel({ color: e.target.value })} /></label>
              <label> Line <input type="number" min={1} max={12} value={sel.lineWidth ?? 2} style={{ width: 48 }} onChange={(e) => patchSel({ lineWidth: Number(e.target.value) })} /></label>
              {sel.symbol && <label> Size <input type="number" min={4} max={80} value={sel.symbol.size} style={{ width: 48 }} onChange={(e) => patchSel({ symbol: { ...sel.symbol!, size: Number(e.target.value) } })} /></label>}
              <div>Quantity: <b>{(() => { const q = quantity(sel, t.feetPerUnit[sel.page]); return q == null ? "uncalibrated" : q.toFixed(2); })()}</b></div>
              <select value="" onChange={(e) => { if (e.target.value) addSelToChest(e.target.value); }}><option value="">Add to Tool Chest…</option>{chest.sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>{" "}
              <button onClick={() => run("delete")}>Delete</button>
            </>}
          </>}
          {tab === "chest" && <ToolChestPanel chest={chest} setChest={setChest} activeId={preset?.id ?? null} onArm={arm} onCapture={() => run("tool:capture")} onReset={() => setChest(defaultChest())} download={download} />}
          {tab === "qty" && <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ textAlign: "left" }}><th>Layer</th><th>Item</th><th>#</th><th>Qty</th></tr></thead>
            <tbody>{summary.map((r, i) => <tr key={i} style={{ borderTop: "1px solid #eee" }}><td>{r.layer}</td><td>{r.label}</td><td>{r.items}</td><td>{r.qty == null ? "uncalibrated" : `${r.qty.toFixed(1)} ${r.unit}`}</td></tr>)}</tbody></table>}
          {tab === "help" && <table>{SHORTCUT_HELP.map(([k, d]) => <tr key={k}><td style={{ paddingRight: 8, whiteSpace: "nowrap" }}><b>{k}</b></td><td>{d}</td></tr>)}</table>}
        </div>
      </aside>
    </div>
  );
}
