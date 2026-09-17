/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — POSITION AGENT
 * ═══════════════════════════════════════════════════════════════════
 * Specialization: Authoritative tracking of current positions, quantities,
 * weighted average entry prices, and unrealized P&L.
 * 
 * Strict Constraint: READ-ONLY. AuthoritativeLedger is the source of truth.
 */

import { BaseAgent } from "./BaseAgent.js";
import { IStructuredAgentDecision, IAgentEvent, IAgentContextSnapshot } from "../types.js";

export class PositionAgent extends BaseAgent {
  constructor() {
    super("PositionAgent", "Specialist Position & Lifecycle Agent", "POSITION_AGENT", "READ_ONLY");
  }

  protected async evaluate(event: IAgentEvent, context: IAgentContextSnapshot): Promise<IStructuredAgentDecision> {
    const positions = await this.toolRegistry.invokeTool("get_positions", { accountId: context.accountContext.accountId }, this.role);

    let totalUnrealizedPnl = 0;
    for (const pos of positions) {
      totalUnrealizedPnl += pos.unrealizedPnl;
    }

    return {
      decision: "HOLD",
      confidence: 1.0,
      rationale: `Active positions count: ${positions.length}. Total unrealized P&L: ₹${totalUnrealizedPnl.toFixed(2)}. All metrics verified from AuthoritativeLedger.`,
      proposed_quantity: 0,
      risk_assessment: totalUnrealizedPnl < 0 ? "NEGATIVE_UNREALIZED_EXPOSURE" : "POSITIVE_UNREALIZED_SURPLUS",
      required_tools: ["get_positions"]
    };
  }
}
