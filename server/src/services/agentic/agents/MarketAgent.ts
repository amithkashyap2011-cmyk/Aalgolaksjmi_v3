/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — MARKET AGENT
 * ═══════════════════════════════════════════════════════════════════
 * Specialization: Market state, volatility, liquidity, regime analysis,
 * and tick freshness verification.
 * 
 * Strict Constraint: READ-ONLY. NEVER places orders.
 */

import { BaseAgent } from "./BaseAgent.js";
import { IStructuredAgentDecision, IAgentEvent, IAgentContextSnapshot } from "../types.js";

export class MarketAgent extends BaseAgent {
  constructor() {
    super("MarketAgent", "Specialist Market & Regime Agent", "MARKET_AGENT", "READ_ONLY");
  }

  protected async evaluate(event: IAgentEvent, context: IAgentContextSnapshot): Promise<IStructuredAgentDecision> {
    const symbol = event.symbol || context.marketContext.symbol || "NIFTY";
    const marketData = await this.toolRegistry.invokeTool("get_market_data", { symbol }, this.role);

    const isVolatile = context.marketContext.volatility === "HIGH" || context.marketContext.atr > 150;
    const isTrending = context.marketContext.adx > 25;
    const regime = isTrending 
      ? (isVolatile ? "VOLATILE_TRENDING" : "STABLE_TRENDING") 
      : (isVolatile ? "CHOPPY" : "RANGING_COMPRESSED");

    return {
      decision: "HOLD",
      confidence: context.marketContext.isFresh ? 0.95 : 0.2,
      rationale: `Market assessment for ${symbol}: Regime is ${regime}. LTP=₹${marketData.ltp}, ATR=${context.marketContext.atr.toFixed(2)}, ADX=${context.marketContext.adx.toFixed(2)}. Tick freshness: ${context.marketContext.isFresh ? "FRESH" : "STALE"}.`,
      proposed_quantity: 0,
      risk_assessment: isVolatile ? "ELEVATED_VOLATILITY_CAUTION" : "NORMAL_RISK_ENVIRONMENT",
      required_tools: ["get_market_data"]
    };
  }
}
