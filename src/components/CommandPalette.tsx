import { useMemo, useState } from "react";

export type PaletteItem = { id: string; label: string; hint?: string; run: () => void };

/** Ctrl+K: type what you want to do, press Enter. Replaces hunting through menus. */
export function CommandPalette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const [q, setQ] = useState(""), [i, setI] = useState(0);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((it) => words.every((w) => it.label.toLowerCase().includes(w) || (it.hint ?? "").toLowerCase().includes(w))).slice(0, 12);
  }, [q, items]);
  const pick = (it?: PaletteItem) => { if (!it) return; onClose(); it.run(); };
  return (
    <div className="modal-back" onMouseDown={onClose} style={{ alignItems: "flex-start", paddingTop: 90 }}>
      <div className="modal pal" onMouseDown={(e) => e.stopPropagation()}>
        <input autoFocus className="pal-in" placeholder="What do you want to do? (cloud, scale, export, array…)" value={q}
          onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") { e.preventDefault(); setI(Math.min(shown.length - 1, i + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setI(Math.max(0, i - 1)); }
            else if (e.key === "Enter") pick(shown[i]);
          }} />
        {shown.map((it, j) => (
          <div key={it.id} className={"pal-row" + (j === i ? " on" : "")} onMouseEnter={() => setI(j)} onClick={() => pick(it)}>
            <span>{it.label}</span><span className="muted">{it.hint ?? ""}</span>
          </div>))}
        {shown.length === 0 && <div className="pal-row"><span className="muted">Nothing matches “{q}”.</span></div>}
      </div>
    </div>
  );
}
