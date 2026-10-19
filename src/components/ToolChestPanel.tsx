import { UNITS } from "../lib/takeoff";
import { useRef, useState } from "react";
import { SymbolIcon } from "./SymbolMark";
import { ToolChest, ToolPreset, addSet, exportChest, importChest, removeSet, removeTool, renameSet } from "../lib/toolchest";

type Props = {
  chest: ToolChest; setChest: (c: ToolChest) => void;
  activeId: string | null; onArm: (t: ToolPreset) => void; onCapture: () => void; onReset: () => void;
  download: (name: string, text: string) => void;
};

export function ToolChestPanel({ chest, setChest, activeId, onArm, onCapture, onReset, download }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const file = useRef<HTMLInputElement>(null);
  const isOpen = (id: string) => open[id] !== false;
  return (
    <div>
      <p style={{ margin: "4px 0" }}>
        <button onClick={onCapture}>Capture symbol from print</button>{" "}
        <button onClick={() => { const n = prompt("New tool set name"); if (n) setChest(addSet(chest, n)); }}>+ Set</button>
      </p>
      <p style={{ margin: "4px 0" }}>
        <button onClick={() => download("toolchest.json", exportChest(chest))}>Export</button>{" "}
        <button onClick={() => file.current?.click()}>Import</button>{" "}
        <button onClick={() => { if (confirm("Replace the whole Tool Chest with the defaults?")) onReset(); }}>Reset</button>
        <input ref={file} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
          try { const r = importChest(await f.text(), chest); setChest(r.chest); alert(`Imported ${r.addedTools} tools in ${r.addedSets} sets${r.skipped ? `, skipped ${r.skipped}` : ""}.`); }
          catch (err) { alert(String(err instanceof Error ? err.message : err)); }
        }} />
      </p>
      {chest.sets.map((s) => (
        <div key={s.id} style={{ borderTop: "1px solid #ddd", paddingTop: 4, marginTop: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setOpen({ ...open, [s.id]: !isOpen(s.id) })} style={{ width: 24 }}>{isOpen(s.id) ? "▾" : "▸"}</button>
            <b style={{ flex: 1 }}>{s.name}</b>
            <button title="Rename" onClick={() => { const n = prompt("Rename tool set", s.name); if (n) setChest(renameSet(chest, s.id, n)); }}>✎</button>
            <button title="Delete set" onClick={() => { if (confirm(`Delete tool set "${s.name}"?`)) setChest(removeSet(chest, s.id)); }}>×</button>
          </div>
          {isOpen(s.id) && (s.tools.length === 0 ? <small style={{ color: "#777" }}>Empty. Capture a symbol, or select a markup and add it here.</small> :
            s.tools.map((t) => (
              <div key={t.id} onClick={() => onArm(t)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 6px", cursor: "pointer", borderRadius: 4, background: activeId === t.id ? "#dbeafe" : "transparent" }}>
                <SymbolIcon symbol={t.symbol} color={t.color} kind={t.kind} />
                <span style={{ flex: 1 }}>{t.name}</span>
                <small style={{ color: "#777" }}>{UNITS[t.kind]}</small>
                <button title="Remove tool" onClick={(e) => { e.stopPropagation(); setChest(removeTool(chest, s.id, t.id)); }}>×</button>
              </div>
            )))}
        </div>
      ))}
    </div>
  );
}
