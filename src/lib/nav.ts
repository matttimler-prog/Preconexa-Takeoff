import { TOOLS, keyLabel } from "./tools";
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
  | `tool:${string}`
  | "page:next" | "page:prev" | "page:first" | "page:last"
  | "zoom:in" | "zoom:out" | "zoom:fit" | "wheel:toggle"
  | "undo" | "redo" | "delete" | "finish" | "cancel" | "backspace-point" | "snap:toggle" | "duplicate" | "lock:toggle" | "array" | "palette";

export type KeyEvt = { key: string; code?: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean };

/**
 * Shortcut map. Letters follow the common PDF-markup conventions: plain letters draw markups (L line, R rectangle,
 * C cloud...), Shift+Alt+letter measures (Shift+Alt+A area, Shift+Alt+C count), and 1-9 are one-key shortcuts for the measure tools.
 */
export function commandForKey(e: KeyEvt): Command | null {
  // With Alt held, e.key can be a symbol on some keyboards, so read the physical key when we have it.
  const k = e.altKey && e.code?.startsWith("Key") ? e.code.slice(3).toLowerCase() : e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const mod = e.ctrlKey || e.metaKey;
  if (mod) {
    if (k === "z") return e.shiftKey ? "redo" : "undo";
    if (k === "y") return "redo";
    if (k === "ArrowRight") return "page:next";
    if (k === "ArrowLeft") return "page:prev";
    if (k === "0") return "zoom:fit";
    if (k === "d") return "duplicate";
    if (k === "l") return "lock:toggle";
    if (k === "k") return "palette";
    return null;
  }
  if (e.altKey && !e.shiftKey) return null;
  if (e.shiftKey && e.altKey && k === "k") return "tool:calibrate";
  const hit = TOOLS.find((t) => t.key && t.key.key === k && !!t.key.shift === e.shiftKey && !!t.key.alt === e.altKey);
  if (hit) return `tool:${hit.id}`;
  if (e.shiftKey || e.altKey) {
    if (!e.altKey && k === "v") return "tool:pan";
    if (!e.altKey && k === "s") return "tool:capture";
    return null;
  }
  const al = TOOLS.find((t) => t.alias === k);
  if (al) return `tool:${al.id}`;
  switch (k) {
    case "v": return "tool:select";
    case "w": return "wheel:toggle";
    case "s": return "snap:toggle";
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
  ["Alt/Shift+Wheel", "Scroll"], ["Space+drag / middle drag", "Pan"], ["V", "Select"], ["Shift+V", "Pan tool"], ["Ctrl+K", "Search every command"],
  ...TOOLS.map((t): [string, string] => [`${keyLabel(t.key)}${t.alias ? ` or ${t.alias}` : ""}`.replace(/^ or /, ""), t.label]).filter(([k]) => k !== ""),
  ["Shift+Alt+K", "Calibrate scale"], ["S", "Snap on / off"], ["Shift+S", "Capture symbol from print"], ["Ctrl+L", "Lock / unlock selected"], ["Ctrl+D", "Duplicate selected"], ["Right-click", "Markup options"], ["Shift", "Hold to constrain 0/45/90°"],
  ["Enter / double-click", "Finish"], ["Backspace", "Remove last point"], ["Esc", "Cancel"], ["Delete", "Delete selected"],
  ["Ctrl+Z / Ctrl+Y", "Undo / Redo"], ["Ctrl+←/→, PgUp/PgDn", "Previous / next page"], ["Home / End", "First / last page"],
  ["+ / -", "Zoom"], ["Ctrl+0", "Fit width"],
];
