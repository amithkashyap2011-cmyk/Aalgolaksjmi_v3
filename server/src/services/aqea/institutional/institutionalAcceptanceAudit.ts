/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Institutional Acceptance Audit Orchestrator (Phase 7B)
 * ═══════════════════════════════════════════════════════════════════
 */

import { ChaosTestRunner } from "./chaosTestRunner.js";
import { SurvivabilityAnalyzer } from "./survivabilityAnalyzer.js";
import { GovernanceAudit } from "./governanceAudit.js";
import { DriftMonitor } from "./driftMonitor.js";
import { RegressionMonitor } from "./regressionMonitor.js";
import { CapitalTierManager } from "./capitalTierManager.js";
import { Trade } from "../../../models/Trade.js";
import mongoose from "mongoose";
import { toValidObjectId } from "../../../utils/mongoUtils.js";

export interface AcceptanceReport {
  overallStatus: "CERTIFIED FOR INSTITUTIONAL PRODUCTION" | "CONDITIONAL APPROVAL" | "REJECTED FOR PRODUCTION";
  performance: any;
  resilience: any;
  governance: any;
  driftDetection: any;
  recommendation: string;
}

export class InstitutionalAcceptanceAudit {
  /**
   * Executes the final production certification audit.
   */
  public static async runCompleteAudit(userId: string): Promise<AcceptanceReport> {
    const mode = "LIVE";

    // 1. Collect Performance Metrics
    const trades = await Trade.find({ userId: toValidObjectId(userId), mode, status: "CLOSED" }).sort({ closedAt: -1 }).limit(1000).lean();
    const pf = this.calculatePF(trades);
    const sharpe = this.calculateSharpe(trades);
    const maxDD = this.calculateMaxDD(trades);

    // 2. Run Resilience Chaos Tests
    const chaosResults = await Promise.all([
      ChaosTestRunner.runScenario("EXCHANGE_OUTAGE"),
      ChaosTestRunner.runScenario("AI_TIMEOUT")
    ]);

    // 3. Analyze Survivability
    const survivability = await SurvivabilityAnalyzer.analyze(userId);

    // 4. Run Governance Audit
    const governance = await GovernanceAudit.runAudit();

    // 5. Evaluate Drift Detection Accuracy
    const drift = await DriftMonitor.calculateDrift(userId);

    // Decision Logic
    const performancePassed = pf > 1.80 && sharpe > 1.80 && maxDD < 0.05;
    const resiliencePassed = chaosResults.every(r => r.status === "PASSED");
    const governancePassed = governance.complianceStatus === "PASSED";
    const survivabilityPassed = survivability.mttrMinutes < 5.0;

    let overallStatus: AcceptanceReport["overallStatus"] = "REJECTED FOR PRODUCTION";
    let recommendation = "System failed multiple institutional hurdles.";

    if (performancePassed && resiliencePassed && governancePassed && survivabilityPassed) {
       overallStatus = "CERTIFIED FOR INSTITUTIONAL PRODUCTION";
       recommendation = "System demonstrated exceptional resilience and profitability. Ready for large-scale deployment.";
    } else if (performancePassed || resiliencePassed) {
       overallStatus = "CONDITIONAL APPROVAL";
       recommendation = "System is profitable but requires stabilization of infrastructure or governance controls.";
    }

    return {
      overallStatus,
      performance: { pf, sharpe, maxDD: maxDD * 100 },
      resilience: chaosResults,
      governance,
      driftDetection: { driftScore: drift.score, status: drift.status },
      recommendation
    };
  }

  private static calculatePF(trades: any[]): number {
    const wins = trades.filter(t => (t.pnl || 0) > 0).reduce((a, b) => a + b.pnl, 0);
    const losses = Math.abs(trades.filter(t => (t.pnl || 0) < 0).reduce((a, b) => a + b.pnl, 0));
    return losses > 0 ? wins / losses : wins > 0 ? 9.99 : 0;
  }

  private static calculateSharpe(trades: any[]): number {
    const pnls = trades.map(t => t.pnl || 0);
    if (pnls.length < 2) return 0;
    const avg = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const std = Math.sqrt(pnls.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / pnls.length);
    return std > 0 ? (avg / std) * Math.sqrt(252) : 0;
  }

  private static calculateMaxDD(trades: any[]): number {
    let peak = 10000;
    let balance = 10000;
    let maxDD = 0;
    for (const t of trades) {
      balance += (t.pnl || 0);
      if (balance > peak) peak = balance;
      const dd = (peak - balance) / peak;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }
}
