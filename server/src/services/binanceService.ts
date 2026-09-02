/*
 * ─── Binance REST + WebSocket service ──────────────────
 *
 * Wraps the public & private Binance API.
 * - getExchangeInfo()  – validate symbols
 * - getKlines()        – historical candles
 * - getAccount()       – balances (requires signed request)
 * - placeOrder()       – market / limit order
 * - subscribeTicker()  – WS stream pushed via Socket.io
 */
import crypto from "node:crypto";
import WebSocket from "ws";
import type { Server as IOServer } from "socket.io";
import { signalBus, SignalType } from "./signalBus.js";

// Overridable only for isolated load testing against a local mock exchange
// (see scripts/mock_exchange.mjs) — unset in every normal deployment, so
// this changes nothing about real trading. Never read anywhere except at
// module load, so a real run can't have this silently swapped mid-flight.
const BASE = process.env.BINANCE_BASE_URL_OVERRIDE || "https://api.binance.com";
const WS_BASE = "wss://stream.binance.com:9443/ws";
const FUTURES_BASE = process.env.BINANCE_FUTURES_BASE_URL_OVERRIDE || "https://fapi.binance.com";

// Every Binance REST call used to be a bare `fetch` with no timeout. If
// Binance ever accepts a TCP connection but never responds, that `fetch`
// never resolves or rejects — and since autoTradeEngine.ts processes
// symbols/users serially, ONE hung call froze trade evaluation for every
// symbol and every user indefinitely (not just for one tick — forever,
// until the OS eventually kills the socket, which may never happen). 10s
// is generous for a legitimate slow response while bounding the worst case.
// Declared here (not near its first use further down) because `syncTime()`
// below is invoked synchronously at module load — a declaration positioned
// after that call site would be in its temporal dead zone at call time.
const REST_TIMEOUT_MS = 2_500;

/* Cache for synchronous lookups */
const priceCache = new Map<string, number>();

/* ── Circuit Breaker & IP Ban Interceptor ──────────────── */
let restBannedUntil = 0;

export function isRestBanned(): boolean {
  return Date.now() < restBannedUntil;
}

export function getRestBanRemainingMs(): number {
  return Math.max(0, restBannedUntil - Date.now());
}

export function handleRestError(status: number, errorText: string): void {
  if (status === 418 || status === 429 || errorText.includes("banned until") || errorText.includes("-1003")) {
    const match = errorText.match(/banned until (\d+)/i);
    let banEndTime = Date.now() + 5 * 60 * 1000; // Default 5 minutes
    if (match && match[1]) {
      const parsed = parseInt(match[1], 10);
      if (!isNaN(parsed) && parsed > Date.now()) {
        banEndTime = parsed;
      }
    }
    restBannedUntil = Math.max(restBannedUntil, banEndTime);
    console.warn(`[binance-circuit-breaker] Binance REST IP Ban/Rate-Limit detected (HTTP ${status})! Suppressing REST requests until ${new Date(restBannedUntil).toISOString()} (remaining: ${Math.round((restBannedUntil - Date.now()) / 1000)}s). Falling back to WebSocket stream + synthetic price feed.`);
  }
}

let timeOffset = 0;
let lastTimeSyncAt = 0;
let lastTimeSyncLatency = 0;
let lastTimeSyncOk = false;

export async function syncTime(): Promise<number> {
  if (isRestBanned()) return 0;
  try {
    const start = Date.now();
    const res = await fetch(`${BASE}/api/v3/time`, { signal: AbortSignal.timeout(REST_TIMEOUT_MS) });
    if (!res.ok) {
      const errText = await res.text();
      handleRestError(res.status, errText);
      throw new Error(`Binance Time API returned ${res.status}`);
    }
    const data = await res.json() as { serverTime: number };
    const end = Date.now();
    const latency = (end - start) / 2;
    timeOffset = Math.round(data.serverTime - end + latency);
    lastTimeSyncAt = end;
    lastTimeSyncLatency = latency;
    lastTimeSyncOk = true;
    console.log(`[binance-service] Synchronized with Binance server time. Local offset: ${timeOffset}ms (Latency: ${latency}ms)`);
  } catch (err: any) {
    lastTimeSyncOk = false;
    console.warn(`[binance-service] Failed to sync time: ${err.message}. Using default offset of 0.`);
  }
  return timeOffset;
}

export function getTimeSyncInfo() {
  return {
    ok: lastTimeSyncOk && !isRestBanned(),
    banned: isRestBanned(),
    banRemainingMs: getRestBanRemainingMs(),
    offsetMs: timeOffset,
    latencyMs: Math.round(lastTimeSyncLatency),
    lastSyncedAt: lastTimeSyncAt || null,
  };
}

export async function pingBinance(): Promise<{ ok: boolean; latencyMs: number; banned?: boolean }> {
  if (isRestBanned()) {
    return { ok: false, latencyMs: 0, banned: true };
  }
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}/api/v3/ping`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      const errText = await res.text();
      handleRestError(res.status, errText);
    }
    return { ok: res.ok, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

if (process.env.NODE_ENV !== "test") {
  // Initial sync triggered instantly in background
  syncTime().catch(() => {});

  // Periodically sync time every 15 minutes
  const syncInterval = setInterval(() => {
    syncTime().catch(() => {});
  }, 15 * 60 * 1000);

  if (typeof syncInterval.unref === "function") {
    syncInterval.unref();
  }
}

function getAdjustedTime(): string {
  return (Date.now() + timeOffset).toString();
}

function getCacheKey(symbol: string, isFutures: boolean): string {
  return `${symbol.toUpperCase()}-${isFutures ? "FUTURES" : "SPOT"}`;
}

export function toBinanceSymbol(symbol: string, isFutures: boolean): string {
  const upper = symbol.toUpperCase();
  if (isFutures && upper === "SHIBUSDT") {
    return "1000SHIBUSDT";
  }
  return upper;
}

export function fromBinanceSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper === "1000SHIBUSDT") {
    return "SHIBUSDT";
  }
  return upper;
}

/* ── helpers ──────────────────────────────────────────── */

function hmacSign(queryString: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

async function publicGet<T>(path: string): Promise<T> {
  if (isRestBanned()) {
    throw new Error(`[CircuitBreaker] Binance REST request suppressed during active IP ban window (${Math.round(getRestBanRemainingMs() / 1000)}s remaining).`);
  }
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(REST_TIMEOUT_MS) });
  if (!res.ok) {
    const errText = await res.text();
    handleRestError(res.status, errText);
    throw new Error(`Binance ${res.status}: ${errText}`);
  }
  return res.json() as Promise<T>;
}

async function signedGet<T>(path: string, apiKey: string, apiSecret: string, params: Record<string, string> = {}): Promise<T> {
  if (isRestBanned()) {
    throw new Error(`[CircuitBreaker] Binance REST signed GET suppressed during active IP ban window.`);
  }
  const qs = new URLSearchParams({ recvWindow: "60000", ...params, timestamp: getAdjustedTime() });
  qs.set("signature", hmacSign(qs.toString(), apiSecret));
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: { "X-MBX-APIKEY": apiKey },
    signal: AbortSignal.timeout(REST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const errText = await res.text();
    handleRestError(res.status, errText);
    throw new Error(`Binance ${res.status}: ${errText}`);
  }
  return res.json() as Promise<T>;
}

async function signedPost<T>(path: string, apiKey: string, apiSecret: string, params: Record<string, string>): Promise<T> {
  if (isRestBanned()) {
    throw new Error(`[CircuitBreaker] Binance Spot POST suppressed during active IP ban window.`);
  }
  const qs = new URLSearchParams({ recvWindow: "60000", ...params, timestamp: getAdjustedTime() });
  qs.set("signature", hmacSign(qs.toString(), apiSecret));
  const res = await fetch(`${BASE}${path}?${qs}`, {
    method: "POST",
    headers: { "X-MBX-APIKEY": apiKey },
    signal: AbortSignal.timeout(REST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const errText = await res.text();
    handleRestError(res.status, errText);
    throw new Error(`Binance Spot ${res.status}: ${errText}`);
  }
  return res.json() as Promise<T>;
}

async function signedFuturesPost<T>(path: string, apiKey: string, apiSecret: string, params: Record<string, string>): Promise<T> {
  if (isRestBanned()) {
    throw new Error(`[CircuitBreaker] Binance Futures POST suppressed during active IP ban window.`);
  }
  const qs = new URLSearchParams({ recvWindow: "60000", ...params, timestamp: getAdjustedTime() });
  qs.set("signature", hmacSign(qs.toString(), apiSecret));
  const res = await fetch(`${FUTURES_BASE}${path}?${qs}`, {
    method: "POST",
    headers: { "X-MBX-APIKEY": apiKey },
    signal: AbortSignal.timeout(REST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const errText = await res.text();
    handleRestError(res.status, errText);
    throw new Error(`Binance Futures ${res.status}: ${errText}`);
  }
  return res.json() as Promise<T>;
}

async function signedFuturesGet<T>(path: string, apiKey: string, apiSecret: string, params: Record<string, string> = {}): Promise<T> {
  if (isRestBanned()) {
    throw new Error(`[CircuitBreaker] Binance Futures GET suppressed during active IP ban window.`);
  }
  const qs = new URLSearchParams({ recvWindow: "60000", ...params, timestamp: getAdjustedTime() });
  qs.set("signature", hmacSign(qs.toString(), apiSecret));
  const res = await fetch(`${FUTURES_BASE}${path}?${qs}`, {
    headers: { "X-MBX-APIKEY": apiKey },
    signal: AbortSignal.timeout(REST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const errText = await res.text();
    handleRestError(res.status, errText);
    throw new Error(`Binance Futures GET ${res.status}: ${errText}`);
  }
  return res.json() as Promise<T>;
}

/* ── public endpoints ─────────────────────────────────── */

export interface SymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  filters: any[];
}

let exchangeInfoCache: SymbolInfo[] | null = null;
let exchangeInfoFetchTime = 0;

export async function getExchangeInfo(): Promise<SymbolInfo[]> {
  const now = Date.now();
  if (exchangeInfoCache && now - exchangeInfoFetchTime < 1000 * 60 * 60 * 12) {
    return exchangeInfoCache;
  }
  if (isRestBanned()) {
    return exchangeInfoCache || [];
  }
  try {
    const data = await publicGet<{ symbols: SymbolInfo[] }>("/api/v3/exchangeInfo");
    exchangeInfoCache = data.symbols;
    exchangeInfoFetchTime = now;
    return exchangeInfoCache;
  } catch (err: any) {
    return exchangeInfoCache || [];
  }
}

/** Accurately formats trade quantities aligned to Binance's specific LOT_SIZE `stepSize` requirement. */
export async function formatQuantity(symbol: string, desiredQuantity: number): Promise<string> {
  const info = await getExchangeInfo();
  const symInfo = info.find(s => s.symbol === symbol);
  if (!symInfo) return String(desiredQuantity); // Fallback

  const lotSizeFilter = symInfo.filters.find((f: any) => f.filterType === "LOT_SIZE");
  if (!lotSizeFilter) return String(desiredQuantity);

  const stepSize = parseFloat(lotSizeFilter.stepSize);
  
  // 🛡️ SECURITY FIX: Avoid floating-point modulo inaccuracy
  // Ensure we safely truncate to the exact nearest stepSize
  const precision = stepSize.toString().split('.')[1]?.length || 0;
  const steps = Math.floor((desiredQuantity + Number.EPSILON) / stepSize);
  const validQty = steps * stepSize;

  if (stepSize >= 1) {
    return validQty.toFixed(0); 
  } else {
    return validQty.toFixed(precision);
  }
}

/* ── futures execution ────────────────────────────────── */

let futuresExchangeInfoCache: SymbolInfo[] | null = null;
let futuresExchangeInfoFetchTime = 0;

export async function getFuturesExchangeInfo(): Promise<SymbolInfo[]> {
  const now = Date.now();
  if (futuresExchangeInfoCache && now - futuresExchangeInfoFetchTime < 1000 * 60 * 60 * 12) {
    return futuresExchangeInfoCache;
  }
  if (isRestBanned()) {
    return futuresExchangeInfoCache || [];
  }
  try {
    const res = await fetch(`${FUTURES_BASE}/fapi/v1/exchangeInfo`, { signal: AbortSignal.timeout(REST_TIMEOUT_MS) });
    if (!res.ok) {
      const errText = await res.text();
      handleRestError(res.status, errText);
      return futuresExchangeInfoCache || [];
    }
    const data = await res.json() as { symbols: SymbolInfo[] };
    futuresExchangeInfoCache = data.symbols;
    futuresExchangeInfoFetchTime = now;
    return futuresExchangeInfoCache;
  } catch (err: any) {
    return futuresExchangeInfoCache || [];
  }
}

export function getExchangeInfoCacheInfo() {
  return {
    spot:    { symbols: exchangeInfoCache?.length ?? 0,        fetchedAt: exchangeInfoFetchTime || null },
    futures: { symbols: futuresExchangeInfoCache?.length ?? 0, fetchedAt: futuresExchangeInfoFetchTime || null },
  };
}

export function invalidateExchangeInfoCache(): void {
  exchangeInfoFetchTime = 0;
  futuresExchangeInfoFetchTime = 0;
}

export async function formatFuturesQuantity(symbol: string, desiredQuantity: number): Promise<string> {
  const info = await getFuturesExchangeInfo();
  const binanceSymbol = toBinanceSymbol(symbol, true);
  const symInfo = info.find(s => s.symbol === binanceSymbol);
  if (!symInfo) return String(desiredQuantity);

  let qty = desiredQuantity;
  if (binanceSymbol === "1000SHIBUSDT") {
    qty = desiredQuantity / 1000;
  }

  const lotSizeFilter = symInfo.filters.find((f: any) => f.filterType === "LOT_SIZE");
  if (!lotSizeFilter) return String(qty);

  const stepSize = parseFloat(lotSizeFilter.stepSize);
  
  const precision = stepSize.toString().split('.')[1]?.length || 0;
  const multiplier = Math.pow(10, precision);
  const steps = Math.floor((qty + Number.EPSILON) / stepSize);
  const validQty = steps * stepSize;

  let formatted = stepSize >= 1 ? validQty.toFixed(0) : validQty.toFixed(precision);
  
  if (binanceSymbol === "1000SHIBUSDT") {
    formatted = (parseFloat(formatted) * 1000).toString();
  }
  return formatted;
}

export async function setFuturesLeverage(apiKey: string, apiSecret: string, symbol: string, leverage: number) {
  const binanceSymbol = toBinanceSymbol(symbol, true);
  return signedFuturesPost("/fapi/v1/leverage", apiKey, apiSecret, { symbol: binanceSymbol, leverage: String(leverage) });
}

// No order placement anywhere in this codebase set a clientOrderId, and
// nothing ever queries Binance's order history — so if a request to place
// an order succeeds on Binance's side but the HTTP response is lost (a
// real, well-documented failure mode: network blip on the way back), there
// was no way to tell "did this actually execute" from "it never reached
// Binance," and no stable ID to look it up by. `genClientOrderId` produces
// an ID every order gets tagged with; `queryOrder`/`queryFuturesOrder`
// below let a caller ask Binance directly whether a given ID executed.
// This doesn't build a full automatic reconciliation loop (deciding what
// to do about an orphaned exchange-side position is a product decision,
// not a mechanical fix) — it provides the primitive that loop would need.
export function genClientOrderId(prefix: string = "aalgo"): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

export async function placeFuturesOrder(
  apiKey: string,
  apiSecret: string,
  params: {
    symbol: string;
    side: "BUY" | "SELL";
    type: "MARKET" | "LIMIT";
    quantity: string;
    clientOrderId?: string;
    // Was declared in an unused type (quantum/types.ts) but never actually
    // passed to any real order call anywhere in the codebase — every
    // closing order was a plain MARKET order with no reduceOnly guard. If
    // a local quantity calculation for a "close" ever miscalculated too
    // high (stale state, a race, a bug), a plain order would execute past
    // the actual position size and OPEN A NEW POSITION IN THE OPPOSITE
    // DIRECTION instead of failing safely. reduceOnly makes Binance itself
    // reject/cap an order that would do that.
    reduceOnly?: boolean;
  },
): Promise<any> {
  // 🛡️ CRITICAL FIX: LiveExecutionBarrier Hard Gate
  // Guarantees no live capital order can execute while LIVE_PROMOTION_BLOCKED === true
  const { LiveExecutionBarrier } = await import("./aqea/governance/LiveExecutionBarrier.js");
  const barrier = LiveExecutionBarrier.verifyExecutionPermitted("LIVE");
  if (!barrier.permitted) {
    throw new Error(`[LIVE_EXECUTION_BARRIER] Binance Futures order rejected: ${barrier.reason || "Live trading is blocked"}`);
  }

  const binanceSymbol = toBinanceSymbol(params.symbol, true);
  let finalQuantity = params.quantity;
  if (binanceSymbol === "1000SHIBUSDT") {
    finalQuantity = (parseFloat(params.quantity) / 1000).toString();
  }

  const body: Record<string, string> = {
    symbol: binanceSymbol,
    side: params.side,
    type: params.type,
    quantity: finalQuantity,
    newClientOrderId: params.clientOrderId ?? genClientOrderId("aalgofut"),
  };
  if (params.reduceOnly) body.reduceOnly = "true";
  return signedFuturesPost<any>("/fapi/v1/order", apiKey, apiSecret, body);
}

/** Look up a previously-placed futures order by the clientOrderId it was
 * tagged with — the mechanism to confirm whether an order whose placement
 * response was lost actually executed on Binance. */
export async function queryFuturesOrder(apiKey: string, apiSecret: string, symbol: string, clientOrderId: string): Promise<any> {
  return signedFuturesGet<any>("/fapi/v1/order", apiKey, apiSecret, {
    symbol: toBinanceSymbol(symbol, true),
    origClientOrderId: clientOrderId,
  });
}

export interface OrderBookEntry {
  price: number;
  quantity: number;
}

export async function getOrderBook(symbol: string, limit = 20): Promise<{ bids: OrderBookEntry[]; asks: OrderBookEntry[] }> {
  const res = await publicGet<{ lastUpdateId: number; bids: [string, string][]; asks: [string, string][] }>(`/api/v3/depth?symbol=${symbol}&limit=${limit}`);
  return {
    bids: res.bids.map(([price, qty]) => ({ price: parseFloat(price), quantity: parseFloat(qty) })),
    asks: res.asks.map(([price, qty]) => ({ price: parseFloat(price), quantity: parseFloat(qty) })),
  };
}

export interface Kline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  // P0.1 Provenance fields — always set; isSynthetic=true means NEVER use for forward-OOS evidence
  isSynthetic?: boolean;
  dataProvenance?: "LIVE_REST" | "LIVE_WEBSOCKET" | "CACHED_LIVE" | "SYNTHETIC" | "UNKNOWN";
  receivedTimestamp?: number;
}

/**
 * Maximum age in ms for cached live klines before they are considered stale.
 * Cached-live data beyond this threshold must be treated as STALE (not CACHED_LIVE).
 * Using 120s to match existing cache TTL, but the provenance will be STALE if exceeded.
 */
export const STALE_MARKET_DATA_MS = 120_000;

/**
 * Result of getKlines that includes provenance information.
 */
export interface KlinesWithProvenance {
  klines: Kline[];
  provenance: "LIVE_REST" | "LIVE_WEBSOCKET" | "CACHED_LIVE" | "SYNTHETIC" | "UNKNOWN";
  isSynthetic: boolean;
  sourceTimestamp: number;    // Timestamp of the most recent candle's openTime
  receivedTimestamp: number;  // When this data was returned
  expiresAt: number;
}

/* ── In-Memory Kline & Funding Rate Caches ──────────────── */
interface CachedKlines {
  klines: Kline[];
  lastUpdated: number;
}

const klineCache = new Map<string, CachedKlines>(); // Key: "BTCUSDT:5m"
const klineInFlight = new Map<string, Promise<Kline[]>>();
const fundingRateCache = new Map<string, { rate: number; timestamp: number }>();

const lastAcceptedEventTimestamp = new Map<string, number>();

export function updateKlineCache(symbol: string, interval: string, kline: Kline): void {
  const key = `${symbol.toUpperCase()}:${interval}`;

  // 1. Malformed OHLCV & NaN/Infinity check
  const o = parseFloat(kline.open);
  const h = parseFloat(kline.high);
  const l = parseFloat(kline.low);
  const c = parseFloat(kline.close);
  const v = parseFloat(kline.volume);

  if (
    !Number.isFinite(o) || o <= 0 ||
    !Number.isFinite(h) || h <= 0 ||
    !Number.isFinite(l) || l <= 0 ||
    !Number.isFinite(c) || c <= 0 ||
    !Number.isFinite(v) || v < 0 ||
    h < l || h < o || h < c || l > o || l > c ||
    !kline.openTime || kline.openTime <= 0
  ) {
    console.warn(`[binance-ws] Rejected malformed/impossible OHLCV candle for ${key}: o=${kline.open} h=${kline.high} l=${kline.low} c=${kline.close}`);
    return;
  }

  // 2. Out-of-order event check
  const lastAccepted = lastAcceptedEventTimestamp.get(key) || 0;
  if (kline.closeTime && kline.closeTime < lastAccepted) {
    console.warn(`[binance-ws] Rejected out-of-order candle for ${key}: closeTime=${kline.closeTime} < lastAccepted=${lastAccepted}`);
    return;
  }
  if (kline.closeTime) {
    lastAcceptedEventTimestamp.set(key, Math.max(lastAccepted, kline.closeTime));
  }

  // 3. Mark live WS provenance
  kline.isSynthetic = false;
  kline.dataProvenance = "LIVE_WEBSOCKET";
  kline.receivedTimestamp = Date.now();

  let entry = klineCache.get(key);
  if (!entry) {
    entry = { klines: [kline], lastUpdated: Date.now() };
    klineCache.set(key, entry);
    return;
  }
  entry.lastUpdated = Date.now();
  const arr = entry.klines;
  if (arr.length === 0) {
    arr.push(kline);
    return;
  }
  const last = arr[arr.length - 1];
  if (last.openTime === kline.openTime) {
    arr[arr.length - 1] = kline;
  } else if (kline.openTime > last.openTime) {
    arr.push(kline);
    if (arr.length > 500) arr.shift();
  }
}

/**
 * Generates synthetic baseline candles for diagnostic/non-trading purposes only.
 *
 * P0.1 CRITICAL RULE: All synthetic candles are tagged isSynthetic=true.
 * These MUST NEVER enter genuine forward-OOS evidence.
 * They MUST NEVER increment N_forward_oos, N_eff, NetEV, Brier, ECE, FDR, or ESS.
 * Statistical quarantine is enforced by ForwardTelemetryStore.recordDecision().
 */
export function generateSyntheticKlines(symbol: string, count = 200): Kline[] {
  const currentPrice = getTickerPriceSync(symbol) || (symbol.toUpperCase().includes("BTC") ? 65000 : 100);
  const now = Date.now();
  const klines: Kline[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const openTime = now - i * 5 * 60 * 1000;
    const variation = (Math.sin(i / 5) * 0.002);
    const p = currentPrice * (1 + variation);
    klines.push({
      openTime,
      open: String(p * 0.999),
      high: String(p * 1.002),
      low: String(p * 0.998),
      close: String(p),
      volume: "1000",
      closeTime: openTime + 5 * 60 * 1000 - 1,
      // P0.1: Mandatory provenance tags on every synthetic candle
      isSynthetic: true,
      dataProvenance: "SYNTHETIC",
      receivedTimestamp: now
    });
  }
  return klines;
}

/**
 * Returns getKlines result with full provenance context.
 * Use this when the caller needs to know whether the data is genuine.
 */
export async function getKlinesWithProvenance(
  symbol: string,
  interval: string,
  startTime?: number,
  endTime?: number,
  limit = 500,
): Promise<KlinesWithProvenance> {
  const receivedTimestamp = Date.now();
  const key = `${symbol.toUpperCase()}:${interval}`;

  // Cache-first: check if we have fresh cached data
  if (!startTime && !endTime) {
    const cached = klineCache.get(key);
    const cacheAge = cached ? receivedTimestamp - cached.lastUpdated : Infinity;
    if (cached && cached.klines.length >= Math.min(limit, 20) && cacheAge < STALE_MARKET_DATA_MS && !isRestBanned()) {
      const sliced = cached.klines.slice(-limit).map(k => ({
        ...k,
        isSynthetic: k.isSynthetic === true,
        dataProvenance: k.isSynthetic ? ("SYNTHETIC" as const) : ("CACHED_LIVE" as const),
        receivedTimestamp: cached.lastUpdated
      }));
      const hasSynthetic = sliced.some(k => k.isSynthetic);
      return {
        klines: sliced,
        provenance: hasSynthetic ? "SYNTHETIC" : "CACHED_LIVE",
        isSynthetic: hasSynthetic,
        sourceTimestamp: sliced.length > 0 ? sliced[sliced.length - 1].openTime : 0,
        receivedTimestamp: cached.lastUpdated,
        expiresAt: cached.lastUpdated + STALE_MARKET_DATA_MS
      };
    }
  }

  // If REST is banned and no valid cache, return synthetic with explicit provenance
  if (isRestBanned()) {
    const cached = klineCache.get(key);
    if (cached && cached.klines.length > 0) {
      const cacheAge = receivedTimestamp - cached.lastUpdated;
      const provenance = cacheAge < STALE_MARKET_DATA_MS ? "CACHED_LIVE" : "UNKNOWN";
      const sliced = cached.klines.slice(-limit).map(k => ({
        ...k,
        isSynthetic: provenance !== "CACHED_LIVE" || k.isSynthetic === true,
        dataProvenance: provenance as "CACHED_LIVE" | "UNKNOWN",
        receivedTimestamp: cached.lastUpdated
      }));
      return {
        klines: sliced,
        provenance,
        isSynthetic: provenance !== "CACHED_LIVE",
        sourceTimestamp: sliced.length > 0 ? sliced[sliced.length - 1].openTime : 0,
        receivedTimestamp: cached.lastUpdated,
        expiresAt: cached.lastUpdated + STALE_MARKET_DATA_MS
      };
    }
    // No cache AND REST banned — synthetic fallback
    const synth = generateSyntheticKlines(symbol, limit);
    return {
      klines: synth,
      provenance: "SYNTHETIC",
      isSynthetic: true,
      sourceTimestamp: synth.length > 0 ? synth[synth.length - 1].openTime : 0,
      receivedTimestamp,
      expiresAt: receivedTimestamp // Expired immediately
    };
  }

  // Live REST fetch
  try {
    const klines = await getKlines(symbol, interval, startTime, endTime, limit);
    // Check if these are synthetic (they would be tagged)
    const hasSynthetic = klines.some(k => k.isSynthetic === true);
    const sourceTimestamp = klines.length > 0 ? klines[klines.length - 1].openTime : 0;
    return {
      klines: klines.map(k => ({
        ...k,
        isSynthetic: k.isSynthetic === true,
        dataProvenance: k.isSynthetic ? ("SYNTHETIC" as const) : ("LIVE_REST" as const),
        receivedTimestamp
      })),
      provenance: hasSynthetic ? "SYNTHETIC" : "LIVE_REST",
      isSynthetic: hasSynthetic,
      sourceTimestamp,
      receivedTimestamp,
      expiresAt: receivedTimestamp + STALE_MARKET_DATA_MS
    };
  } catch {
    const synth = generateSyntheticKlines(symbol, limit);
    return {
      klines: synth,
      provenance: "SYNTHETIC",
      isSynthetic: true,
      sourceTimestamp: synth.length > 0 ? synth[synth.length - 1].openTime : 0,
      receivedTimestamp,
      expiresAt: receivedTimestamp
    };
  }
}

export async function getKlines(
  symbol: string,
  interval: string,
  startTime?: number,
  endTime?: number,
  limit = 500,
): Promise<Kline[]> {
  const key = `${symbol.toUpperCase()}:${interval}`;

  // 1. Cache-first lookup for real-time polling (no explicit historical timestamp bounds)
  if (!startTime && !endTime) {
    const cached = klineCache.get(key);
    // If cached bars exist and are reasonably fresh (< 120s)
    if (cached && cached.klines.length >= Math.min(limit, 20) && (Date.now() - cached.lastUpdated < 120_000 || isRestBanned())) {
      // Sync latest candle with live WebSocket ticker price if available
      const latestPrice = getTickerPriceSync(symbol);
      if (latestPrice && cached.klines.length > 0) {
        const lastBar = cached.klines[cached.klines.length - 1];
        lastBar.close = String(latestPrice);
        if (latestPrice > parseFloat(lastBar.high)) lastBar.high = String(latestPrice);
        if (latestPrice < parseFloat(lastBar.low)) lastBar.low = String(latestPrice);
      }
      return cached.klines.slice(-limit);
    }
  }

  // 2. Circuit breaker active fallback
  if (isRestBanned()) {
    const cached = klineCache.get(key);
    if (cached && cached.klines.length > 0) {
      const cacheAge = Date.now() - cached.lastUpdated;
      const provenance = cacheAge < STALE_MARKET_DATA_MS ? "CACHED_LIVE" : "UNKNOWN";
      return cached.klines.slice(-limit).map(k => ({
        ...k,
        isSynthetic: k.isSynthetic === true || provenance === "UNKNOWN",
        dataProvenance: provenance as "CACHED_LIVE" | "UNKNOWN",
        receivedTimestamp: cached.lastUpdated
      }));
    }
    // No cache at all — must return synthetic, explicitly tagged
    return generateSyntheticKlines(symbol, limit);
  }

  // 3. In-flight request deduplication
  const inFlightKey = `${key}:${startTime || 0}:${endTime || 0}:${limit}`;
  if (klineInFlight.has(inFlightKey)) {
    return klineInFlight.get(inFlightKey)!;
  }

  const fetchPromise = (async () => {
    const binanceSymbol = toBinanceSymbol(symbol, false);
    const params = new URLSearchParams({ symbol: binanceSymbol, interval, limit: String(limit) });
    if (startTime) params.set("startTime", String(startTime));
    if (endTime) params.set("endTime", String(endTime));

    try {
      const raw: unknown[][] = await publicGet(`/api/v3/klines?${params}`);
      const is1000Shib = binanceSymbol === "1000SHIBUSDT";
      const klines: Kline[] = raw.map((k) => {
        let open = parseFloat(k[1] as string);
        let high = parseFloat(k[2] as string);
        let low = parseFloat(k[3] as string);
        let close = parseFloat(k[4] as string);
        let volume = parseFloat(k[5] as string);
        if (is1000Shib) {
          open /= 1000;
          high /= 1000;
          low /= 1000;
          close /= 1000;
          volume *= 1000;
        }
        return {
          openTime: k[0] as number,
          open: String(open),
          high: String(high),
          low: String(low),
          close: String(close),
          volume: String(volume),
          closeTime: k[6] as number,
        };
      });

      // Tag all live REST klines with provenance
      klines.forEach(k => {
        k.isSynthetic = false;
        k.dataProvenance = "LIVE_REST";
        k.receivedTimestamp = Date.now();
      });

      if (!startTime && !endTime) {
        klineCache.set(key, { klines, lastUpdated: Date.now() });
      }
      return klines;
    } catch (err: any) {
      // Graceful degradation on REST error: prefer stale cache over synthetic
      const cached = klineCache.get(key);
      if (cached && cached.klines.length > 0) {
        // Tag stale cache klines as UNKNOWN if beyond freshness window
        const cacheAge = Date.now() - cached.lastUpdated;
        const provenance = cacheAge < STALE_MARKET_DATA_MS ? "CACHED_LIVE" : "UNKNOWN";
        return cached.klines.slice(-limit).map(k => ({
          ...k,
          isSynthetic: k.isSynthetic === true || provenance === "UNKNOWN",
          dataProvenance: provenance as "CACHED_LIVE" | "UNKNOWN",
          receivedTimestamp: cached.lastUpdated
        }));
      }
      // Last resort: synthetic fallback — always tagged isSynthetic=true
      return generateSyntheticKlines(symbol, limit);
    }
  })();

  klineInFlight.set(inFlightKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    klineInFlight.delete(inFlightKey);
  }
}

export async function getFuturesOpenInterest(symbol: string): Promise<number> {
  if (isRestBanned()) return 0;
  const binanceSymbol = toBinanceSymbol(symbol, true);
  const params = new URLSearchParams({ symbol: binanceSymbol });
  try {
    const res = await fetch(`${FUTURES_BASE}/fapi/v1/openInterest?${params.toString()}`, { signal: AbortSignal.timeout(REST_TIMEOUT_MS) });
    if (!res.ok) {
      const errText = await res.text();
      handleRestError(res.status, errText);
      return 0;
    }
    const data = await res.json() as { openInterest: string };
    return parseFloat(data.openInterest) || 0;
  } catch {
    return 0;
  }
}

export async function getLatestFundingRate(symbol: string): Promise<number> {
  const upper = symbol.toUpperCase();
  const cached = fundingRateCache.get(upper);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.rate;
  }

  if (isRestBanned()) return cached?.rate ?? 0.0001;
  const binanceSymbol = toBinanceSymbol(symbol, true);
  const params = new URLSearchParams({ symbol: binanceSymbol, limit: "1" });
  try {
    const res = await fetch(`${FUTURES_BASE}/fapi/v1/fundingRate?${params.toString()}`, { signal: AbortSignal.timeout(REST_TIMEOUT_MS) });
    if (!res.ok) {
      const errText = await res.text();
      handleRestError(res.status, errText);
      return cached?.rate ?? 0.0001;
    }
    const data = await res.json() as Array<{ fundingRate: string }>;
    const rate = data?.[0]?.fundingRate ? parseFloat(data[0].fundingRate) : 0.0001;
    fundingRateCache.set(upper, { rate, timestamp: Date.now() });
    return rate;
  } catch {
    return cached?.rate ?? 0.0001;
  }
}

/* ── private endpoints ────────────────────────────────── */

export interface AccountBalance {
  asset: string;
  free: string;
  locked: string;
}

export async function getAccount(apiKey: string, apiSecret: string): Promise<AccountBalance[]> {
  const data = await signedGet<{ balances: AccountBalance[] }>("/api/v3/account", apiKey, apiSecret);
  return data.balances.filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
}

export interface FuturesAccountInfo {
  totalWalletBalance: string;
  totalUnrealizedProfit: string;
  totalMarginBalance: string;
  availableBalance: string;
  canTrade?: boolean;
  assets: Array<{ asset: string; walletBalance: string; unrealizedProfit: string; marginBalance: string }>;
}

export async function getFuturesAccount(apiKey: string, apiSecret: string): Promise<FuturesAccountInfo> {
  return signedFuturesGet<FuturesAccountInfo>("/fapi/v2/account", apiKey, apiSecret);
}

/** Currently-open (unfilled/partially-filled) futures orders — used by the
 * reconciliation engine to detect an order the local system placed but
 * never got a usable response for (still resting on the book). */
export async function getFuturesOpenOrders(apiKey: string, apiSecret: string, symbol?: string): Promise<any[]> {
  return signedFuturesGet<any[]>("/fapi/v1/openOrders", apiKey, apiSecret, symbol ? { symbol: toBinanceSymbol(symbol, true) } : {});
}

/** Whether the account is in Hedge mode (dualSidePosition=true). Nothing in
 * this codebase's order-placement logic sends `positionSide`, which
 * Binance requires on every order when Hedge mode is active — orders
 * would be rejected outright. Used as a pre-flight/reconciliation check,
 * not to add Hedge-mode support (a materially bigger feature: tracking a
 * long AND short position per symbol simultaneously). */
export async function isHedgeMode(apiKey: string, apiSecret: string): Promise<boolean> {
  const res = await signedFuturesGet<{ dualSidePosition: boolean }>("/fapi/v1/positionSide/dual", apiKey, apiSecret);
  return !!res.dualSidePosition;
}

export interface FuturesPosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  unrealizedProfit: string;
  leverage: string;
  // Binance's /fapi/v2/positionRisk response already includes this field —
  // it just wasn't declared here, so it was invisible to every caller. No
  // code anywhere tracked Binance's actual tiered-maintenance-margin
  // liquidation price for LIVE futures positions; the only liquidation
  // guard in the codebase (sentinelAuditor.ts) is an internal 90%-margin
  // approximation explicitly gated to PAPER mode only.
  liquidationPrice?: string;
}

export async function getFuturesPositions(apiKey: string, apiSecret: string): Promise<FuturesPosition[]> {
  const data = await signedFuturesGet<FuturesPosition[]>("/fapi/v2/positionRisk", apiKey, apiSecret);
  if (!Array.isArray(data)) return [];
  return data
    .filter(p => parseFloat(p.positionAmt) !== 0)
    .map((pos) => {
      if (pos.symbol === "1000SHIBUSDT") {
        return {
          ...pos,
          symbol: "SHIBUSDT",
          positionAmt: (parseFloat(pos.positionAmt) * 1000).toString(),
          entryPrice: (parseFloat(pos.entryPrice) / 1000).toString(),
        };
      }
      return pos;
    });
}

export interface LiquidationProximity {
  liquidationPrice: number;
  currentPrice: number;
  /** Distance from current price to liquidation, as a fraction of current price (0.05 = 5%). Always >= 0. */
  distancePct: number;
  /** True when distancePct is at or below the warning threshold. */
  warning: boolean;
}

/**
 * How close a LIVE futures position is to Binance's actual liquidation
 * price (not an internal approximation). Visibility only — this does not
 * take any action (no auto-close), since deciding what to DO about a
 * near-liquidation position is a risk-policy decision, not a mechanical
 * fix. `warningThresholdPct` default 0.10 (10%) is a starting point, not a
 * validated risk parameter — tune it before relying on it operationally.
 */
export function checkLiquidationProximity(
  liquidationPrice: number,
  currentPrice: number,
  warningThresholdPct: number = 0.10,
): LiquidationProximity | null {
  if (!Number.isFinite(liquidationPrice) || liquidationPrice <= 0 || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return null; // Binance returns 0 for isolated positions with no liquidation risk at current settings, or data not yet available
  }
  const distancePct = Math.abs(currentPrice - liquidationPrice) / currentPrice;
  return {
    liquidationPrice,
    currentPrice,
    distancePct,
    warning: distancePct <= warningThresholdPct,
  };
}

export interface OrderResult {
  symbol: string;
  orderId: number;
  clientOrderId?: string;
  status: string;
  executedQty: string;
  origQty?: string;
  cummulativeQuoteQty: string;
  price: string;
}

export async function placeOrder(
  apiKey: string,
  apiSecret: string,
  params: {
    symbol: string;
    side: "BUY" | "SELL";
    type: "MARKET" | "LIMIT";
    quantity: string;
    price?: string;
    timeInForce?: string;
    clientOrderId?: string;
  },
): Promise<OrderResult> {
  // 🛡️ CRITICAL FIX: LiveExecutionBarrier Hard Gate
  // Guarantees no live capital order can execute while LIVE_PROMOTION_BLOCKED === true
  const { LiveExecutionBarrier } = await import("./aqea/governance/LiveExecutionBarrier.js");
  const barrier = LiveExecutionBarrier.verifyExecutionPermitted("LIVE");
  if (!barrier.permitted) {
    throw new Error(`[LIVE_EXECUTION_BARRIER] Binance Spot order rejected: ${barrier.reason || "Live trading is blocked"}`);
  }

  const body: Record<string, string> = {
    symbol: params.symbol,
    side: params.side,
    type: params.type,
    quantity: params.quantity,
    newClientOrderId: params.clientOrderId ?? genClientOrderId("aalgospot"),
  };
  if (params.type === "LIMIT") {
    body.price = params.price!;
    body.timeInForce = params.timeInForce ?? "GTC";
  }
  return signedPost<OrderResult>("/api/v3/order", apiKey, apiSecret, body);
}

/** Look up a previously-placed spot order by the clientOrderId it was
 * tagged with — same purpose as queryFuturesOrder, for the spot API. */
export async function queryOrder(apiKey: string, apiSecret: string, symbol: string, clientOrderId: string): Promise<any> {
  return signedGet<any>("/api/v3/order", apiKey, apiSecret, {
    symbol,
    origClientOrderId: clientOrderId,
  });
}

/* ── WebSocket ticker stream (Combined Multiplexed) ──── */

// Instead of one WS per symbol, we use ONE combined WS per account type.
// Binance allows max 5 individual WS connections — with 8+ symbols we'd exceed it.
// The combined stream endpoint supports up to 200 streams on a single connection.

interface CombinedSocket {
  ws: WebSocket;
  symbols: Set<string>;  // tracked symbols (original names, uppercase)
  io: IOServer;
  isFutures: boolean;
  id: number;  // subscription ID counter for JSON method
  reconnectAttempts: number;
}

const combinedSockets = new Map<string, CombinedSocket>();  // "spot" | "futures" → CombinedSocket
const subscribedSymbolKeys = new Set<string>();  // "SYMBOL-spot" / "SYMBOL-futures"
const intentionalClose = new Set<string>();

let nextSubId = 1;

// 🛡️ Phase 5: Binance Hardening — Subscription Queue
interface PendingSubscription {
  symbol: string;
  isFutures: boolean;
  io: IOServer;
}

const subscriptionQueue: PendingSubscription[] = [];
let isProcessingQueue = false;

async function processSubscriptionQueue() {
  if (isProcessingQueue || subscriptionQueue.length === 0) return;
  isProcessingQueue = true;

  try {
    while (subscriptionQueue.length > 0) {
      const batch = subscriptionQueue.splice(0, 5); // Max 5 per batch
      
      for (const sub of batch) {
        const type = sub.isFutures ? "futures" : "spot";
        const existing = combinedSockets.get(type);

        if (!existing) {
          const cs = createCombinedSocket([sub.symbol], sub.io, sub.isFutures);
          combinedSockets.set(type, cs);
        } else {
          existing.symbols.add(sub.symbol.toUpperCase());
          const binSym = toBinanceSymbol(sub.symbol, false);
          const newStreams = getStreamsForSymbol(binSym);
          const subId = nextSubId++;

          if (existing.ws.readyState === WebSocket.OPEN) {
            existing.ws.send(JSON.stringify({
              method: "SUBSCRIBE",
              params: newStreams,
              id: subId,
            }));
            console.log(`[binance-ws] Batched subscription for ${sub.symbol} on ${type}`);
          }
        }
      }
      
      if (subscriptionQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 250)); // 250ms delay between batches
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

export function getActiveSocketsInfo() {
  const result: { symbol: string; readyState: number }[] = [];
  for (const [type, cs] of combinedSockets.entries()) {
    for (const sym of cs.symbols) {
      result.push({ symbol: `${sym}-${type}`, readyState: cs.ws.readyState });
    }
  }
  return result;
}

/* ── ticker price (public, no auth) ───────────────────── */

export async function getTickerPrice(symbol: string, isFutures: boolean = false): Promise<number> {
  const cached = getTickerPriceSync(symbol, isFutures);
  if (isRestBanned()) {
    if (cached !== null) return cached;
    const fallbacks: Record<string, number> = {
      BTCUSDT: 65000,
      ETHUSDT: 3500,
      BNBUSDT: 580,
      SOLUSDT: 145,
      ADAUSDT: 0.45,
      XRPUSDT: 0.55,
      DOGEUSDT: 0.12,
      SHIBUSDT: 0.000018,
    };
    return fallbacks[symbol.toUpperCase()] || 100;
  }

  const binanceSymbol = toBinanceSymbol(symbol, isFutures);
  const url = isFutures
    ? `${FUTURES_BASE}/fapi/v1/ticker/price?symbol=${binanceSymbol}`
    : `${BASE}/api/v3/ticker/price?symbol=${binanceSymbol}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REST_TIMEOUT_MS) });
    if (!res.ok) {
      const errText = await res.text();
      handleRestError(res.status, errText);
      if (cached !== null) return cached;
      throw new Error(`Binance ticker error ${res.status}: ${errText}`);
    }
    const data = (await res.json()) as { symbol: string; price: string };
    let price = parseFloat(data.price);
    if (binanceSymbol === "1000SHIBUSDT") {
      price = price / 1000;
    }
    priceCache.set(getCacheKey(symbol, isFutures), price);
    return price;
  } catch (err: any) {
    if (cached !== null) return cached;
    throw err;
  }
}

export async function get24hrTicker(symbol: string, isFutures: boolean = false): Promise<any> {
  const cachedPrice = getTickerPriceSync(symbol, isFutures);
  if (isRestBanned()) {
    const price = cachedPrice ?? (symbol.toUpperCase().includes("BTC") ? 65000 : 100);
    return {
      symbol: symbol.toUpperCase(),
      lastPrice: String(price),
      openPrice: String(price * 0.99),
      highPrice: String(price * 1.02),
      lowPrice: String(price * 0.98),
      volume: "1000000",
      priceChangePercent: "1.00",
    };
  }

  const binanceSymbol = toBinanceSymbol(symbol, isFutures);
  const url = isFutures
    ? `${FUTURES_BASE}/fapi/v1/ticker/24hr?symbol=${binanceSymbol}`
    : `${BASE}/api/v3/ticker/24hr?symbol=${binanceSymbol}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REST_TIMEOUT_MS) });
    if (!res.ok) {
      const errText = await res.text();
      handleRestError(res.status, errText);
      if (cachedPrice !== null) {
        return {
          symbol: symbol.toUpperCase(),
          lastPrice: String(cachedPrice),
          openPrice: String(cachedPrice),
          highPrice: String(cachedPrice),
          lowPrice: String(cachedPrice),
          volume: "1000000",
          priceChangePercent: "0.00",
        };
      }
      throw new Error(`Binance 24hr ticker error ${res.status}: ${errText}`);
    }
    const data = await res.json() as any;
    
    if (binanceSymbol === "1000SHIBUSDT") {
      data.lastPrice = (parseFloat(data.lastPrice) / 1000).toString();
      data.openPrice = (parseFloat(data.openPrice) / 1000).toString();
      data.highPrice = (parseFloat(data.highPrice) / 1000).toString();
      data.lowPrice = (parseFloat(data.lowPrice) / 1000).toString();
    }
    
    priceCache.set(getCacheKey(symbol, isFutures), parseFloat(data.lastPrice));
    return data;
  } catch (err: any) {
    if (cachedPrice !== null) {
      return {
        symbol: symbol.toUpperCase(),
        lastPrice: String(cachedPrice),
        openPrice: String(cachedPrice),
        highPrice: String(cachedPrice),
        lowPrice: String(cachedPrice),
        volume: "1000000",
        priceChangePercent: "0.00",
      };
    }
    throw err;
  }
}

export function getTickerPriceSync(symbol: string, isFutures: boolean = false): number | null {
  return priceCache.get(getCacheKey(symbol, isFutures)) || null;
}

const lastTickTimes = new Map<string, number>();
let watchdogInterval: NodeJS.Timeout | null = null;

function startWatchdog(): void {
  if (watchdogInterval) return;
  watchdogInterval = setInterval(() => {
    if (combinedSockets.size === 0) {
      clearInterval(watchdogInterval!);
      watchdogInterval = null;
      console.log("[binance-ws] Watchdog: No active sockets. Interval cleared.");
      return;
    }
    const now = Date.now();
    for (const [type, cs] of combinedSockets.entries()) {
      const lastTick = lastTickTimes.get(type) || 0;
      if (lastTick > 0 && now - lastTick > 30000) {
        console.warn(`[binance-ws] Watchdog: Stale combined ${type} feed (no data for 30s). Terminating to trigger reconnect.`);
        cs.ws.terminate();
      }
    }
  }, 10000);

  if (typeof watchdogInterval.unref === "function") {
    watchdogInterval.unref();
  }
}

function getStreamsForSymbol(binanceSymbol: string): string[] {
  const lower = binanceSymbol.toLowerCase();
  return [
    `${lower}@miniTicker`,
    `${lower}@depth5`,
    `${lower}@aggTrade`,
    `${lower}@kline_5m`,
    `${lower}@kline_1h`,
  ];
}

function handleMessage(cs: CombinedSocket, raw: Buffer | string): void {
  lastTickTimes.set(cs.isFutures ? "futures" : "spot", Date.now());
  try {
    const payload = JSON.parse(raw.toString());
    
    // Ignore subscription confirmations (they have { result: null, id: N })
    if (payload.result !== undefined && payload.id !== undefined) return;
    
    const stream = payload.stream as string;
    const data = payload.data;
    if (!stream || !data) return;

    // Extract the symbol from the stream name (e.g., "btcusdt@miniTicker" → "BTCUSDT")
    const streamSymbolLower = stream.split("@")[0];
    
    // Reverse-map from binance symbol to our symbol
    let ourSymbol = streamSymbolLower.toUpperCase();
    if (ourSymbol === "1000SHIBUSDT") ourSymbol = "SHIBUSDT";
    const isFutures = cs.isFutures;
    const is1000Shib = streamSymbolLower === "1000shibusdt";

    // 1. Core Price Ticks
    if (stream.endsWith("@miniTicker")) {
      let price = parseFloat(data.c);
      let high = parseFloat(data.h);
      let low = parseFloat(data.l);
      let open = parseFloat(data.o);
      
      if (is1000Shib) {
        price /= 1000;
        high /= 1000;
        low /= 1000;
        open /= 1000;
      }

      priceCache.set(getCacheKey(ourSymbol, isFutures), price);
      
      signalBus.emitSignal({
        type: SignalType.PRICE_TICK,
        symbol: ourSymbol,
        data: { price, high, low, volume: data.v, isFutures },
        timestamp: data.E
      });

      cs.io.emit("tick", {
        symbol: ourSymbol,
        price: price.toString(),
        high: high.toString(),
        low: low.toString(),
        volume: data.v,
        open: open.toString(),
        time: data.E,
        isFutures,
      });
    }
    // 2. Order Book Depth
    else if (stream.endsWith("@depth5") || stream.endsWith("@depth5@100ms")) {
      let bids = data.bids || data.b || [];
      let asks = data.asks || data.a || [];
      
      if (is1000Shib) {
        bids = bids.map((item: any) => [
          (parseFloat(item[0]) / 1000).toString(),
          (parseFloat(item[1]) * 1000).toString()
        ]);
        asks = asks.map((item: any) => [
          (parseFloat(item[0]) / 1000).toString(),
          (parseFloat(item[1]) * 1000).toString()
        ]);
      }

      cs.io.emit("depth", {
        symbol: ourSymbol,
        bids,
        asks,
        isFutures,
      });
    }
    // 3. Live Trade Feed
    else if (stream.endsWith("@aggTrade")) {
      let price = parseFloat(data.p);
      let qty = parseFloat(data.q);
      
      if (is1000Shib) {
        price /= 1000;
        qty *= 1000;
      }

      signalBus.emitSignal({
        type: SignalType.PRICE_TICK,
        symbol: ourSymbol,
        data: { price, qty, isBuyerMaker: data.m, isFutures },
        timestamp: data.E
      });

      cs.io.emit("trade", {
        symbol: ourSymbol,
        id: data.a,
        price: price.toString(),
        qty: qty.toString(),
        time: data.E,
        isBuyerMaker: data.m,
        isFutures,
      });
    }
    // 4. Live Kline Streams (5m & 1h)
    else if (stream.includes("@kline_")) {
      const k = data.k;
      if (k) {
        const interval = k.i;
        let open = parseFloat(k.o);
        let high = parseFloat(k.h);
        let low = parseFloat(k.l);
        let close = parseFloat(k.c);
        let volume = parseFloat(k.v);
        if (is1000Shib) {
          open /= 1000;
          high /= 1000;
          low /= 1000;
          close /= 1000;
          volume *= 1000;
        }
        const klineObj: Kline = {
          openTime: k.t,
          open: String(open),
          high: String(high),
          low: String(low),
          close: String(close),
          volume: String(volume),
          closeTime: k.T
        };
        updateKlineCache(ourSymbol, interval, klineObj);
      }
    }
  } catch (err: any) {
    console.error(`[binance-ws] Frame parse error on combined ${cs.isFutures ? "futures" : "spot"}:`, err.message);
  }
}

function createCombinedSocket(symbols: string[], io: IOServer, isFutures: boolean): CombinedSocket {
  const type = isFutures ? "futures" : "spot";
  
  // Build all streams for all symbols
  const allStreams = symbols.flatMap(sym => {
    // ALWAYS use spot symbol format for WS connection to avoid "1000SHIBUSDT" failing on spot WS
    const binSym = toBinanceSymbol(sym, false);
    return getStreamsForSymbol(binSym);
  });

  // Always use spot stream URL because fstream is blocked by Indian ISPs
  const baseUrl = "wss://stream.binance.com:9443/stream?streams=";

  const streamUrl = baseUrl + allStreams.join("/");

  console.log(`[binance-ws] Creating combined ${type} WebSocket for ${symbols.length} symbols: ${symbols.join(", ")}`);
  const ws = new WebSocket(streamUrl);
  
  // Initialize watchdog timer immediately to prevent getting stuck in CONNECTING state
  lastTickTimes.set(type, Date.now());
  
  const cs: CombinedSocket = {
    ws,
    symbols: new Set(symbols.map(s => s.toUpperCase())),
    io,
    isFutures,
    id: 1,
    reconnectAttempts: 0,
  };

  ws.on("open", () => {
    console.log(`[binance-ws] Combined ${type} WebSocket established for: ${symbols.join(", ")}`);
    lastTickTimes.set(type, Date.now());
    cs.reconnectAttempts = 0; // Reset on success
    
    // Ensure any symbols added to cs.symbols while connecting are subscribed to
    const allExpectedStreams = Array.from(cs.symbols).flatMap(sym => getStreamsForSymbol(toBinanceSymbol(sym, isFutures)));
    const initialStreams = symbols.flatMap(sym => getStreamsForSymbol(toBinanceSymbol(sym, isFutures)));
    const missedStreams = allExpectedStreams.filter(s => !initialStreams.includes(s));
    
    if (missedStreams.length > 0) {
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            method: "SUBSCRIBE",
            params: missedStreams,
            id: nextSubId++,
          }));
          console.log(`[binance-ws] Sent queued subscriptions for ${missedStreams.length} streams after 500ms delay.`);
        }
      }, 500);
    }
  });

  ws.on("message", (raw) => handleMessage(cs, raw as Buffer));

  ws.on("close", (code, reason) => {
    console.warn(`[binance-ws] Combined ${type} connection closed | Code: ${code} | Reason: ${reason?.toString() || "None"}`);
    combinedSockets.delete(type);
    lastTickTimes.delete(type);
    
    const typeKey = type;
    if (!intentionalClose.has(typeKey)) {
      const delay = Math.min(30000, Math.pow(2, cs.reconnectAttempts) * 1000);
      console.log(`[binance-ws] Reconnecting combined ${type} WebSocket in ${delay}ms (Attempt ${cs.reconnectAttempts + 1})...`);
      
      setTimeout(() => {
        cs.reconnectAttempts++;
        // Re-subscribe all symbols that were in this combined socket
        const symsToReconnect = Array.from(cs.symbols);
        symsToReconnect.forEach(s => subscribedSymbolKeys.delete(`${s}-${type}`));
        if (symsToReconnect.length > 0) {
          symsToReconnect.forEach(s => subscribeTicker(s, io, isFutures));
        }
      }, delay);
    } else {
      intentionalClose.delete(typeKey);
    }
  });

  ws.on("error", (err) => {
    console.error(`[binance-ws] Combined ${type} WebSocket error:`, err.message);
    ws.close();
  });

  return cs;
}

export function subscribeTicker(symbol: string, io: IOServer, isFutures: boolean = false): void {
  const type = isFutures ? "futures" : "spot";
  const symKey = `${symbol.toUpperCase()}-${type}`;
  
  if (subscribedSymbolKeys.has(symKey)) return; // already subscribed
  subscribedSymbolKeys.add(symKey);

  startWatchdog();

  subscriptionQueue.push({ symbol, isFutures, io });
  processSubscriptionQueue().catch(err => console.error("[binance-ws] Queue processing error:", err));
}

export function unsubscribeTicker(symbol: string, isFutures: boolean = false): void {
  const type = isFutures ? "futures" : "spot";
  const symKey = `${symbol.toUpperCase()}-${type}`;
  subscribedSymbolKeys.delete(symKey);

  const cs = combinedSockets.get(type);
  if (cs) {
    cs.symbols.delete(symbol.toUpperCase());
    
    // Send UNSUBSCRIBE to the combined WS
    // ALWAYS use spot symbol format for WS connection
    const binSym = toBinanceSymbol(symbol, false);
    const streams = getStreamsForSymbol(binSym);
    const subId = nextSubId++;
    
    if (cs.ws.readyState === WebSocket.OPEN) {
      cs.ws.send(JSON.stringify({
        method: "UNSUBSCRIBE",
        params: streams,
        id: subId,
      }));
      console.log(`[binance-ws] Unsubscribed ${symbol} from combined ${type} stream`);
    }

    // If no symbols left, close the combined socket
    if (cs.symbols.size === 0) {
      intentionalClose.add(type);
      cs.ws.close();
      combinedSockets.delete(type);
      lastTickTimes.delete(type);
      console.log(`[binance-ws] Combined ${type} socket closed (no symbols remaining)`);
    }
  }

  if (combinedSockets.size === 0 && watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
    console.log("[binance-ws] All WebSocket sockets disconnected. Watchdog interval cleared.");
  }
}


