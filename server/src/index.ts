/*
 * ─── AALGOLAKSHMI V2 — Server entry ───────────────────
 *
 * Express + Socket.io + Mongoose
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env") });

import express from "express";
import cors from "cors";
import http from "node:http";
import { Server as IOServer } from "socket.io";
import mongoose from "mongoose";

/* routes */
import authRouter from "./routes/auth.js";
import settingsRouter from "./routes/settings.js";
import apikeysRouter from "./routes/apikeys.js";
import tradingRouter from "./routes/trading.js";
import backtestRouter from "./routes/backtest.js";
import agentRouter from "./routes/agent.js";
import walletRouter from "./routes/wallet.js";

/* binance WS relay */
import { subscribeTicker, unsubscribeTicker } from "./services/binanceService.js";

/* auto‑trade engine */
import * as autoTradeEngine from "./services/autoTradeEngine.js";

/* ── Express app ──────────────────────────────────────── */

const app = express();
app.use(cors());
app.use(express.json());

/* ── Health check ─────────────────────────────────────── */
app.get("/health", (_req, res) => res.json({ status: "ok" }));

/* ── Mount routes ─────────────────────────────────────── */
app.use("/auth", authRouter);
app.use("/settings", settingsRouter);
app.use("/apikeys", apikeysRouter);
app.use("/trading", tradingRouter);
app.use("/backtest", backtestRouter);
app.use("/agent", agentRouter);
app.use("/wallet", walletRouter);

/* ── HTTP + Socket.io ─────────────────────────────────── */

const server = http.createServer(app);
const io = new IOServer(server, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log(`[ws] client connected: ${socket.id}`);

  socket.on("subscribe", (symbol: string) => {
    subscribeTicker(symbol, io);
    socket.join(symbol);
    console.log(`[ws] ${socket.id} subscribed to ${symbol}`);
  });

  socket.on("unsubscribe", (symbol: string) => {
    socket.leave(symbol);
    // only unsub binance WS when no clients left in room
    const room = io.sockets.adapter.rooms.get(symbol);
    if (!room || room.size === 0) {
      unsubscribeTicker(symbol);
    }
    console.log(`[ws] ${socket.id} unsubscribed from ${symbol}`);
  });

  socket.on("disconnect", () => {
    console.log(`[ws] client disconnected: ${socket.id}`);
  });
});

/* ── Start ────────────────────────────────────────────── */

const PORT = Number(process.env.PORT) || 4000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";

async function boot() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`[db] connected to MongoDB`);
  } catch (err) {
    console.error("[db] MongoDB connection failed:", err);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
    /* Start auto‑trade scheduler (runs every 60s) */
    autoTradeEngine.start();
  });
}

boot();
