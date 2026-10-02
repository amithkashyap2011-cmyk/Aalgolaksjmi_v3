import { describe, it, expect } from "vitest";
// @ts-ignore — Vite resolves ?raw to the file's text; sw.js has no type declarations.
import swSource from "../../public/sw.js?raw";

/** Load public/sw.js as a non-localhost client (LAN/phone) and capture its listeners. */
function loadWorker() {
  const src: string = swSource;
  const listeners: Record<string, (e: any) => void> = {};
  const self: any = {
    location: { hostname: "192.168.1.20", origin: "http://192.168.1.20:9994" },
    addEventListener: (t: string, fn: (e: any) => void) => { listeners[t] = fn; },
    skipWaiting: () => {},
    clients: { claim: () => {}, matchAll: async () => [] },
    registration: { unregister: async () => true },
  };
  const caches = { open: async () => ({ addAll: async () => {}, put: async () => {} }), match: async () => undefined, keys: async () => [], delete: async () => true };
  new Function("self", "caches", "fetch", "Response", "URL", src)(self, caches, async () => ({ ok: true, clone: () => ({}) }), { error: () => ({}) }, URL);
  return listeners;
}

function dispatch(listeners: Record<string, (e: any) => void>, url: string, opts: { method?: string; mode?: string } = {}) {
  let intercepted = false;
  listeners.fetch({
    request: { url: `http://192.168.1.20:9994${url}`, method: opts.method ?? "GET", mode: opts.mode ?? "cors" },
    respondWith: () => { intercepted = true; },
  });
  return intercepted;
}

describe("service worker strategy (LAN/phone clients)", () => {
  const w = loadWorker();

  it.each([
    "/aqea-ui/dashboard?accountType=SPOT",
    "/indian-market/funds?userId=guest-user",
    "/models/matrix-stats?domain=ALL",
    "/trading/live-decisions",
    "/wallet/balance",
    "/api/anything",
    "/system/health",
    "/socket.io/?EIO=4&transport=polling",
    "/health",
  ])("does NOT intercept API / socket request %s (always goes to the network)", (u) => {
    expect(dispatch(w, u)).toBe(false);
  });

  it.each(["/assets/index-B7vmSTnI.js", "/icons/icon-192.svg", "/manifest.json"])("caches hashed static asset %s", (u) => {
    expect(dispatch(w, u)).toBe(true);
  });

  it("handles page navigations (network-first with offline fallback)", () => {
    expect(dispatch(w, "/aqea/orders", { mode: "navigate" })).toBe(true);
  });

  it("never intercepts non-GET requests", () => {
    expect(dispatch(w, "/assets/x.js", { method: "POST" })).toBe(false);
  });
});
