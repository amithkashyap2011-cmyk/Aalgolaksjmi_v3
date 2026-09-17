/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — RECONCILIATION AGENT
 * ═══════════════════════════════════════════════════════════════════
 * Specialization: Continuous detection of broker/local position,
 * order, and ledger mismatches.
 * 
 * Strict Constraint: READ + PROPOSE CORRECTION. MUST NOT silently
 * modify financial records.
 */

import { BaseAgent } from "./BaseAgent.js";
import { IStructuredAgentDecision, IAgentEvent, IAgentContextSnapshot } from "../types.js";

export class ReconciliationAgent extends BaseAgent {
  constructor() {
    super("ReconciliationAgent", "Specialist State Reconciliation Agent", "RECONCILIATION_AGENT", "READ_PROPOSE_CORRECTION");
  }

  protected async evaluate(event: IAgentEvent, context: IAgentContextSnapshot): Promise<IStructuredAgentDecision> {
    const isMismatch = event.type === "RECONCILIATION_MISMATCH" || context.systemHealth.reconciliationStatus === "MISMATCH";

    if (isMismatch) {
      return {
        decision: "RECONCILE",
        confidence: 1.0,
        rationale: "Position or order discrepancy detected between local authoritative ledger and broker report. Recommending immediate reconciliation and Auto-Pilot pause.",
        proposed_quantity: 0,
        risk_assessment: "STATE_DIVERGENCE_HIGH_SEVERITY",
        required_tools: ["request_reconciliation", "pause_autopilot"],
        blockingReason: "RECONCILIATION_DISCREPANCY_DETECTED"
      };
    }

    return {
      decision: "HOLD",
      confidence: 1.0,
      rationale: "Authoritative ledger perfectly synchronized with broker state (0 discrepancies).",
      proposed_quantity: 0,
      risk_assessment: "STATE_SYNCHRONIZED",
      required_tools: []
    };
  }
}
