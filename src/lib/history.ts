export type History<T> = { past: T[]; present: T; future: T[] };
export const newHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });
export function push<T>(h: History<T>, next: T, cap = 100): History<T> {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-cap), present: next, future: [] };
}
export const canUndo = <T>(h: History<T>) => h.past.length > 0;
export const canRedo = <T>(h: History<T>) => h.future.length > 0;
export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}
export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
