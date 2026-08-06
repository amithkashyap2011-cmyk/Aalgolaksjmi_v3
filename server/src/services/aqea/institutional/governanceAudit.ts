/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Governance Audit Service (Phase 7B)
 * ═══════════════════════════════════════════════════════════════════
 */

import { AqeaProductionAudit } from "../../../models/AqeaProductionAudit.js";

export interface GovernanceReport {
  totalActions: number;
  unauthorizedAttempts: number;
  riskViolations: number;
  lastManualOverride: Date | null;
  complianceStatus: "PASSED" | "FAILED";
}

export class GovernanceAudit {
  /**
   * Audits the system for compliance with institutional governance rules.
   */
  public static async runAudit(): Promise<GovernanceReport> {
    // 1. Fetch Audit Logs
    const allLogs = await AqeaProductionAudit.find({ level: { $in: ["CRITICAL", "SECURITY"] } }).lean();

    const unauthorized = allLogs.filter(l => l.event === "UNAUTHORIZED_ACCESS_ATTEMPT").length;
    const riskViolations = allLogs.filter(l => l.event === "RISK_LIMIT_VIOLATION").length;
    
    const manualOverrides = allLogs.filter(l => l.event === "MANUAL_OVERRIDE_EXECUTED");
    const lastOverride = manualOverrides.length > 0 ? manualOverrides[manualOverrides.length-1].timestamp : null;

    return {
      totalActions: allLogs.length,
      unauthorizedAttempts: unauthorized,
      riskViolations: riskViolations,
      lastManualOverride: lastOverride,
      complianceStatus: (unauthorized === 0 && riskViolations === 0) ? "PASSED" : "FAILED"
    };
  }
}
