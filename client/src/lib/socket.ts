/*
 * ─── Socket.io Client ─────────────────────────────────
 *
 * Singleton connection to the server's Socket.io instance.
 * Used for real-time ticker streaming from Binance via the server.
 *
 * Usage:
 *   import { socket, subscribeTicker, unsubscribeTicker } from "../lib/socket";
 *   subscribeTicker("DOGEUSDT");
 *   socket.on("tick", (data) => { ... });
 */
import { io, type Socket } from "socket.io-client";

function getSocketUrl(): string {
  if (typeof window === "undefined") return "http://GATEWAY_REQUIRED";
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  // Always use same-origin relative path so Vite proxy handles /socket.io cleanly
  // avoiding macOS IPv6 localhost ::1 connection refusals and CORS restrictions
  return "";
}

export const socket: Socket = io(getSocketUrl(), {
  path: "/socket.io",
  transports: ["polling", "websocket"],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

/* ── connection lifecycle logging ──────────────────── */
socket.on("connect", () => {
  console.log("[socket] connected:", socket.id);
  // Re-subscribe all active tickers on reconnection to trigger backend streams
  for (const key of subscribed.keys()) {
    const parts = key.split("-");
    const symbol = parts[0];
    const isFutures = parts[1] === "FUTURES";
    socket.emit("subscribe", { symbol, isFutures });
    console.log(`[socket] re-subscribed to ${symbol} (Futures: ${isFutures}) on reconnect`);
  }
});
socket.on("disconnect", (reason) => {
  console.log("[socket] disconnected:", reason);
});
socket.on("connect_error", (err) => {
  console.warn("[socket] connection error:", err.message);
});

/* ── helpers ───────────────────────────────────────── */

// Reference-counted: several components share one stream (the chart, the
// footer's rotating ticker, the store's watchlist). With a plain Set, the first
// component to unsubscribe dropped the stream for all of them — the footer
// rotating off BTCUSDT froze the BTCUSDT chart until it remounted.
const subscribed = new Map<string, number>();

export function subscribeTicker(symbol: string, isFutures: boolean = false): void {
  const key = `${symbol}-${isFutures ? "FUTURES" : "SPOT"}`;
  const count = subscribed.get(key) ?? 0;
  subscribed.set(key, count + 1);
  if (count > 0) return;
  socket.emit("subscribe", { symbol, isFutures });
  console.log(`[socket] subscribed to ${symbol} (Futures: ${isFutures})`);
}

export function unsubscribeTicker(symbol: string, isFutures: boolean = false): void {
  const key = `${symbol}-${isFutures ? "FUTURES" : "SPOT"}`;
  const count = subscribed.get(key) ?? 0;
  if (count === 0) return;
  if (count > 1) {
    subscribed.set(key, count - 1);
    return;
  }
  subscribed.delete(key);
  socket.emit("unsubscribe", { symbol, isFutures });
  console.log(`[socket] unsubscribed from ${symbol} (Futures: ${isFutures})`);
}

export interface TickData {
  symbol: string;
  price: string;
  high: string;
  low: string;
  volume: string;
  open?: string;
  time: number;
  isFutures?: boolean;
}
