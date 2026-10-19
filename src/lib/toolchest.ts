import type { Kind } from "./takeoff";
import { KINDS as ALL_KINDS } from "./takeoff";
import type { Shape } from "./shapes";
import { CLOSED } from "./shapes";

export type SymbolShape = "circle" | "square" | "triangle" | "diamond" | "cross" | "image";
export type SymbolDef = { shape: SymbolShape; text?: string; image?: string; size: number };
export type ToolPreset = {
  id: string; name: string; kind: Kind; color: string; lineWidth: number;
  label: string; layerName?: string; symbol?: SymbolDef; shape?: Shape; depth?: number; text?: string;
};
export type ToolSet = { id: string; name: string; tools: ToolPreset[] };
export type ToolChest = { version: 1; sets: ToolSet[] };

let n = 0;
export const newId = (p = "id") => `${p}_${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const sym = (shape: SymbolShape, text: string, size = 14): SymbolDef => ({ shape, text, size });
const tool = (name: string, kind: Kind, color: string, extra: Partial<ToolPreset> = {}): ToolPreset =>
  ({ id: newId("tool"), name, kind, color, lineWidth: 2, label: name, ...extra });

export function defaultChest(): ToolChest {
  return {
    version: 1,
    sets: [
      { id: newId("set"), name: "Electrical – Devices", tools: [
        tool("Duplex receptacle", "count", "#2563eb", { layerName: "Power", symbol: sym("circle", "R") }),
        tool("GFCI receptacle", "count", "#2563eb", { layerName: "Power", symbol: sym("circle", "G") }),
        tool("Switch", "count", "#16a34a", { layerName: "Lighting", symbol: sym("square", "S") }),
        tool("Recessed light", "count", "#d97706", { layerName: "Lighting", symbol: sym("circle", "C") }),
        tool("2x4 troffer", "count", "#d97706", { layerName: "Lighting", symbol: sym("square", "L") }),
        tool("Data outlet", "count", "#7c3aed", { layerName: "Low voltage", symbol: sym("diamond", "D") }),
        tool("Fire alarm device", "count", "#e11d48", { layerName: "Fire alarm", symbol: sym("triangle", "F") }),
        tool("Panel", "count", "#0891b2", { layerName: "Power", symbol: sym("square", "P", 20) }),
      ] },
      { id: newId("set"), name: "Electrical – Runs", tools: [
        tool("3/4 EMT", "length", "#2563eb", { layerName: "Conduit" }),
        tool("1 EMT", "length", "#7c3aed", { layerName: "Conduit" }),
        tool("Feeder", "length", "#e11d48", { layerName: "Feeders", lineWidth: 3 }),
        tool("Cable tray", "length", "#0891b2", { layerName: "Tray", lineWidth: 4 }),
      ] },
      { id: newId("set"), name: "Areas", tools: [
        tool("Room / floor area", "area", "#16a34a", { layerName: "Areas" }),
      ] },
      { id: newId("set"), name: "My Symbols", tools: [] },
    ],
  };
}

const upd = (c: ToolChest, setId: string, f: (s: ToolSet) => ToolSet): ToolChest => ({ ...c, sets: c.sets.map((s) => (s.id === setId ? f(s) : s)) });

export const addTool = (c: ToolChest, setId: string, t: Omit<ToolPreset, "id"> & { id?: string }): ToolChest =>
  upd(c, setId, (s) => ({ ...s, tools: [...s.tools, { ...t, id: t.id ?? newId("tool") }] }));
export const removeTool = (c: ToolChest, setId: string, toolId: string): ToolChest =>
  upd(c, setId, (s) => ({ ...s, tools: s.tools.filter((t) => t.id !== toolId) }));
export const updateTool = (c: ToolChest, setId: string, toolId: string, patch: Partial<ToolPreset>): ToolChest =>
  upd(c, setId, (s) => ({ ...s, tools: s.tools.map((t) => (t.id === toolId ? { ...t, ...patch, id: t.id } : t)) }));
export const addSet = (c: ToolChest, name: string): ToolChest => ({ ...c, sets: [...c.sets, { id: newId("set"), name, tools: [] }] });
export const removeSet = (c: ToolChest, setId: string): ToolChest => ({ ...c, sets: c.sets.filter((s) => s.id !== setId) });
export const renameSet = (c: ToolChest, setId: string, name: string): ToolChest => upd(c, setId, (s) => ({ ...s, name }));

export const exportChest = (c: ToolChest) => JSON.stringify(c, null, 1);

const KINDS: string[] = ALL_KINDS;
const SHAPE_NAMES: string[] = [...CLOSED, "polyline", "arc", "line", "arrow", "text", "callout", "pen", "dimension", "point", "note", "angle"];
const SHAPES = ["circle", "square", "triangle", "diamond", "cross", "image"];
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);

/** Validate and merge an imported chest. Unknown or malformed pieces are dropped; ids are regenerated so imports never collide. */
export function importChest(text: string, into: ToolChest): { chest: ToolChest; addedSets: number; addedTools: number; skipped: number } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("Not a valid tool chest file"); }
  const sets = (raw as { sets?: unknown })?.sets;
  if (!Array.isArray(sets)) throw new Error("Not a valid tool chest file");
  let addedTools = 0, skipped = 0;
  const out: ToolSet[] = [];
  for (const s of sets) {
    if (!s || typeof s !== "object" || !Array.isArray((s as ToolSet).tools)) { skipped++; continue; }
    const tools: ToolPreset[] = [];
    for (const t of (s as ToolSet).tools as unknown[]) {
      const o = t as Record<string, unknown>;
      if (!o || typeof o !== "object" || !KINDS.includes(str(o.kind)) || !str(o.name)) { skipped++; continue; }
      const sy = o.symbol as Record<string, unknown> | undefined;
      const symbol: SymbolDef | undefined = sy && SHAPES.includes(str(sy.shape))
        ? { shape: sy.shape as SymbolShape, text: str(sy.text) || undefined, image: str(sy.image).startsWith("data:image/") ? str(sy.image) : undefined, size: Math.min(80, Math.max(4, num(sy.size, 14))) }
        : undefined;
      tools.push({ id: newId("tool"), name: str(o.name), kind: o.kind as Kind, color: /^#[0-9a-fA-F]{6}$/.test(str(o.color)) ? str(o.color) : "#2563eb",
        lineWidth: Math.min(12, Math.max(1, num(o.lineWidth, 2))), label: str(o.label) || str(o.name), layerName: str(o.layerName) || undefined, symbol,
        shape: SHAPE_NAMES.includes(str(o.shape)) ? (o.shape as Shape) : undefined, depth: typeof o.depth === "number" && o.depth > 0 ? o.depth : undefined, text: str(o.text) || undefined });
      addedTools++;
    }
    out.push({ id: newId("set"), name: str((s as ToolSet).name, "Imported"), tools });
  }
  return { chest: { ...into, sets: [...into.sets, ...out] }, addedSets: out.length, addedTools, skipped };
}
