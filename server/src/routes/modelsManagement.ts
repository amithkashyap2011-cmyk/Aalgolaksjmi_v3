/*
 * ─── Models Management REST Router ───────────────────────────
 *
 * REST Endpoints:
 * GET  /api/models
 * GET  /api/models/champion
 * GET  /api/models/challenger
 * GET  /api/models/leaderboard
 * POST /api/models/promote
 * POST /api/models/rollback
 * GET  /api/models/features
 */

import { Router } from "express";
import { ModelVersion } from "../models/ModelVersion.js";
import { FeatureStoreService } from "../services/championChallenger/featureStoreService.js";
import { ChampionChallengerEngine } from "../services/championChallenger/championChallengerEngine.js";
import { PromotionEvaluator } from "../services/championChallenger/promotionEvaluator.js";
import { RollbackManager } from "../services/championChallenger/rollbackManager.js";
import { DeploymentHistory } from "../models/DeploymentHistory.js";

const router = Router();

// GET /api/models
router.get("/", async (_req, res) => {
  try {
    const versions = await ModelVersion.find().sort({ createdAt: -1 }).lean();
    res.json(versions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/models/champion
router.get("/champion", async (_req, res) => {
  try {
    const champions = await ModelVersion.find({ role: "CHAMPION" }).lean();
    res.json(champions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/models/challenger
router.get("/challenger", async (_req, res) => {
  try {
    const challengers = await ModelVersion.find({ role: "CHALLENGER" }).lean();
    res.json(challengers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/models/leaderboard
router.get("/leaderboard", async (_req, res) => {
  try {
    const leaderboard = await ModelVersion.find().sort({ liveSharpe: -1, liveProfitFactor: -1 }).lean();
    res.json(leaderboard);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/models/promote
router.post("/promote", async (req, res) => {
  try {
    const { modelName, challengerVersion } = req.body;
    const result = await PromotionEvaluator.promoteChallenger(
      modelName || "FinMamba-SSM",
      challengerVersion || "v3.3.0-challenger"
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/models/rollback
router.post("/rollback", async (req, res) => {
  try {
    const { modelName } = req.body;
    const result = await RollbackManager.executeRollback(modelName || "FinMamba-SSM");
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/models/features
router.get("/features", async (_req, res) => {
  try {
    const features = await FeatureStoreService.ensureFeaturesInitialized();
    res.json(features);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
