/**
 * Our markups live in the page "as displayed" (the page viewport at scale 1: y points down, rotation applied).
 * To draw them into a PDF page that has a /Rotate value or a crop box that doesn't start at 0,0, we draw in an
 * upright, y-up copy of the displayed page and wrap the drawing in one transform that maps it onto the real page.
 */
export type Box = { x: number; y: number; width: number; height: number };
export type Matrix6 = [number, number, number, number, number, number];

/** Height of the displayed page, and the matrix that places the upright displayed page onto the PDF page's own space. */
export function displayTransform(rotation: number, box: Box): { height: number; width: number; matrix: Matrix6 } {
  const r = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  const { x: x0, y: y0, width: W, height: H } = box;
  switch (r) {
    case 90: return { width: H, height: W, matrix: [0, 1, -1, 0, x0 + W, y0] };
    case 180: return { width: W, height: H, matrix: [-1, 0, 0, -1, x0 + W, y0 + H] };
    case 270: return { width: H, height: W, matrix: [0, -1, 1, 0, x0, y0 + H] };
    default: return { width: W, height: H, matrix: [1, 0, 0, 1, x0, y0] };
  }
}

/** Applies a PDF-style matrix to a point (x' = a x + c y + e, y' = b x + d y + f). */
export const applyMatrix = (m: Matrix6, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

/** Where a displayed-page point (y down) lands in the PDF page's own space. */
export function displayToUser(rotation: number, box: Box, vx: number, vy: number) {
  const d = displayTransform(rotation, box);
  return applyMatrix(d.matrix, vx, d.height - vy);
}
