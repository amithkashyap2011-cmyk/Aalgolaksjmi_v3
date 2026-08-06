/*
 * ─── Meta-Ensemble REST Router ──────────────────────────────
 *
 * REST Endpoints:
 * GET  /api/meta-ensemble/registry
 * GET  /api/meta-ensemble/health
 * POST /api/meta-ensemble/evaluate
 * POST /api/meta-ensemble/lifecycle/transition
 */

import { Router } from "express";
import { ModelRegistryService } from "../services/ensemble/modelRegistryService.js";
import { ModelHealthService } from "../services/ensemble/modelHealthService.js";
import { LifecycleManager } from "../services/ensemble/lifecycleManager.js";
import { MetaEnsembleEngine } from "../services/ensemble/metaEnsembleEngine.js";
import { ModelHealth } from "../models/ModelHealth.js";
import { ModelLifecycleLog } from "../models/ModelLifecycleLog.js";

const router = Router();

// GET /api/meta-ensemble/registry
router.get("/registry", async (_req, res) => {
  try {
    const registry = await ModelRegistryService.ensureRegistryInitialized();
    res.json(registry);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meta-ensemble/health
router.get("/health", async (_req, res) => {
  try {
    const healthLogs = await ModelHealth.find().sort({ evaluatedAt: -1 }).limit(50).lean();
    res.json(healthLogs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meta-ensemble/evaluate
router.post("/evaluate", async (req, res) => {
  try {
    const { predictions, context } = req.body;
    const consensus = await MetaEnsembleEngine.evaluateMetaConsensus(
      predictions || [],
      context || { symbol: "BTCUSDT", regime: "TRENDING", volatility: 0.01, orderFlowImbalance: 0.15 }
    );
    res.json(consensus);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meta-ensemble/lifecycle/transition
router.post("/lifecycle/transition", async (req, res) => {
  try {
    const { modelName, currentState, healthScore, rollingProfitFactor, rollingSharpe, rollingShadowTrades, conceptDriftScore } = req.body;
    const result = await LifecycleManager.executeTransition({
      modelName: modelName || "FinMamba-SSM",
      currentState: currentState || "ACTIVE",
      healthScore: healthScore ?? 35,
      rollingProfitFactor: rollingProfitFactor ?? 0.8,
      rollingSharpe: rollingSharpe ?? 0.3,
      rollingShadowTrades: rollingShadowTrades ?? 500,
      conceptDriftScore: conceptDriftScore ?? 0.05,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
