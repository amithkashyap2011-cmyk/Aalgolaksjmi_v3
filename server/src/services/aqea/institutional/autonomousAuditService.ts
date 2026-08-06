/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.4H — Autonomous Audit Service
 * ═══════════════════════════════════════════════════════════════════
 */

import { ResearchMetaAlphaAudit } from "../../../models/ResearchMetaAlphaAudit.js";
import { MetaAlphaPromotionGates } from "../research/MetaAlphaPromotionGates.js";
import { MetaAlphaPerformanceTracker } from "../research/MetaAlphaPerformanceTracker.js";

export class AutonomousAuditService {
  /**
   * Generates the Daily Shadow Report.
   */
  public static async generateDailyReport(): Promise<string> {
    const readiness = await MetaAlphaPromotionGates.evaluateReadiness();
    const metrics7d = await MetaAlphaPerformanceTracker.computeMetrics(7);

    const report = `
═══════════════════════════════════════════════════════════════════
 AQEA DAILY SHADOW REPORT (RESEARCH FROZEN)
═══════════════════════════════════════════════════════════════════

--- READINESS STATUS ---
Readiness Score:     ${readiness.readinessScore.toFixed(1)}/100
Decisions Collected: ${readiness.decisionsCollected}/5000
Trade Outcomes:      ${readiness.tradesOutcomeCollected}/2000
Promotion Status:    ${readiness.status}

--- PERFORMANCE (7-DAY WINDOW) ---
Profit Factor:       ${metrics7d?.profitFactor.toFixed(2) || "N/A"}
Win Rate:            ${(metrics7d?.winRate * 100).toFixed(2) || "N/A"}%
Avg Latency:         ${metrics7d?.avgLatency.toFixed(1) || "N/A"}ms

--- EVIDENCE GAPS ---
Required Decisions:  ${readiness.dataStillRequired.decisions}
Required Trades:     ${readiness.dataStillRequired.trades}

--- FINAL RECOMMENDATION ---
>>> ${readiness.status} <<<
═══════════════════════════════════════════════════════════════════
`;
    return report;
  }

  /**
   * Periodically checks for promotion readiness.
   */
  public static async checkAlerts(): Promise<void> {
    const readiness = await MetaAlphaPromotionGates.evaluateReadiness();
    if (readiness.status === "PROMOTE_TO_VOTING") {
      console.log("!!! ALERT: AQEA v2.4 META ALPHA IS READY FOR PROMOTION !!!");
    }
  }
}
