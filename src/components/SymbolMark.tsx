import type { SymbolDef } from "../lib/toolchest";

/** A symbol drawn at (cx, cy); all sizes are in the parent SVG's units (page units on the print). */
export function SymbolMark({ symbol, cx, cy, color, selected }: { symbol: SymbolDef; cx: number; cy: number; color: string; selected?: boolean }) {
  const s = symbol.size, h = s / 2;
  const common = { fill: "#ffffff", fillOpacity: 0.85, stroke: selected ? "#000" : color, strokeWidth: selected ? 3 : 1.5, vectorEffect: "non-scaling-stroke" as const };
  let shape: JSX.Element;
  switch (symbol.shape) {
    case "ring": shape = <circle cx={cx} cy={cy} r={h} fill="none" stroke={selected ? "#000" : color} strokeWidth={selected ? 3 : 2} vectorEffect="non-scaling-stroke" />; break;
    case "square": shape = <rect x={cx - h} y={cy - h} width={s} height={s} {...common} />; break;
    case "triangle": shape = <polygon points={`${cx},${cy - h} ${cx + h},${cy + h} ${cx - h},${cy + h}`} {...common} />; break;
    case "diamond": shape = <polygon points={`${cx},${cy - h} ${cx + h},${cy} ${cx},${cy + h} ${cx - h},${cy}`} {...common} />; break;
    case "cross": shape = <path d={`M${cx - h},${cy} H${cx + h} M${cx},${cy - h} V${cy + h}`} fill="none" stroke={selected ? "#000" : color} strokeWidth={3} vectorEffect="non-scaling-stroke" />; break;
    case "image": shape = (
      <g>
        <rect x={cx - h} y={cy - h} width={s} height={s} {...common} />
        {symbol.image && <image href={symbol.image} x={cx - h} y={cy - h} width={s} height={s} preserveAspectRatio="xMidYMid meet" />}
      </g>); break;
    default: shape = <circle cx={cx} cy={cy} r={h} {...common} />;
  }
  return (
    <g>
      {shape}
      {symbol.text && symbol.shape !== "image" && symbol.shape !== "cross" && (
        <text x={cx} y={cy} fontSize={s * 0.6} fontWeight={700} textAnchor="middle" dominantBaseline="central" fill={color} style={{ pointerEvents: "none", userSelect: "none" }}>{symbol.text}</text>
      )}
    </g>
  );
}

export function SymbolIcon({ symbol, color, kind }: { symbol?: SymbolDef; color: string; kind: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" style={{ flex: "none" }}>
      {symbol ? <SymbolMark symbol={{ ...symbol, size: 18 }} cx={12} cy={12} color={color} />
        : kind !== "area" && kind !== "volume" && kind !== "cutout" ? <path d="M3,18 L10,8 L14,14 L21,5" fill="none" stroke={color} strokeWidth={2.5} />
        : <polygon points="4,6 20,4 21,18 6,20" fill={color + "44"} stroke={color} strokeWidth={2} />}
    </svg>
  );
}
