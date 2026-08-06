/*
 * ─── Execution REST Router ────────────────────────────────────
 *
 * REST Endpoints:
 * GET  /api/execution/shadow/trades
 * POST /api/execution/shadow/order
 * GET  /api/execution/quality
 * GET  /api/execution/live-vs-paper
 * POST /api/execution/replay
 * GET  /api/execution/report
 */

import { Router } from "express";
import { ShadowExecutionEngine } from "../services/execution/shadowExecutionEngine.js";
import { ExecutionQualityService } from "../services/execution/executionQualityService.js";
import { ExecutionAnalyticsService } from "../services/execution/executionAnalyticsService.js";
import { ReplayEngine } from "../services/execution/replayEngine.js";
import { LatencyEngine } from "../services/execution/latencyEngine.js";

const router = Router();

// GET /api/execution/shadow/trades
router.get("/shadow/trades", async (_req, res) => {
  try {
    const trades = await ShadowExecutionEngine.getShadowTrades();
    res.json(trades);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/execution/shadow/order
router.post("/shadow/order", async (req, res) => {
  try {
    const { symbol, side, requestedQty, requestedPrice, exchangeType } = req.body;
    const trade = await ShadowExecutionEngine.executeShadowOrder({
      symbol: symbol || "BTCUSDT",
      side: side || "BUY",
      requestedQty: requestedQty || 0.1,
      requestedPrice: requestedPrice || 65000,
      exchangeType: exchangeType || "BINANCE_TESTNET",
    });
    res.json(trade);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/execution/quality
router.get("/quality", async (_req, res) => {
  try {
    const latency = LatencyEngine.measurePipelineLatency();
    const eqs = ExecutionQualityService.calculateEQS(latency.total, 0.04, 0.98, 0.02);
    res.json({ latency, eqs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/execution/live-vs-paper
router.get("/live-vs-paper", async (_req, res) => {
  try {
    const comparison = ExecutionAnalyticsService.getLiveVsPaperComparison();
    res.json(comparison);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/execution/replay
router.post("/replay", async (req, res) => {
  try {
    const period = (req.body.period as any) || "YESTERDAY";
    const result = await ReplayEngine.replayPeriod(period);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/execution/report
router.get("/report", async (req, res) => {
  try {
    const format = (req.query.format as string) || "json";
    if (format === "markdown") {
      const md = await ReplayEngine.generateDailyValidationReport();
      res.type("text/markdown").send(md);
    } else {
      const comparison = ExecutionAnalyticsService.getLiveVsPaperComparison();
      res.json(comparison);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
