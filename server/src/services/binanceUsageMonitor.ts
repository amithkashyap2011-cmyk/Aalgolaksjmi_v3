/**
 * Binance REST usage monitor. The Spot circuit breaker tripped on HTTP 429
 * ~900 times overnight (2026-09-24/25) and there was no way to see which
 * calls were spending the IP's request weight (limit 6000 / min). This wraps
 * the global fetch once, counts calls to api/fapi.binance.com per endpoint,
 * and records the weight Binance reports in X-MBX-USED-WEIGHT-1M.
 * Read via GET /system/binance-usage. Observation only — never alters a call.
 */
type Bucket = { calls: number; errors429: number };

const WINDOW_MS = 60_000;
let windowStart = Date.now();
let current = new Map<string, Bucket>();
let lastWindow: { at: number; byEndpoint: Array<{ endpoint: string } & Bucket>; total: number } | null = null;
let maxWeight = 0;
let lastWeight = 0;
let installed = false;

function endpointOf(url: string): string | null {
  const m = url.match(/^https?:\/\/(api\d?|fapi|dapi)\.binance\.com(\/[^?]*)/);
  return m ? `${m[1]}${m[2]}` : null;
}

function roll(): void {
  if (Date.now() - windowStart < WINDOW_MS) return;
  const byEndpoint = [...current.entries()].map(([endpoint, b]) => ({ endpoint, ...b })).sort((a, b) => b.calls - a.calls);
  lastWindow = { at: windowStart, byEndpoint, total: byEndpoint.reduce((s, b) => s + b.calls, 0) };
  current = new Map();
  windowStart = Date.now();
  maxWeight = 0;
}

export function installBinanceUsageMonitor(): void {
  if (installed || typeof globalThis.fetch !== "function") return;
  installed = true;
  const orig = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const ep = endpointOf(url);
    const res = await orig(input, init);
    if (ep) {
      try {
        roll();
        const b = current.get(ep) ?? { calls: 0, errors429: 0 };
        b.calls++;
        if (res.status === 429 || res.status === 418) b.errors429++;
        current.set(ep, b);
        const w = Number(res.headers.get("x-mbx-used-weight-1m"));
        if (Number.isFinite(w) && w > 0) { lastWeight = w; maxWeight = Math.max(maxWeight, w); }
      } catch { /* observation only */ }
    }
    return res;
  }) as typeof fetch;
}

export function getBinanceUsage() {
  roll();
  const live = [...current.entries()].map(([endpoint, b]) => ({ endpoint, ...b })).sort((a, b) => b.calls - a.calls);
  return {
    windowSeconds: Math.round((Date.now() - windowStart) / 1000),
    currentWindow: { total: live.reduce((s, b) => s + b.calls, 0), byEndpoint: live.slice(0, 15) },
    lastFullMinute: lastWindow,
    usedWeight1m: { last: lastWeight, maxThisWindow: maxWeight, limit: 6000 },
  };
}
