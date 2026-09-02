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

// Connect via the page origin so Vite proxy can forward /socket.io transparently.
// In production, this will use the app's own host and port.
const SOCKET_URL = typeof window !== 'undefined'
  ? (import.meta.env.VITE_SOCKET_URL || `${window.location.protocol}//${window.location.host}`)
  : "http://GATEWAY_REQUIRED";

export const socket: Socket = io(SOCKET_URL, {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

/* ── connection lifecycle logging ──────────────────── */
socket.on("connect", () => {
  console.log("[socket] connected:", socket.id);
  // Re-subscribe all active tickers on reconnection to trigger backend streams
  for (const key of subscribed) {
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

const subscribed = new Set<string>();

export function subscribeTicker(symbol: string, isFutures: boolean = false): void {
  const key = `${symbol}-${isFutures ? "FUTURES" : "SPOT"}`;
  if (subscribed.has(key)) return;
  subscribed.add(key);
  socket.emit("subscribe", { symbol, isFutures });
  console.log(`[socket] subscribed to ${symbol} (Futures: ${isFutures})`);
}

export function unsubscribeTicker(symbol: string, isFutures: boolean = false): void {
  const key = `${symbol}-${isFutures ? "FUTURES" : "SPOT"}`;
  if (!subscribed.has(key)) return;
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
