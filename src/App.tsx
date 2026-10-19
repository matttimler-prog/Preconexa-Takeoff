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
import { canonicalScale, detectScales, parseScaleText, sheetInfo } from "./lib/scaledetect";
import type { ScaleCandidate } from "./lib/scaledetect";
import { centroid, insertPoint, nearestOnSegment, removePoint, translate } from "./lib/geom";
import { MeasureLabel, ShapeView, textSize } from "./components/ShapeView";
import { ArrayDialog } from "./components/ArrayDialog";
import { CommandPalette } from "./components/CommandPalette";
import type { PaletteItem } from "./components/CommandPalette";
import { TOOLS, TOOL_BY_ID, keyLabel, toolForPreset } from "./lib/tools";
import type { ToolDef } from "./lib/tools";
import { RECTLIKE, TEXTLIKE, circleOf, isClosed, labelAnchor, outline, textBox, textBoxOf } from "./lib/shapes";
import { boxesInRect, findUrls, lineRects, parseLinkTarget, safeUrl, searchBoxes, textBoxes } from "./lib/textboxes";
import type { Rect, TBox, TextItem } from "./lib/textboxes";
import { CUSTOM_STAMP, STAMPS, stampText, stampWithDate } from "./lib/stamps";
import { regionPolygon } from "./lib/rasterfill";
import { History, newHistory, push, redo as redoH, undo as undoH, canRedo, canUndo } from "./lib/history";
import { Measurement, Takeoff, UNITS, deleteLayer, ensureLayer, measureLabel, quantity, scaleFor, setScale, shapeOf, summarize, summaryCsv, toCsv } from "./lib/takeoff";
import { ToolChest, ToolPreset, addTool, defaultChest, newId } from "./lib/toolchest";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Tool = string; // "select" | "pan" | "calibrate" | "capture" | a drawing tool id from lib/tools
const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];
const CHEST_KEY = "preconexa.chest.v1";
const SNAP_KEY = "preconexa.snap.v1";
const CLIP_KEY = "preconexa.clip.v1";
const ASK_KEY = "preconexa.asklabel.v1";
const LABELS_KEY = "preconexa.labels.v1";
const empty = (): Takeoff => ({ layers: [{ id: "l1", name: "Layer 1", color: COLORS[0], visible: true }], measurements: [], feetPerUnit: {} });

const store = {
  get<T>(k: string): T | null { try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : null; } catch { return null; } },
  set(k: string, v: unknown): boolean { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; /* storage full or blocked */ } },
};
const download = (name: string, text: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text])); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const downloadBlob = (name: string, b: Blob) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
const MARKS = ["underline", "strike", "squiggly", "hltext"];
const bboxOfPts = (pts: Pt[]) => {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};
const inPoly = (p: Pt, pts: Pt[]) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if ((pts[i].y > p.y) !== (pts[j].y > p.y) && p.x < ((pts[j].x - pts[i].x) * (p.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) c = !c;
  }
  return c;
};
const HINT: Record<string, string> = {
  select: "Click a markup to select it, drag to move, drag a handle to reshape. Right-click for options.", pan: "Drag to pan.",
  calibrate: "Click two ends of a known dimension.", capture: "Drag a box around a symbol on the print.",
  eraser: "Drag across markups to erase them. Locked markups are skipped. Undo brings them back.",
};
const hintFor = (tool: string) => HINT[tool] ?? TOOL_BY_ID[tool]?.hint ?? "";
const presetFits = (p: ToolPreset, d: ToolDef) => p.kind === d.kind && (!p.shape || p.shape === d.shape);
const tkey = (t: ToolDef) => `${keyLabel(t.key)}${t.alias ? `${t.key ? " or " : ""}${t.alias}` : ""}`;

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
  const [selIds, setSelIds] = useState<string[]>([]);
  const [chest, setChestState] = useState<ToolChest>(() => store.get<ToolChest>(CHEST_KEY) ?? defaultChest());
  const [leftTab, setLeftTab] = useState<"pages" | "chest" | "layers" | "search" | "bookmarks" | null>("pages");
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
  const [liveMods, setLiveMods] = useState<Record<string, Pt[]> | null>(null);
  const [marq, setMarq] = useState<{ a: Pt; b: Pt } | null>(null);
  const [erased, setErased] = useState<string[]>([]);
  const [stampId, setStampId] = useState("approved");
  const [stampDated, setStampDated] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ page: number; rects: Rect[] }[]>([]);
  const [searched, setSearched] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [scaleText, setScaleText] = useState("");
  const [detect, setDetect] = useState<{ page: number; cands: ScaleCandidate[]; nts: boolean; noText: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [askLabel, setAskLabel] = useState<boolean>(() => store.get<boolean>(ASK_KEY) ?? true);
  const [showLabels, setShowLabels] = useState<boolean>(() => store.get<boolean>(LABELS_KEY) ?? true);
  const [arrayOpen, setArrayOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const penRef = useRef<Pt[] | null>(null);
  const tRef = useRef<Takeoff | null>(null);
  const marqRef = useRef<{ a: Pt; b: Pt; add: boolean; moved: boolean } | null>(null);
  const eraseRef = useRef<Set<string> | null>(null);
  const clip = useRef<{ ms: Measurement[]; layers: Takeoff["layers"]; n: number } | null>(null);
  const pdfBytes = useRef<Uint8Array | null>(null);
  const boxCache = useRef(new Map<number, TBox[]>());
  const imgIn = useRef<HTMLInputElement>(null);
  const imgAt = useRef<Pt | null>(null);
  const imgDef = useRef<ToolDef | null>(null);

  const t = hist.present;
  tRef.current = t;
  const selected = selIds.length ? selIds[selIds.length - 1] : null;
  /** Select one markup (and everything grouped with it), or clear. */
  const setSelected = (id: string | null) => {
    const cur = tRef.current, g = id ? cur?.measurements.find((m) => m.id === id)?.groupId : undefined;
    setSelIds(!id ? [] : g && cur ? cur.measurements.filter((m) => m.groupId === g).map((m) => m.id) : [id]);
  };
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
  const drag = useRef<{ ids: string[]; idx: number | null; start: Pt; orig: Record<string, Pt[]>; moved: boolean } | null>(null);
  const liveRef = useRef<Record<string, Pt[]> | null>(null);
  const justDragged = useRef(0);
  const autoTried = useRef(new Set<string>());

  const apply = useCallback((fn: (x: Takeoff) => Takeoff) => setHist((h) => push(h, fn(h.present))), []);
  const setChest = (c: ToolChest) => { setChestState(c); store.set(CHEST_KEY, c); };

  // ---- document loading, persistence ----
  const openDoc = async (f: File) => {
    const buf = await f.arrayBuffer();
    pdfBytes.current = new Uint8Array(buf.slice(0)); boxCache.current.clear(); setHits([]); setSearched("");
    const d = await pdfjs.getDocument({ data: buf }).promise;
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
    const id = setTimeout(() => { if (!store.set(fileKey, t)) setMsg("Browser storage is full, so this takeoff is not auto-saved. Use File > Save takeoff (JSON) to keep your work."); }, 400);
    return () => clearTimeout(id);
  }, [t, fileKey]);

  useEffect(() => { store.set(SNAP_KEY, { on: snapOn, opts: snapOpts }); }, [snapOn, snapOpts]);
  useEffect(() => { store.set(ASK_KEY, askLabel); store.set(LABELS_KEY, showLabels); }, [askLabel, showLabels]);
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
      const sh = shapeOf(m);
      if (m.kind === "count" || TEXTLIKE.includes(sh)) { centers.push(m.pts[0]); continue; }
      if (MARKS.includes(sh) || sh === "link" || sh === "image") continue;
      const o = outline(sh, m.pts), n = o.pts.length;
      for (let i = 0; i + 1 < n; i++) segs.push([o.pts[i].x, o.pts[i].y, o.pts[i + 1].x, o.pts[i + 1].y]);
      if (o.closed && n > 2) segs.push([o.pts[n - 1].x, o.pts[n - 1].y, o.pts[0].x, o.pts[0].y]);
      if ((sh === "rect" || sh === "ellipse") && m.pts.length >= 2) centers.push({ x: (m.pts[0].x + m.pts[1].x) / 2, y: (m.pts[0].y + m.pts[1].y) / 2 });
      const k = circleOf(sh, m.pts); if (k) centers.push(k.c);
    }
    return new SnapIndex(segs, centers);
  }, [mine, t.layers, dragId]);

  const say = (s: string) => setMsg(s);
  const patchM = (id: string, patch: Partial<Measurement>) => apply((x) => ({ ...x, measurements: x.measurements.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  const patchMany = (ids: string[], patch: Partial<Measurement>) => apply((x) => ({ ...x, measurements: x.measurements.map((m) => (ids.includes(m.id) && !m.locked ? { ...m, ...patch } : m)) }));
  const idsFor = (id: string | null) => (id && !selIds.includes(id) ? [id] : selIds);
  const toggleLock = (id: string | null) => {
    const ids = idsFor(id), ms = t.measurements.filter((y) => ids.includes(y.id)); if (!ms.length) return;
    const lock = ms.some((m) => !m.locked);
    apply((x) => ({ ...x, measurements: x.measurements.map((m) => (ids.includes(m.id) ? { ...m, locked: lock } : m)) }));
    say(lock ? "Locked. Locked markups can't be moved, edited or deleted until unlocked." : "Unlocked.");
  };
  /** Copies with fresh ids; groups are copied as new groups. */
  const cloneMs = (ms: Measurement[], dx: number, dy: number, pg?: number): Measurement[] => {
    const gm = new Map<string, string>();
    return ms.map((m) => {
      let g = m.groupId; if (g) { if (!gm.has(g)) gm.set(g, newId("g")); g = gm.get(g); }
      return { ...m, id: newId("m"), page: pg ?? m.page, pts: translate(m.pts, dx, dy), locked: false, groupId: g };
    });
  };
  const duplicate = (id: string | null) => {
    const ids = idsFor(id), ms = t.measurements.filter((y) => ids.includes(y.id)); if (!ms.length) return;
    const cp = cloneMs(ms, 12, 12);
    apply((x) => ({ ...x, measurements: [...x.measurements, ...cp] }));
    setSelIds(cp.map((m) => m.id));
  };
  const reorder = (id: string, front: boolean) => apply((x) => {
    const m = x.measurements.find((y) => y.id === id); if (!m) return x;
    const rest = x.measurements.filter((y) => y.id !== id);
    return { ...x, measurements: front ? [...rest, m] : [m, ...rest] };
  });
  const removeIds = (ids: string[]) => {
    const del = t.measurements.filter((m) => ids.includes(m.id) && !m.locked), skipped = ids.length - del.length;
    if (!del.length) { say("That markup is locked. Right-click it and choose Unlock first."); return; }
    const gone = new Set(del.map((m) => m.id));
    apply((x) => ({ ...x, measurements: x.measurements.filter((y) => !gone.has(y.id)) }));
    setSelIds([]); if (skipped) say(`${skipped} locked markup(s) were left in place.`);
  };
  const removeM = (m: Measurement) => removeIds(selIds.includes(m.id) ? selIds : [m.id]);

  // ---- page text (for text markups, search, links) ----
  const pageBoxes = async (pg: number): Promise<TBox[]> => {
    const c = boxCache.current.get(pg); if (c) return c;
    const p = await doc!.getPage(pg), tc = await p.getTextContent();
    const items = tc.items.filter((i) => "str" in i) as unknown as TextItem[];
    const b = textBoxes(items, p.getViewport({ scale: 1 }).transform as number[]);
    boxCache.current.set(pg, b); return b;
  };
  const commitTextMark = async (def: ToolDef, pts: Pt[]) => {
    const usePreset = preset && presetFits(preset, def) ? preset : null;
    let rects: Rect[] = [];
    try { rects = lineRects(boxesInRect(await pageBoxes(page), pts[0], pts[1])); } catch { /* no text layer */ }
    if (!rects.length) {
      say("No text under that box (a scanned sheet has none), so the box you drew is marked instead.");
      const b = bboxOfPts(pts); if (b.w < 1 || b.h < 1) return; rects = [b];
    }
    const gid = rects.length > 1 ? newId("g") : undefined, color = usePreset?.color ?? (def.shape === "hltext" ? "#facc15" : undefined);
    const add: Measurement[] = rects.map((r) => ({ id: newId("m"), layerId: activeLayer, kind: "markup", shape: def.shape, page, label: def.label, pts: [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }], color, groupId: gid }));
    apply((x) => ({ ...x, measurements: [...x.measurements, ...add] }));
  };
  const makeUrlLinks = async () => {
    if (!doc) return;
    try {
      const u = findUrls(await pageBoxes(page));
      if (!u.length) { say("No web addresses found in this page's text."); return; }
      const add: Measurement[] = u.map(({ url, rect }) => ({ id: newId("m"), layerId: activeLayer, kind: "markup", shape: "link", page, label: "Link", text: url, pts: [{ x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y + rect.h }] }));
      apply((x) => ({ ...x, measurements: [...x.measurements, ...add] })); say(`Made ${add.length} link(s) from printed web addresses. Double-click one to open it.`);
    } catch { say("Couldn't read this page's text."); }
  };
  const openLink = (m: Measurement) => {
    const r = parseLinkTarget(m.text ?? "");
    if (!r) { say("This link has no valid target. Select it and edit the text in Properties."); return; }
    if ("page" in r) { if (r.page < 1 || r.page > pageCount) say(`Page ${r.page} isn't in this file.`); else goPage(r.page); return; }
    const u = safeUrl(r.url); if (u) window.open(u, "_blank", "noopener,noreferrer");
  };

  const commit = (def: ToolDef, pts0: Pt[]) => {
    if (!pts0.length) return;
    let pts = pts0;
    if (MARKS.includes(def.shape)) { setDraft([]); void commitTextMark(def, pts0); return; }
    if (def.ask === "image") { imgAt.current = pts[0]; imgDef.current = def; setDraft([]); imgIn.current?.click(); return; }
    const usePreset = preset && presetFits(preset, def) ? preset : null;
    let label = def.label, text = usePreset?.text, depth = usePreset?.depth, parentLayer: string | undefined, color = usePreset?.color;
    const extra: Partial<Measurement> = {};
    if (usePreset) label = usePreset.label;
    else if (def.kind === "cutout") label = "Cutout";
    else if (def.kind !== "markup" && askLabel) {
      const a = prompt(`Label for this ${def.label.toLowerCase()} (e.g. 2x4 troffer, 3/4 EMT, Slab)`);
      if (a === null) { setDraft([]); return; }
      label = a.trim() || def.label;
    }
    if (def.ask === "text" && text === undefined) {
      const a = prompt(def.id === "note" ? "Note text" : "Text");
      if (a === null) { setDraft([]); return; }
      text = a;
    }
    if (def.ask === "depth" && depth == null) {
      const a = prompt("How deep is it? (e.g. 4 in, 6\", 0.5'. A plain number means feet.)");
      const ft = a === null ? null : parseDistance(a);
      if (ft == null || ft <= 0) { if (a !== null) alert(`Couldn't read "${a}" as a depth. Try 4 in or 0.5'.`); setDraft([]); return; }
      depth = ft;
    }
    if (def.ask === "stamp") {
      const d = STAMPS.find((x) => x.id === stampId);
      let tx: string;
      if (stampId === CUSTOM_STAMP || !d) {
        const a = prompt("Stamp text"); if (a === null || !a.trim()) { setDraft([]); return; }
        tx = a.trim(); color = color ?? "#2563eb";
      } else { tx = stampText(d); color = color ?? d.color; }
      if (stampDated && !d?.date) tx = stampWithDate(tx);
      text = tx; label = "Stamp";
    }
    if (def.ask === "link") {
      const a = prompt("Where should this link go?\nType a page number (like 5) or a web address (like www.example.com)");
      if (a === null) { setDraft([]); return; }
      const r = parseLinkTarget(a);
      if (!r) { alert(`Couldn't read "${a}". Type a page number like 5, or an address that starts with http:// or www.`); setDraft([]); return; }
      text = "page" in r ? `page ${r.page}` : r.url; label = "Link";
    }
    if (def.ask === "dims") {
      const fp = t.feetPerUnit[page];
      if (!fp) { say("Set this page's scale first (Measurements panel), then sketch to scale."); setDraft([]); return; }
      const a = prompt("Size, width x height (e.g. 10' x 12', or 3 m x 4 m)");
      if (a === null) { setDraft([]); return; }
      const parts = a.split(/\s*(?:x|×|\*|\bby\b)\s*/i), w = parts.length === 2 ? parseDistance(parts[0]) : null, h = parts.length === 2 ? parseDistance(parts[1]) : null;
      if (w == null || h == null || w <= 0 || h <= 0) { alert(`Couldn't read "${a}". Try 10' x 12'.`); setDraft([]); return; }
      pts = [pts[0], { x: pts[0].x + w / fp, y: pts[0].y + h / fp }];
    }
    if (def.ask === "scale") {
      const a = prompt("What scale is drawn inside this box? (e.g. 1/4\" = 1'-0\", 1\" = 20', 1:48)");
      if (a === null) { setDraft([]); return; }
      const k = parseScaleText(a);
      if (k == null) { alert(`Couldn't read "${a}". Try 1/4" = 1'-0" or 1:48.`); setDraft([]); return; }
      extra.vpScale = presetFeetPerUnit(k); text = canonicalScale(k); label = "Viewport scale";
    }
    if (def.kind === "cutout") {
      const c = centroid(outline(def.shape, pts).pts);
      const par = [...mine].reverse().find((m) => (m.kind === "area" || m.kind === "volume") && layerOf(m.layerId)?.visible && (() => { const o = outline(shapeOf(m), m.pts); return o.closed && inPoly(c, o.pts); })());
      if (par) { label = par.label; parentLayer = par.layerId; } else say("There's no area under that cutout, so it will subtract on its own. Draw the area first, then the cutout inside it.");
    }
    const lineWidth = usePreset?.lineWidth, symbol = usePreset?.symbol, layerName = usePreset?.layerName;
    apply((x) => {
      let tk = x, layerId = parentLayer ?? activeLayer;
      if (layerName && !parentLayer) { const r = ensureLayer(x, layerName, color ?? COLORS[x.layers.length % COLORS.length]); tk = r.takeoff; layerId = r.layerId; }
      return { ...tk, measurements: [...tk.measurements, { id: newId("m"), layerId, kind: def.kind, shape: def.shape, page, label, pts, color, lineWidth, symbol, text, depth, ...extra }] };
    });
    setDraft([]);
  };
  const placeImage = async (f: File) => {
    const at = imgAt.current; imgAt.current = null; if (!at) return;
    try {
      const url = URL.createObjectURL(f);
      const im = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("bad image")); i.src = url; });
      URL.revokeObjectURL(url);
      const k = Math.min(1, 1200 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
      const data = c.toDataURL(f.type === "image/png" && f.size < 600_000 ? "image/png" : "image/jpeg", 0.85);
      const w = Math.min(200, pageSize.w * 0.5), h = (w * c.height) / c.width;
      const px = Math.max(0, Math.min(at.x, pageSize.w - w)), py = Math.max(0, Math.min(at.y, pageSize.h - h)), id = newId("m");
      apply((x) => ({ ...x, measurements: [...x.measurements, { id, layerId: activeLayer, kind: "markup", shape: "image", page, label: "Image", pts: [{ x: px, y: py }, { x: px + w, y: py + h }], image: data }] }));
      setSelected(id); setTool("select");
    } catch { say("Couldn't read that image. Use a PNG or JPG."); }
  };
  const finish = () => {
    const def = TOOL_BY_ID[tool];
    if (!def || def.mode !== "poly") { if (tool === "calibrate") setDraft([]); return; }
    const pts = draft.filter((p, i) => i === 0 || dist(p, draft[i - 1]) > 0.5);
    if (pts.length >= (isClosed(def.shape) ? 3 : 2)) commit(def, pts);
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
  const bboxOf = (m: Measurement) => {
    const sh = shapeOf(m);
    if (m.kind === "count") { const r = (m.symbol?.size ?? 12) / 2; return { x: m.pts[0].x - r, y: m.pts[0].y - r, w: 2 * r, h: 2 * r }; }
    if (sh === "note") return { x: m.pts[0].x, y: m.pts[0].y, w: 16 / zoom, h: 16 / zoom };
    if (TEXTLIKE.includes(sh)) return textBoxOf(sh, m.text ?? "", m.pts[0], textSize(zoom));
    const o = outline(sh, m.pts); return bboxOfPts(o.pts.length ? o.pts : m.pts);
  };
  const hitTest = (p: Pt): { m: Measurement; vertex: number | null; onEdge: boolean } | null => {
    const tol = 8 / zoom;
    for (let i = mine.length - 1; i >= 0; i--) {
      const m = mine[i]; if (!layerOf(m.layerId)?.visible) continue;
      const pts = m.pts, sh = shapeOf(m);
      if (m.kind === "count") { if (dist(p, pts[0]) <= Math.max(tol, (m.symbol?.size ?? 12) / 2)) return { m, vertex: null, onEdge: false }; continue; }
      const inBox = (b: { x: number; y: number; w: number; h: number }) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
      if (TEXTLIKE.includes(sh)) { if (inBox(bboxOf(m))) return { m, vertex: null, onEdge: false }; continue; }
      if (sh === "callout" && pts.length > 1 && inBox(textBox(m.text ?? "", pts[1], textSize(zoom)))) return { m, vertex: null, onEdge: false };
      const vi = pts.findIndex((q) => dist(p, q) <= tol); if (vi >= 0 && !MARKS.includes(sh)) return { m, vertex: vi, onEdge: false };
      const o = outline(sh, pts), n = o.pts.length; let edge = Infinity;
      for (let k = 0; k + 1 < n + (o.closed ? 1 : 0); k++) edge = Math.min(edge, nearestOnSegment(p, o.pts[k], o.pts[(k + 1) % n]).d);
      if (edge <= tol) return { m, vertex: null, onEdge: true };
      const filled = m.kind === "area" || m.kind === "volume" || m.kind === "cutout" || ["highlight", "link", "image", "hltext", "underline", "strike", "squiggly"].includes(sh);
      if (filled && o.closed && inPoly(p, o.pts)) return { m, vertex: null, onEdge: false };
    }
    return null;
  };
  const groupOf = (m: Measurement) => (m.groupId ? t.measurements.filter((y) => y.groupId === m.groupId).map((y) => y.id) : [m.id]);
  const startDrag = (e: React.PointerEvent, m: Measurement, idx: number | null) => {
    if (e.button !== 0 || tool !== "select" || spaceDown) return;
    e.stopPropagation();
    if (idx == null && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      const g = groupOf(m);
      setSelIds(selIds.includes(m.id) ? selIds.filter((i) => !g.includes(i)) : [...selIds.filter((i) => !g.includes(i)), ...g]);
      return;
    }
    setRightTab((r) => r ?? "props");
    let ids = selIds;
    if (idx != null) { if (selIds.length !== 1 || selIds[0] !== m.id) { ids = [m.id]; setSelIds(ids); } }
    else if (!selIds.includes(m.id)) { ids = groupOf(m); setSelIds(ids); }
    const movers = idx == null ? t.measurements.filter((y) => ids.includes(y.id) && !y.locked) : m.locked ? [] : [m];
    if (!movers.length) return;
    drag.current = { ids: movers.map((y) => y.id), idx, start: resolve(e, true).p, orig: Object.fromEntries(movers.map((y) => [y.id, y.pts])), moved: false }; liveRef.current = null;
    setDragId(idx == null ? null : m.id);
  };
  const dragMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current; if (!d) return;
    const raw = resolve(e, true).p;
    if (!d.moved) { if (Math.hypot(raw.x - d.start.x, raw.y - d.start.y) * zoom < 3) return; d.moved = true; svg.current?.setPointerCapture(e.pointerId); }
    const mods: Record<string, Pt[]> = {};
    if (d.idx != null) { const r = resolve(e), id = d.ids[0]; setSnapHit(r.hit); mods[id] = d.orig[id].map((q, i) => (i === d.idx ? r.p : q)); }
    else for (const id of d.ids) mods[id] = translate(d.orig[id], raw.x - d.start.x, raw.y - d.start.y);
    liveRef.current = mods; setLiveMods(mods);
  };
  const dragEnd = () => {
    const d = drag.current, mods = liveRef.current;
    drag.current = null; liveRef.current = null; setDragId(null); setSnapHit(null);
    if (d?.moved && mods) { justDragged.current = performance.now(); apply((x) => ({ ...x, measurements: x.measurements.map((m) => (mods[m.id] ? { ...m, pts: mods[m.id] } : m)) })); }
    setLiveMods(null);
  };
  const dragCancel = () => { drag.current = null; liveRef.current = null; setDragId(null); setLiveMods(null); setSnapHit(null); };

  const endMarq = () => {
    const q = marqRef.current; marqRef.current = null; setMarq(null);
    if (!q || !q.moved) return;
    justDragged.current = performance.now();
    const x0 = Math.min(q.a.x, q.b.x), x1 = Math.max(q.a.x, q.b.x), y0 = Math.min(q.a.y, q.b.y), y1 = Math.max(q.a.y, q.b.y);
    const found = mine.filter((m) => { if (!layerOf(m.layerId)?.visible) return false; const b = bboxOf(m); return b.x <= x1 && b.x + b.w >= x0 && b.y <= y1 && b.y + b.h >= y0; });
    const ids = new Set<string>(q.add ? selIds : []);
    for (const m of found) for (const g of groupOf(m)) ids.add(g);
    setSelIds([...ids]);
  };
  const eraseAt = (p: Pt) => {
    const set = eraseRef.current; if (!set) return;
    const h = hitTest(p);
    if (h && !h.m.locked && !set.has(h.m.id)) { set.add(h.m.id); setErased([...set]); }
  };
  const endErase = () => {
    const set = eraseRef.current; eraseRef.current = null; setErased([]);
    if (set && set.size) { apply((x) => ({ ...x, measurements: x.measurements.filter((m) => !set.has(m.id)) })); say(`Erased ${set.size} markup(s). Undo (Ctrl+Z) brings them back.`); }
  };

  // ---- copy, paste, group ----
  const copySel = (): boolean => {
    const ms = t.measurements.filter((m) => selIds.includes(m.id)); if (!ms.length) { say("Select something first."); return false; }
    clip.current = { ms, layers: t.layers, n: 0 }; store.set(CLIP_KEY, clip.current);
    say(`Copied ${ms.length} markup(s). Paste with Ctrl+V, on this page or another.`); return true;
  };
  const pasteAt = (at?: Pt) => {
    const c = clip.current ?? store.get<{ ms: Measurement[]; layers: Takeoff["layers"]; n: number }>(CLIP_KEY);
    if (!c || !c.ms.length) { say("Nothing to paste. Select markups and press Ctrl+C first."); return; }
    clip.current = c; c.n += 1;
    const bb = bboxOfPts(c.ms.flatMap((m) => m.pts));
    const dx = at ? at.x - bb.x : c.ms[0].page === page ? 12 * c.n : 0, dy = at ? at.y - bb.y : c.ms[0].page === page ? 12 * c.n : 0;
    const cp = cloneMs(c.ms, dx, dy, page);
    let tk = t;
    for (const m of cp) {
      if (tk.layers.some((l) => l.id === m.layerId)) continue;
      const L = c.layers.find((l) => l.id === m.layerId);
      if (L) { const r = ensureLayer(tk, L.name, L.color); tk = r.takeoff; m.layerId = r.layerId; } else m.layerId = activeLayer;
    }
    apply(() => ({ ...tk, measurements: [...tk.measurements, ...cp] }));
    setSelIds(cp.map((m) => m.id)); setTool("select");
  };
  const groupSel = () => {
    if (selIds.length < 2) { say("Select two or more markups, then group them."); return; }
    const g = newId("g"); apply((x) => ({ ...x, measurements: x.measurements.map((m) => (selIds.includes(m.id) ? { ...m, groupId: g } : m)) }));
    say("Grouped. They now select, move and copy together. Ctrl+Shift+G ungroups.");
  };
  const ungroupSel = () => { apply((x) => ({ ...x, measurements: x.measurements.map((m) => (selIds.includes(m.id) ? { ...m, groupId: undefined } : m)) })); say("Ungrouped."); };

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
        { sep: true, label: "" }, { label: "Paste here", shortcut: "Ctrl+V", onClick: () => pasteAt(p) }, { label: "Select all on this page", shortcut: "Ctrl+A", onClick: () => run("select:all") },
        { sep: true, label: "" }, { label: "Fit width", shortcut: "Ctrl+0", onClick: () => run("zoom:fit") },
        { label: "Snap to edges and centers", shortcut: "S", checked: snapOn, onClick: () => run("snap:toggle") },
        { sep: true, label: "" }, { label: "Calibrate…", shortcut: "Shift+Alt+K", onClick: () => run("tool:calibrate") }, { label: "Set page scale…", onClick: () => setRightTab("qty") }] });
      return;
    }
    const { m, vertex, onEdge } = h, lk = !!m.locked, sh = shapeOf(m), min = isClosed(sh) ? 3 : 2;
    if (!selIds.includes(m.id)) setSelected(m.id);
    if (selIds.includes(m.id) && selIds.length > 1) {
      const anyLocked = t.measurements.some((y) => selIds.includes(y.id) && y.locked);
      setCtx({ ...at, items: [
        { label: `${selIds.length} markups selected`, header: true },
        { label: "Copy", shortcut: "Ctrl+C", onClick: () => run("copy") }, { label: "Cut", shortcut: "Ctrl+X", onClick: () => run("cut") },
        { sep: true, label: "" }, { label: "Group", shortcut: "Ctrl+G", onClick: groupSel }, { label: "Ungroup", shortcut: "Ctrl+Shift+G", onClick: ungroupSel },
        { label: anyLocked ? "Lock all" : "Unlock all", shortcut: "Ctrl+L", onClick: () => toggleLock(null) },
        { label: "Duplicate", shortcut: "Ctrl+D", onClick: () => duplicate(null) }, { label: "Array…", onClick: () => setArrayOpen(true) },
        { sep: true, label: "" }, { label: "Delete", shortcut: "Del", onClick: () => removeIds(selIds) }] });
      return;
    }
    const items: CtxItem[] = [
      { label: "Properties", onClick: () => { setSelected(m.id); setRightTab("props"); } },
      ...(sh === "link" ? [{ label: "Open link", onClick: () => openLink(m) } as CtxItem] : []),
      { label: lk ? "Unlock" : "Lock", shortcut: "Ctrl+L", onClick: () => toggleLock(m.id) },
      { sep: true, label: "" },
      { label: "Move to layer", header: true },
      ...t.layers.map((l): CtxItem => ({ label: l.name, sub: true, checked: l.id === m.layerId, disabled: lk, onClick: () => patchM(m.id, { layerId: l.id }) })),
      { sep: true, label: "" },
      { label: "Copy", shortcut: "Ctrl+C", onClick: () => { setSelected(m.id); clip.current = { ms: [m], layers: t.layers, n: 0 }; store.set(CLIP_KEY, clip.current); say("Copied."); } },
      { label: "Duplicate", shortcut: "Ctrl+D", onClick: () => duplicate(m.id) }, { label: "Array…", onClick: () => { setSelected(m.id); setArrayOpen(true); } },
      ...(m.groupId ? [{ label: "Ungroup", shortcut: "Ctrl+Shift+G", onClick: ungroupSel } as CtxItem] : []),
      { label: "Bring to front", onClick: () => reorder(m.id, true) }, { label: "Send to back", onClick: () => reorder(m.id, false) },
      { sep: true, label: "" },
      { label: "Add to Tool Chest", header: true },
      ...chest.sets.map((s): CtxItem => ({ label: s.name, sub: true, onClick: () => addToChest(m, s.id) })),
    ];
    if (sh === "polyline" || sh === "polygon" || sh === "cloud") {
      items.push({ sep: true, label: "" });
      if (vertex != null) items.push({ label: "Delete point", disabled: lk || m.pts.length <= min, onClick: () => { const r = removePoint(m.pts, vertex, min); if (r) patchM(m.id, { pts: r }); } });
      else if (onEdge) items.push({ label: "Add point here", disabled: lk, onClick: () => patchM(m.id, { pts: insertPoint(m.pts, p, isClosed(sh)) }) });
    }
    if (m.kind !== "count" && m.kind !== "markup") items.push({ label: m.hideLabel ? "Show measurement text" : "Hide measurement text", onClick: () => patchM(m.id, { hideLabel: !m.hideLabel }) });
    items.push({ sep: true, label: "" }, { label: "Delete", shortcut: "Del", disabled: lk, onClick: () => removeM(m) });
    setCtx({ ...at, items });
  };

  // ---- Dynamic Fill: click inside a closed room and trace it from the rendered sheet ----
  const runDynFill = async (p: Pt) => {
    if (!doc) return;
    setBusy(true); say("Finding the space…");
    try {
      const pg = await doc.getPage(page);
      const s = Math.min(3, 2800 / Math.max(pageSize.w, pageSize.h)), vp = pg.getViewport({ scale: s });
      const c = document.createElement("canvas"); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      const cx = c.getContext("2d"); if (!cx) throw new Error("no canvas");
      cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: cx, viewport: vp }).promise;
      const im = cx.getImageData(0, 0, c.width, c.height);
      const r = regionPolygon({ w: im.width, h: im.height, data: im.data }, p.x * s, p.y * s, { gap: Math.max(2, Math.round(1.5 * s)) });
      setBusy(false);
      if (!r) { say("Click inside an empty space (not on a line) to fill it."); return; }
      if (r.touchesBorder) { say("That space isn't closed: there is a gap in the walls (an open door, say) so the fill leaked out. Close the gap with a line, or click a closed room."); return; }
      const pts = r.pts.map((q) => ({ x: q.x / s, y: q.y / s }));
      if (pts.length < 3) { say("That space is too small to trace."); return; }
      say(""); commit(TOOL_BY_ID.dynfill, pts);
    } catch { setBusy(false); say("Couldn't read this page to fill it."); }
  };

  const onSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (panStart.current?.moved || performance.now() - justDragged.current < 300) return;
    if (tool === "select") { setSelIds([]); return; }
    if (tool === "pan") { const h = hitTest(resolve(e, true).p); if (h && shapeOf(h.m) === "link") openLink(h.m); return; }
    if (tool === "capture" || tool === "eraser") return;
    const p = resolve(e).p;
    const def = TOOL_BY_ID[tool];
    if (def) {
      if (def.mode === "free") return;
      if (def.id === "dynfill") { void runDynFill(resolve(e, true).p); return; }
      if (def.mode === "one") return commit(def, [p]);
      if (draft.length && dist(p, draft[draft.length - 1]) < 1 / zoom) return;
      const pts = [...draft, p];
      if ((def.mode === "two" && pts.length === 2) || (def.mode === "three" && pts.length === 3)) return commit(def, pts);
      setDraft(pts);
      return;
    }
    if (tool === "calibrate") {
      const pts = [...draft, p];
      if (pts.length < 2) return setDraft(pts);
      const entered = prompt("How long is the distance you just clicked?\nType it any way you like: 20, 20', 20'-6\", 240 in, 5 m\n(or type the sheet's printed scale, e.g. 1/8\" = 1'-0\")");
      setDraft([]);
      if (!entered || !entered.trim()) return;
      if (dist(pts[0], pts[1]) < 1) { alert("The two points are on top of each other. Click two separate points on the dimension you want to use."); return; }
      const k = entered.includes("=") ? parseArchScale(entered) : (() => { const ft = parseDistance(entered); return ft == null ? null : calibrate(pts[0], pts[1], ft); })();
      if (k == null) { alert(`Couldn't read "${entered}". Try something like 20, 20', 20'-6", 240 in or 5 m, or a scale like 1/8" = 1'-0".`); return; }
      const prev = t.feetPerUnit[page];
      apply((x) => setScale(x, allPages ? Array.from({ length: pageCount }, (_, i) => i + 1) : [page], k, "calibrated on the sheet"));
      if (prev && Math.abs(k - prev) / prev > 0.02) say(`The new scale differs from the old one by ${((Math.abs(k - prev) / prev) * 100).toFixed(1)}%. If the sheet is one scale, check which dimension you trust.`);
      setTool("select");
    }
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
  const selMs = () => t.measurements.filter((m) => selIds.includes(m.id));
  const openArray = () => { if (!selIds.length) { say("Select a markup first, then choose Array."); return; } setArrayOpen(true); };
  const doArray = (rows: number, cols: number, dx: number, dy: number) => {
    const ms = selMs(); if (!ms.length) return;
    const copies: Measurement[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (r || c) copies.push(...cloneMs(ms, c * dx, r * dy));
    apply((x) => ({ ...x, measurements: [...x.measurements, ...copies] }));
    setArrayOpen(false); say(`Created ${copies.length} copies.`);
  };
  const exportPdf = async () => {
    if (!pdfBytes.current) { say("Open a PDF first."); return; }
    setBusy(true); say("Building the marked-up PDF…");
    try {
      const { exportMarkedUpPdf } = await import("./lib/exportpdf");
      const r = await exportMarkedUpPdf(pdfBytes.current, t, { labels: showLabels });
      downloadBlob(fileName.replace(/\.pdf$/i, "") + " (marked up).pdf", new Blob([r.bytes as BlobPart], { type: "application/pdf" }));
      say(r.skippedRotated.length ? `Exported. Page(s) ${r.skippedRotated.join(", ")} are rotated, so their markups were left out of the PDF.` : "Exported. The markups are now part of the PDF pages.");
    } catch (err) { say("Couldn't build the PDF: " + (err instanceof Error ? err.message : "unknown error")); }
    setBusy(false);
  };
  const doSearch = async () => {
    const q = query.trim(); if (!doc || !q) return;
    setBusy(true); const out: { page: number; rects: Rect[] }[] = []; let anyText = false;
    for (let pg = 1; pg <= pageCount; pg++) {
      try { const b = await pageBoxes(pg); if (b.length) anyText = true; const r = searchBoxes(b, q); if (r.length) out.push({ page: pg, rects: r }); } catch { /* skip page */ }
    }
    setHits(out); setSearched(q); setBusy(false);
    const first = out.find((h) => h.page >= page) ?? out[0];
    if (first) goPage(first.page); else say(anyText ? `"${q}" wasn't found in the sheets' text.` : "These sheets have no text to search (they're scans).");
  };
  const addBookmark = () => {
    if (!doc) return;
    const name = prompt("Bookmark name", `Page ${page}`); if (!name || !name.trim()) return;
    apply((x) => ({ ...x, bookmarks: [...(x.bookmarks ?? []), { id: newId("b"), name: name.trim(), page }] }));
    setLeftTab("bookmarks");
  };
  const run = (cmd: Command) => {
    if (cmd.startsWith("tool:")) {
      const id = cmd.slice(5), d = TOOL_BY_ID[id];
      if (id === "select" || id === "pan" || id === "calibrate" || id === "capture" || id === "eraser" || d) {
        setTool(id); setDraft([]); penRef.current = null; setSnapHit(null);
        if (id !== "select" && !(d && preset && presetFits(preset, d))) setPreset(null);
      }
      return;
    }
    switch (cmd) {
      case "array": openArray(); break;
      case "palette": setPalette(true); break;
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
      case "delete": if (selIds.length) removeIds(selIds); break;
      case "copy": copySel(); break;
      case "cut": if (copySel()) removeIds(selIds); break;
      case "paste": pasteAt(); break;
      case "select:all": setTool("select"); setSelIds(mine.filter((m) => layerOf(m.layerId)?.visible).map((m) => m.id)); break;
      case "group": groupSel(); break;
      case "ungroup": ungroupSel(); break;
      case "search": setLeftTab("search"); setTimeout(() => document.getElementById("search-q")?.focus(), 30); break;
      case "save": if (doc) { download("takeoff.json", JSON.stringify(t, null, 1)); say("Saved takeoff.json to your downloads. (It is also saved in this browser as you work.)"); } break;
      case "export:pdf": void exportPdf(); break;
      case "snap:toggle": setSnapOn(!snapOn); say(snapOn ? "Snap off. Click exactly where you want points." : "Snap on: ends, centers, midpoints and edges."); break;
      case "duplicate": duplicate(null); break;
      case "lock:toggle": toggleLock(null); break;
      case "backspace-point": setDraft((d) => d.slice(0, -1)); break;
      case "finish": finish(); break;
      case "cancel": if (ctx) setCtx(null); else if (drag.current) dragCancel(); else if (draft.length || capRect) { setDraft([]); setCapRect(null); } else if (selIds.length && tool === "select") setSelIds([]); else { setTool("select"); setPreset(null); } break;
    }
  };
  const arm = (p: ToolPreset) => { setPreset(p); setTool(toolForPreset(p.kind, p.shape).id); setDraft([]); };

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
    setChest(addTool(chest, setId, { name: m.label, kind: m.kind, shape: shapeOf(m), depth: m.depth, text: m.text, color: colorOf(m), lineWidth: m.lineWidth ?? 2, label: m.label, layerName: layerOf(m.layerId)?.name, symbol: m.symbol }));
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
      { label: "Save takeoff (JSON)", shortcut: "Ctrl+S", disabled: !doc, onClick: () => run("save") },
      { label: "Export PDF with markups…", disabled: !doc || busy, onClick: () => run("export:pdf") },
      { label: "Export summary (CSV)", disabled: !doc, onClick: () => download("takeoff-summary.csv", summaryCsv(t)) },
      { label: "Export every markup (CSV)", disabled: !doc, onClick: () => download("takeoff-detail.csv", toCsv(t)) } ] },
    { label: "Edit", items: [
      { label: "Undo", shortcut: "Ctrl+Z", disabled: !canUndo(hist), onClick: () => run("undo") }, { label: "Redo", shortcut: "Ctrl+Y", disabled: !canRedo(hist), onClick: () => run("redo") },
      { sep: true, label: "" }, { label: "Copy", shortcut: "Ctrl+C", disabled: !selected, onClick: () => run("copy") }, { label: "Cut", shortcut: "Ctrl+X", disabled: !selected, onClick: () => run("cut") },
      { label: "Paste", shortcut: "Ctrl+V", onClick: () => run("paste") }, { label: "Select all on this page", shortcut: "Ctrl+A", disabled: !doc, onClick: () => run("select:all") },
      { label: "Group", shortcut: "Ctrl+G", disabled: selIds.length < 2, onClick: () => run("group") }, { label: "Ungroup", shortcut: "Ctrl+Shift+G", disabled: !selected, onClick: () => run("ungroup") },
      { sep: true, label: "" }, { label: "Find text…", shortcut: "Ctrl+F", disabled: !doc, onClick: () => run("search") }, { label: "Eraser", shortcut: "Shift+E", checked: tool === "eraser", onClick: () => run("tool:eraser") },
      { sep: true, label: "" }, { label: "Duplicate selected", shortcut: "Ctrl+D", disabled: !selected, onClick: () => run("duplicate") },
      { label: "Array selected…", disabled: !selected, onClick: () => run("array") },
      { label: "Lock / unlock selected", shortcut: "Ctrl+L", disabled: !selected, onClick: () => run("lock:toggle") }, { label: "Delete selected", shortcut: "Del", disabled: !selected, onClick: () => run("delete") } ] },
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
      ...TOOLS.filter((x) => x.group === "markup").map((x) => ({ label: x.label, shortcut: tkey(x), checked: tool === x.id, onClick: () => run(`tool:${x.id}`) })),
      { sep: true, label: "" }, { label: "Array selected…", disabled: !selected, onClick: () => run("array") }, { label: "Capture symbol from print", shortcut: "Shift+S", onClick: () => run("tool:capture") } ] },
    { label: "Measure", items: [
      ...TOOLS.filter((x) => x.group === "measure").map((x) => ({ label: x.label, shortcut: tkey(x), checked: tool === x.id, onClick: () => run(`tool:${x.id}`) })),
      { sep: true, label: "" }, { label: "Calibrate…", shortcut: "Shift+Alt+K", onClick: () => run("tool:calibrate") }, { label: "Scale and quantities", onClick: () => setRightTab("qty") },
      { label: "Apply scale to all pages", checked: allPages, onClick: () => setAllPages(!allPages) },
      { sep: true, label: "" }, { label: "Show measurement text on the drawing", checked: showLabels, onClick: () => setShowLabels(!showLabels) },
      { label: "Ask for a label after each measurement", checked: askLabel, onClick: () => setAskLabel(!askLabel) } ] },
    { label: "Tools", items: [
      { label: "Tool Chest", onClick: () => setLeftTab("chest") }, { label: "Layers", onClick: () => setLeftTab("layers") }, { label: "Bookmarks", onClick: () => setLeftTab("bookmarks") }, { label: "Make links from printed web addresses", disabled: !doc, onClick: () => void makeUrlLinks() }, { label: "Page thumbnails", onClick: () => setLeftTab("pages") }, { label: "All markups", onClick: () => setRightTab("markups") } ] },
    { label: "Help", items: [{ label: "Search every command", shortcut: "Ctrl+K", onClick: () => run("palette") }, { label: "Keyboard shortcuts", onClick: () => setRightTab("keys") }] },
  ];

  const paletteItems: PaletteItem[] = [
    ...TOOLS.map((x): PaletteItem => ({ id: `t-${x.id}`, label: `${x.group === "measure" ? "Measure" : "Draw"}: ${x.label}`, hint: tkey(x), run: () => run(`tool:${x.id}`) })),
    { id: "sel", label: "Select tool", hint: "V", run: () => run("tool:select") }, { id: "pan", label: "Pan tool", hint: "Shift+V", run: () => run("tool:pan") },
    { id: "cal", label: "Calibrate the page scale", hint: "Shift+Alt+K", run: () => run("tool:calibrate") },
    { id: "scale", label: "Scale: type it or pick it", hint: "Measurements panel", run: () => setRightTab("qty") },
    { id: "det", label: "Scale: detect from page text", run: () => { setRightTab("qty"); void detectNow(); } },
    { id: "scan", label: "Scale: scan all pages", run: () => { setRightTab("qty"); void scanAll(); } },
    { id: "cap", label: "Capture a symbol from the print", hint: "Shift+S", run: () => run("tool:capture") },
    { id: "era", label: "Eraser tool", hint: "Shift+E", run: () => run("tool:eraser") }, { id: "cp", label: "Copy", hint: "Ctrl+C", run: () => run("copy") }, { id: "ct", label: "Cut", hint: "Ctrl+X", run: () => run("cut") },
    { id: "ps", label: "Paste", hint: "Ctrl+V", run: () => run("paste") }, { id: "sa", label: "Select all on this page", hint: "Ctrl+A", run: () => run("select:all") },
    { id: "gr", label: "Group selected", hint: "Ctrl+G", run: () => run("group") }, { id: "ug", label: "Ungroup selected", hint: "Ctrl+Shift+G", run: () => run("ungroup") },
    { id: "find", label: "Find text in the sheets", hint: "Ctrl+F", run: () => run("search") }, { id: "bm", label: "Bookmark this page", run: addBookmark }, { id: "ul", label: "Make links from printed web addresses", run: () => void makeUrlLinks() },
    { id: "pdf", label: "Export PDF with markups", run: () => run("export:pdf") },
    { id: "arr", label: "Array the selected markup", run: () => run("array") }, { id: "dup", label: "Duplicate selected", hint: "Ctrl+D", run: () => run("duplicate") },
    { id: "lock", label: "Lock or unlock selected", hint: "Ctrl+L", run: () => run("lock:toggle") }, { id: "del", label: "Delete selected", hint: "Del", run: () => run("delete") },
    { id: "snap", label: "Snap on / off", hint: "S", run: () => run("snap:toggle") }, { id: "wheel", label: "Mouse wheel: zoom or change pages", hint: "W", run: () => run("wheel:toggle") },
    { id: "fit", label: "Fit page width", hint: "Ctrl+0", run: () => run("zoom:fit") }, { id: "zi", label: "Zoom in", hint: "+", run: () => run("zoom:in") }, { id: "zo", label: "Zoom out", hint: "-", run: () => run("zoom:out") },
    { id: "undo", label: "Undo", hint: "Ctrl+Z", run: () => run("undo") }, { id: "redo", label: "Redo", hint: "Ctrl+Y", run: () => run("redo") },
    { id: "open", label: "Open a PDF", run: () => fileIn.current?.click() }, { id: "save", label: "Save takeoff (JSON)", hint: "Ctrl+S", run: () => run("save") },
    { id: "csv1", label: "Export summary (CSV)", run: () => download("takeoff-summary.csv", summaryCsv(t)) }, { id: "csv2", label: "Export every markup (CSV)", run: () => download("takeoff-detail.csv", toCsv(t)) },
    { id: "chest", label: "Show the Tool Chest", run: () => setLeftTab("chest") }, { id: "layers", label: "Show layers", run: () => setLeftTab("layers") }, { id: "pages", label: "Show page thumbnails", run: () => setLeftTab("pages") },
    { id: "keys", label: "Keyboard shortcuts", run: () => setRightTab("keys") },
    { id: "labels", label: "Show or hide measurement text", run: () => setShowLabels(!showLabels) },
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
      {["text", "callout", "note", "cloud", "typewriter", "stamp"].includes(sel.shape ?? "") && field("Text", <textarea rows={3} value={sel.text ?? ""} onChange={(e) => patchSel({ text: e.target.value })} />)}
      {sel.shape === "link" && field("Goes to", <input value={sel.text ?? ""} placeholder="page 5, or www.example.com" onChange={(e) => patchSel({ text: e.target.value })} />)}
      {sel.shape === "link" && <button className="btn" style={{ marginBottom: 6 }} onClick={() => openLink(sel)}><Icon name="link" size={16} />Open link</button>}
      {sel.shape === "viewport" && field("Scale in box", <b>{sel.text}</b>)}
      {sel.groupId && <p className="muted" style={{ margin: "4px 0" }}>Part of a group. <button className="btn" onClick={ungroupSel}>Ungroup</button></p>}
      {sel.kind === "volume" && field("Depth (ft)", <input type="number" min={0} step={0.05} value={sel.depth ?? ""} onChange={(e) => patchSel({ depth: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })} />)}
      {sel.kind !== "markup" && sel.kind !== "count" && <label style={{ display: "block", margin: "4px 0" }}><input type="checkbox" checked={!sel.hideLabel} onChange={() => patchSel({ hideLabel: !sel.hideLabel })} /> Show measurement text</label>}
      {sel.symbol && field("Size", <input type="number" min={4} max={80} value={sel.symbol.size} onChange={(e) => patchSel({ symbol: { ...sel.symbol!, size: Number(e.target.value) } })} />)}
      {sel.kind !== "markup" && field("Quantity", <b>{(() => { const q = quantity(sel, scaleFor(t, sel)); return q == null ? (sel.kind === "volume" && sel.depth == null ? "Needs depth" : "Needs calibration") : `${q.toFixed(2)} ${UNITS[sel.kind]}`; })()}</b>)}
      {field("Page", <span>{sel.page}</span>)}
      </fieldset>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <select className="btn" value="" onChange={(e) => { if (e.target.value) addToChest(sel, e.target.value); }}><option value="">Add to Tool Chest…</option>{chest.sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <button className="btn" disabled={!!sel.locked} onClick={() => run("delete")}><Icon name="trash" size={16} />Delete</button>
      </div>
    </>
  ) : <p className="muted">Select a markup to see and change its properties. Press <b>V</b>, then click one on the print. Drag a box around several to select them together, or hold Shift and click.</p>;
  const multiPanel = (
    <>
      <p style={{ marginTop: 0 }}><b>{selIds.length}</b> markups selected</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <button className="btn" onClick={groupSel}><Icon name="group" size={16} />Group</button>
        <button className="btn" onClick={ungroupSel}>Ungroup</button>
        <button className="btn" onClick={() => toggleLock(null)}><Icon name="lock" size={16} />Lock / unlock</button>
        <button className="btn" onClick={() => run("copy")}>Copy</button>
        <button className="btn" onClick={() => duplicate(null)}>Duplicate</button>
        <button className="btn" onClick={() => setArrayOpen(true)}><Icon name="array" size={16} />Array…</button>
        <button className="btn" onClick={() => removeIds(selIds)}><Icon name="trash" size={16} />Delete</button>
      </div>
      {field("Layer", <select value="" onChange={(e) => { if (e.target.value) patchMany(selIds, { layerId: e.target.value }); }}><option value="">Move all to…</option>{t.layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>)}
      {field("Color", <input type="color" value="#2563eb" onChange={(e) => patchMany(selIds, { color: e.target.value })} />)}
      {field("Line", <input type="number" min={1} max={12} placeholder="all" onChange={(e) => { if (Number(e.target.value) > 0) patchMany(selIds, { lineWidth: Number(e.target.value) }); }} />)}
    </>
  );

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
        const q = quantity(m, scaleFor(t, m));
        return (
          <div key={m.id} className={"row" + (selIds.includes(m.id) ? " on" : "")} style={{ cursor: "pointer" }} onClick={() => { goPage(m.page); setTimeout(() => setSelected(m.id), 0); setTool("select"); }}>
            <span style={{ color: colorOf(m) }}><Icon name={(TOOLS.find((x) => x.kind === m.kind && x.shape === shapeOf(m))?.icon ?? "polylength") as IconName} size={16} /></span>
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

  const searchPanel = (
    <>
      <div className="snaprow">
        <input id="search-q" placeholder="Search the sheets' text" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void doSearch(); }} />
        <button className="btn" disabled={!doc || busy || !query.trim()} onClick={() => void doSearch()}>{busy ? "…" : "Find"}</button>
      </div>
      {searched && <p className="muted" style={{ margin: "4px 0" }}>{hits.length ? `"${searched}" on ${hits.length} page(s), ${hits.reduce((n, h) => n + h.rects.length, 0)} match(es).` : `No matches for "${searched}".`}</p>}
      {hits.map((h) => <div key={h.page} className={"row" + (h.page === page ? " on" : "")} style={{ cursor: "pointer" }} onClick={() => goPage(h.page)}><span className="grow">Page {h.page}</span><span className="muted">{h.rects.length}</span></div>)}
      <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="btn" disabled={!doc} onClick={() => void makeUrlLinks()}><Icon name="link" size={16} />Make links from web addresses on this page</button>
        {searched && <button className="btn" onClick={() => { setHits([]); setSearched(""); }}>Clear highlights</button>}
      </div>
      <p className="muted">Searches the text built into the PDF. Scanned sheets have none (no OCR).</p>
    </>
  );
  const bookmarksPanel = (
    <>
      <button className="btn" disabled={!doc} onClick={addBookmark}><Icon name="plus" size={16} />Bookmark page {doc ? page : ""}</button>
      {(t.bookmarks ?? []).map((b) => (
        <div key={b.id} className={"row" + (b.page === page ? " on" : "")}>
          <span className="grow" style={{ cursor: "pointer" }} onClick={() => goPage(b.page)}>{b.name}</span><span className="muted">p{b.page}</span>
          <button className="tbtn" title="Delete bookmark" onClick={() => apply((x) => ({ ...x, bookmarks: (x.bookmarks ?? []).filter((y) => y.id !== b.id) }))}><Icon name="trash" size={16} /></button>
        </div>))}
      {!(t.bookmarks ?? []).length && <p className="muted">No bookmarks yet. Use them to jump to key sheets.</p>}
    </>
  );
  const leftTitle = leftTab === "pages" ? "Pages" : leftTab === "chest" ? "Tool Chest" : leftTab === "search" ? "Search" : leftTab === "bookmarks" ? "Bookmarks" : "Layers";
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
          {tb("eraser", "Eraser (Shift+E)", () => run("tool:eraser"), tool === "eraser")}
        </div>
        <div className="tb-group">
          {tb("calibrate", "Calibrate the page scale (Shift+Alt+K)", () => run("tool:calibrate"), tool === "calibrate")}
          {tb("capture", "Capture symbol (Shift+S)", () => run("tool:capture"), tool === "capture")}
          {tb("array", "Array the selected markup", () => run("array"), false, !selected)}
          {tb("search", "Search every command (Ctrl+K)", () => run("palette"))}
          {tb("searchdoc", "Find text in the sheets (Ctrl+F)", () => run("search"), leftTab === "search")}
          {tb("export", "Export PDF with the markups drawn in", () => run("export:pdf"), false, !doc || busy)}
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
        <input ref={imgIn} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void placeImage(f); }} />
        <input ref={loadIn} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void loadTakeoff(f); }} />
      </div>
      <div className="toolbar two">
        <span className="tb-label">Markup</span>
        {TOOLS.filter((x) => x.group === "markup").map((x) => tb(x.icon as IconName, `${x.label} (${tkey(x)})`, () => run(`tool:${x.id}`), tool === x.id))}
        {tool === "stamp" && <>
          <select className="btn" value={stampId} title="Which stamp" onChange={(e) => setStampId(e.target.value)}>{STAMPS.map((x) => <option key={x.id} value={x.id}>{x.text}</option>)}<option value={CUSTOM_STAMP}>Custom text…</option></select>
          <label className="tb-text"><input type="checkbox" checked={stampDated} onChange={(e) => setStampDated(e.target.checked)} /> add date</label></>}
        <span className="tb-label">Measure</span>
        {TOOLS.filter((x) => x.group === "measure").map((x) => tb(x.icon as IconName, `${x.label} (${tkey(x)})`, () => run(`tool:${x.id}`), tool === x.id))}
      </div>

      <div className="body">
        <div className="rail">
          {rail("pages", "Pages", leftTab === "pages", () => toggle(leftTab, "pages", setLeftTab))}
          {rail("toolchest", "Tool Chest", leftTab === "chest", () => toggle(leftTab, "chest", setLeftTab))}
          {rail("layers", "Layers", leftTab === "layers", () => toggle(leftTab, "layers", setLeftTab))}
          {rail("searchdoc", "Search text (Ctrl+F)", leftTab === "search", () => toggle(leftTab, "search", setLeftTab))}
          {rail("bookmark", "Bookmarks", leftTab === "bookmarks", () => toggle(leftTab, "bookmarks", setLeftTab))}
        </div>
        {leftTab && (
          <div className="side">
            <div className="side-head">{leftTitle}<button className="tbtn" title="Close panel" onClick={() => setLeftTab(null)}><Icon name="close" size={16} /></button></div>
            <div className="side-body">
              {leftTab === "pages" && <Thumbs doc={doc} page={page} onPick={goPage} />}
              {leftTab === "chest" && <ToolChestPanel chest={chest} setChest={setChest} activeId={preset?.id ?? null} onArm={arm} onCapture={() => run("tool:capture")} onReset={() => setChest(defaultChest())} download={download} />}
              {leftTab === "layers" && layersPanel}
              {leftTab === "search" && searchPanel}
              {leftTab === "bookmarks" && bookmarksPanel}
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
                  style={{ position: "absolute", inset: 0 }} onClick={onSvgClick} onDoubleClick={(e) => { if (tool === "select") { const h = hitTest(resolve(e, true).p); if (h && shapeOf(h.m) === "link") openLink(h.m); return; } if (tool === "polylength" || tool === "area") finish(); }} onContextMenu={openCtx}
                  onPointerMove={(e) => {
                    if (drag.current) { dragMove(e); return; }
                    if (eraseRef.current) { eraseAt(resolve(e, true).p); return; }
                    if (marqRef.current) { const q = marqRef.current, p = resolve(e, true).p; if (!q.moved && Math.hypot(p.x - q.a.x, p.y - q.a.y) * zoom < 4) return; q.moved = true; q.b = p; setMarq({ a: q.a, b: p }); return; }
                    if (penRef.current) { const q = resolve(e, true).p, last = penRef.current[penRef.current.length - 1]; if (dist(q, last) > 2 / zoom) { penRef.current = [...penRef.current, q]; setDraft(penRef.current); } return; }
                    const r = resolve(e); setCursor(r.p); setSnapHit(r.hit); capturePointer(e, "move"); }}
                  onPointerDown={(e) => {
                    if (tool === "eraser" && e.button === 0 && !spaceDown) { eraseRef.current = new Set(); svg.current?.setPointerCapture(e.pointerId); eraseAt(resolve(e, true).p); return; }
                    if (tool === "select" && e.button === 0 && !spaceDown && e.target === svg.current) { const p = resolve(e, true).p; marqRef.current = { a: p, b: p, add: e.shiftKey || e.ctrlKey || e.metaKey, moved: false }; svg.current?.setPointerCapture(e.pointerId); return; }
                    if (tool === "pen" && e.button === 0 && !spaceDown) { const q = resolve(e, true).p; penRef.current = [q]; setDraft([q]); svg.current?.setPointerCapture(e.pointerId); return; }
                    capturePointer(e, "down");
                  }}
                  onPointerUp={(e) => {
                    if (eraseRef.current) { endErase(); return; }
                    if (marqRef.current) { endMarq(); return; }
                    if (penRef.current) { const pts = penRef.current; penRef.current = null; justDragged.current = performance.now(); if (pts.length > 1) commit(TOOL_BY_ID.pen, pts); else setDraft([]); return; }
                    dragEnd(); capturePointer(e, "up");
                  }} onPointerCancel={() => { penRef.current = null; eraseRef.current = null; marqRef.current = null; setErased([]); setMarq(null); dragCancel(); }}>
                  {mine.map((m) => {
                    const l = layerOf(m.layerId); if (!l?.visible) return null;
                    if (erased.includes(m.id)) return null;
                    const c = colorOf(m), isSel = selIds.includes(m.id), hit = tool === "select" ? "visiblePainted" : "none";
                    const mp = liveMods?.[m.id] ?? m.pts, sh = shapeOf(m);
                    const down = (e: React.PointerEvent) => startDrag(e, m, null);
                    const stop = (e: React.MouseEvent) => { if (tool === "select") e.stopPropagation(); };
                    const gs = { pointerEvents: hit, cursor: tool === "select" && !m.locked ? "move" : undefined } as React.CSSProperties;
                    if (m.kind === "count") {
                      const p = mp[0];
                      return <g key={m.id} onPointerDown={down} onClick={stop} style={gs}>{m.symbol ? <SymbolMark symbol={m.symbol} cx={p.x} cy={p.y} color={c} selected={isSel} /> : <circle cx={p.x} cy={p.y} r={6} fill={c} stroke={isSel ? "#000" : "none"} strokeWidth={2} vectorEffect="non-scaling-stroke" />}</g>;
                    }
                    const live = mp === m.pts ? m : { ...m, pts: mp };
                    const lab = showLabels && !m.hideLabel ? measureLabel(live, scaleFor(t, live)) : null, an = lab ? labelAnchor(sh, mp) : null;
                    return (
                      <g key={m.id} onPointerDown={down} onClick={stop} style={gs}>
                        <ShapeView kind={m.kind} shape={sh} pts={mp} color={c} lw={m.lineWidth ?? 2} zoom={zoom} text={m.text} image={m.image} selected={isSel} />
                        {lab && an && <MeasureLabel text={lab} pt={an.pt} angle={an.angle} onLine={an.onLine} zoom={zoom} color={c} />}
                        {isSel && selIds.length === 1 && !m.locked && !TEXTLIKE.includes(sh) && !MARKS.includes(sh) && mp.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={5 / zoom} fill="#fff" stroke="#000" vectorEffect="non-scaling-stroke" style={{ cursor: "crosshair" }} onPointerDown={(e) => startDrag(e, m, i)} />)}
                      </g>);
                  })}
                  {tool === "calibrate" && draft.length > 0 && <polyline points={[...draft, ...(cursor ? [cursor] : [])].map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#000" strokeDasharray="5 4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
                  {(() => {
                    const def = TOOL_BY_ID[tool];
                    if (!def || def.mode === "one" || !draft.length) return null;
                    const pv = def.mode === "free" ? draft : [...draft, ...(cursor ? [cursor] : [])];
                    const pm: Measurement = { id: "preview", layerId: activeLayer, kind: def.kind, shape: def.shape, page, label: "", pts: pv, depth: undefined };
                    const lab = showLabels ? measureLabel(pm, fpu) : null, an = lab && pv.length > 1 ? labelAnchor(def.shape, pv) : null;
                    const col = preset && presetFits(preset, def) ? preset.color : layerOf(activeLayer)?.color ?? "#2563eb";
                    return <g pointerEvents="none"><ShapeView kind={def.kind} shape={def.shape} pts={pv} color={col} lw={2} zoom={zoom} text={def.ask === "text" ? "…" : undefined} preview />
                      {lab && an && def.kind !== "volume" && <MeasureLabel text={lab} pt={an.pt} angle={an.angle} onLine={an.onLine} zoom={zoom} color={col} />}</g>;
                  })()}
                  {tool === "count" && cursor && preset?.symbol && <g opacity={0.5}><SymbolMark symbol={preset.symbol} cx={cursor.x} cy={cursor.y} color={preset.color} /></g>}
                  {hits.find((h) => h.page === page)?.rects.map((r, i) => <rect key={"hl" + i} x={r.x} y={r.y} width={r.w} height={r.h} fill="#facc15" fillOpacity={0.45} stroke="#ca8a04" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />)}
                  {marq && <rect x={Math.min(marq.a.x, marq.b.x)} y={Math.min(marq.a.y, marq.b.y)} width={Math.abs(marq.b.x - marq.a.x)} height={Math.abs(marq.b.y - marq.a.y)} fill="#2563eb18" stroke="#2563eb" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
                  {capRect && <rect x={Math.min(capRect.a.x, capRect.b.x)} y={Math.min(capRect.a.y, capRect.b.y)} width={Math.abs(capRect.b.x - capRect.a.x)} height={Math.abs(capRect.b.y - capRect.a.y)} fill="#2563eb22" stroke="#2563eb" strokeDasharray="4" vectorEffect="non-scaling-stroke" />}
                  {snapHit && (TOOL_BY_ID[tool] != null || tool === "calibrate" || liveMods) && (() => {
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
              {rightTab === "props" && (selIds.length > 1 ? multiPanel : propsPanel)}
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
        <span>{msg ? <b>{msg}</b> : <>{hintFor(tool)}{preset ? <b> · {preset.name}</b> : null}</>}</span><span className="sp" />
        <span>Scale: <b>{doc ? scaleLabel : "–"}</b></span>
        <span>Snap: <b>{snapLabel}</b></span>
        <span>Wheel: <b>{wheelMode === "zoom" ? "zoom" : "pages"}</b></span>
        <span>Layer: <b>{layerOf(activeLayer)?.name ?? "–"}</b></span>
        <span>Page <b>{doc ? `${page} / ${pageCount}` : "–"}</b></span><span><b>{Math.round(zoom * 100)}%</b></span>
      </div>
      {arrayOpen && <ArrayDialog feetPerUnit={fpu} onApply={doArray} onClose={() => setArrayOpen(false)} />}
      {palette && <CommandPalette items={paletteItems} onClose={() => setPalette(false)} />}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </div>
  );
}
