import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { SymbolMark } from "./components/SymbolMark";
import { ToolChestPanel } from "./components/ToolChestPanel";
import { Icon } from "./components/Icons";
import type { IconName } from "./components/Icons";
import { MenuBar } from "./components/MenuBar";
import type { Menu } from "./components/MenuBar";
import { Thumbs } from "./components/Thumbs";
import { SCALE_PRESETS, calibrate, dist, parseArchScale, parseDistance, presetFeetPerUnit } from "./lib/measure";
import type { Pt } from "./lib/measure";
import { Command, SHORTCUT_HELP, View, WheelMode, commandForKey, fitWidthZoom, resolveWheel, stepAccumulator, zoomAt } from "./lib/nav";
import { constrainAngle } from "./lib/snap";
import { ContextMenu } from "./components/ContextMenu";
import type { CtxItem } from "./components/ContextMenu";
import { DEFAULT_SNAP, SnapIndex } from "./lib/snapindex";
import type { Seg, SnapHit, SnapOpts } from "./lib/snapindex";
import { extractGeometry } from "./lib/pdfgeom";
import type { OpList, OpsTable } from "./lib/pdfgeom";
import { detectScales, parseScaleText, sheetInfo } from "./lib/scaledetect";
import type { ScaleCandidate } from "./lib/scaledetect";
import { insertPoint, nearestOnSegment, removePoint, translate } from "./lib/geom";
import { History, newHistory, push, redo as redoH, undo as undoH, canRedo, canUndo } from "./lib/history";
import { Kind, Measurement, Takeoff, deleteLayer, ensureLayer, quantity, setScale, summarize, summaryCsv, toCsv } from "./lib/takeoff";
import { ToolChest, ToolPreset, addTool, defaultChest, newId } from "./lib/toolchest";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Tool = "select" | "pan" | "length" | "polylength" | "area" | "count" | "calibrate" | "capture";
const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];
const CHEST_KEY = "preconexa.chest.v1";
const SNAP_KEY = "preconexa.snap.v1";
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
const inPoly = (p: Pt, pts: Pt[]) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if ((pts[i].y > p.y) !== (pts[j].y > p.y) && p.x < ((pts[j].x - pts[i].x) * (p.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) c = !c;
  }
  return c;
};
const kindOf = (t: Tool): Kind | null => (t === "length" || t === "polylength" ? "length" : t === "area" ? "area" : t === "count" ? "count" : null);
const HINT: Record<Tool, string> = {
  select: "Click a markup to select it, drag to move, drag a handle to reshape. Right-click for options.", pan: "Drag to pan.",
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
  const [leftTab, setLeftTab] = useState<"pages" | "chest" | "layers" | null>("pages");
  const [rightTab, setRightTab] = useState<"props" | "qty" | "markups" | "keys" | null>("props");
  const fileIn = useRef<HTMLInputElement>(null);
  const loadIn = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [capRect, setCapRect] = useState<{ a: Pt; b: Pt } | null>(null);
  const [allPages, setAllPages] = useState(true);
  const savedSnap = useMemo(() => store.get<{ on: boolean; opts: SnapOpts }>(SNAP_KEY), []);
  const [snapOn, setSnapOn] = useState<boolean>(savedSnap?.on ?? true);
  const [snapOpts, setSnapOpts] = useState<SnapOpts>({ ...DEFAULT_SNAP, ...(savedSnap?.opts ?? {}) });
  const [snapHit, setSnapHit] = useState<SnapHit | null>(null);
  const [geoVer, setGeoVer] = useState(0);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null);
  const [liveMods, setLiveMods] = useState<{ id: string; pts: Pt[] } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [scaleText, setScaleText] = useState("");
  const [detect, setDetect] = useState<{ page: number; cands: ScaleCandidate[]; nts: boolean; noText: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

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
  const geoCache = useRef(new Map<number, SnapIndex>());
  const geoDoc = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const drag = useRef<{ id: string; idx: number | null; start: Pt; orig: Pt[]; moved: boolean } | null>(null);
  const liveRef = useRef<Pt[] | null>(null);
  const justDragged = useRef(0);
  const autoTried = useRef(new Set<string>());

  const apply = useCallback((fn: (x: Takeoff) => Takeoff) => setHist((h) => push(h, fn(h.present))), []);
  const setChest = (c: ToolChest) => { setChestState(c); store.set(CHEST_KEY, c); };

  // ---- document loading, persistence ----
  const openDoc = async (f: File) => {
    const d = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
    const key = `preconexa.takeoff.v1:${f.name}:${f.size}`;
    const saved = store.get<Takeoff>(key);
    loaded.current = false;
    setHist(newHistory(saved ?? empty())); setActiveLayer((saved ?? empty()).layers[0].id);
    geoCache.current.clear(); setDetect(null);
    setFileName(f.name); setFileKey(key); setDoc(d); setPage(1); setDraft([]); setSelected(null); needFit.current = true;
  };
  useEffect(() => {
    if (!fileKey) return;
    if (!loaded.current) { loaded.current = true; return; }
    const id = setTimeout(() => store.set(fileKey, t), 400);
    return () => clearTimeout(id);
  }, [t, fileKey]);

  useEffect(() => { store.set(SNAP_KEY, { on: snapOn, opts: snapOpts }); }, [snapOn, snapOpts]);
  useEffect(() => { if (!msg) return; const id = setTimeout(() => setMsg(""), 7000); return () => clearTimeout(id); }, [msg]);

  // ---- vector geometry for snapping (read from the PDF drawing instructions) ----
  useEffect(() => {
    if (!doc) return;
    if (geoDoc.current !== doc) { geoDoc.current = doc; geoCache.current.clear(); }
    if (geoCache.current.has(page)) return;
    let dead = false;
    (async () => {
      let idx: SnapIndex;
      try {
        const p = await doc.getPage(page);
        const list = await p.getOperatorList();
        const g = extractGeometry(list as unknown as OpList, pdfjs.OPS as unknown as OpsTable, p.getViewport({ scale: 1 }).transform as number[]);
        idx = new SnapIndex(g.segs, g.centers);
      } catch { idx = new SnapIndex([], []); }
      if (dead || geoDoc.current !== doc) return;
      geoCache.current.set(page, idx); setGeoVer((v) => v + 1);
    })();
    return () => { dead = true; };
  }, [doc, page]);

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

  const mIdx = useMemo(() => {
    const segs: Seg[] = [], centers: Pt[] = [];
    for (const m of mine) {
      if (m.id === dragId || !t.layers.find((l) => l.id === m.layerId)?.visible) continue;
      if (m.kind === "count") { centers.push(m.pts[0]); continue; }
      const n = m.pts.length;
      for (let i = 0; i + 1 < n; i++) segs.push([m.pts[i].x, m.pts[i].y, m.pts[i + 1].x, m.pts[i + 1].y]);
      if (m.kind === "area" && n > 2) segs.push([m.pts[n - 1].x, m.pts[n - 1].y, m.pts[0].x, m.pts[0].y]);
    }
    return new SnapIndex(segs, centers);
  }, [mine, t.layers, dragId]);

  const say = (s: string) => setMsg(s);
  const patchM = (id: string, patch: Partial<Measurement>) => apply((x) => ({ ...x, measurements: x.measurements.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  const toggleLock = (id: string | null) => { const m = t.measurements.find((y) => y.id === id); if (m) { patchM(m.id, { locked: !m.locked }); say(m.locked ? "Unlocked." : "Locked. It can't be moved, edited or deleted until unlocked."); } };
  const duplicate = (id: string | null) => {
    const m = t.measurements.find((y) => y.id === id); if (!m) return;
    const nid = newId("m");
    apply((x) => ({ ...x, measurements: [...x.measurements, { ...m, id: nid, pts: translate(m.pts, 12, 12), locked: false }] }));
    setSelected(nid);
  };
  const reorder = (id: string, front: boolean) => apply((x) => {
    const m = x.measurements.find((y) => y.id === id); if (!m) return x;
    const rest = x.measurements.filter((y) => y.id !== id);
    return { ...x, measurements: front ? [...rest, m] : [m, ...rest] };
  });
  const removeM = (m: Measurement) => { if (m.locked) { say("That markup is locked. Right-click it and choose Unlock first."); return; } apply((x) => ({ ...x, measurements: x.measurements.filter((y) => y.id !== m.id) })); setSelected(null); };

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
  /** Pointer position in page units, snapped to drawing geometry and markups unless Shift (angle lock) or snap is off. */
  const resolve = (e: { clientX: number; clientY: number; shiftKey: boolean }, noSnap = false): { p: Pt; hit: SnapHit | null } => {
    const r = svg.current!.getBoundingClientRect();
    const p = { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
    if (e.shiftKey && draft.length) return { p: constrainAngle(draft[draft.length - 1], p), hit: null };
    if (!snapOn || noSnap) return { p, hit: null };
    const rad = 10 / zoom, hits: SnapHit[] = [];
    const g = geoCache.current.get(page)?.query(p, rad, snapOpts); if (g) hits.push(g);
    const m = mIdx.query(p, rad, snapOpts); if (m) hits.push(m);
    if (draft.length > 2) { const d = dist(p, draft[0]); if (d <= rad) hits.push({ pt: draft[0], kind: "end", score: d - rad }); }
    if (!hits.length) return { p, hit: null };
    const best = hits.reduce((a, b) => (b.score < a.score ? b : a));
    return { p: best.pt, hit: best };
  };

  // ---- hit testing, dragging, right-click ----
  const hitTest = (p: Pt): { m: Measurement; vertex: number | null; onEdge: boolean } | null => {
    const tol = 8 / zoom;
    for (let i = mine.length - 1; i >= 0; i--) {
      const m = mine[i]; if (!layerOf(m.layerId)?.visible) continue;
      const pts = m.pts;
      if (m.kind === "count") { if (dist(p, pts[0]) <= Math.max(tol, (m.symbol?.size ?? 12) / 2)) return { m, vertex: null, onEdge: false }; continue; }
      const vi = pts.findIndex((q) => dist(p, q) <= tol); if (vi >= 0) return { m, vertex: vi, onEdge: false };
      const n = pts.length; let edge = Infinity;
      for (let k = 0; k + 1 < n + (m.kind === "area" ? 1 : 0); k++) edge = Math.min(edge, nearestOnSegment(p, pts[k], pts[(k + 1) % n]).d);
      if (edge <= tol) return { m, vertex: null, onEdge: true };
      if (m.kind === "area" && inPoly(p, pts)) return { m, vertex: null, onEdge: false };
    }
    return null;
  };
  const startDrag = (e: React.PointerEvent, m: Measurement, idx: number | null) => {
    if (e.button !== 0 || tool !== "select" || spaceDown) return;
    e.stopPropagation();
    setSelected(m.id); setRightTab((r) => r ?? "props");
    if (m.locked) return;
    drag.current = { id: m.id, idx, start: resolve(e, true).p, orig: m.pts, moved: false }; liveRef.current = null;
    setDragId(idx == null ? null : m.id);
  };
  const dragMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current; if (!d) return;
    const raw = resolve(e, true).p;
    if (!d.moved) { if (Math.hypot(raw.x - d.start.x, raw.y - d.start.y) * zoom < 3) return; d.moved = true; svg.current?.setPointerCapture(e.pointerId); }
    let pts: Pt[];
    if (d.idx != null) { const r = resolve(e); setSnapHit(r.hit); pts = d.orig.map((q, i) => (i === d.idx ? r.p : q)); }
    else pts = translate(d.orig, raw.x - d.start.x, raw.y - d.start.y);
    liveRef.current = pts; setLiveMods({ id: d.id, pts });
  };
  const dragEnd = () => {
    const d = drag.current, pts = liveRef.current;
    drag.current = null; liveRef.current = null; setDragId(null); setSnapHit(null);
    if (d?.moved && pts) { justDragged.current = performance.now(); patchM(d.id, { pts }); }
    setLiveMods(null);
  };
  const dragCancel = () => { drag.current = null; liveRef.current = null; setDragId(null); setLiveMods(null); setSnapHit(null); };

  const openCtx = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (!doc || panStart.current?.moved) return;
    const at = { x: e.clientX, y: e.clientY };
    const p = resolve(e, true).p;
    if (draft.length && tool !== "select") {
      setCtx({ ...at, items: [
        { label: "Finish", shortcut: "Enter", onClick: finish }, { label: "Remove last point", shortcut: "Backspace", onClick: () => run("backspace-point") },
        { sep: true, label: "" }, { label: "Cancel", shortcut: "Esc", onClick: () => run("cancel") }] });
      return;
    }
    const h = hitTest(p);
    if (!h) {
      setCtx({ ...at, items: [
        { label: "Select", shortcut: "V", checked: tool === "select", onClick: () => run("tool:select") }, { label: "Pan", shortcut: "Shift+V", checked: tool === "pan", onClick: () => run("tool:pan") },
        { sep: true, label: "" }, { label: "Fit width", shortcut: "Ctrl+0", onClick: () => run("zoom:fit") },
        { label: "Snap to edges and centers", shortcut: "S", checked: snapOn, onClick: () => run("snap:toggle") },
        { sep: true, label: "" }, { label: "Calibrate…", shortcut: "K", onClick: () => run("tool:calibrate") }, { label: "Set page scale…", onClick: () => setRightTab("qty") }] });
      return;
    }
    const { m, vertex, onEdge } = h, lk = !!m.locked, min = m.kind === "area" ? 3 : 2;
    setSelected(m.id);
    const items: CtxItem[] = [
      { label: "Properties", onClick: () => { setSelected(m.id); setRightTab("props"); } },
      { label: lk ? "Unlock" : "Lock", shortcut: "Shift+L", onClick: () => toggleLock(m.id) },
      { sep: true, label: "" },
      { label: "Move to layer", header: true },
      ...t.layers.map((l): CtxItem => ({ label: l.name, sub: true, checked: l.id === m.layerId, disabled: lk, onClick: () => patchM(m.id, { layerId: l.id }) })),
      { sep: true, label: "" },
      { label: "Duplicate", shortcut: "Ctrl+D", onClick: () => duplicate(m.id) },
      { label: "Bring to front", onClick: () => reorder(m.id, true) }, { label: "Send to back", onClick: () => reorder(m.id, false) },
      { sep: true, label: "" },
      { label: "Add to Tool Chest", header: true },
      ...chest.sets.map((s): CtxItem => ({ label: s.name, sub: true, onClick: () => addToChest(m, s.id) })),
    ];
    if (m.kind !== "count") {
      items.push({ sep: true, label: "" });
      if (vertex != null) items.push({ label: "Delete point", disabled: lk || m.pts.length <= min, onClick: () => { const r = removePoint(m.pts, vertex, min); if (r) patchM(m.id, { pts: r }); } });
      else if (onEdge) items.push({ label: "Add point here", disabled: lk, onClick: () => patchM(m.id, { pts: insertPoint(m.pts, p, m.kind === "area") }) });
    }
    items.push({ sep: true, label: "" }, { label: "Delete", shortcut: "Del", disabled: lk, onClick: () => removeM(m) });
    setCtx({ ...at, items });
  };

  const onSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (panStart.current?.moved || performance.now() - justDragged.current < 300) return;
    if (tool === "select") { setSelected(null); return; }
    if (tool === "pan" || tool === "capture") return;
    const p = resolve(e).p;
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
      setLeftTab("chest"); setTool("select");
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
      case "delete": { const cur = t.measurements.find((m) => m.id === selected); if (cur) removeM(cur); break; }
      case "snap:toggle": setSnapOn(!snapOn); say(snapOn ? "Snap off. Click exactly where you want points." : "Snap on: ends, centers, midpoints and edges."); break;
      case "duplicate": duplicate(selected); break;
      case "lock:toggle": toggleLock(selected); break;
      case "backspace-point": setDraft((d) => d.slice(0, -1)); break;
      case "finish": finish(); break;
      case "cancel": if (ctx) setCtx(null); else if (drag.current) dragCancel(); else if (draft.length || capRect) { setDraft([]); setCapRect(null); } else { setTool("select"); setPreset(null); } break;
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
  const patchSel = (patch: Partial<Measurement>) => { if (selected) patchM(selected, patch); };
  const addToChest = (m: Measurement, setId: string) => {
    setChest(addTool(chest, setId, { name: m.label, kind: m.kind, color: colorOf(m), lineWidth: m.lineWidth ?? 2, label: m.label, layerName: layerOf(m.layerId)?.name, symbol: m.symbol }));
    setLeftTab("chest");
  };

  const cursorStyle = panning ? "grabbing" : spaceDown || tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair";
  const summary = useMemo(() => summarize(t), [t]);
  const scaleLabel = fpu ? (SCALE_PRESETS.find((p) => Math.abs(presetFeetPerUnit(p.feetPerPaperInch) - fpu) < 1e-6)?.label ?? `${(fpu * 72).toFixed(2)} ft per paper inch`) : "Not calibrated";
  const geo = geoVer >= 0 ? geoCache.current.get(page) : undefined;
  const snapLabel = !snapOn ? "off" : !geo ? "reading drawing…" : geo.size === 0 ? "markups only (no vector lines on this sheet)" : `on · ${geo.size.toLocaleString()} edges`;
  const allPageList = () => Array.from({ length: pageCount }, (_, i) => i + 1);
  const loadTakeoff = async (f: File) => {
    try {
      const o = JSON.parse(await f.text()) as Partial<Takeoff>;
      if (!Array.isArray(o.layers) || !o.layers.length || !Array.isArray(o.measurements) || typeof o.feetPerUnit !== "object" || !o.feetPerUnit) throw new Error("bad");
      const next = o as Takeoff;
      apply(() => next); setActiveLayer(next.layers[0].id); setSelected(null);
    } catch { alert("That file isn't a Preconexa takeoff (.json) file."); }
  };

  // ---- scale: typed input and auto-detect from the sheet's text ----
  const runDetect = async (pg: number) => {
    const p = await doc!.getPage(pg);
    const tc = await p.getTextContent();
    const items = tc.items.map((i) => ("str" in i ? i.str : ""));
    const vp = p.getViewport({ scale: 1 });
    const r = detectScales(items);
    return { cands: r.candidates, nts: r.nts, noText: items.join("").trim().length === 0, info: sheetInfo(vp.width, vp.height) };
  };
  useEffect(() => {
    if (!doc || !fileKey || fpu != null) return;
    const key = `${fileKey}#${page}`;
    if (autoTried.current.has(key)) return;
    autoTried.current.add(key);
    let dead = false, done = false;
    (async () => {
      try {
        const r = await runDetect(page);
        done = true; if (dead) return;
        setDetect({ page, cands: r.cands, nts: r.nts, noText: r.noText });
        if (r.cands.length === 1 && r.info.trusted && !r.nts) {
          const c = r.cands[0];
          apply((x) => (x.feetPerUnit[page] != null ? x : setScale(x, [page], presetFeetPerUnit(c.feetPerPaperInch), `auto-detected "${c.text}"`)));
          setMsg(`Page ${page}: scale set to ${c.text} from the sheet's text. Check it against a known dimension.`);
        } else if (r.cands.length > 0) { setRightTab("qty"); setMsg(`Page ${page}: found ${r.cands.length > 1 ? "several scales" : "a scale on a reduced or not-to-scale sheet"}. Pick the right one in the Measurements panel.`); }
      } catch { done = true; }
    })();
    return () => { dead = true; if (!done) autoTried.current.delete(key); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page, fileKey, fpu]);
  const detectNow = async () => {
    if (!doc) return; setBusy(true);
    try { const r = await runDetect(page); setDetect({ page, cands: r.cands, nts: r.nts, noText: r.noText }); if (!r.cands.length) setMsg(r.noText ? "This sheet has no readable text (it's probably a scan). Type the scale or calibrate instead." : "No scale found in this sheet's text. Type it or calibrate."); }
    catch { setMsg("Couldn't read this page's text."); }
    setBusy(false);
  };
  const scanAll = async () => {
    if (!doc) return; setBusy(true);
    const hits: { page: number; c: ScaleCandidate }[] = []; let multi = 0, none = 0;
    for (let pg = 1; pg <= pageCount; pg++) {
      if (t.feetPerUnit[pg] != null) continue;
      try { const r = await runDetect(pg); if (r.cands.length === 1 && r.info.trusted && !r.nts) hits.push({ page: pg, c: r.cands[0] }); else if (r.cands.length > 1) multi++; else none++; } catch { none++; }
    }
    apply((x) => hits.reduce((acc, h) => (acc.feetPerUnit[h.page] != null ? acc : setScale(acc, [h.page], presetFeetPerUnit(h.c.feetPerPaperInch), `auto-detected "${h.c.text}"`)), x));
    setBusy(false);
    setMsg(`Scan finished: scale set on ${hits.length} page(s); ${multi} had several scales (set those by hand); ${none} had none.`);
  };
  const useCandidate = (c: ScaleCandidate) => { apply((x) => setScale(x, [page], presetFeetPerUnit(c.feetPerPaperInch), `from sheet text "${c.text}"`)); setMsg(`Page ${page}: scale set to ${c.text}.`); };
  const applyTyped = () => {
    const k = parseScaleText(scaleText);
    if (k == null) { setMsg(`Couldn't read "${scaleText}". Try 1/8" = 1'-0", 1/8=1', 1" = 20' or 1:48.`); return; }
    apply((x) => setScale(x, allPages ? allPageList() : [page], presetFeetPerUnit(k), `typed "${scaleText.trim()}"`));
    setMsg(`Scale set to ${scaleText.trim()} on ${allPages ? "all pages" : `page ${page}`}.`); setScaleText("");
  };
  const info = sheetInfo(pageSize.w, pageSize.h);
  const cur = detect && detect.page === page ? detect : null;

  const tb = (icon: IconName, title: string, onClick: () => void, on = false, disabled = false, text?: string) => (
    <button className={"tbtn" + (on ? " on" : "")} title={title} aria-label={title} disabled={disabled} onClick={onClick}><Icon name={icon} />{text}</button>
  );
  const rail = (icon: IconName, title: string, on: boolean, onClick: () => void) => (
    <button className={"tbtn" + (on ? " on" : "")} title={title} aria-label={title} onClick={onClick}><Icon name={icon} /></button>
  );
  const toggle = <K,>(cur: K | null, v: K, set: (x: K | null) => void) => set(cur === v ? null : v);

  const menus: Menu[] = [
    { label: "File", items: [
      { label: "Open PDF…", onClick: () => fileIn.current?.click() }, { label: "Load takeoff…", onClick: () => loadIn.current?.click() }, { sep: true, label: "" },
      { label: "Save takeoff (JSON)", disabled: !doc, onClick: () => download("takeoff.json", JSON.stringify(t, null, 1)) },
      { label: "Export summary (CSV)", disabled: !doc, onClick: () => download("takeoff-summary.csv", summaryCsv(t)) },
      { label: "Export every markup (CSV)", disabled: !doc, onClick: () => download("takeoff-detail.csv", toCsv(t)) } ] },
    { label: "Edit", items: [
      { label: "Undo", shortcut: "Ctrl+Z", disabled: !canUndo(hist), onClick: () => run("undo") }, { label: "Redo", shortcut: "Ctrl+Y", disabled: !canRedo(hist), onClick: () => run("redo") },
      { sep: true, label: "" }, { label: "Duplicate selected", shortcut: "Ctrl+D", disabled: !selected, onClick: () => run("duplicate") },
      { label: "Lock / unlock selected", shortcut: "Shift+L", disabled: !selected, onClick: () => run("lock:toggle") }, { label: "Delete selected", shortcut: "Del", disabled: !selected, onClick: () => run("delete") } ] },
    { label: "View", items: [
      { label: "Zoom in", shortcut: "+", onClick: () => run("zoom:in") }, { label: "Zoom out", shortcut: "-", onClick: () => run("zoom:out") }, { label: "Fit width", shortcut: "Ctrl+0", onClick: () => run("zoom:fit") },
      { sep: true, label: "" }, { label: "Mouse wheel zooms", checked: wheelMode === "zoom", onClick: () => setWheelMode("zoom") }, { label: "Mouse wheel changes pages", checked: wheelMode === "page", shortcut: "W", onClick: () => setWheelMode("page") },
      { sep: true, label: "" }, { label: "Snap to edges and centers", shortcut: "S", checked: snapOn, onClick: () => run("snap:toggle") },
      { label: "Snap to endpoints", checked: snapOpts.end, onClick: () => setSnapOpts({ ...snapOpts, end: !snapOpts.end }) }, { label: "Snap to centers", checked: snapOpts.center, onClick: () => setSnapOpts({ ...snapOpts, center: !snapOpts.center }) },
      { label: "Snap to midpoints", checked: snapOpts.mid, onClick: () => setSnapOpts({ ...snapOpts, mid: !snapOpts.mid }) }, { label: "Snap to edges", checked: snapOpts.edge, onClick: () => setSnapOpts({ ...snapOpts, edge: !snapOpts.edge }) },
      { sep: true, label: "" }, { label: "Left panel", checked: leftTab !== null, onClick: () => setLeftTab(leftTab ? null : "pages") }, { label: "Right panel", checked: rightTab !== null, onClick: () => setRightTab(rightTab ? null : "props") } ] },
    { label: "Page", items: [
      { label: "Next page", shortcut: "Ctrl+→", onClick: () => run("page:next") }, { label: "Previous page", shortcut: "Ctrl+←", onClick: () => run("page:prev") },
      { label: "First page", shortcut: "Home", onClick: () => run("page:first") }, { label: "Last page", shortcut: "End", onClick: () => run("page:last") } ] },
    { label: "Markup", items: [
      { label: "Select", shortcut: "V", checked: tool === "select", onClick: () => run("tool:select") }, { label: "Pan", shortcut: "Shift+V", checked: tool === "pan", onClick: () => run("tool:pan") }, { sep: true, label: "" },
      { label: "Length", shortcut: "L", checked: tool === "length", onClick: () => run("tool:length") }, { label: "Polylength", shortcut: "Shift+N", checked: tool === "polylength", onClick: () => run("tool:polylength") },
      { label: "Area", shortcut: "A", checked: tool === "area", onClick: () => run("tool:area") }, { label: "Count", shortcut: "C", checked: tool === "count", onClick: () => run("tool:count") },
      { sep: true, label: "" }, { label: "Capture symbol from print", shortcut: "Shift+S", onClick: () => run("tool:capture") } ] },
    { label: "Measure", items: [
      { label: "Calibrate…", shortcut: "K", onClick: () => run("tool:calibrate") }, { label: "Scale and quantities", onClick: () => setRightTab("qty") },
      { label: "Apply scale to all pages", checked: allPages, onClick: () => setAllPages(!allPages) } ] },
    { label: "Tools", items: [
      { label: "Tool Chest", onClick: () => setLeftTab("chest") }, { label: "Layers", onClick: () => setLeftTab("layers") }, { label: "Page thumbnails", onClick: () => setLeftTab("pages") }, { label: "All markups", onClick: () => setRightTab("markups") } ] },
    { label: "Help", items: [{ label: "Keyboard shortcuts", onClick: () => setRightTab("keys") }] },
  ];

  const field = (label: string, el: JSX.Element) => <div className="field"><span>{label}</span>{el}</div>;
  const propsPanel = sel ? (
    <>
      <label style={{ display: "block", marginBottom: 6 }}><input type="checkbox" checked={!!sel.locked} onChange={() => toggleLock(sel.id)} /> Locked (can't be moved, edited or deleted)</label>
      <fieldset disabled={!!sel.locked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {field("Label", <input value={sel.label} onChange={(e) => patchSel({ label: e.target.value })} />)}
      {field("Layer", <select value={sel.layerId} onChange={(e) => patchSel({ layerId: e.target.value })}>{t.layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>)}
      {field("Color", <input type="color" value={colorOf(sel)} onChange={(e) => patchSel({ color: e.target.value })} />)}
      {field("Line", <input type="number" min={1} max={12} value={sel.lineWidth ?? 2} onChange={(e) => patchSel({ lineWidth: Number(e.target.value) })} />)}
      {sel.symbol && field("Size", <input type="number" min={4} max={80} value={sel.symbol.size} onChange={(e) => patchSel({ symbol: { ...sel.symbol!, size: Number(e.target.value) } })} />)}
      {field("Quantity", <b>{(() => { const q = quantity(sel, t.feetPerUnit[sel.page]); return q == null ? "Needs calibration" : `${q.toFixed(2)} ${sel.kind === "length" ? "LF" : sel.kind === "area" ? "SF" : "EA"}`; })()}</b>)}
      {field("Page", <span>{sel.page}</span>)}
      </fieldset>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <select className="btn" value="" onChange={(e) => { if (e.target.value) addToChest(sel, e.target.value); }}><option value="">Add to Tool Chest…</option>{chest.sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <button className="btn" disabled={!!sel.locked} onClick={() => run("delete")}><Icon name="trash" size={16} />Delete</button>
      </div>
    </>
  ) : <p className="muted">Select a markup to see and change its properties. Press <b>V</b>, then click one on the print.</p>;

  const qtyPanel = (
    <>
      <h4 className="sec" style={{ marginTop: 0 }}>Scale · page {page}</h4>
      <div style={{ marginBottom: 6 }}><b>{scaleLabel}</b>{t.scaleNote?.[page] ? <span className="muted"> · {t.scaleNote[page]}</span> : null}</div>
      <div className="snaprow">
        <input placeholder={`Type a scale, e.g. 1/8" = 1'-0"`} value={scaleText} onChange={(e) => setScaleText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyTyped(); }} />
        <button className="btn" disabled={!doc || !scaleText.trim()} onClick={applyTyped}>Set</button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        <button className="btn" disabled={!doc || busy} onClick={() => void detectNow()}>Detect from page text</button>
        <button className="btn" disabled={!doc || busy} onClick={() => void scanAll()}>{busy ? "Scanning…" : "Scan all pages"}</button>
      </div>
      {cur && cur.cands.length > 0 && <div style={{ marginBottom: 6 }}><div className="muted">Scales found on this sheet:</div>
        {cur.cands.map((c) => <div key={c.text} className="cand"><b className="grow">{c.text}</b><span className="muted">×{c.count}</span><button className="btn" onClick={() => useCandidate(c)}>Use</button></div>)}</div>}
      {cur && cur.cands.length === 0 && <p className="muted" style={{ margin: "0 0 6px" }}>{cur.noText ? "No readable text on this sheet (likely a scan). Type the scale or calibrate." : "No scale found in the sheet's text."}</p>}
      {cur?.nts && <div className="note">This sheet mentions “not to scale”. Don't trust a printed scale here; calibrate against a known dimension.</div>}
      {doc && <p className="muted" style={{ margin: "0 0 6px" }}>Sheet: {info.label}</p>}
      {doc && !info.trusted && <div className="note">This looks like a reduced print. Printed scales are only right at full size, so calibrate against a known dimension.</div>}
      {msg && <div className="note">{msg}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => run("tool:calibrate")}><Icon name="calibrate" size={16} />Calibrate</button>
        <select className="btn" value="" onChange={(e) => { const p = SCALE_PRESETS.find((x) => x.label === e.target.value); if (p) apply((x) => setScale(x, allPages ? allPageList() : [page], presetFeetPerUnit(p.feetPerPaperInch))); }}>
          <option value="">Standard scale…</option>{SCALE_PRESETS.map((p) => <option key={p.label}>{p.label}</option>)}
        </select>
      </div>
      <label style={{ display: "block", margin: "6px 0" }}><input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} /> Apply scale to all pages</label>
      <p className="muted" style={{ margin: 0 }}>Standard scales assume the sheet prints full size. Calibrating against a known dimension is the safest check.</p>
      <h4 className="sec">Quantities</h4>
      {summary.length === 0 ? <p className="muted">Nothing measured yet.</p> :
        <table className="qty"><thead><tr><th>Layer</th><th>Item</th><th>#</th><th>Qty</th></tr></thead>
          <tbody>{summary.map((r, i) => <tr key={i}><td>{r.layer}</td><td>{r.label}</td><td>{r.items}</td><td>{r.qty == null ? "uncalibrated" : `${r.qty.toFixed(1)} ${r.unit}`}</td></tr>)}</tbody></table>}
      <div style={{ marginTop: 8 }}><button className="btn" disabled={!doc} onClick={() => download("takeoff-summary.csv", summaryCsv(t))}><Icon name="download" size={16} />Export CSV</button></div>
    </>
  );

  const [filter, setFilter] = useState("");
  const markupsPanel = (
    <>
      <input className="tb-input" style={{ width: "100%", marginBottom: 6, textAlign: "left", padding: "0 6px" }} placeholder="Filter markups…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {t.measurements.filter((m) => m.label.toLowerCase().includes(filter.toLowerCase())).map((m) => {
        const q = quantity(m, t.feetPerUnit[m.page]);
        return (
          <div key={m.id} className={"row" + (m.id === selected ? " on" : "")} style={{ cursor: "pointer" }} onClick={() => { goPage(m.page); setSelected(m.id); setTool("select"); }}>
            <span style={{ color: colorOf(m) }}><Icon name={m.kind === "count" ? "count" : m.kind === "area" ? "area" : "polylength"} size={16} /></span>
            <span className="grow">{m.label}</span>{m.locked && <Icon name="lock" size={14} />}<span className="muted">p{m.page}</span>
            <span>{q == null ? "—" : q.toFixed(1)}</span>
          </div>);
      })}
      {t.measurements.length === 0 && <p className="muted">No markups yet.</p>}
    </>
  );

  const layersPanel = (
    <>
      {t.layers.map((l) => (
        <div key={l.id} className={"row" + (activeLayer === l.id ? " on" : "")}>
          <input type="checkbox" checked={l.visible} title="Show / hide" onChange={() => apply((x) => ({ ...x, layers: x.layers.map((y) => (y.id === l.id ? { ...y, visible: !y.visible } : y)) }))} />
          <span style={{ color: l.color }}>■</span>
          <span className="grow" style={{ cursor: "pointer" }} title="Click to draw on this layer" onClick={() => setActiveLayer(l.id)}>{l.name}{activeLayer === l.id ? " (active)" : ""}</span>
          <button className="tbtn" title="Delete layer and its markups" onClick={() => { if (t.layers.length > 1 && confirm(`Delete layer "${l.name}" and its markups?`)) { const n = deleteLayer(t, l.id); apply(() => n); setActiveLayer(n.layers[0].id); } }}><Icon name="trash" size={16} /></button>
        </div>))}
      <button className="btn" style={{ marginTop: 8 }} onClick={() => { const name = prompt("Layer name"); if (name) { const id = newId("l"); apply((x) => ({ ...x, layers: [...x.layers, { id, name, color: COLORS[x.layers.length % COLORS.length], visible: true }] })); setActiveLayer(id); } }}><Icon name="plus" size={16} />New layer</button>
    </>
  );

  const leftTitle = leftTab === "pages" ? "Pages" : leftTab === "chest" ? "Tool Chest" : "Layers";
  const rightTitle = rightTab === "props" ? "Properties" : rightTab === "qty" ? "Measurements" : rightTab === "markups" ? "Markups list" : "Keyboard shortcuts";

  return (
    <div className="app">
      <MenuBar menus={menus} />
      <div className="toolbar">
        <div className="tb-group">
          {tb("open", "Open PDF", () => fileIn.current?.click())}
          {tb("save", "Save takeoff (JSON)", () => download("takeoff.json", JSON.stringify(t, null, 1)), false, !doc)}
          {tb("undo", "Undo (Ctrl+Z)", () => run("undo"), false, !canUndo(hist))}
          {tb("redo", "Redo (Ctrl+Y)", () => run("redo"), false, !canRedo(hist))}
        </div>
        <div className="tb-group">
          {tb("select", "Select (V)", () => run("tool:select"), tool === "select")}
          {tb("pan", "Pan (Shift+V)", () => run("tool:pan"), tool === "pan")}
        </div>
        <div className="tb-group">
          {tb("length", "Length (L)", () => run("tool:length"), tool === "length")}
          {tb("polylength", "Polylength (Shift+N)", () => run("tool:polylength"), tool === "polylength")}
          {tb("area", "Area (A)", () => run("tool:area"), tool === "area")}
          {tb("count", "Count (C)", () => run("tool:count"), tool === "count")}
          {tb("calibrate", "Calibrate (K)", () => run("tool:calibrate"), tool === "calibrate")}
          {tb("capture", "Capture symbol (Shift+S)", () => run("tool:capture"), tool === "capture")}
        </div>
        <div className="tb-group">
          {tb("zoomOut", "Zoom out (-)", () => run("zoom:out"))}
          <span className="tb-text" style={{ minWidth: 44, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
          {tb("zoomIn", "Zoom in (+)", () => run("zoom:in"))}
          {tb("fit", "Fit width (Ctrl+0)", () => run("zoom:fit"))}
        </div>
        <div className="tb-group">
          {tb("prev", "Previous page (Ctrl+←)", () => run("page:prev"), false, !doc)}
          <input className="tb-input" type="number" min={1} max={Math.max(1, pageCount)} value={doc ? page : ""} disabled={!doc} onChange={(e) => goPage(Number(e.target.value))} />
          <span className="tb-text">of {pageCount || "–"}</span>
          {tb("next", "Next page (Ctrl+→)", () => run("page:next"), false, !doc)}
        </div>
        <div className="tb-group">
          {tb("snap", snapOn ? "Snap is ON: points jump to ends, centers, midpoints and edges (S to turn off)" : "Snap is OFF (S to turn on)", () => run("snap:toggle"), snapOn, false, snapOn ? "Snap" : "Snap off")}
          {tb("wheel", "Mouse wheel: " + (wheelMode === "zoom" ? "zooms" : "changes pages") + " (W to switch)", () => run("wheel:toggle"), wheelMode === "page", false, wheelMode === "zoom" ? "Zoom" : "Pages")}
        </div>
        <input ref={fileIn} type="file" accept="application/pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void openDoc(f); }} />
        <input ref={loadIn} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void loadTakeoff(f); }} />
      </div>

      <div className="body">
        <div className="rail">
          {rail("pages", "Pages", leftTab === "pages", () => toggle(leftTab, "pages", setLeftTab))}
          {rail("toolchest", "Tool Chest", leftTab === "chest", () => toggle(leftTab, "chest", setLeftTab))}
          {rail("layers", "Layers", leftTab === "layers", () => toggle(leftTab, "layers", setLeftTab))}
        </div>
        {leftTab && (
          <div className="side">
            <div className="side-head">{leftTitle}<button className="tbtn" title="Close panel" onClick={() => setLeftTab(null)}><Icon name="close" size={16} /></button></div>
            <div className="side-body">
              {leftTab === "pages" && <Thumbs doc={doc} page={page} onPick={goPage} />}
              {leftTab === "chest" && <ToolChestPanel chest={chest} setChest={setChest} activeId={preset?.id ?? null} onArm={arm} onCapture={() => run("tool:capture")} onReset={() => setChest(defaultChest())} download={download} />}
              {leftTab === "layers" && layersPanel}
            </div>
          </div>)}

        <div className="center">
          <div className="tabs"><div className="tab">{fileName || "No document open"}</div></div>
          <div className="viewer">
            <div ref={scroller} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPan} onPointerCancel={endPan}
              onAuxClick={(e) => e.preventDefault()} onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
              style={{ position: "absolute", inset: 0, overflow: "auto", background: "#c9d1dc", cursor: cursorStyle, touchAction: "none" }}>
              {!doc && <div style={{ padding: 32, maxWidth: 520 }}><h3 style={{ marginTop: 0 }}>Open a drawing to start</h3>
                <button className="btn" onClick={() => fileIn.current?.click()}><Icon name="open" size={16} />Open PDF…</button>
                <p className="muted">Scroll to zoom. Press <b>W</b> to make the wheel change pages. Press the wheel and drag (or hold Space and drag) to move the page.</p></div>}
              <div style={{ position: "relative", width: pageSize.w * zoom, height: pageSize.h * zoom, margin: 14, display: doc ? "block" : "none", boxShadow: "0 2px 10px #0005", background: "#fff" }}>
                <canvas ref={canvas} style={{ width: pageSize.w * zoom, height: pageSize.h * zoom, display: "block" }} />
                <svg ref={svg} width={pageSize.w * zoom} height={pageSize.h * zoom} viewBox={`0 0 ${pageSize.w} ${pageSize.h}`}
                  style={{ position: "absolute", inset: 0 }} onClick={onSvgClick} onDoubleClick={() => { if (tool === "polylength" || tool === "area") finish(); }} onContextMenu={openCtx}
                  onPointerMove={(e) => { if (drag.current) { dragMove(e); return; } const r = resolve(e); setCursor(r.p); setSnapHit(r.hit); capturePointer(e, "move"); }}
                  onPointerDown={(e) => capturePointer(e, "down")} onPointerUp={(e) => { dragEnd(); capturePointer(e, "up"); }} onPointerCancel={dragCancel}>
                  {mine.map((m) => {
                    const l = layerOf(m.layerId); if (!l?.visible) return null;
                    const c = colorOf(m), isSel = m.id === selected, hit = tool === "select" ? "all" : "none";
                    const mp = liveMods?.id === m.id ? liveMods.pts : m.pts;
                    const down = (e: React.PointerEvent) => startDrag(e, m, null);
                    const stop = (e: React.MouseEvent) => { if (tool === "select") e.stopPropagation(); };
                    const gs = { pointerEvents: hit, cursor: tool === "select" && !m.locked ? "move" : undefined } as React.CSSProperties;
                    if (m.kind === "count") {
                      const p = mp[0];
                      return <g key={m.id} onPointerDown={down} onClick={stop} style={gs}>{m.symbol ? <SymbolMark symbol={m.symbol} cx={p.x} cy={p.y} color={c} selected={isSel} /> : <circle cx={p.x} cy={p.y} r={6} fill={c} stroke={isSel ? "#000" : "none"} strokeWidth={2} vectorEffect="non-scaling-stroke" />}</g>;
                    }
                    const pts = mp.map((p) => `${p.x},${p.y}`).join(" ");
                    return (
                      <g key={m.id} onPointerDown={down} onClick={stop} style={gs}>
                        {m.kind === "area"
                          ? <polygon points={pts} fill={c + "33"} stroke={isSel ? "#000" : c} strokeWidth={isSel ? 3 : (m.lineWidth ?? 2)} vectorEffect="non-scaling-stroke" />
                          : <polyline points={pts} fill="none" stroke={isSel ? "#000" : c} strokeWidth={isSel ? 3 : (m.lineWidth ?? 2)} vectorEffect="non-scaling-stroke" />}
                        <polyline points={pts} fill="none" stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke" />
                        {isSel && !m.locked && mp.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={5 / zoom} fill="#fff" stroke="#000" vectorEffect="non-scaling-stroke" style={{ cursor: "crosshair" }} onPointerDown={(e) => startDrag(e, m, i)} />)}
                      </g>);
                  })}
                  {draft.length > 0 && <polyline points={[...draft, ...(cursor ? [cursor] : [])].map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#000" strokeDasharray="5 4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
                  {tool === "count" && cursor && preset?.symbol && <g opacity={0.5}><SymbolMark symbol={preset.symbol} cx={cursor.x} cy={cursor.y} color={preset.color} /></g>}
                  {capRect && <rect x={Math.min(capRect.a.x, capRect.b.x)} y={Math.min(capRect.a.y, capRect.b.y)} width={Math.abs(capRect.b.x - capRect.a.x)} height={Math.abs(capRect.b.y - capRect.a.y)} fill="#2563eb22" stroke="#2563eb" strokeDasharray="4" vectorEffect="non-scaling-stroke" />}
                  {snapHit && (tool === "length" || tool === "polylength" || tool === "area" || tool === "count" || tool === "calibrate" || liveMods) && (() => {
                    const q = 6 / zoom, { x, y } = snapHit.pt, col = "#f59e0b", sw = { stroke: col, strokeWidth: 2, fill: "none", vectorEffect: "non-scaling-stroke" as const };
                    return <g pointerEvents="none">{snapHit.kind === "end" ? <rect x={x - q} y={y - q} width={2 * q} height={2 * q} {...sw} />
                      : snapHit.kind === "center" ? <circle cx={x} cy={y} r={q} {...sw} />
                      : snapHit.kind === "mid" ? <polygon points={`${x},${y - q} ${x + q},${y + q} ${x - q},${y + q}`} {...sw} />
                      : <path d={`M${x - q},${y - q}L${x + q},${y + q}M${x - q},${y + q}L${x + q},${y - q}`} {...sw} />}</g>;
                  })()}
                </svg>
              </div>
            </div>
          </div>
        </div>

        {rightTab && (
          <div className="side right">
            <div className="side-head">{rightTitle}<button className="tbtn" title="Close panel" onClick={() => setRightTab(null)}><Icon name="close" size={16} /></button></div>
            <div className="side-body">
              {rightTab === "props" && propsPanel}
              {rightTab === "qty" && qtyPanel}
              {rightTab === "markups" && markupsPanel}
              {rightTab === "keys" && <table><tbody>{SHORTCUT_HELP.map(([k, d]) => <tr key={k}><td style={{ paddingRight: 10, whiteSpace: "nowrap", verticalAlign: "top" }}><b>{k}</b></td><td>{d}</td></tr>)}</tbody></table>}
            </div>
          </div>)}
        <div className="rail right">
          {rail("props", "Properties", rightTab === "props", () => toggle(rightTab, "props", setRightTab))}
          {rail("calc", "Measurements and scale", rightTab === "qty", () => toggle(rightTab, "qty", setRightTab))}
          {rail("list", "Markups list", rightTab === "markups", () => toggle(rightTab, "markups", setRightTab))}
          {rail("keys", "Keyboard shortcuts", rightTab === "keys", () => toggle(rightTab, "keys", setRightTab))}
        </div>
      </div>

      <div className="status">
        <span>{msg ? <b>{msg}</b> : <>{HINT[tool]}{preset ? <b> · {preset.name}</b> : null}</>}</span><span className="sp" />
        <span>Scale: <b>{doc ? scaleLabel : "–"}</b></span>
        <span>Snap: <b>{snapLabel}</b></span>
        <span>Wheel: <b>{wheelMode === "zoom" ? "zoom" : "pages"}</b></span>
        <span>Layer: <b>{layerOf(activeLayer)?.name ?? "–"}</b></span>
        <span>Page <b>{doc ? `${page} / ${pageCount}` : "–"}</b></span><span><b>{Math.round(zoom * 100)}%</b></span>
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </div>
  );
}
