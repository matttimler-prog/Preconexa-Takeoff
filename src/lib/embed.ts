/**
 * Hand-off to a Preconexa window that embeds this tool in an iframe.
 * We only ever post to an origin on the allow-list, never "*".
 */
export const EMBED_MESSAGE = "preconexa-takeoff:export";

const ALLOWED = [
  /^https:\/\/app\.preconexa\.com$/,
  /^https:\/\/([a-z0-9-]+\.)*preconexa\.com$/,
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
];

export function allowedParentOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;
  return ALLOWED.some((r) => r.test(origin)) ? origin : null;
}

/** Origin of the embedding page, from the browser's ancestor list or the referrer. Null when not embedded or not allowed. */
export function parentOrigin(w: { parent: unknown; location: { ancestorOrigins?: ArrayLike<string> } }, self: unknown, referrer: string): string | null {
  if (w.parent === self) return null;
  const anc = w.location.ancestorOrigins?.[0];
  if (anc) return allowedParentOrigin(anc);
  try { return allowedParentOrigin(new URL(referrer).origin); } catch { return null; }
}
