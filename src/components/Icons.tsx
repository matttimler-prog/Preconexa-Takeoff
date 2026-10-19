export type IconName =
  | "open" | "save" | "undo" | "redo" | "select" | "pan" | "length" | "polylength" | "area" | "count" | "calibrate" | "capture"
  | "zoomIn" | "zoomOut" | "fit" | "prev" | "next" | "wheel" | "pages" | "toolchest" | "layers" | "props" | "calc" | "list"
  | "keys" | "trash" | "download" | "upload" | "chevron" | "plus" | "eye" | "close";

/** Preconexa's own line-icon set (24px grid, 1.8 stroke). */
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const p = (d: string) => <path d={d} />;
  let body: JSX.Element;
  switch (name) {
    case "open": body = p("M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"); break;
    case "save": body = <>{p("M5 3h11l3 3v15H5z")}{p("M8 3v6h7V3")}{p("M8 21v-7h8v7")}</>; break;
    case "undo": body = <>{p("M9 14L4 9l5-5")}{p("M4 9h10a6 6 0 0 1 0 12h-4")}</>; break;
    case "redo": body = <>{p("M15 14l5-5-5-5")}{p("M20 9H10a6 6 0 0 0 0 12h4")}</>; break;
    case "select": body = p("M5 3l14 8-6 2-2 6z"); break;
    case "pan": body = <>{p("M8 12V6a1.5 1.5 0 0 1 3 0v5")}{p("M11 11V4.5a1.5 1.5 0 0 1 3 0V11")}{p("M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2 7-6 7s-5-2-7-5l-1-2a1.5 1.5 0 0 1 2.5-1.5L8 15")}</>; break;
    case "length": body = <>{p("M4 19L19 4")}{p("M2.5 16.5l3 3")}{p("M16.5 2.5l3 3")}</>; break;
    case "polylength": body = <>{p("M3 18l5-9 5 6 8-10")}<circle cx="3" cy="18" r="1.6" /><circle cx="8" cy="9" r="1.6" /><circle cx="13" cy="15" r="1.6" /><circle cx="21" cy="5" r="1.6" /></>; break;
    case "area": body = <path d="M4 7l9-3 7 6-3 9-12-2z" fill="currentColor" fillOpacity="0.15" />; break;
    case "count": body = <><circle cx="12" cy="12" r="8" />{p("M10.5 9.5L12.5 8v8")}</>; break;
    case "calibrate": body = <>{p("M3 12h18")}{p("M3 8v8")}{p("M21 8v8")}{p("M7 12l2-2")}{p("M7 12l2 2")}{p("M17 12l-2-2")}{p("M17 12l-2 2")}</>; break;
    case "capture": body = <>{p("M4 8V5a1 1 0 0 1 1-1h3")}{p("M16 4h3a1 1 0 0 1 1 1v3")}{p("M20 16v3a1 1 0 0 1-1 1h-3")}{p("M8 20H5a1 1 0 0 1-1-1v-3")}<circle cx="12" cy="12" r="2.5" /></>; break;
    case "zoomIn": body = <><circle cx="11" cy="11" r="6" />{p("M20 20l-4.5-4.5")}{p("M11 8v6")}{p("M8 11h6")}</>; break;
    case "zoomOut": body = <><circle cx="11" cy="11" r="6" />{p("M20 20l-4.5-4.5")}{p("M8 11h6")}</>; break;
    case "fit": body = <>{p("M4 9V4h5")}{p("M20 9V4h-5")}{p("M4 15v5h5")}{p("M20 15v5h-5")}</>; break;
    case "prev": body = p("M15 5l-7 7 7 7"); break;
    case "next": body = p("M9 5l7 7-7 7"); break;
    case "wheel": body = <><rect x="7" y="3" width="10" height="18" rx="5" />{p("M12 3v6")}{p("M12 6v2")}</>; break;
    case "pages": body = <><rect x="4" y="3" width="7" height="8" /><rect x="13" y="3" width="7" height="8" /><rect x="4" y="13" width="7" height="8" /><rect x="13" y="13" width="7" height="8" /></>; break;
    case "toolchest": body = <>{p("M3 9h18v11H3z")}{p("M8 9V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3")}{p("M3 14h18")}</>; break;
    case "layers": body = <>{p("M12 3l9 5-9 5-9-5z")}{p("M3 13l9 5 9-5")}</>; break;
    case "props": body = <>{p("M4 7h10")}{p("M18 7h2")}{p("M4 17h2")}{p("M10 17h10")}<circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>; break;
    case "calc": body = <><rect x="4" y="3" width="16" height="18" rx="2" />{p("M8 7h8")}{p("M8 12h2")}{p("M12 12h2")}{p("M8 16h2")}{p("M12 16h2")}</>; break;
    case "list": body = <>{p("M8 6h12")}{p("M8 12h12")}{p("M8 18h12")}{p("M4 6h.01")}{p("M4 12h.01")}{p("M4 18h.01")}</>; break;
    case "keys": body = <><rect x="2" y="6" width="20" height="12" rx="2" />{p("M6 10h.01")}{p("M10 10h.01")}{p("M14 10h.01")}{p("M18 10h.01")}{p("M7 14h10")}</>; break;
    case "trash": body = <>{p("M4 7h16")}{p("M9 7V4h6v3")}{p("M6 7l1 13h10l1-13")}</>; break;
    case "download": body = <>{p("M12 4v10")}{p("M8 10l4 4 4-4")}{p("M5 20h14")}</>; break;
    case "upload": body = <>{p("M12 14V4")}{p("M8 8l4-4 4 4")}{p("M5 20h14")}</>; break;
    case "chevron": body = p("M6 9l6 6 6-6"); break;
    case "plus": body = <>{p("M12 5v14")}{p("M5 12h14")}</>; break;
    case "eye": body = <>{p("M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z")}<circle cx="12" cy="12" r="3" /></>; break;
    default: body = <>{p("M6 6l12 12")}{p("M18 6L6 18")}</>;
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{body}</svg>;
}
