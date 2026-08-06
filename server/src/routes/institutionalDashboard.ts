/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Institutional Dashboard API (Phase 7A)
 * ═══════════════════════════════════════════════════════════════════
 */

import { Router } from "express";
import { authGuard, adminGuard, type AuthRequest } from "../middleware/auth.js";
import { CapitalTierManager } from "../services/aqea/institutional/capitalTierManager.js";
import { DriftMonitor } from "../services/aqea/institutional/driftMonitor.js";
import { RegressionMonitor } from "../services/aqea/institutional/regressionMonitor.js";
import { PortfolioCorrelationMonitor } from "../services/production/correlationMonitor.js";
import { InstitutionalAcceptanceAudit } from "../services/aqea/institutional/institutionalAcceptanceAudit.js";
import { InstitutionalCertificationService } from "../services/aqea/institutional/institutionalCertificationService.js";

const router = Router();

/**
 * GET /institutional/certification
 * Detailed production readiness scorecard.
 */
router.get("/certification", authGuard, async (req: AuthRequest, res) => {
  try {
    const report = await InstitutionalCertificationService.runCertification(req.userId!);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /institutional/audit
 * Executes the final production certification audit.
 */
router.post("/audit", authGuard, adminGuard, async (req: AuthRequest, res) => {
  try {
    const report = await InstitutionalAcceptanceAudit.runCompleteAudit(req.userId!);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /institutional/status
 * Comprehensive institutional overview.
 */
router.get("/status", authGuard, adminGuard, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const mode = "LIVE";

    const [tier, drift, regression, correlation] = await Promise.all([
      CapitalTierManager.getActiveTier(userId, mode),
      DriftMonitor.calculateDrift(userId),
      RegressionMonitor.analyzeRegression(userId, mode),
      PortfolioCorrelationMonitor.generateReport(userId, mode)
    ]);

    res.json({
      timestamp: new Date(),
      tier,
      drift,
      regressionAlerts: regression,
      correlation
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
