/** View + input logic with no DOM dependencies, so it can be tested. */
export type WheelMode = "zoom" | "page";
export type WheelAction = { type: "zoom"; factor: number } | { type: "page"; dir: 1 | -1 } | { type: "scroll" };
export type WheelEvt = { deltaY: number; ctrlKey: boolean; altKey: boolean; shiftKey: boolean };

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 12;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const zoomFactorFromDelta = (deltaY: number) => Math.exp(-Math.max(-300, Math.min(300, deltaY)) * 0.0015);

/**
 * Wheel mapping.
 *  zoom mode: wheel zooms at the cursor; Alt/Shift+wheel scroll.
 *  page mode: wheel changes pages; Ctrl+wheel zooms (also what trackpad pinch sends); Alt/Shift+wheel scroll.
 * Ctrl+wheel always zooms so trackpad pinch works in both modes.
 */
export function resolveWheel(mode: WheelMode, e: WheelEvt): WheelAction {
  if (e.altKey || e.shiftKey) return { type: "scroll" };
  if (e.ctrlKey || mode === "zoom") return { type: "zoom", factor: zoomFactorFromDelta(e.deltaY) };
  return { type: "page", dir: e.deltaY > 0 ? 1 : -1 };
}

/** Accumulate wheel delta so one notch / one trackpad swipe flips exactly one page. */
export function stepAccumulator(acc: number, deltaY: number, threshold = 60): { acc: number; step: -1 | 0 | 1 } {
  const next = acc + deltaY;
  if (next >= threshold) return { acc: 0, step: 1 };
  if (next <= -threshold) return { acc: 0, step: -1 };
  return { acc: next, step: 0 };
}

export type View = { zoom: number; scrollLeft: number; scrollTop: number };

/** Zoom so the content point under the cursor (cx, cy in viewport px) stays under the cursor. */
export function zoomAt(v: View, cx: number, cy: number, factor: number): View {
  const zoom = clampZoom(v.zoom * factor);
  const k = zoom / v.zoom;
  return { zoom, scrollLeft: (v.scrollLeft + cx) * k - cx, scrollTop: (v.scrollTop + cy) * k - cy };
}

export const fitWidthZoom = (viewportW: number, pageW: number, margin = 24) => clampZoom((viewportW - margin) / pageW);

export type Command =
  | "tool:select" | "tool:pan" | "tool:length" | "tool:polylength" | "tool:area" | "tool:count" | "tool:calibrate" | "tool:capture"
  | "page:next" | "page:prev" | "page:first" | "page:last"
  | "zoom:in" | "zoom:out" | "zoom:fit" | "wheel:toggle"
  | "undo" | "redo" | "delete" | "finish" | "cancel" | "backspace-point";

export type KeyEvt = { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean };

/** Shortcut map. Letters follow the common PDF-markup conventions (V select, L line, Shift+N polyline, Shift+Alt+A area, Shift+Alt+C count). */
export function commandForKey(e: KeyEvt): Command | null {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const mod = e.ctrlKey || e.metaKey;
  if (mod) {
    if (k === "z") return e.shiftKey ? "redo" : "undo";
    if (k === "y") return "redo";
    if (k === "ArrowRight") return "page:next";
    if (k === "ArrowLeft") return "page:prev";
    if (k === "0") return "zoom:fit";
    return null;
  }
  if (e.shiftKey && e.altKey) { if (k === "a") return "tool:area"; if (k === "c") return "tool:count"; return null; }
  if (e.shiftKey) {
    if (k === "n") return "tool:polylength";
    if (k === "v") return "tool:pan";
    if (k === "s") return "tool:capture";
    return null;
  }
  if (e.altKey) return null;
  switch (k) {
    case "v": return "tool:select";
    case "l": return "tool:length";
    case "a": return "tool:area";
    case "c": return "tool:count";
    case "k": return "tool:calibrate";
    case "w": return "wheel:toggle";
    case "+": case "=": return "zoom:in";
    case "-": case "_": return "zoom:out";
    case "PageDown": return "page:next";
    case "PageUp": return "page:prev";
    case "Home": return "page:first";
    case "End": return "page:last";
    case "Delete": return "delete";
    case "Backspace": return "backspace-point";
    case "Enter": return "finish";
    case "Escape": return "cancel";
    default: return null;
  }
}

export const SHORTCUT_HELP: [string, string][] = [
  ["Wheel", "Zoom at cursor (or change page in page mode)"], ["W", "Toggle wheel: zoom / page"], ["Ctrl+Wheel", "Always zoom"],
  ["Alt/Shift+Wheel", "Scroll"], ["Space+drag / middle drag", "Pan"], ["V", "Select"], ["Shift+V", "Pan tool"],
  ["L", "Length (2 points)"], ["Shift+N", "Polylength"], ["A / Shift+Alt+A", "Area"], ["C / Shift+Alt+C", "Count"],
  ["K", "Calibrate"], ["Shift+S", "Capture symbol from print"], ["Shift", "Hold to constrain 0/45/90°"],
  ["Enter / double-click", "Finish"], ["Backspace", "Remove last point"], ["Esc", "Cancel"], ["Delete", "Delete selected"],
  ["Ctrl+Z / Ctrl+Y", "Undo / Redo"], ["Ctrl+←/→, PgUp/PgDn", "Previous / next page"], ["Home / End", "First / last page"],
  ["+ / -", "Zoom"], ["Ctrl+0", "Fit width"],
];
