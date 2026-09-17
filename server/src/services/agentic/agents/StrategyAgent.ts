/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — STRATEGY AGENT
 * ═══════════════════════════════════════════════════════════════════
 * Specialization: Evaluating configured strategies, ranking candidate
 * opportunities, calculating strategy confidence, and generating
 * structured trade proposals.
 * 
 * Strict Constraint: READ + PROPOSE. NEVER sends broker orders.
 */

import { BaseAgent } from "./BaseAgent.js";
import { IStructuredAgentDecision, IAgentEvent, IAgentContextSnapshot, IActionProposal } from "../types.js";

export class StrategyAgent extends BaseAgent {
  constructor() {
    super("StrategyAgent", "Specialist Quantitative Strategy Agent", "STRATEGY_AGENT", "READ_PROPOSE");
  }

  protected async evaluate(event: IAgentEvent, context: IAgentContextSnapshot): Promise<IStructuredAgentDecision> {
    const symbol = event.symbol || context.marketContext.symbol || "NIFTY";
    const marketData = await this.toolRegistry.invokeTool("get_market_data", { symbol }, this.role);

    // Evaluate strategy signal based on event and market conditions
    let decision: "BUY" | "SELL" | "EXIT" | "HOLD" = "HOLD";
    let confidence = 0.5;
    let rationale = "No high-conviction setup detected in current market regime.";
    let proposedQuantity = 0;

    if (event.type === "TARGET_APPROACHING" || event.type === "STOP_APPROACHING") {
      decision = "EXIT";
      confidence = 0.92;
      rationale = `Position trigger event ${event.type} detected. Recommending managed exit.`;
    } else if (
      event.type === "SIGNIFICANT_PRICE_MOVE" ||
      event.type === "MARKET_REGIME_CHANGE" ||
      event.type === "PRICE_BREAKOUT"
    ) {
      const isBullish = context.marketContext.adx > 25 && marketData.ltp > 24000;
      if (isBullish && context.positionContext.openPositionsCount < 3) {
        decision = "BUY";
        confidence = 0.85;
        proposedQuantity = marketData.lotSize; // 1 lot within margin limits
        rationale = `Strong breakout momentum detected on ${symbol}. Recommending 1 lot entry.`;
      }
    }

    return {
      decision,
      confidence,
      rationale,
      proposed_quantity: proposedQuantity,
      risk_assessment: "Strategy risk parameters aligned with standard ATR bounds.",
      required_tools: ["get_market_data", "propose_trade"]
    };
  }

  public createProposal(
    symbol: string,
    action: "BUY" | "SELL" | "EXIT",
    quantity: number,
    price: number,
    confidence: number,
    reason: string,
    context: IAgentContextSnapshot
  ): IActionProposal {
    return {
      actionId: `PROP_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      agentId: this.id,
      accountId: context.accountContext.accountId || "guest-user",
      instrument: symbol,
      action,
      side: action === "EXIT" ? undefined : action,
      quantity,
      orderType: "MARKET",
      price,
      reason,
      confidence,
      timestamp: Date.now(),
      strategyId: context.strategyContext.strategyId || "MOMENTUM_AI_V2",
      riskSnapshot: {
        dailyLoss: context.riskContext.dailyLoss,
        availableCapital: context.riskContext.availableMargin,
        openPositions: context.positionContext.openPositionsCount,
        currentDrawdown: 0,
        portfolioExposure: context.riskContext.portfolioHeatPercent
      }
    };
  }
}
