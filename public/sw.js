const CACHE = "creative-studio-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Network-first pass-through so the app stays installable while always getting fresh content.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache app shell assets (same-origin, non-API) for light offline support.
        const url = new URL(req.url);
        // تحت زیر‌مسیر میزبانی (مثل /App-Editor/) هم مسیر API شناسایی شود
        const isApi = /(^|\/)api\//.test(url.pathname);
        if (url.origin === self.location.origin && !isApi) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || caches.match(self.registration.scope))
      )
  );
});
