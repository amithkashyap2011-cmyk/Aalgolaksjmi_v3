/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — PORTFOLIO AGENT (PHASE 11 ENHANCED)
 * ═══════════════════════════════════════════════════════════════════
 *  Specialization: Authoritative portfolio-level exposure, correlation,
 *  concentration caps, dynamic capital allocation, and reserve management.
 * 
 *  Strict Constraint: READ + PROPOSE. Operates under deterministic portfolio bounds.
 */

import { BaseAgent } from "./BaseAgent.js";
import { IStructuredAgentDecision, IAgentEvent, IAgentContextSnapshot } from "../types.js";
import { PortfolioIntelligenceEngine } from "../portfolio/PortfolioIntelligenceEngine.js";
import { PortfolioAuditLogger } from "../portfolio/audit/PortfolioAuditLogger.js";

export class PortfolioAgent extends BaseAgent {
  constructor() {
    super("PortfolioAgent", "Specialist Portfolio Allocation Agent", "PORTFOLIO_AGENT", "READ_PROPOSE");
  }

  protected async evaluate(event: IAgentEvent, context: IAgentContextSnapshot): Promise<IStructuredAgentDecision> {
    const snapshot = await PortfolioIntelligenceEngine.getPortfolioSnapshot();
    const marginUtilization = snapshot.capital.marginUtilizationPct;
    const drawdownState = snapshot.drawdownState;

    let decision: "HOLD" | "REDUCE" | "PAUSE" = "HOLD";
    let rationale = `Portfolio healthy. Margin utilization: ${marginUtilization.toFixed(
      1
    )}%. Net Equity: ₹${snapshot.capital.netEquity.toFixed(2)}. Reserve: ${snapshot.reserves.totalReservePct}%.`;

    if (PortfolioIntelligenceEngine.isEmergencyHalted() || drawdownState === "EMERGENCY") {
      decision = "PAUSE";
      rationale = `EMERGENCY_STATE: Portfolio in emergency state. Pausing all new autonomous allocations.`;
    } else if (drawdownState === "REDUCE_RISK" || marginUtilization > 75.0) {
      decision = "REDUCE";
      rationale = `Elevated risk detected (Drawdown: ${drawdownState}, Margin: ${marginUtilization.toFixed(
        1
      )}% > 75%). Recommending partial exposure trim and reserve capital preservation.`;
    } else if (snapshot.driftReport.rebalanceRequired) {
      decision = "HOLD";
      rationale = `Rebalance proposal active: ${snapshot.driftReport.rebalanceProposal?.reason}`;
    }

    return {
      decision,
      confidence: 0.92,
      rationale,
      proposed_quantity: 0,
      risk_assessment:
        marginUtilization > 75
          ? "ELEVATED_MARGIN_UTILIZATION"
          : drawdownState !== "NORMAL"
          ? "DRAWDOWN_GOVERNED_RISK"
          : "OPTIMAL_PORTFOLIO_DIVERSIFICATION",
      required_tools: ["get_account_state"],
    };
  }

  /**
   * Generates authoritative explanation for capital allocation decisions.
   */
  public async explainDecision(
    question: "WHY_ALLOCATED" | "WHY_REJECTED" | "WHY_REDUCED" | "WHY_RESERVE_HIGH",
    context?: { strategyId?: string; rejectionReason?: string; drawdownPct?: number }
  ): Promise<string> {
    const snapshot = await PortfolioIntelligenceEngine.getPortfolioSnapshot();
    return PortfolioAuditLogger.explainAllocationDecision(
      snapshot.capital,
      snapshot.reserves,
      question,
      context
    );
  }
}
