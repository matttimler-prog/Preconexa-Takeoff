import { useEffect, useRef, useState } from "react";

export type MenuItem = { label: string; shortcut?: string; onClick?: () => void; disabled?: boolean; checked?: boolean; sep?: boolean };
export type Menu = { label: string; items: MenuItem[] };

export function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open === null) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("mousedown", away); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="menubar" ref={ref}>
      <div className="brand"><span className="brand-mark" />Preconexa <b>Takeoff</b></div>
      {menus.map((m, i) => (
        <div key={m.label} className="menu">
          <button className={"menu-btn" + (open === i ? " on" : "")} onClick={() => setOpen(open === i ? null : i)} onMouseEnter={() => { if (open !== null) setOpen(i); }}>{m.label}</button>
          {open === i && (
            <div className="menu-pop">
              {m.items.map((it, j) => it.sep ? <div key={j} className="menu-sep" /> : (
                <button key={j} className="menu-item" disabled={it.disabled} onClick={() => { setOpen(null); it.onClick?.(); }}>
                  <span className="menu-check">{it.checked ? "✓" : ""}</span><span className="menu-label">{it.label}</span><span className="menu-key">{it.shortcut ?? ""}</span>
                </button>))}
            </div>)}
        </div>))}
    </div>
  );
}
