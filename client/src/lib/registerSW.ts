/*
 * ─── PWA service worker registration ──────────────────
 *
 * In development (Vite DEV mode) we must NOT keep a service worker,
 * otherwise it serves a cached app shell + JS bundle and code changes
 * never appear ("same as old"). So in dev we actively unregister any
 * existing worker and purge its caches. Only production registers the SW.
 */

export function registerSW(): void {
  if (!("serviceWorker" in navigator)) return;

  const isDev = (import.meta as any)?.env?.DEV === true;

  if (isDev) {
    // Kill any stale service worker that may be serving old cached bundles.
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
    // Purge all Cache Storage entries left behind by a previous PWA build.
    if (typeof caches !== "undefined") {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
    }
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("[SW] registered:", reg.scope))
      .catch((err) => console.warn("[SW] registration failed:", err));
  });
}
