/*
 * ─── Models Route ──────────────────────────────────────
 *
 * REST API for the AI Model Registry.
 *   GET  /models              → list all models
 *   POST /models/:id/toggle   → enable/disable a model
 *   POST /models/:id/weight   → update model weight
 *   POST /models/weights      → bulk weight update
 *   POST /models/health-check → trigger health checks
 *   POST /models/reset        → reset to defaults
 */

import { Router } from "express";
import * as registry from "../services/modelRegistry.js";
import { weatherIntelligenceEngine } from "../services/weatherIntelligenceEngine.js";
import { AI_ENDPOINTS, buildEndpointUrl } from "../config/aiEndpointRegistry.js";
import { getQuantEngineURL } from "../config/serviceDiscovery.js";
import { authGuard, adminGuard } from "../middleware/auth.js";
import { ModelAccuracyMetrics } from "../models/AIPredictionTelemetry.js";

// registry id → model_name in the modelaccuracymetrics collection (written
// by aiTelemetryService as live predictions resolve). PPO is deliberately
// absent: it is an execution/sizing agent whose "direction" is always HOLD,
// so a directional-accuracy number for it only measures how often the
// market stays flat — a category error, not a metric.
const LIVE_METRIC_NAMES: Record<string, string> = {
  "cnn": "CNN_1D_V1",
  "transformer": "TRANSFORMER_MICRO_V1",
  "mamba-hybrid": "MAMBA_V1",
};

const router = Router();

/**
 * GET /models/health
 * Proxies model health from the Python Quant Engine using dynamic discovery.
 */
router.get("/health", async (_req, res) => {
  try {
    const baseUrl = await getQuantEngineURL();
    const paths = [AI_ENDPOINTS.MODEL_HEALTH, AI_ENDPOINTS.HEALTH];

    for (const path of paths) {
      const url = `${baseUrl}${path}`;
      try {
        console.log(`[PROXY] Attempting fetch: ${url}`);
        const engineRes = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (engineRes.ok) {
          const data = await engineRes.json();
          return res.json(data);
        }
      } catch (err: any) {
        console.error(`[PROXY] fetch_error url=${url} error=${err.message}`);
      }
    }
    res.status(500).json({ error: "All health endpoints failed" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /models/training-status
 * Proxies the quant engine's continuous-learning status (last cycle,
 * per-model promotion history) so the client doesn't need to know the
 * quant engine's dynamically-allocated port.
 */
router.get("/training-status", async (_req, res) => {
  try {
    const baseUrl = await getQuantEngineURL();
    const url = `${baseUrl}/health/training`;
    const engineRes = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!engineRes.ok) {
      return res.status(502).json({ error: `Quant engine returned ${engineRes.status}` });
    }
    const data = await engineRes.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── List all models ── */
router.get("/", async (_req, res) => {
  try {
    // Copy before overlaying — getAllModels() hands back registry-internal
    // objects and mutating them would corrupt the registry for every
    // later request.
    const models = registry.getAllModels().map((m: any) => ({ ...m, metrics: { ...m.metrics } }));

    // The registry's directionalAccuracy values are hand-written estimates.
    // Where we HAVE a live measurement (rolling accuracy over the last 500
    // resolved predictions), show that instead — the UI must not display
    // "92.4%" while the measured number is ~30%. Models without live
    // measurement keep their estimate, explicitly labelled.
    await Promise.all(models.map(async (m: any) => {
      if (m.id === "ppo-agent") {
        m.metrics.directionalAccuracy = "n/a — execution agent";
        return;
      }
      const metricName = LIVE_METRIC_NAMES[m.id];
      if (metricName) {
        try {
          const doc: any = await ModelAccuracyMetrics.findOne({ model_name: metricName })
            .sort({ timestamp: -1 }).lean();
          if (doc && typeof doc.rolling500_accuracy === "number") {
            m.metrics.directionalAccuracy = `${doc.rolling500_accuracy.toFixed(1)}% measured`;
            return;
          }
        } catch { /* DB unavailable — fall through to the labelled estimate */ }
      }
      if (!/measured|est\./.test(m.metrics.directionalAccuracy)) {
        m.metrics.directionalAccuracy += " (est.)";
      }
    }));

    const weights = registry.getEnsembleWeights();
    res.json({ models, normalizedWeights: weights });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Toggle model enable/disable ── */
router.post("/:id/toggle", authGuard, (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled (boolean) is required" });
    }
    const model = registry.setModelEnabled(id, enabled);
    if (!model) {
      return res.status(404).json({ error: `Model '${id}' not found` });
    }
    res.json({ model, normalizedWeights: registry.getEnsembleWeights() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Update single model weight ── */
router.post("/:id/weight", authGuard, adminGuard, (req, res) => {
  try {
    const { id } = req.params;
    const { weight } = req.body;
    if (typeof weight !== "number" || weight < 0 || weight > 1) {
      return res.status(400).json({ error: "weight (0-1) is required" });
    }
    const model = registry.setModelWeight(id, weight);
    if (!model) {
      return res.status(404).json({ error: `Model '${id}' not found or disabled` });
    }
    res.json({ model, normalizedWeights: registry.getEnsembleWeights() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Bulk weight update ── */
router.post("/weights", authGuard, adminGuard, (req, res) => {
  try {
    const { weights } = req.body;
    if (!weights || typeof weights !== "object") {
      return res.status(400).json({ error: "weights object is required" });
    }
    registry.setBulkWeights(weights);
    res.json({ models: registry.getAllModels(), normalizedWeights: registry.getEnsembleWeights() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Trigger health checks ── */
router.post("/health-check", async (_req, res) => {
  try {
    await registry.runHealthChecks();
    res.json({ models: registry.getAllModels() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Reset to defaults ── */
router.post("/reset", authGuard, adminGuard, (_req, res) => {
  try {
    registry.resetToDefaults();
    res.json({ models: registry.getAllModels(), normalizedWeights: registry.getEnsembleWeights() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Weather Effect on Market (global on/off + influence) ── */
router.get("/weather-effect", (_req, res) => {
  res.json({
    enabled: weatherIntelligenceEngine.isEnabled(),
    influence: weatherIntelligenceEngine.getInfluence(),
  });
});

router.post("/weather-effect", authGuard, (req, res) => {
  try {
    const { enabled, influence } = req.body ?? {};
    if (typeof enabled === "boolean") weatherIntelligenceEngine.setEnabled(enabled);
    if (typeof influence === "number") weatherIntelligenceEngine.setInfluence(influence);
    res.json({
      enabled: weatherIntelligenceEngine.isEnabled(),
      influence: weatherIntelligenceEngine.getInfluence(),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
