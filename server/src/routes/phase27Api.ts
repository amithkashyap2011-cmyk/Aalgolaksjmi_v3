/*
 * ─── Phase 27: Autonomous Research REST Router ───────────────────
 *
 * REST Endpoints:
 * GET  /api/phase27/weaknesses
 * POST /api/phase27/hypotheses/generate
 * POST /api/phase27/experiments/run
 * GET  /api/phase27/reports
 * POST /api/phase27/promotions/approve
 */

import { Router } from "express";
import { WeaknessDetectorEngine } from "../services/phase27/weaknessDetectorEngine.js";
import { HypothesisGeneratorEngine } from "../services/phase27/hypothesisGeneratorEngine.js";
import { AutonomousResearchEngine } from "../services/phase27/autonomousResearchEngine.js";
import { ResearchHypothesis } from "../models/ResearchHypothesis.js";
import { ResearchReport } from "../models/ResearchReport.js";

const router = Router();

// GET /api/phase27/weaknesses
router.get("/weaknesses", (_req, res) => {
  try {
    const weaknesses = WeaknessDetectorEngine.scanTelemetry([
      { tradeId: "T1", strategyId: "STRAT_TREND", marketRegime: "HIGH_VOLATILITY", slippagePct: 0.06, holdingTimeMinutes: 20, pnlR: -0.5 },
    ]);
    res.json(weaknesses);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/phase27/hypotheses/generate
router.post("/hypotheses/generate", async (_req, res) => {
  try {
    const weaknesses = WeaknessDetectorEngine.scanTelemetry([
      { tradeId: "T1", strategyId: "STRAT_TREND", marketRegime: "HIGH_VOLATILITY", slippagePct: 0.06, holdingTimeMinutes: 20, pnlR: -0.5 },
    ]);
    const hypotheses = await HypothesisGeneratorEngine.generateHypotheses(weaknesses);
    res.json(hypotheses);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/phase27/experiments/run
router.post("/experiments/run", async (req, res) => {
  try {
    const { hypothesisId, candidateProfitFactor, candidateSharpe } = req.body;
    const result = await AutonomousResearchEngine.evaluateExperiment(
      hypothesisId || "HYP_SAMPLE_101",
      candidateProfitFactor ?? 1.95,
      candidateSharpe ?? 1.94
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/phase27/reports
router.get("/reports", async (_req, res) => {
  try {
    const reports = await ResearchReport.find().sort({ createdAt: -1 }).lean();
    res.json(reports);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/phase27/promotions/approve
router.post("/promotions/approve", async (req, res) => {
  try {
    const { reportId } = req.body;
    const result = await AutonomousResearchEngine.approvePromotion(reportId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
