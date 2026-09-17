/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — RISK AGENT
 * ═══════════════════════════════════════════════════════════════════
 * Specialization: Continuous monitoring of portfolio risk, capital usage,
 * daily drawdown, concentration limits, and vetoing unsafe proposals.
 * 
 * Strict Constraint: READ + VETO. Can VETO an action; CANNOT override
 * deterministic hard limits.
 */

import { BaseAgent } from "./BaseAgent.js";
import { IStructuredAgentDecision, IAgentEvent, IAgentContextSnapshot, IActionProposal } from "../types.js";

export class RiskAgent extends BaseAgent {
  constructor() {
    super("RiskAgent", "Specialist Risk Management & Veto Agent", "RISK_AGENT", "READ_VETO");
  }

  protected async evaluate(event: IAgentEvent, context: IAgentContextSnapshot): Promise<IStructuredAgentDecision> {
    const riskState = await this.toolRegistry.invokeTool("get_risk_state", { accountId: context.accountContext.accountId }, this.role);

    const isDailyLossNearCap = context.riskContext.dailyLoss >= context.riskContext.maxDailyLossLimit * 0.8;
    const isKillSwitchEngaged = riskState.killSwitchActive;

    if (isKillSwitchEngaged) {
      return {
        decision: "PAUSE",
        confidence: 1.0,
        rationale: `Global Trading Kill Switch is ACTIVE (${riskState.killSwitchReason}). Risk Agent forces full pause.`,
        proposed_quantity: 0,
        risk_assessment: "EMERGENCY_HALT_ACTIVE",
        required_tools: ["pause_autopilot"],
        blockingReason: "KILL_SWITCH_ACTIVE"
      };
    }

    if (isDailyLossNearCap) {
      return {
        decision: "REDUCE",
        confidence: 0.95,
        rationale: `Current daily loss ₹${context.riskContext.dailyLoss} has reached 80% of max limit ₹${context.riskContext.maxDailyLossLimit}. Disallowing new exposures.`,
        proposed_quantity: 0,
        risk_assessment: "RISK_BUDGET_NEAR_EXHAUSTION",
        required_tools: ["get_risk_state"],
        blockingReason: "DAILY_LOSS_THRESHOLD_80_PERCENT"
      };
    }

    return {
      decision: "HOLD",
      confidence: 0.9,
      rationale: `Risk bounds nominal. Daily loss at ${((context.riskContext.dailyLoss / (context.riskContext.maxDailyLossLimit || 1)) * 100).toFixed(1)}% of cap. Open positions: ${context.positionContext.openPositionsCount}.`,
      proposed_quantity: 0,
      risk_assessment: "WITHIN_ACCEPTABLE_BOUNDS",
      required_tools: ["get_risk_state"]
    };
  }

  /**
   * Evaluates an action proposal and exercises VETO authority if risk bounds are breached.
   */
  public evaluateVeto(proposal: IActionProposal, context: IAgentContextSnapshot): { vetoed: boolean; reason?: string } {
    if (context.riskContext.killSwitchActive) {
      return { vetoed: true, reason: "Risk Agent VETO: Global Kill Switch is engaged." };
    }

    if (context.riskContext.dailyLoss >= context.riskContext.maxDailyLossLimit) {
      return { vetoed: true, reason: `Risk Agent VETO: Daily loss limit ₹${context.riskContext.maxDailyLossLimit} breached.` };
    }

    if (proposal.action === "BUY" && context.positionContext.openPositionsCount >= 3) {
      return { vetoed: true, reason: "Risk Agent VETO: Max concurrent positions (3) reached." };
    }

    // Capital concentration check: No single position may exceed 40% of total equity
    const equity = context.riskContext.availableMargin + context.riskContext.usedMargin;
    const isIndex = proposal.instrument === "NIFTY" || proposal.instrument === "BANKNIFTY" || proposal.instrument === "FINNIFTY";
    const marginOutlay = isIndex ? proposal.quantity * (proposal.price || 1000) * 0.05 : proposal.quantity * (proposal.price || 1000);
    if (equity > 0 && marginOutlay > equity * 0.40) {
      return { vetoed: true, reason: `Risk Agent VETO: Proposal margin requirement ₹${marginOutlay.toFixed(2)} exceeds 40% concentration limit (₹${(equity * 0.4).toFixed(2)}).` };
    }

    return { vetoed: false };
  }
}
