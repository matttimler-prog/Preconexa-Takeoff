import { useEffect, useRef } from "react";
import type * as pdfjs from "pdfjs-dist";

function Thumb({ doc, n, active, onPick }: { doc: pdfjs.PDFDocumentProxy; n: number; active: boolean; onPick: (n: number) => void }) {
  const box = useRef<HTMLButtonElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    let task: pdfjs.RenderTask | null = null, dead = false, done = false;
    const draw = async () => {
      if (done) return; done = true;
      const p = await doc.getPage(n); if (dead) return;
      const base = p.getViewport({ scale: 1 });
      const vp = p.getViewport({ scale: 150 / base.width });
      const c = cv.current; if (!c) return;
      c.width = vp.width; c.height = vp.height;
      const ctx = c.getContext("2d"); if (!ctx) return;
      task = p.render({ canvasContext: ctx, viewport: vp });
      try { await task.promise; } catch { /* cancelled */ }
    };
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) void draw(); }, { rootMargin: "200px" });
    io.observe(el);
    return () => { dead = true; io.disconnect(); task?.cancel(); };
  }, [doc, n]);
  useEffect(() => { if (active) box.current?.scrollIntoView({ block: "nearest" }); }, [active]);
  return (
    <button ref={box} className={"thumb" + (active ? " on" : "")} onClick={() => onPick(n)}>
      <canvas ref={cv} width={150} height={190} />
      <span>{n}</span>
    </button>
  );
}

export function Thumbs({ doc, page, onPick }: { doc: pdfjs.PDFDocumentProxy | null; page: number; onPick: (n: number) => void }) {
  if (!doc) return <p className="muted">Open a PDF to see its pages.</p>;
  return <div className="thumbs">{Array.from({ length: doc.numPages }, (_, i) => <Thumb key={i} doc={doc} n={i + 1} active={page === i + 1} onPick={onPick} />)}</div>;
}
