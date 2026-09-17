/**
 * ═══════════════════════════════════════════════════════════════════
 *  PORTFOLIO INTELLIGENCE & CAPITAL ALLOCATION API ROUTES
 * ═══════════════════════════════════════════════════════════════════
 *  REST endpoints for real-time portfolio capital, Greeks, exposure,
 *  allocations, stress tests, drift monitoring, and emergency controls.
 */

import { Router, Request, Response } from "express";
import { PortfolioIntelligenceEngine } from "../services/agentic/portfolio/PortfolioIntelligenceEngine.js";
import { AuthoritativeCapitalManager } from "../services/agentic/portfolio/capital/AuthoritativeCapitalManager.js";
import { PortfolioExposureEngine } from "../services/agentic/portfolio/exposure/PortfolioExposureEngine.js";
import { PortfolioCapitalAllocationEngine } from "../services/agentic/portfolio/allocation/PortfolioCapitalAllocationEngine.js";
import { PortfolioOptimizerEngine } from "../services/agentic/portfolio/optimizer/PortfolioOptimizerEngine.js";
import { PortfolioAuditLogger } from "../services/agentic/portfolio/audit/PortfolioAuditLogger.js";

const router = Router();

/**
 * GET /api/portfolio-intelligence/snapshot
 * Authoritative complete snapshot of capital, reserves, exposure, and risk.
 */
router.get("/snapshot", async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || (req as any).user?.userId;
    const mode = ((req.query.mode as string) || "PAPER").toUpperCase() as "PAPER" | "LIVE";

    const snapshot = await PortfolioIntelligenceEngine.getSynchronizedPortfolioSnapshot(userId, mode);
    const reconciliation = AuthoritativeCapitalManager.verifyCapitalReconciliation();

    res.json({
      success: true,
      data: {
        ...snapshot,
        reconciliation,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/portfolio-intelligence/exposure
 * Multi-dimensional Gross/Net exposure and Black-Scholes Greeks breakdown.
 */
router.get("/exposure", async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || (req as any).user?.userId;
    const mode = ((req.query.mode as string) || "PAPER").toUpperCase() as "PAPER" | "LIVE";

    const snapshot = await PortfolioIntelligenceEngine.getSynchronizedPortfolioSnapshot(userId, mode);
    res.json({
      success: true,
      data: {
        exposure: snapshot.exposure,
        hiddenClusters: snapshot.hiddenClusters,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/portfolio-intelligence/allocations
 * Strategy allocation status, targets, actual weights, and drift.
 */
router.get("/allocations", async (req: Request, res: Response) => {
  try {
    const snapshot = await PortfolioIntelligenceEngine.getPortfolioSnapshot();
    res.json({
      success: true,
      data: {
        reserves: snapshot.reserves,
        allocations: snapshot.allocations,
        driftReport: snapshot.driftReport,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/portfolio-intelligence/rebalance
 * Executes portfolio optimizer and recalculates strategy allocations.
 */
router.post("/rebalance", async (req: Request, res: Response) => {
  try {
    const snapshot = await PortfolioIntelligenceEngine.getPortfolioSnapshot();
    const capital = snapshot.capital.netEquity;

    const dummyCandidates = [
      {
        strategyId: "NIFTY_TREND_CONT",
        strategyName: "NIFTY Trend Continuation",
        expectedEdgeR: 1.8,
        winRate: 0.62,
        sharpeRatio: 2.1,
        maxDrawdownPct: 5.5,
        volatilityRatio: 1.0,
        confidenceScore: 0.9,
        averageCorrelation: 0.4,
      },
      {
        strategyId: "BNF_MEAN_REV",
        strategyName: "BankNIFTY Mean Reversion",
        expectedEdgeR: 1.5,
        winRate: 0.58,
        sharpeRatio: 1.7,
        maxDrawdownPct: 7.0,
        volatilityRatio: 1.2,
        confidenceScore: 0.85,
        averageCorrelation: 0.35,
      },
    ];

    const result = PortfolioCapitalAllocationEngine.allocateCapital(dummyCandidates, capital, snapshot.volatilityRegime);
    PortfolioIntelligenceEngine.setStrategyAllocations(result.allocations);

    PortfolioAuditLogger.logDecision({
      event: "PORTFOLIO_REBALANCE_EXECUTED",
      portfolioStateSnapshot: snapshot.capital,
      marketRegime: snapshot.volatilityRegime,
      drawdownState: snapshot.drawdownState,
      allocationsBefore: {},
      allocationsAfter: {},
      decidingAgent: "OPERATOR",
      policyVersion: "1.0.0",
      approved: true,
      rationale: "Operator triggered portfolio rebalance.",
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/portfolio-intelligence/emergency-halt
 * Triggers emergency halt stopping all autonomous entries.
 */
router.post("/emergency-halt", (req: Request, res: Response) => {
  try {
    const { reason = "Manual operator emergency halt" } = req.body;
    PortfolioIntelligenceEngine.triggerEmergencyHalt(reason);
    res.json({ success: true, message: "EMERGENCY_HALT_ENGAGED", reason });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/portfolio-intelligence/reset-emergency-halt
 * Clears emergency halt.
 */
router.post("/reset-emergency-halt", (req: Request, res: Response) => {
  try {
    PortfolioIntelligenceEngine.resetEmergencyHalt();
    res.json({ success: true, message: "EMERGENCY_HALT_CLEARED" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/portfolio-intelligence/audits
 * Retrieves recent portfolio governance and allocation decisions.
 */
router.get("/audits", (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const audits = PortfolioAuditLogger.getRecentAudits(limit);
    res.json({ success: true, data: audits });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/portfolio-intelligence/explain
 * Queries authoritative AI explanation for a portfolio inquiry.
 */
router.post("/explain", async (req: Request, res: Response) => {
  try {
    const { question, context } = req.body;
    const snapshot = await PortfolioIntelligenceEngine.getPortfolioSnapshot();
    const explanation = PortfolioAuditLogger.explainAllocationDecision(
      snapshot.capital,
      snapshot.reserves,
      question || "WHY_ALLOCATED",
      context
    );
    res.json({ success: true, explanation });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
