export type IconName =
  | "open" | "save" | "undo" | "redo" | "select" | "pan" | "length" | "polylength" | "area" | "count" | "calibrate" | "capture"
  | "zoomIn" | "zoomOut" | "fit" | "prev" | "next" | "wheel" | "pages" | "toolchest" | "layers" | "props" | "calc" | "list"
  | "keys" | "trash" | "download" | "upload" | "chevron" | "plus" | "eye" | "close" | "snap" | "lock"
  | "line" | "arrow" | "arc" | "polyline" | "dimension" | "callout" | "rect" | "ellipse" | "polygon" | "cloud" | "cloudplus" | "text" | "note" | "pen" | "highlight" | "perimeter" | "rectarea" | "ellipsearea" | "volume" | "cutout" | "cutoutrect" | "cutoutellipse" | "diameter" | "radius" | "radius3" | "angle" | "array" | "search" | "cover" | "autocount" | "stamp" | "typewriter" | "link" | "image" | "underline" | "strike" | "squiggly" | "hltext" | "sketchrect" | "sketchellipse" | "viewport" | "dynfill" | "eraser" | "bookmark" | "searchdoc" | "group" | "export";

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
    case "snap": body = <>{p("M6 3v8a6 6 0 0 0 12 0V3")}{p("M6 7h4")}{p("M14 7h4")}</>; break;
    case "lock": body = <><rect x="5" y="11" width="14" height="9" rx="2" />{p("M8 11V8a4 4 0 0 1 8 0v3")}</>; break;
    case "line": body = p("M5 19L19 5"); break;
    case "arrow": body = <>{p("M5 19L19 5")}{p("M10 5h9v9")}</>; break;
    case "arc": body = p("M4 18a10 10 0 0 1 16 0"); break;
    case "polyline": body = p("M3 17l5-8 5 6 8-9"); break;
    case "dimension": body = <>{p("M5 19L19 5")}{p("M3 17l4 4")}{p("M17 3l4 4")}</>; break;
    case "callout": body = p("M4 4h16v10h-9l-4 4v-4H4z"); break;
    case "rect": body = <rect x="4" y="6" width="16" height="12" />; break;
    case "ellipse": body = <ellipse cx="12" cy="12" rx="9" ry="6" />; break;
    case "polygon": body = p("M5 8l7-4 7 6-3 9H7z"); break;
    case "cloud": body = p("M7 18h10a4 4 0 0 0 .5-8A5.5 5.5 0 0 0 7 9a4.5 4.5 0 0 0 0 9z"); break;
    case "cloudplus": body = <>{p("M7 18h10a4 4 0 0 0 .5-8A5.5 5.5 0 0 0 7 9a4.5 4.5 0 0 0 0 9z")}{p("M12 11v4")}{p("M10 13h4")}</>; break;
    case "text": body = <>{p("M5 6h14")}{p("M12 6v13")}{p("M9 19h6")}</>; break;
    case "note": body = <>{p("M5 4h14v12l-5 4H5z")}{p("M14 20v-4h5")}</>; break;
    case "pen": body = <>{p("M4 20l1-4L16 5l3 3L8 19z")}{p("M14 7l3 3")}</>; break;
    case "highlight": body = <>{p("M6 18l-1 3 3-1 9-9-2-2z")}{p("M14 9l3-3 2 2-3 3")}{p("M3 22h18")}</>; break;
    case "perimeter": body = <rect x="5" y="6" width="14" height="12" strokeDasharray="3 2" />; break;
    case "rectarea": body = <rect x="4" y="6" width="16" height="12" fill="currentColor" fillOpacity="0.18" />; break;
    case "ellipsearea": body = <ellipse cx="12" cy="12" rx="9" ry="6" fill="currentColor" fillOpacity="0.18" />; break;
    case "volume": body = <>{p("M12 3l8 4v10l-8 4-8-4V7z")}{p("M4 7l8 4 8-4")}{p("M12 11v10")}</>; break;
    case "cutout": body = <>{p("M4 5h16v14H4z")}<path d="M9 9h6v6H9z" fill="currentColor" fillOpacity="0.25" /></>; break;
    case "cutoutrect": body = <><rect x="4" y="5" width="16" height="14" /><rect x="8" y="9" width="8" height="6" fill="currentColor" fillOpacity="0.25" /></>; break;
    case "cutoutellipse": body = <><rect x="4" y="5" width="16" height="14" /><ellipse cx="12" cy="12" rx="4.5" ry="3" fill="currentColor" fillOpacity="0.25" /></>; break;
    case "diameter": body = <><circle cx="12" cy="12" r="8" />{p("M4 12h16")}</>; break;
    case "radius": body = <><circle cx="12" cy="12" r="8" />{p("M12 12l5.6-5.6")}<circle cx="12" cy="12" r="1" /></>; break;
    case "radius3": body = <>{p("M4 18a10 10 0 0 1 16 0")}<circle cx="4" cy="18" r="1.2" /><circle cx="12" cy="8" r="1.2" /><circle cx="20" cy="18" r="1.2" /></>; break;
    case "angle": body = <>{p("M4 19h16")}{p("M4 19L15 5")}{p("M11 19a7 7 0 0 0-2-5")}</>; break;
    case "array": body = <><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><rect x="14" y="14" width="6" height="6" /></>; break;
    case "search": body = <><circle cx="11" cy="11" r="6" />{p("M20 20l-4.5-4.5")}</>; break;
    case "autocount": body = <><rect x="3" y="3" width="8" height="8" strokeDasharray="2 2" /><circle cx="17" cy="7" r="3" /><circle cx="7" cy="17" r="3" /><circle cx="17" cy="17" r="3" /></>; break;
    case "cover": body = <><rect x="4" y="6" width="16" height="9" fill="currentColor" fillOpacity="0.15" />{p("M8 18h8")}{p("M12 18v3")}{p("M8 10.5h8")}</>; break;
    case "stamp": body = <>{p("M4 12h16v6H4z")}{p("M8 12V9a4 4 0 0 1 8 0v3")}{p("M7 21h10")}</>; break;
    case "typewriter": body = <>{p("M5 6h14")}{p("M12 6v12")}{p("M9 18h6")}{p("M18 14v6")}</>; break;
    case "link": body = <>{p("M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1")}{p("M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1")}</>; break;
    case "image": body = <><rect x="4" y="5" width="16" height="14" />{p("M4 16l5-5 4 4 3-3 4 4")}<circle cx="9" cy="9" r="1.4" /></>; break;
    case "underline": body = <>{p("M7 5v7a5 5 0 0 0 10 0V5")}{p("M5 20h14")}</>; break;
    case "strike": body = <>{p("M5 12h14")}{p("M16 7c0-2-2-3-4-3s-4 1-4 3 2 3 4 4")}{p("M8 17c0 2 2 3 4 3s4-1 4-3")}</>; break;
    case "squiggly": body = <>{p("M8 13l4-9 4 9")}{p("M3 19l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2")}</>; break;
    case "hltext": body = <><rect x="4" y="7" width="16" height="9" fill="currentColor" fillOpacity="0.2" />{p("M9 14l3-6 3 6")}</>; break;
    case "sketchrect": body = <><rect x="4" y="5" width="16" height="10" />{p("M4 19h16")}{p("M4 17v4")}{p("M20 17v4")}</>; break;
    case "sketchellipse": body = <><ellipse cx="12" cy="10" rx="8" ry="5" />{p("M4 19h16")}{p("M4 17v4")}{p("M20 17v4")}</>; break;
    case "viewport": body = <><rect x="3" y="5" width="18" height="14" strokeDasharray="3 2" /><rect x="8" y="9" width="8" height="6" /></>; break;
    case "dynfill": body = <>{p("M6 11l6-6 6 6-6 6z")}{p("M19 15c1.2 1.6 1.2 3 0 3s-1.2-1.4 0-3z")}{p("M4 21h16")}</>; break;
    case "eraser": body = <>{p("M4 16l8-8 6 6-5 5H8z")}{p("M10 21h10")}</>; break;
    case "bookmark": body = p("M7 4h10v17l-5-4-5 4z"); break;
    case "searchdoc": body = <>{p("M6 3h8l4 4v14H6z")}<circle cx="11" cy="13" r="3" />{p("M13.2 15.2l2.3 2.3")}</>; break;
    case "group": body = <><rect x="4" y="4" width="7" height="7" /><rect x="13" y="13" width="7" height="7" />{p("M7.5 11v5h5.5")}</>; break;
    case "export": body = <>{p("M12 3v12")}{p("M8 7l4-4 4 4")}{p("M5 21h14")}{p("M5 17v4")}{p("M19 17v4")}</>; break;
    default: body = <>{p("M6 6l12 12")}{p("M18 6L6 18")}</>;
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{body}</svg>;
}
