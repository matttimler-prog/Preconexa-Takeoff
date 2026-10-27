// Preconexa Takeoff offline support: keeps the app itself available without a connection.
// Your PDFs and takeoffs never go through this: they stay in your browser and your downloads.
const V = "pt-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== self.location.origin) return;
  if (r.mode === "navigate") {
    // Page loads: newest copy when online, the saved copy when not.
    e.respondWith((async () => {
      try { const res = await fetch(r); (await caches.open(V)).put("/", res.clone()); return res; }
      catch { return (await caches.match("/")) || Response.error(); }
    })());
    return;
  }
  // Scripts, styles, the PDF reader and icons: use the saved copy at once and refresh it in the background.
  e.respondWith((async () => {
    const c = await caches.open(V), hit = await c.match(r);
    const net = fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
