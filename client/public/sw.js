/*
 * ─── Service Worker (PWA shell · Phase 6) ──────────────
 *
 * Cache‑first for static assets, network‑first for API calls.
 * Versioned cache so updates propagate on deploy.
 * Gives an app‑like install experience on mobile / Capacitor.
 *
 * In development (localhost), the SW unregisters itself to
 * avoid interfering with Vite's hot module replacement.
 */

/* ── Dev-mode bypass ─────────────────────────────────── */
if (
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1"
) {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
        clients.forEach((client) => client.navigate(client.url));
        return self.registration.unregister();
      })
    );
  });
  // In dev mode, don't intercept any fetch events
} else {

const CACHE_VERSION = 2;
const CACHE_NAME = `aalgo-v2-cache-v${CACHE_VERSION}`;
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

/* ── API path segments that should NEVER be cached ───── */
const API_SEGMENTS = [
  "/auth/",
  "/settings/",
  "/trading/",
  "/agent/",
  "/backtest/",
  "/apikeys/",
  "/wallet/",
  "/health",
];

/* Install: pre-cache shell */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

/* Activate: purge old caches */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* Fetch: network-first for API, cache-first for assets */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET
  if (request.method !== "GET") return;

  // API & dynamic routes → network-first with offline fallback
  if (API_SEGMENTS.some((seg) => request.url.includes(seg))) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Static assets → cache-first, update cache in background
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

} // end else (production only)
