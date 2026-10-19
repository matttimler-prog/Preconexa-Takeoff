import type { Kind } from "./takeoff";
import type { Shape } from "./shapes";

/** one = click places it; two/three = that many clicks; poly = click points, Enter/double-click finishes; free = press, drag, release. */
export type Mode = "one" | "two" | "three" | "poly" | "free";
export type KeySpec = { key: string; shift?: boolean; alt?: boolean };
export type ToolDef = {
  id: string; label: string; kind: Kind; shape: Shape; mode: Mode; group: "markup" | "measure"; icon: string;
  key?: KeySpec; alias?: string; ask?: "text" | "depth" | "dims" | "cover" | "link" | "image" | "stamp" | "scale"; hint: string;
};

const K = (key: string, shift = false, alt = false): KeySpec => ({ key, shift, alt });

/** Tool names and shortcuts follow the common PDF-markup conventions (single letters for markups, Shift+Alt+letter for measuring). */
export const TOOLS: ToolDef[] = [
  { id: "line", label: "Line", kind: "markup", shape: "line", mode: "two", group: "markup", icon: "line", key: K("l"), hint: "Click two points." },
  { id: "arrow", label: "Arrow", kind: "markup", shape: "arrow", mode: "two", group: "markup", icon: "arrow", key: K("a"), hint: "Click the tail, then the point." },
  { id: "arc", label: "Arc", kind: "markup", shape: "arc", mode: "three", group: "markup", icon: "arc", key: K("c", true), hint: "Click the start, a point on the curve, then the end." },
  { id: "polyline", label: "Polyline", kind: "markup", shape: "polyline", mode: "poly", group: "markup", icon: "polyline", key: K("n", true), hint: "Click points. Double-click or Enter to finish." },
  { id: "dimension", label: "Dimension", kind: "length", shape: "dimension", mode: "two", group: "markup", icon: "dimension", key: K("l", true), hint: "Click two points; the length is written on the drawing." },
  { id: "callout", label: "Callout", kind: "markup", shape: "callout", mode: "two", group: "markup", icon: "callout", key: K("q"), ask: "text", hint: "Click what it points at, then where the text goes." },
  { id: "rect", label: "Rectangle", kind: "markup", shape: "rect", mode: "two", group: "markup", icon: "rect", key: K("r"), hint: "Click two opposite corners." },
  { id: "ellipse", label: "Ellipse", kind: "markup", shape: "ellipse", mode: "two", group: "markup", icon: "ellipse", key: K("e"), hint: "Click two opposite corners of its box." },
  { id: "polygon", label: "Polygon", kind: "markup", shape: "polygon", mode: "poly", group: "markup", icon: "polygon", key: K("p", true), hint: "Click corners. Double-click or Enter to close." },
  { id: "cloud", label: "Cloud", kind: "markup", shape: "cloud", mode: "poly", group: "markup", icon: "cloud", key: K("c"), hint: "Click corners. Double-click or Enter to close." },
  { id: "cloudplus", label: "Cloud+", kind: "markup", shape: "cloud", mode: "poly", group: "markup", icon: "cloudplus", key: K("k"), ask: "text", hint: "Click corners, then type the note that goes with it." },
  { id: "text", label: "Text box", kind: "markup", shape: "text", mode: "one", group: "markup", icon: "text", key: K("t"), ask: "text", hint: "Click where the text goes." },
  { id: "note", label: "Note", kind: "markup", shape: "note", mode: "one", group: "markup", icon: "note", key: K("n"), ask: "text", hint: "Click to drop a note." },
  { id: "pen", label: "Pen", kind: "markup", shape: "pen", mode: "free", group: "markup", icon: "pen", key: K("p"), hint: "Press and drag to draw freehand." },
  { id: "highlight", label: "Highlight", kind: "markup", shape: "highlight", mode: "two", group: "markup", icon: "highlight", key: K("h"), hint: "Click two corners to highlight an area." },

  { id: "stamp", label: "Stamp", kind: "markup", shape: "stamp", mode: "one", group: "markup", icon: "stamp", key: K("m", true), ask: "stamp", hint: "Pick a stamp in the toolbar, then click where it goes." },
  { id: "typewriter", label: "Typewriter", kind: "markup", shape: "typewriter", mode: "one", group: "markup", icon: "typewriter", key: K("t", true), ask: "text", hint: "Click where the text goes. No box is drawn." },
  { id: "link", label: "Hyperlink", kind: "markup", shape: "link", mode: "two", group: "markup", icon: "link", key: K("h", true), ask: "link", hint: "Drag a box, then enter a web address or a page number." },
  { id: "image", label: "Image", kind: "markup", shape: "image", mode: "one", group: "markup", icon: "image", key: K("i"), ask: "image", hint: "Click where the picture goes, then choose the file." },
  { id: "underline", label: "Underline text", kind: "markup", shape: "underline", mode: "two", group: "markup", icon: "underline", hint: "Drag a box over printed text to underline it." },
  { id: "strike", label: "Strikethrough text", kind: "markup", shape: "strike", mode: "two", group: "markup", icon: "strike", hint: "Drag a box over printed text to strike it out." },
  { id: "squiggly", label: "Squiggly underline", kind: "markup", shape: "squiggly", mode: "two", group: "markup", icon: "squiggly", hint: "Drag a box over printed text to underline it with a squiggle." },
  { id: "hltext", label: "Highlight text", kind: "markup", shape: "hltext", mode: "two", group: "markup", icon: "hltext", hint: "Drag a box over printed text to highlight the lines." },
  { id: "cover", label: "Cover and replace text", kind: "markup", shape: "whiteout", mode: "two", group: "markup", icon: "cover", ask: "cover", hint: "Drag a box over printed text or lines. It is covered in white and you can type the replacement." },
  { id: "sketchrect", label: "Sketch rectangle to scale", kind: "markup", shape: "rect", mode: "one", group: "markup", icon: "sketchrect", ask: "dims", hint: "Click the corner, then type its size, e.g. 10' x 12'." },
  { id: "sketchellipse", label: "Sketch ellipse to scale", kind: "markup", shape: "ellipse", mode: "one", group: "markup", icon: "sketchellipse", ask: "dims", hint: "Click the corner of its box, then type the size, e.g. 6' x 4'." },
  { id: "length", label: "Length", kind: "length", shape: "polyline", mode: "two", group: "measure", icon: "length", key: K("l", true, true), alias: "1", hint: "Click two points." },
  { id: "polylength", label: "Polylength", kind: "length", shape: "polyline", mode: "poly", group: "measure", icon: "polylength", key: K("q", true, true), alias: "2", hint: "Click points. Double-click or Enter to finish." },
  { id: "perimeter", label: "Perimeter", kind: "perimeter", shape: "polygon", mode: "poly", group: "measure", icon: "perimeter", key: K("p", true, true), alias: "3", hint: "Click corners. Double-click or Enter to close." },
  { id: "area", label: "Area", kind: "area", shape: "polygon", mode: "poly", group: "measure", icon: "area", key: K("a", true, true), alias: "4", hint: "Click corners. Double-click or Enter to close." },
  { id: "rectarea", label: "Area (rectangle)", kind: "area", shape: "rect", mode: "two", group: "measure", icon: "rectarea", key: K("r", true, true), hint: "Click two opposite corners." },
  { id: "ellipsearea", label: "Area (ellipse)", kind: "area", shape: "ellipse", mode: "two", group: "measure", icon: "ellipsearea", key: K("e", true, true), hint: "Click two opposite corners of its box." },
  { id: "volume", label: "Volume", kind: "volume", shape: "polygon", mode: "poly", group: "measure", icon: "volume", key: K("v", true, true), alias: "5", ask: "depth", hint: "Click corners, then enter the depth." },
  { id: "cutout", label: "Cutout (polygon)", kind: "cutout", shape: "polygon", mode: "poly", group: "measure", icon: "cutout", key: K("x", true, true), hint: "Click corners of the hole inside an area." },
  { id: "cutoutrect", label: "Cutout (rectangle)", kind: "cutout", shape: "rect", mode: "two", group: "measure", icon: "cutoutrect", hint: "Click two opposite corners of the hole." },
  { id: "cutoutellipse", label: "Cutout (ellipse)", kind: "cutout", shape: "ellipse", mode: "two", group: "measure", icon: "cutoutellipse", hint: "Click two opposite corners of the hole's box." },
  { id: "viewport", label: "Viewport scale", kind: "markup", shape: "viewport", mode: "two", group: "measure", icon: "viewport", key: K("w", true, true), ask: "scale", hint: "Drag a box around a detail, then enter its scale. Measurements inside use it." },
  { id: "dynfill", label: "Dynamic Fill", kind: "area", shape: "polygon", mode: "one", group: "measure", icon: "dynfill", key: K("j"), hint: "Click inside a closed room or space to measure it automatically." },
  { id: "count", label: "Count", kind: "count", shape: "point", mode: "one", group: "measure", icon: "count", key: K("c", true, true), alias: "6", hint: "Click each item." },
  { id: "diameter", label: "Diameter", kind: "diameter", shape: "diameter", mode: "two", group: "measure", icon: "diameter", key: K("d", true, true), alias: "7", hint: "Click two points across the circle." },
  { id: "radius", label: "Radius", kind: "radius", shape: "circle", mode: "two", group: "measure", icon: "radius", key: K("u", true, true), alias: "8", hint: "Click the center, then a point on the edge." },
  { id: "radius3", label: "Radius (3 points)", kind: "radius", shape: "arc", mode: "three", group: "measure", icon: "radius3", hint: "Click three points on the curve." },
  { id: "angle", label: "Angle", kind: "angle", shape: "angle", mode: "three", group: "measure", icon: "angle", key: K("g", true, true), alias: "9", hint: "Click one end, the corner, then the other end." },
];

export const TOOL_BY_ID: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

/** Closest tool for a saved preset (kind + shape), so Tool Chest items arm the right tool. */
export function toolForPreset(kind: Kind, shape?: Shape): ToolDef {
  if (kind === "length" && (!shape || shape === "polyline")) return TOOL_BY_ID.polylength; // a saved run can have any number of points
  const fit = (t: ToolDef) => t.kind === kind && (!shape || t.shape === shape);
  return TOOLS.find((t) => fit(t) && t.group === "measure") ?? TOOLS.find(fit) ?? TOOLS.find((t) => t.kind === kind) ?? TOOLS[0];
}

export const keyLabel = (k?: KeySpec) => (k ? `${k.shift ? "Shift+" : ""}${k.alt ? "Alt+" : ""}${k.key.toUpperCase()}` : "");
