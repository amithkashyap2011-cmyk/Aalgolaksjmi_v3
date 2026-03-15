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

/* Connect through Vite proxy (same origin) */
export const socket: Socket = io("/", {
  transports: ["websocket", "polling"],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
});

/* ── connection lifecycle logging ──────────────────── */
socket.on("connect", () => {
  console.log("[socket] connected:", socket.id);
});
socket.on("disconnect", (reason) => {
  console.log("[socket] disconnected:", reason);
});
socket.on("connect_error", (err) => {
  console.warn("[socket] connection error:", err.message);
});

/* ── helpers ───────────────────────────────────────── */

const subscribed = new Set<string>();

export function subscribeTicker(symbol: string): void {
  if (subscribed.has(symbol)) return;
  subscribed.add(symbol);
  socket.emit("subscribe", symbol);
  console.log(`[socket] subscribed to ${symbol}`);
}

export function unsubscribeTicker(symbol: string): void {
  if (!subscribed.has(symbol)) return;
  subscribed.delete(symbol);
  socket.emit("unsubscribe", symbol);
  console.log(`[socket] unsubscribed from ${symbol}`);
}

export interface TickData {
  symbol: string;
  price: string;
  high: string;
  low: string;
  volume: string;
  time: number;
}
