import type { Pt } from "../lib/measure";
import { dist } from "../lib/measure";
import type { Shape } from "../lib/shapes";
import { angleArc, arrowHead, circleOf, cloudPath, outline, textBox } from "../lib/shapes";
import type { Kind } from "../lib/takeoff";

type Props = { kind: Kind; shape: Shape; pts: Pt[]; color: string; lw: number; zoom: number; text?: string; preview?: boolean; selected?: boolean };

/** Text size in page units: 11 on the sheet, but never smaller than 9 screen pixels when zoomed out. */
export const textSize = (zoom: number) => Math.max(11, 9 / zoom);
const list = (a: Pt[]) => a.map((q) => `${q.x},${q.y}`).join(" ");
const VE = "non-scaling-stroke" as const;

/** Draws one markup's geometry. Used for finished markups and for the live preview while drawing. */
export function ShapeView({ kind, shape, pts, color, lw, zoom, text, preview, selected }: Props) {
  if (!pts.length) return null;
  const stroke = selected ? "#000" : color, sw = selected ? Math.max(3, lw + 1) : lw;
  const line = { stroke, strokeWidth: sw, fill: "none", vectorEffect: VE, strokeLinejoin: "round" as const, strokeLinecap: "round" as const, strokeDasharray: preview ? "5 4" : undefined };
  const fs = textSize(zoom);
  const fill = kind === "area" || kind === "volume" ? color + "33" : kind === "cutout" ? "#ef444433" : "none";
  const dash = kind === "cutout" ? "6 3" : line.strokeDasharray;
  const o = outline(shape, pts);
  const pick = !preview && o.pts.length > 1 ? <polyline points={list(o.closed ? [...o.pts, o.pts[0]] : o.pts)} fill="none" stroke="transparent" strokeWidth={12} vectorEffect={VE} /> : null;

  switch (shape) {
    case "text": {
      const b = textBox(text ?? "", pts[0], fs), rows = (text || " ").split("\n");
      return <g><rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#fff" fillOpacity={0.88} stroke={stroke} strokeWidth={1} vectorEffect={VE} strokeDasharray={preview ? "4 3" : undefined} />
        {rows.map((r, i) => <text key={i} x={b.x + fs * 0.4} y={b.y + fs * (1.15 + 1.25 * i)} fontSize={fs} fill={color} fontFamily="Arial, sans-serif">{r}</text>)}</g>;
    }
    case "callout": {
      if (pts.length < 2) return <circle cx={pts[0].x} cy={pts[0].y} r={3 / zoom} fill={color} />;
      const b = textBox(text ?? "", pts[1], fs), rows = (text || " ").split("\n");
      return <g><polyline points={list([pts[0], { x: b.x, y: b.y + b.h / 2 }])} {...line} /><circle cx={pts[0].x} cy={pts[0].y} r={3 / zoom} fill={color} />
        <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#fff" fillOpacity={0.92} stroke={stroke} strokeWidth={sw} vectorEffect={VE} strokeDasharray={preview ? "4 3" : undefined} />
        {rows.map((r, i) => <text key={i} x={b.x + fs * 0.4} y={b.y + fs * (1.15 + 1.25 * i)} fontSize={fs} fill="#111" fontFamily="Arial, sans-serif">{r}</text>)}</g>;
    }
    case "note": {
      const s = 16 / zoom, p = pts[0];
      return <g><rect x={p.x} y={p.y} width={s} height={s} fill="#fde047" stroke={selected ? "#000" : "#a16207"} strokeWidth={1.5} vectorEffect={VE} />
        <path d={`M${p.x + s * 0.2},${p.y + s * 0.35}h${s * 0.6}M${p.x + s * 0.2},${p.y + s * 0.6}h${s * 0.6}`} stroke="#a16207" strokeWidth={1} vectorEffect={VE} fill="none" />{text ? <title>{text}</title> : null}</g>;
    }
    case "arrow": {
      if (pts.length < 2) return <polyline points={list(pts)} {...line} />;
      const a = pts[0], b = pts[pts.length - 1];
      return <g><polyline points={list([a, b])} {...line} />{pick}<polygon points={list(arrowHead(a, b, 12 / zoom))} fill={stroke} stroke={stroke} strokeWidth={1} vectorEffect={VE} /></g>;
    }
    case "dimension": {
      if (pts.length < 2) return <polyline points={list(pts)} {...line} />;
      const [a, b] = pts, t = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2, d = 7 / zoom, nx = Math.cos(t) * d, ny = Math.sin(t) * d;
      return <g><polyline points={list([a, b])} {...line} />{pick}<path d={`M${a.x - nx},${a.y - ny}L${a.x + nx},${a.y + ny}M${b.x - nx},${b.y - ny}L${b.x + nx},${b.y + ny}`} {...line} strokeDasharray={undefined} /></g>;
    }
    case "cloud":
      if (pts.length < 3) return <polyline points={list(pts)} {...line} />;
      return <g><path d={cloudPath(pts)} {...line} fill={fill} />{pick}</g>;
    case "rect": case "highlight": {
      if (pts.length < 2) return <polyline points={list(pts)} {...line} />;
      const [a, b] = pts, r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
      return <g>{shape === "highlight"
        ? <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#facc15" fillOpacity={0.45} stroke={selected ? "#000" : "none"} vectorEffect={VE} />
        : <rect x={r.x} y={r.y} width={r.w} height={r.h} {...line} fill={fill} strokeDasharray={dash} />}{pick}</g>;
    }
    case "ellipse": {
      if (pts.length < 2) return <polyline points={list(pts)} {...line} />;
      const [a, b] = pts;
      return <g><ellipse cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} rx={Math.abs(b.x - a.x) / 2} ry={Math.abs(b.y - a.y) / 2} {...line} fill={fill} strokeDasharray={dash} />{pick}</g>;
    }
    case "circle": case "diameter": {
      const k = circleOf(shape, pts);
      if (!k) return <polyline points={list(pts)} {...line} />;
      return <g><circle cx={k.c.x} cy={k.c.y} r={k.r} {...line} /><polyline points={list(shape === "circle" ? [pts[0], pts[1]] : pts.slice(0, 2))} {...line} strokeDasharray={undefined} />{pick}</g>;
    }
    case "angle": {
      if (pts.length < 3) return <polyline points={list(pts)} {...line} />;
      const [a, v, b] = pts, r = Math.min(Math.min(dist(v, a), dist(v, b)) * 0.4, 40 / zoom);
      return <g><polyline points={list(pts)} {...line} /><polyline points={list(angleArc(a, v, b, r))} {...line} strokeDasharray={undefined} />{pick}</g>;
    }
    case "polygon":
      if (pts.length < 3) return <polyline points={list(pts)} {...line} />;
      return <g><polygon points={list(pts)} {...line} fill={fill} strokeDasharray={dash} />{pick}</g>;
    case "pen":
      return <polyline points={list(pts)} {...line} />;
    default:
      return <g><polyline points={list(o.pts)} {...line} />{pick}</g>;
  }
}

/** The measured value written on the drawing, in a white box so it reads over any print. */
export function MeasureLabel({ text, pt, angle, onLine, zoom, color }: { text: string; pt: Pt; angle: number; onLine: boolean; zoom: number; color: string }) {
  const fs = textSize(zoom), w = text.length * fs * 0.6 + fs * 0.8, h = fs * 1.55, y0 = onLine ? -h * 1.15 : -h / 2;
  return (
    <g transform={`translate(${pt.x},${pt.y}) rotate(${angle})`} pointerEvents="none">
      <rect x={-w / 2} y={y0} width={w} height={h} rx={fs * 0.2} fill="#fff" fillOpacity={0.92} stroke={color} strokeWidth={1} vectorEffect={VE} />
      <text x={0} y={y0 + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={fs} fontFamily="Arial, sans-serif" fontWeight={600} fill="#111">{text}</text>
    </g>
  );
}
