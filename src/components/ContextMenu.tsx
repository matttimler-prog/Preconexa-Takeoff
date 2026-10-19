import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MenuItem } from "./MenuBar";

export type CtxItem = MenuItem & { header?: boolean; sub?: boolean };

/** Right-click menu. Closes on outside click, Escape, wheel or window blur. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: CtxItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) });
  }, [x, y, items]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", away); window.addEventListener("keydown", esc);
    window.addEventListener("wheel", onClose, { passive: true }); window.addEventListener("blur", onClose);
    return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc); window.removeEventListener("wheel", onClose); window.removeEventListener("blur", onClose); };
  }, [onClose]);
  return (
    <div className="ctx" ref={ref} style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, j) => it.sep ? <div key={j} className="menu-sep" /> : it.header ? <div key={j} className="ctx-head">{it.label}</div> : (
        <button key={j} className={"menu-item" + (it.sub ? " sub" : "")} disabled={it.disabled} onClick={() => { onClose(); it.onClick?.(); }}>
          <span className="menu-check">{it.checked ? "✓" : ""}</span><span className="menu-label">{it.label}</span><span className="menu-key">{it.shortcut ?? ""}</span>
        </button>))}
    </div>
  );
}
