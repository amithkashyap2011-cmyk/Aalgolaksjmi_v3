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

const BASE = "https://api.binance.com";
const WS_BASE = "wss://stream.binance.com:9443/ws";

/* ── helpers ──────────────────────────────────────────── */

function hmacSign(queryString: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Binance ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function signedGet<T>(path: string, apiKey: string, apiSecret: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams({ ...params, timestamp: Date.now().toString() });
  qs.set("signature", hmacSign(qs.toString(), apiSecret));
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  if (!res.ok) throw new Error(`Binance ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function signedPost<T>(path: string, apiKey: string, apiSecret: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ ...params, timestamp: Date.now().toString() });
  qs.set("signature", hmacSign(qs.toString(), apiSecret));
  const res = await fetch(`${BASE}${path}?${qs}`, {
    method: "POST",
    headers: { "X-MBX-APIKEY": apiKey },
  });
  if (!res.ok) throw new Error(`Binance ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/* ── public endpoints ─────────────────────────────────── */

export interface SymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
}

export async function getExchangeInfo(): Promise<SymbolInfo[]> {
  const data = await publicGet<{ symbols: SymbolInfo[] }>("/api/v3/exchangeInfo");
  return data.symbols;
}

export interface Kline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
}

export async function getKlines(
  symbol: string,
  interval: string,
  startTime?: number,
  endTime?: number,
  limit = 500,
): Promise<Kline[]> {
  const params = new URLSearchParams({ symbol, interval, limit: String(limit) });
  if (startTime) params.set("startTime", String(startTime));
  if (endTime) params.set("endTime", String(endTime));
  const raw: unknown[][] = await publicGet(`/api/v3/klines?${params}`);
  return raw.map((k) => ({
    openTime: k[0] as number,
    open: k[1] as string,
    high: k[2] as string,
    low: k[3] as string,
    close: k[4] as string,
    volume: k[5] as string,
    closeTime: k[6] as number,
  }));
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

export interface OrderResult {
  symbol: string;
  orderId: number;
  status: string;
  executedQty: string;
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
  },
): Promise<OrderResult> {
  const body: Record<string, string> = {
    symbol: params.symbol,
    side: params.side,
    type: params.type,
    quantity: params.quantity,
  };
  if (params.type === "LIMIT") {
    body.price = params.price!;
    body.timeInForce = params.timeInForce ?? "GTC";
  }
  return signedPost<OrderResult>("/api/v3/order", apiKey, apiSecret, body);
}

/* ── WebSocket ticker stream ─────────────────────────── */

const activeSockets = new Map<string, WebSocket>();

/* ── ticker price (public, no auth) ───────────────────── */

export async function getTickerPrice(symbol: string): Promise<number> {
  const res = await fetch(`${BASE}/api/v3/ticker/price?symbol=${symbol}`);
  if (!res.ok) throw new Error(`Binance ticker error: ${res.status}`);
  const data = (await res.json()) as { symbol: string; price: string };
  return parseFloat(data.price);
}

/**
 * Subscribe to mini‑ticker for a symbol and relay ticks
 * to all connected Socket.io clients.
 */
export function subscribeTicker(symbol: string, io: IOServer): void {
  const key = symbol.toLowerCase();
  if (activeSockets.has(key)) return; // already subscribed

  const ws = new WebSocket(`${WS_BASE}/${key}@miniTicker`);
  activeSockets.set(key, ws);

  ws.on("message", (raw) => {
    try {
      const tick = JSON.parse(raw.toString());
      io.emit("tick", {
        symbol: tick.s,
        price: tick.c,
        high: tick.h,
        low: tick.l,
        volume: tick.v,
        time: tick.E,
      });
    } catch { /* ignore bad frames */ }
  });

  ws.on("close", () => {
    activeSockets.delete(key);
    // auto‑reconnect after 3s
    setTimeout(() => subscribeTicker(symbol, io), 3000);
  });

  ws.on("error", () => ws.close());
}

export function unsubscribeTicker(symbol: string): void {
  const ws = activeSockets.get(symbol.toLowerCase());
  if (ws) {
    ws.close();
    activeSockets.delete(symbol.toLowerCase());
  }
}
