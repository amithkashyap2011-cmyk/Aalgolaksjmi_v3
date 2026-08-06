/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Decision Attribution Route (V8.5.1)
 * ═══════════════════════════════════════════════════════════════════
 */
import { Router } from "express";
import { AqeaDecisionAttribution } from "../models/AqeaDecisionAttribution.js";
import { OutcomeAttributionService } from "../services/aqea/outcomeAttribution.js";
import mongoose from "mongoose";

const router = Router();

/**
 * GET /api/aqea-attribution/outcomes
 * Returns per-subsystem win rates and alpha contribution metrics.
 */
router.get("/outcomes", async (req, res) => {
  try {
    const stats = await OutcomeAttributionService.getOutcomeStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/aqea-attribution
...
 * Retrieves attribution data for a user's signals.
 */
router.get("/", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const limit = parseInt(req.query.limit as string) || 100;
    const skip = parseInt(req.query.skip as string) || 0;

    const attributions = await AqeaDecisionAttribution.find({
      userId: new mongoose.Types.ObjectId(userId)
    })
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip)
    .lean();

    res.json(attributions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/aqea/decision-attribution/stats
 * Aggregated attribution metrics.
 */
router.get("/stats", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: "userId required" });

    // Calculate agreement rate between CNN and Final Decision
    const total = await AqeaDecisionAttribution.countDocuments({ userId: new mongoose.Types.ObjectId(userId) });
    const cnnAgreement = await AqeaDecisionAttribution.countDocuments({ 
      userId: new mongoose.Types.ObjectId(userId),
      $expr: { $eq: ["$cnnPrediction", "$finalDecision"] }
    });

    res.json({
      totalSignals: total,
      cnnAgreementRate: total > 0 ? (cnnAgreement / total) * 100 : 0,
      factors: ["CNN", "Transformer", "OrderFlow", "SmartMoney", "Regime"]
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
