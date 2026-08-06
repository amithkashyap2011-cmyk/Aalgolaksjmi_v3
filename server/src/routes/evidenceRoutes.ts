/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI V5.2 — Evidence Repository REST API Router
 * ═══════════════════════════════════════════════════════════════════
 */

import express from "express";
import { EvidenceRepository } from "../evidence/evidenceRepository.js";
import { BenchmarkEngine } from "../evidence/benchmarkEngine.js";
import { TimelineGenerator } from "../evidence/timelineGenerator.js";
import { ReportGenerator } from "../evidence/reportGenerator.js";
import { TradeEvidence, ModelEvidence, StrategyEvidence } from "../models/Evidence.js";

const router = express.Router();

/**
 * GET /api/evidence/summary
 */
router.get("/summary", async (req, res) => {
  try {
    const userId = (req.query.userId as string) || "000000000000000000000000";
    const summary = await EvidenceRepository.getEvidenceSummary(userId);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/evidence/trades
 */
router.get("/trades", async (req, res) => {
  try {
    const userId = (req.query.userId as string) || "000000000000000000000000";
    const limit = parseInt(req.query.limit as string) || 50;
    const trades = await TradeEvidence.find().sort({ timestamp: -1 }).limit(limit).lean();
    res.json(trades);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/evidence/models
 */
router.get("/models", async (req, res) => {
  try {
    const models = await ModelEvidence.find().sort({ timestamp: -1 }).limit(50).lean();
    res.json(models);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/evidence/strategies
 */
router.get("/strategies", async (req, res) => {
  try {
    const strategies = await StrategyEvidence.find().sort({ timestamp: -1 }).limit(50).lean();
    res.json(strategies);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/evidence/benchmarks
 */
router.get("/benchmarks", async (req, res) => {
  try {
    const userId = (req.query.userId as string) || "000000000000000000000000";
    const asset = (req.query.asset as string) || "BTCUSDT";
    const result = await BenchmarkEngine.evaluateBenchmarks(userId, asset);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/evidence/timeline
 */
router.get("/timeline", async (req, res) => {
  try {
    const userId = (req.query.userId as string) || "000000000000000000000000";
    const timeline = await TimelineGenerator.getTimeline(userId);
    res.json(timeline);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/evidence/reports
 */
router.get("/reports", async (req, res) => {
  try {
    const userId = (req.query.userId as string) || "000000000000000000000000";
    const type = (req.query.type as string) || "AUDIT";
    const format = ((req.query.format as string)?.toUpperCase() as any) || "MARKDOWN";
    const report = await ReportGenerator.generateReport(userId, type, format);

    if (format === "CSV") {
      res.setHeader("Content-Type", "text/csv");
      return res.send(report);
    }

    res.json({ report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
