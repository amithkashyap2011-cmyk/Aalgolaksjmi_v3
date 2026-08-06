/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Governance & Observability Routes (V8.1)
 * ═══════════════════════════════════════════════════════════════════
 */

import { Router } from "express";
import { ModelGovernanceService } from "../services/aqea/modelGovernance.js";
import { ShadowValidationService } from "../services/aqea/shadowValidation.js";
import { PaperValidationService } from "../services/aqea/paperValidation.js";
import { InstitutionalRiskEngine } from "../services/institutionalRisk.js";
import * as selfLearning from "../services/selfLearningService.js";
import { Trade } from "../models/Trade.js";
import * as paper from "../services/paperState.js";
import mongoose from "mongoose";

const router = Router();

/**
 * GET /api/aqea/governance/summary
 * High-level system readiness and model quality gates.
 */
router.get("/summary", async (req, res) => {
  try {
    const report = await ModelGovernanceService.getReadinessReport();
    const tradeAllowed = await ModelGovernanceService.isTradeAllowed();
    
    res.json({
      timestamp: new Date(),
      tradeAllowed,
      models: report
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/aqea/governance/shadow
 * Detailed shadow validation metrics (14-day window).
 */
router.get("/shadow", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: "userId required" });
    
    const report = await ShadowValidationService.getShadowReport(userId);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/aqea/governance/paper
 * Detailed paper validation metrics (100-trade window).
 */
router.get("/paper", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: "userId required" });
    
    const report = await PaperValidationService.getValidationSummary(userId);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/aqea/governance/observability
 * Combined health and status for dashboards.
 */
router.get("/observability", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const [gov, shadow, paperMetrics] = await Promise.all([
      ModelGovernanceService.getReadinessReport(),
      ShadowValidationService.getShadowReport(userId),
      PaperValidationService.getValidationSummary(userId)
    ]);
    const learning = await selfLearning.summarize(userId).catch(() => ({
      retrainWeekly: false,
      strategyDecayDetected: false,
      regimeChangeDetected: false,
      overfittingRisk: false,
      notes: ["Self-learning summary unavailable."],
    }));

    // Risk Status
    const wallet = paper.getWallet(userId, "PAPER", "FUTURES");
    const balance = wallet.get("USDT") ?? 0;
    const riskHealthy = await InstitutionalRiskEngine.validateSystemHealth(userId, balance);

    // Portfolio Heat (Open notional by symbol)
    const openTrades = await Trade.find({ userId: new mongoose.Types.ObjectId(userId), status: "OPEN" }).lean();
    const portfolioHeat: Record<string, number> = {};
    openTrades.forEach(t => {
      portfolioHeat[t.symbol] = (portfolioHeat[t.symbol] || 0) + (t.quantity * t.entryPrice);
    });

    res.json({
      aiHealth: gov,
      validation: {
        shadow,
        paper: paperMetrics
      },
      learning,
      risk: {
        status: riskHealthy ? "HEALTHY" : "CRITICAL",
        currentBalance: balance,
        circuitBreakerActive: !riskHealthy
      },
      portfolioHeat
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
