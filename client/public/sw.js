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

const CACHE_VERSION = 3;
const CACHE_NAME = `aalgo-v2-cache-v${CACHE_VERSION}`;
const STATIC_ASSETS = [
  "/manifest.json",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

/*
 * Strategy (v3). v2 treated EVERY GET that was not on a short API list as a static asset and
 * served it cache-first — so /aqea-ui/*, /indian-market/*, /models, /api/*, /system/* and the
 * /socket.io/ polling transport were answered from cache one request behind, which showed up as
 * "data not updating" on LAN/phone clients (localhost unregisters this worker). Now only
 * content-hashed build assets and the icon shell are cached; everything else goes to the network
 * untouched, and page navigations are network-first (cached shell only as an offline fallback).
 */
const isStaticAsset = (url) =>
  url.pathname.startsWith("/assets/") ||
  url.pathname.startsWith("/icons/") ||
  url.pathname === "/manifest.json" ||
  url.pathname === "/favicon.svg";

/* Install: pre-cache the small static shell */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

/* Activate: purge old caches (including v2's stale API responses) */
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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try { url = new URL(request.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

  // Page navigations: network-first, offline fallback to the cached shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put("/", clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("/").then((c) => c || Response.error()))
    );
    return;
  }

  // Hashed build assets / icons: cache-first (their names change when their content does).
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone)).catch(() => {});
          }
          return res;
        });
      })
    );
    return;
  }

  // Everything else (all API calls, socket.io polling, ...): network only — not intercepted.
});

} // end else (production only)
