/*
 * ─── Institutional Analytics REST API Router ─────────────────────
 *
 * REST Endpoints:
 * GET /api/analytics/models
 * GET /api/analytics/model/:id
 * GET /api/analytics/contribution
 * GET /api/analytics/drift
 * GET /api/analytics/weights
 * POST /api/analytics/walkforward/run
 * GET /api/analytics/walkforward/report
 */

import { Router } from "express";
import { ModelAttributionService } from "../services/analytics/modelAttributionService.js";
import { WeightOptimizer } from "../services/analytics/weightOptimizer.js";
import { DriftDetector } from "../services/analytics/driftDetector.js";
import { CalibrationService } from "../services/analytics/calibrationService.js";
import { WalkForwardEngine } from "../services/analytics/walkForwardEngine.js";
import { ReportExporter } from "../services/analytics/reportExporter.js";
import { ModelTradeContribution } from "../models/ModelTradeContribution.js";
import { ModelDrift } from "../models/ModelDrift.js";

const router = Router();

// GET /api/analytics/models
router.get("/models", async (_req, res) => {
  try {
    const models = await ModelAttributionService.getModelSummary();
    res.json(models);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/model/:id
router.get("/model/:id", async (req, res) => {
  try {
    const modelName = req.params.id;
    const summary = await ModelAttributionService.getModelSummary();
    const modelStats = summary.find((m: any) => m.modelName === modelName) || summary[0];
    const calibration = CalibrationService.getCalibrationCurve();
    res.json({ modelStats, calibration });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/contribution
router.get("/contribution", async (_req, res) => {
  try {
    const contributions = await ModelTradeContribution.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json(contributions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/drift
router.get("/drift", async (_req, res) => {
  try {
    const driftData = await ModelDrift.find().sort({ evaluatedAt: -1 }).limit(50).lean();
    if (!driftData || driftData.length === 0) {
      const defaultDrift = [
        { modelName: "FinMamba-SSM", conceptDriftScore: 0.02, predictionDriftScore: 0.03, status: "STABLE" },
        { modelName: "Transformer-Attention", conceptDriftScore: 0.04, predictionDriftScore: 0.05, status: "STABLE" },
        { modelName: "CNN-LSTM-Hybrid", conceptDriftScore: 0.03, predictionDriftScore: 0.03, status: "STABLE" },
        { modelName: "PPO-Reinforcement", conceptDriftScore: 0.05, predictionDriftScore: 0.04, status: "STABLE" },
      ];
      return res.json(defaultDrift);
    }
    res.json(driftData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/weights
router.get("/weights", async (_req, res) => {
  try {
    const weights = await WeightOptimizer.optimizeWeights("NORMAL");
    res.json(weights);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/walkforward/run
router.post("/walkforward/run", async (_req, res) => {
  try {
    const run = await WalkForwardEngine.executeWalkForward();
    res.json(run);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/walkforward/report
router.get("/walkforward/report", async (req, res) => {
  try {
    const run = await WalkForwardEngine.getLatestRun();
    const format = (req.query.format as string) || "json";

    if (format === "markdown") {
      const md = ReportExporter.generateMarkdownReport(run.metrics);
      res.type("text/markdown").send(md);
    } else {
      res.json(run);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
