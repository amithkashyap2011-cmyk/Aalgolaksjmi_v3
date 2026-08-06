import { Router } from "express";
import { systemManager, SystemState } from "../services/systemManager.js";
import mongoose from "mongoose";
import os from "node:os";
import { authGuard, adminGuard } from "../middleware/auth.js";

const router = Router();

/**
 * @route POST /system/register
 * @desc Allows external services (Quant Engine) to register their coordinates.
 */
router.post("/register", (req, res) => {
  const { name, url, version, health } = req.body;
  if (!name || !url) {
    return res.status(400).json({ error: "Name and URL required" });
  }

  systemManager.registerService({ name, url, version: version || "1.0.0", health: health || {} });
  res.json({ status: "registered", state: systemManager.getState() });
});

/**
 * @route POST /system/heartbeat
 * @desc Heartbeat endpoint for registered services.
 */
router.post("/heartbeat", (req, res) => {
  const { name, health } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });

  const success = systemManager.heartbeat(name, health);
  if (!success) {
    return res.status(404).json({ error: "service_not_registered", message: "Service is unknown, please register first." });
  }
  res.json({ status: "ok", state: systemManager.getState() });
});

/**
 * @route GET /system/status
 * @desc Returns high-level system status and registered services.
 */
router.get("/status", (req, res) => {
  res.json(systemManager.getStatusReport());
});

/**
 * @route GET /system/diagnostics
 * @desc Detailed system diagnostics for the registry.
 */
router.get("/diagnostics", async (req, res) => {
  const report = systemManager.getStatusReport();
  
  const diagnostics = {
    ...report,
    infrastructure: {
      memory: {
        free: os.freemem(),
        total: os.totalmem(),
        usage: (1 - os.freemem() / os.totalmem()).toFixed(2),
      },
      load: os.loadavg(),
      platform: os.platform(),
      release: os.release(),
    },
    mongodb: {
      status: mongoose.connection.readyState === 1 ? "ok" : "error",
      readyState: mongoose.connection.readyState,
    },
  };

  res.json(diagnostics);
});

/**
 * @route POST /system/emergency-stop
 * @desc Manual trigger for EMERGENCY_STOP state.
 */
router.post("/emergency-stop", authGuard, adminGuard, (req, res) => {
  systemManager.setState(SystemState.EMERGENCY_STOP);
  res.json({ status: "EMERGENCY_STOP_ACTIVATED" });
});

/* ── Service Control ─────────────────────────────────────────────────── */

/**
 * @route GET /system/services/status
 * @desc Returns live status of server, quant engine, and client.
 */
router.get("/services/status", (_req, res) => {
  const quantService = systemManager.getService("quant_engine");
  const quantRunning = systemManager.isQuantRunning();
  const systemState = systemManager.getState();

  res.json({
    server: {
      status: "online",
      uptime: Math.floor(process.uptime()),
      state: systemState,
      pid: process.pid,
    },
    quant: {
      status: quantService ? "online" : (quantRunning ? "starting" : "offline"),
      registered: !!quantService,
      url: quantService?.url ?? null,
      version: quantService?.version ?? null,
      health: quantService?.health ?? null,
      lastHeartbeat: quantService?.lastHeartbeat ?? null,
    },
    client: {
      status: "online",
      note: "Served by Vite dev server / static build",
    },
  });
});

/**
 * @route POST /system/quant/start
 * @desc Start the quant engine if not already running.
 */
router.post("/quant/start", authGuard, (_req, res) => {
  if (systemManager.isQuantRunning()) {
    return res.json({ status: "already_running" });
  }
  systemManager.startQuantEngine();
  res.json({ status: "starting" });
});

/**
 * @route POST /system/quant/stop
 * @desc Stop the quant engine.
 */
router.post("/quant/stop", authGuard, (_req, res) => {
  systemManager.stopQuantEngine();
  systemManager.unregisterService("quant_engine");
  res.json({ status: "stopped" });
});

/**
 * @route POST /system/quant/restart
 * @desc Restart the quant engine.
 */
router.post("/quant/restart", authGuard, (_req, res) => {
  systemManager.stopQuantEngine();
  systemManager.unregisterService("quant_engine");
  setTimeout(() => systemManager.startQuantEngine(), 1000);
  res.json({ status: "restarting" });
});

/**
 * @route POST /system/server/restart
 * @desc Graceful server restart — relies on PM2 / tsx watch to bring it back up.
 */
router.post("/server/restart", authGuard, (_req, res) => {
  res.json({ status: "restarting" });
  setTimeout(() => process.exit(0), 300);
});

/**
 * @route POST /system/reconcile
 * @desc On-demand exchange reconciliation (Binance vs local Trade records)
 *       for every user with saved API keys, or a single userId if given.
 *       Runs automatically every 5 minutes (see exchangeReconciliation.ts);
 *       this is for forcing an immediate check.
 */
router.post("/reconcile", authGuard, adminGuard, async (req, res) => {
  try {
    const { reconcileAllLiveUsers, reconcileUserLive } = await import("../services/exchangeReconciliation.js");
    const userId = (req.body as any)?.userId as string | undefined;
    const results = userId
      ? [await reconcileUserLive(userId)].filter(Boolean)
      : await reconcileAllLiveUsers();
    res.json({ ok: true, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route GET /system/live-news
 * @desc Returns real-time financial news headlines and NLP sentiment analysis summary.
 */
router.get("/live-news", async (req, res) => {
  try {
    const domain = ((req.query.domain as string)?.toUpperCase() || "ALL") as "INDIAN_MARKET" | "CRYPTO" | "ALL";
    const symbol = req.query.symbol as string | undefined;
    const { LiveNewsService } = await import("../services/liveNewsService.js");

    const news = await LiveNewsService.fetchLiveNews(domain);
    const summary = await LiveNewsService.getMarketSentimentSummary(domain, symbol);

    res.json({
      ok: true,
      domain,
      summary,
      news,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
