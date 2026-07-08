/* 
 * ─── AALGOLAKSHMI V2 — Server entry ───────────────────
 * Refreshed: Clean reload triggered. (Restarted after MongoDB recovery)
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import http from "node:http";
import { Server as IOServer } from "socket.io";
import mongoose from "mongoose";
import os from "node:os";
import dns from "node:dns";
import { rotateLogIfNeeded } from "./utils/logger.js";

// 🛡️ CRITICAL FIX: Force IPv4 for Node.js fetch() to prevent "fetch failed" with Binance API
dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env") });

import { authGuard } from "./middleware/auth.js";
import authRouter from "./routes/auth.js";
import settingsRouter from "./routes/settings.js";
import apikeysRouter from "./routes/apikeys.js";
import tradingRouter from "./routes/trading.js";
import backtestRouter from "./routes/backtest.js";
import agentRouter from "./routes/agent.js";
import walletRouter from "./routes/wallet.js";
import modelsRouter from "./routes/models.js";
import productionDashboardRouter from "./routes/productionDashboard.js";
import institutionalDashboardRouter from "./routes/institutionalDashboard.js";
import platformRouter from "./routes/platform.js";
import aqeaUiRouter from "./routes/aqeaUi.js";
import aqeaGovernanceRouter from "./routes/aqeaGovernance.js";
import aqeaAttributionRouter from "./routes/aqeaAttribution.js";
import aiTimelineRouter from "./routes/aiTimeline.js";
import systemRouter from "./routes/system.js";
import externalSyncRouter from "./routes/externalSync.js";
import { systemManager, SystemState } from "./services/systemManager.js";
import { recoveryManager } from "./services/recoveryManager.js";
import { subscribeTicker, unsubscribeTicker, syncTime } from "./services/binanceService.js";
import * as autoTradeEngine from "./services/autoTradeEngine.js";
import * as paperState from "./services/paperState.js";
import { setIO } from "./services/socketService.js";
import { UITelemetryService } from "./services/uiTelemetry.js";

// 🛡️ CRITICAL: Process-level Error Handlers
process.on("uncaughtException", (err) => {
  const msg = `[FATAL_UNCAUGHT_EXCEPTION] ${new Date().toISOString()}: ${err.stack || err}\n`;
  try {
    const crashLog = path.join(__dirname, "..", "server_crash.log");
    const tradeLog = path.join(__dirname, "..", "auto_trade.log");
    rotateLogIfNeeded(crashLog);
    rotateLogIfNeeded(tradeLog);
    fs.appendFileSync(crashLog, msg);
    fs.appendFileSync(tradeLog, msg);
  } catch {}
  console.error(msg);
  // Give time for logging before exiting
  setTimeout(() => process.exit(1), 1000);
});

process.on("unhandledRejection", (reason, promise) => {
  const msg = `[FATAL_UNHANDLED_REJECTION] ${new Date().toISOString()}: Reason: ${reason}\n`;
  try {
    const crashLog = path.join(__dirname, "..", "server_crash.log");
    const tradeLog = path.join(__dirname, "..", "auto_trade.log");
    rotateLogIfNeeded(crashLog);
    rotateLogIfNeeded(tradeLog);
    fs.appendFileSync(crashLog, msg);
    fs.appendFileSync(tradeLog, msg);
  } catch {}
  console.error(msg);
});

const app = express();

// Was app.use(helmet()) omitted entirely — no security headers at all on a
// real-money-facing API. Defaults are safe here since this Express app only
// ever returns JSON (the client is a separate Vite process on its own
// origin/port, never served by this app), so helmet's default CSP has
// nothing HTML/inline-script to conflict with.
app.use(helmet());

// Was app.use(cors()) — completely open, any origin. Restricted to an
// explicit allowlist (env-configurable so a real deployment can add its
// production client origin without a code change); the dev client's own
// port (see client/vite.config.ts) is included by default so local dev
// keeps working unchanged.
const corsAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:9994,http://127.0.0.1:9994")
  .split(",").map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // No Origin header (curl, server-to-server, same-origin) — allow.
    if (!origin || corsAllowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
}));

// Was no rate limiting anywhere — /auth/login had no brute-force
// throttling at all (noted in an earlier security audit this session).
// Generous general limit (this API is polled every 5-15s by the dashboard
// across several endpoints) plus a much stricter one on auth specifically,
// which is the highest-value place for it on a bearer-token API.
// Overridable only for isolated load testing (an isolated instance
// measuring raw throughput needs a higher ceiling than the real
// production limit) — defaults to 600 in every normal deployment, so this
// never weakens the real rate limit.
const generalLimiterMax = Number(process.env.RATE_LIMIT_MAX_OVERRIDE) || 600;
const generalLimiter = rateLimit({ windowMs: 60_000, limit: generalLimiterMax, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many auth attempts, try again shortly." } });
app.use(generalLimiter);
app.use("/auth/login", authLimiter);
app.use("/auth/register", authLimiter);

app.use(express.json());

// Was no operational metrics anywhere — no visibility into memory/CPU/
// event-loop trends, request latency, or open-position counts without
// reading logs by hand. /metrics exposes standard Prometheus-format data
// for a real Prometheus server to scrape. Prometheus scrapers don't send
// bearer tokens, so this can't reuse authGuard — restricted to loopback
// by default (matches the typical setup of Prometheus running on the same
// host or reached over a private network), or to requests carrying
// METRICS_TOKEN if that env var is set (for a scraper on another host).
app.get("/metrics", async (req, res) => {
  const token = process.env.METRICS_TOKEN;
  const remote = req.socket.remoteAddress || "";
  const isLoopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  // Prometheus's standard scrape `authorization` config sends a normal
  // `Authorization: Bearer <token>` header, not a custom one — accepting
  // only X-Metrics-Token meant a real Prometheus deployment following its
  // own documented config would get a 403. Accept either.
  const bearerMatch = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  const hasValidToken = !!token && (req.get("X-Metrics-Token") === token || bearerMatch === token);
  if (!isLoopback && !hasValidToken) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { metricsHandler } = await import("./services/metrics.js");
  return metricsHandler(req, res);
});
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    if (req.path === "/metrics") return;
    import("./services/metrics.js").then(({ httpRequestDuration }) => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      const route = req.route?.path || req.path.replace(/[0-9a-f]{24}/g, ":id");
      httpRequestDuration.observe({ method: req.method, route, status_code: String(res.statusCode) }, seconds);
    }).catch(() => {});
  });
  next();
});

const serverStartTime = Date.now();
export let io: IOServer;
const SERVER_HOST = "0.0.0.0";
// Quick retries handle a just-killed socket lingering in TIME_WAIT; after that
// we fall back to a dynamic (OS-assigned) port instead of waiting/failing.
const SERVER_LISTEN_RETRIES = 2;
const SERVER_LISTEN_RETRY_DELAY_MS = 400;
const MONGO_CONNECT_RETRY_BASE_MS = 2000;
const MONGO_CONNECT_RETRY_MAX_MS = 15000;

function log(msg: string) {
  const line = `[${new Date().toISOString()}] [server] ${msg}\n`;
  try {
    const tradeLog = path.join(__dirname, "..", "auto_trade.log");
    rotateLogIfNeeded(tradeLog);
    fs.appendFileSync(tradeLog, line);
  } catch {}
  console.log(line);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function connectMongoWithRetry(bootLog: (msg: string) => void) {
  // Surface driver-level connection churn in the logs: the crash log's
  // MongoServerSelectionError / PoolClearedOnNetworkError entries were the
  // only evidence of drops, with no record of when the pool degraded or
  // recovered in between.
  mongoose.connection.on("disconnected", () =>
    console.error(`[mongo] disconnected at ${new Date().toISOString()}`));
  mongoose.connection.on("reconnected", () =>
    console.error(`[mongo] reconnected at ${new Date().toISOString()}`));

  for (let attempt = 1; ; attempt += 1) {
    try {
      if (mongoose.connection.readyState === 1) return;

      bootLog(`Connecting to MongoDB at ${MONGO_URI}...`);
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        // Local mongod stalls (seen as "connection <monitor> timed out" +
        // pool clears in the crash log) shouldn't fail queries instantly —
        // let in-flight ops ride out a brief stall and retry once.
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        maxPoolSize: 20,
        minPoolSize: 2,
        retryWrites: true,
        retryReads: true,
      });
      bootLog("MongoDB connected.");
      return;
    } catch (err: any) {
      const delay = Math.min(MONGO_CONNECT_RETRY_BASE_MS * attempt, MONGO_CONNECT_RETRY_MAX_MS);
      bootLog(`[mongo_retry] Attempt ${attempt} failed: ${err?.message || err}. Retrying in ${delay}ms...`);
      systemManager.setState(SystemState.RECOVERING);
      await wait(delay);
    }
  }
}

async function listenWithRetry(port: number) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= SERVER_LISTEN_RETRIES; attempt += 1) {
    try {
      // 🛡️ If retries exhausted on default port, use dynamic port assignment
      const listenPort = attempt >= SERVER_LISTEN_RETRIES ? 0 : port;

      await new Promise<void>((resolve, reject) => {
        const onListening = () => {
          server.off("error", onError);
          const addr = server.address() as any;
          const assignedPort = addr?.port || port;
          if (assignedPort !== port) {
            console.log(`[dynamic-port] Assigned port ${assignedPort} (requested ${port} was busy)`);
          }
          resolve();
        };

        const onError = (err: unknown) => {
          server.off("listening", onListening);
          reject(err);
        };

        server.once("listening", onListening);
        server.once("error", onError);
        server.listen(listenPort, SERVER_HOST);
      });

      return;
    } catch (err: any) {
      lastError = err;
      if (err?.code !== "EADDRINUSE" || attempt === SERVER_LISTEN_RETRIES) {
        throw err;
      }

      const delay = SERVER_LISTEN_RETRY_DELAY_MS * (attempt + 1);
      log(`Port ${port} is busy, retrying in ${delay}ms (${attempt + 1}/${SERVER_LISTEN_RETRIES})...`);
      await wait(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Unable to bind to port ${port}.`);
}

// 🛡️ Phase 2: Trading Circuit Breaker Middleware
app.use((req, res, next) => {
  const state = systemManager.getState();
  const protectedRoutes = ["/trading", "/backtest", "/agent"];
  const isProtectedRoute = protectedRoutes.some(route => req.path.startsWith(route));

  // Read-only queries stay available while the system boots or waits for the
  // quant engine — they never place orders, and the Positions/History pages
  // must keep working even when execution is gated.
  const readOnlyRoutes = ["/trading/open-positions", "/trading/history", "/trading/wallet", "/trading/klines"];
  const isReadOnlyQuery = req.method === "GET" && readOnlyRoutes.some(route => req.path.startsWith(route));

  if (isProtectedRoute && !isReadOnlyQuery && state !== SystemState.READY && state !== SystemState.DEGRADED) {
    return res.status(503).json({
      status: "error",
      code: "SYSTEM_NOT_READY",
      state: state,
      message: "Trading services are currently unavailable. System is in state: " + state
    });
  }
  next();
});

app.get("/health", (_req, res) => {
  try {
    let scannerCount = 0;
    try {
      scannerCount = autoTradeEngine.getScannerCount();
    } catch {
      scannerCount = -1;
    }
    
    res.json({
      status: mongoose.connection.readyState === 1 ? "ok" : "degraded",
      server: true,
      mongodb: mongoose.connection.readyState === 1,
      binance: true, // Basic reachability checked on boot
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      activeUsers: scannerCount,
      protocol: "V11.5_RELIABILITY_MISSION",
      state: systemManager.getState()
    });
  } catch (err: any) {
    res.json({
      status: "degraded",
      error: err.message
    });
  }
});

app.get("/health/full", async (_req, res) => {
  try {
    let binancePing = false;
    try {
      const pingRes = await fetch("https://api.binance.com/api/v3/ping");
      binancePing = pingRes.ok;
    } catch {}

    const diagnostics = {
      server: {
        status: "ok",
        uptime: Math.floor((Date.now() - serverStartTime) / 1000),
        state: systemManager.getState(),
        memory: {
          free: os.freemem(),
          total: os.totalmem(),
          usage: 1 - (os.freemem() / os.totalmem())
        },
        load: os.loadavg()
      },
      mongodb: {
        status: mongoose.connection.readyState === 1 ? "ok" : "error",
        readyState: mongoose.connection.readyState,
        dbName: mongoose.connection.name
      },
      binance: {
        status: binancePing ? "ok" : "error",
        ping: binancePing,
        activeSockets: (await import("./services/binanceService.js")).getActiveSocketsInfo().length
      },
      autoTrade: {
        status: "ok",
        activeUsers: autoTradeEngine.getScannerCount()
      },
      timestamp: new Date().toISOString()
    };
    res.json(diagnostics);
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Mounted under /system so the existing Vite proxy path covers it.
app.use("/system/external-sync", externalSyncRouter);
app.use("/system", systemRouter);
app.use("/auth", authRouter);
app.use("/settings", settingsRouter);
app.use("/apikeys", apikeysRouter);
app.use("/trading", tradingRouter);
app.use("/backtest", backtestRouter);
app.use("/agent", agentRouter);
app.use("/wallet", walletRouter);
app.use("/models", modelsRouter);
app.use("/production", productionDashboardRouter);
app.use("/institutional", institutionalDashboardRouter);
app.use("/platform", platformRouter);
app.use("/aqea-ui", aqeaUiRouter);
app.use("/aqea-governance", aqeaGovernanceRouter);
app.use("/aqea-attribution", aqeaAttributionRouter);
app.use("/ai-timeline", aiTimelineRouter);

// Global Error Handler for Express
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errorMsg = `[FATAL_API_ERROR] ${err.stack || err.message || err}\n`;
  try {
    const tradeLog = path.join(__dirname, "..", "auto_trade.log");
    rotateLogIfNeeded(tradeLog);
    fs.appendFileSync(tradeLog, errorMsg);
  } catch {}
  console.error(errorMsg);
  res.status(500).json({ error: "Internal Server Error", message: err.message });
});

const server = http.createServer(app);
io = new IOServer(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
setIO(io);

// ── Socket Connection Handler ──────────────────────────
io.on("connection", (socket) => {
  log(`socket client connected: ${socket.id}`);

  socket.on("subscribe", (payload: string | { symbol: string; isFutures?: boolean }) => {
    if (!payload) return;
    let symbol: string;
    let isFutures = false;
    if (typeof payload === "string") {
      symbol = payload;
    } else {
      symbol = payload.symbol;
      isFutures = !!payload.isFutures;
    }
    log(`client ${socket.id} subscribing to ${symbol} (Futures: ${isFutures})`);
    subscribeTicker(symbol, io, isFutures);
  });

  socket.on("unsubscribe", (payload: string | { symbol: string; isFutures?: boolean }) => {
    if (!payload) return;
    let symbol: string;
    let isFutures = false;
    if (typeof payload === "string") {
      symbol = payload;
    } else {
      symbol = payload.symbol;
      isFutures = !!payload.isFutures;
    }
    log(`client ${socket.id} unsubscribing from ${symbol} (Futures: ${isFutures})`);
    unsubscribeTicker(symbol, isFutures);
  });

  socket.on("disconnect", (reason) => {
    log(`socket client disconnected: ${socket.id} (${reason})`);
  });
});

import { EnvironmentAuthority } from "./services/aqea/environmentAuthority.js";

const PORT = EnvironmentAuthority.getPort();
const MONGO_URI = EnvironmentAuthority.getMongoUri();

async function boot() {
  const bootLog = (msg: string) => {
    const line = `[${new Date().toISOString()}] [BOOT] ${msg}\n`;
    try {
      const tradeLog = path.join(__dirname, "..", "auto_trade.log");
      rotateLogIfNeeded(tradeLog);
      fs.appendFileSync(tradeLog, line);
    } catch {}
    console.log(line);
  };

  bootLog("Starting V11.5 Reliability boot sequence...");
  systemManager.setState(SystemState.BOOTING);

  // 0. Start Server Immediately to allow Registry (Phase 1/2)
  try {
    await listenWithRetry(PORT);
  } catch (err: any) {
    bootLog(`[server_error] ${err.stack || err.message}`);
    systemManager.setState(SystemState.RECOVERING);
    return;
  }

  const actualPort = (server.address() as any)?.port || PORT;
  bootLog(`[server] listening on http://${SERVER_HOST}:${actualPort} - Registry Active.`);
  server.on("error", (err: any) => {
    if (err?.code === "EADDRINUSE") {
      return;
    }
    bootLog(`[server_error] ${err.stack || err.message}`);
  });

  // 1. MongoDB Connectivity Check & Hydration
  systemManager.setState(SystemState.WAITING_FOR_MONGO);
  try {
    await connectMongoWithRetry(bootLog);

    // ─── Migrations & Hydration ──────────────────────────
    const db = mongoose.connection.db;
    if (db) {
      try {
        const collection = db.collection("walletsnapshots");
        await collection.dropIndexes();
        bootLog("Dropped old indexes on walletsnapshots.");
      } catch (e) {}

      try {
        const { Settings } = await import("./models/Settings.js");
        await Settings.updateMany(
          { autoTrade: { $exists: false } },
          { $set: { autoTrade: true } }
        );
      } catch (e) {}
    }

    await paperState.hydrate();
    bootLog("Memory state hydrated.");

    // Proactive startup reconciliation — previously the self-healing
    // auditor (sentinelAuditor.runSentinelAudit) only ran per-request, from
    // wallet.ts's balance route. A wallet/position invariant violation (a
    // ghost position, a corrupted balance) sat undetected until whoever
    // owned it happened to load their wallet page — and for the automated
    // engine, that could be a long time. Running it once for every known
    // wallet right after hydration, before AutoTradeEngine starts placing
    // trades, catches drift as early as possible instead of waiting on a
    // user request that may never come.
    try {
      const { runSentinelAudit } = await import("./services/sentinelAuditor.js");
      const keys = paperState.getWalletKeys();
      let checked = 0;
      for (const key of keys) {
        const [userId, mode, accountType] = key.split(":");
        if (!userId || !mode || !accountType) continue;
        try {
          await runSentinelAudit(userId, mode as "PAPER" | "LIVE", accountType as "SPOT" | "FUTURES");
          checked++;
        } catch (auditErr: any) {
          bootLog(`Startup reconciliation failed for ${key}: ${auditErr.message}`);
        }
      }
      bootLog(`Startup reconciliation complete: ${checked}/${keys.length} wallets checked.`);
    } catch (err: any) {
      bootLog(`Startup reconciliation skipped: ${err.message}`);
    }

    // Exchange reconciliation — compares Binance's actual account/position
    // state against local Trade records for every user with saved API
    // keys, for LIVE mode specifically (the above reconciliation only
    // covers the in-memory/DB-internal PAPER-mode invariants). Runs once
    // now, then every 5 minutes.
    try {
      const { reconcileAllLiveUsers, startReconciliationSchedule } = await import("./services/exchangeReconciliation.js");
      const results = await reconcileAllLiveUsers();
      bootLog(`Exchange reconciliation: ${results.length} user(s) with LIVE credentials checked.`);
      startReconciliationSchedule();
    } catch (err: any) {
      bootLog(`Exchange reconciliation skipped: ${err.message}`);
    }

    try {
      const { startMetricsRefresh } = await import("./services/metrics.js");
      startMetricsRefresh();
      bootLog("Metrics refresh started (/metrics).");
    } catch (err: any) {
      bootLog(`Metrics refresh skipped: ${err.message}`);
    }

    // Start AutoTradeEngine immediately after memory is ready.
    // Decoupled from quant engine — AI models degrade gracefully via TA-fallback
    // when the quant engine is offline. This prevents a total trading halt when
    // CNN/PPO/TRANSFORMER are unavailable.
    autoTradeEngine.start();
    bootLog("AutoTradeEngine started (independent of quant engine state).");

    // 2. Wait for Quant Engine Registration (enhances AI decisions, not required for trading)
    systemManager.setState(SystemState.WAITING_FOR_QUANT);
    bootLog("Waiting for Quant Engine registration via /system/register...");

    let binanceBootstrapped = false;
    const finishBoot = async () => {
      if (binanceBootstrapped) return;
      binanceBootstrapped = true;

      bootLog("Quant Engine Ready. Syncing with Binance...");
      try {
        const offset = await syncTime();
        bootLog(`Binance sync successful. Offset: ${offset}ms`);

        const { Trade } = await import("./models/Trade.js");
        const openTrades = await Trade.find({ status: "OPEN" }).lean();
        for (const trade of openTrades) {
          subscribeTicker(trade.symbol, io, trade.accountType === "FUTURES");
        }
        bootLog("Price feeds pre-warmed.");

        systemManager.setState(SystemState.READY);
        bootLog("AQEA SYSTEM READY.");

        autoTradeEngine.start(); // no-op if already running (idempotent)
        bootLog("AutoTradeEngine confirmed running (quant engine online).");

        setInterval(() => UITelemetryService.emitSystemHealth(), 5000);
        setInterval(async () => {
          const { AITelemetryService } = await import("./services/aqea/aiTelemetryService.js");
          const { OutcomeAttributionService } = await import("./services/aqea/outcomeAttribution.js");
          await AITelemetryService.resolvePendingOutcomes();
          await OutcomeAttributionService.resolvePendingOutcomes();
          await AITelemetryService.updateRollingAccuracies();
        }, 300000);
      } catch (e: any) {
        binanceBootstrapped = false;
        bootLog(`[FATAL] Binance API unavailable: ${e.message}`);
        systemManager.setState(SystemState.RECOVERING);
      }
    };

    const onStateChange = ({ newState }: { newState: SystemState }) => {
      if (newState === SystemState.WAITING_FOR_BINANCE) {
        void finishBoot();
      }
    };

    systemManager.on("stateChanged", onStateChange);

    const quantService = systemManager.getService("quant_engine");
    if (systemManager.getState() === SystemState.WAITING_FOR_BINANCE || quantService) {
      void finishBoot();
    }

  } catch (err: any) {
    bootLog(`[FATAL] MongoDB connection failed: ${err.message}`);
    // In a real production system, we might want to retry here.
    // For now, we stay in WAITING_FOR_MONGO or RECOVERING.
  }
}

boot();

app.get("/debug/cache", authGuard, (req, res) => {
  import("./services/binanceService.js").then(binance => {
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "SHIBUSDT", "XRPUSDT"];
    const futures = symbols.reduce((acc, sym) => ({ ...acc, [sym]: binance.getTickerPriceSync(sym, true) }), {});
    const spot = symbols.reduce((acc, sym) => ({ ...acc, [sym]: binance.getTickerPriceSync(sym, false) }), {});
    res.json({ futures, spot });
  });
});

app.get("/debug/sockets", authGuard, (req, res) => {
  import("./services/binanceService.js").then(binance => {
    res.json(binance.getActiveSocketsInfo());
  });
});

// 🛡️ Graceful Shutdown
async function shutdown(signal: string) {
  console.log(`\n[${new Date().toISOString()}] [SHUTDOWN] Received ${signal}. Starting graceful shutdown...`);
  
  // Force exit after 10s
  setTimeout(() => {
    console.error("[SHUTDOWN] Graceful shutdown timed out. Forcing exit.");
    process.exit(1);
  }, 10000);

  try {
    // 1. Stop Trade Engine + Quant Engine
    autoTradeEngine.stop();
    systemManager.stopQuantEngine();
    console.log("[SHUTDOWN] AutoTradeEngine + QuantEngine stopped.");

    // 2. Close Server and IO
    if (io) {
       io.close();
       console.log("[SHUTDOWN] IO server closed.");
    }
    await new Promise<void>((resolve) => {
      server.close(() => {
        console.log("[SHUTDOWN] HTTP server closed.");
        resolve();
      });
    });

    // 3. Close MongoDB
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log("[SHUTDOWN] MongoDB connection closed.");
    }

    console.log("[SHUTDOWN] Cleanup complete. Exiting.");
    process.exit(0);
  } catch (err: any) {
    console.error(`[SHUTDOWN_ERROR] ${err.message}`);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
