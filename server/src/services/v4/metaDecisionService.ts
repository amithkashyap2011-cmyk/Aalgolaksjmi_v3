/*
 * ─── Meta Decision AI Service ───────────────────────────────
 *
 * Replaces simple consensus with Meta Decision AI:
 * 10 Models → Meta Ensemble → Meta Decision AI → Portfolio Intelligence → Risk Engine → Execution.
 */

import { TradeQualityEngine, TradeQualityInput } from "./tradeQualityEngine.js";
import { MarketRegimeEngine } from "./marketRegimeEngine.js";
import { PortfolioOptimizer } from "./portfolioOptimizer.js";

export interface MetaDecisionInput {
  symbol: string;
  consensusStrength: number;
  confidenceCalibration: number;
  historicalSimilarity: number;
  orderFlowScore: number;
  volatilityScore: number;
  liquidityScore: number;
  correlationScore: number;
  activeEquity: number;
  openPositionsNotional: number;
}

export class MetaDecisionService {
  public static async makeMetaDecision(input: MetaDecisionInput): Promise<any> {
    // 1. Classify Market Regime
    const regimeInfo = MarketRegimeEngine.classifyRegime(input.symbol);

    // 2. Compute Trade Quality Score (TQS)
    const tqsInput: TradeQualityInput = {
      symbol: input.symbol,
      consensusStrength: input.consensusStrength,
      confidenceCalibration: input.confidenceCalibration,
      historicalSimilarity: input.historicalSimilarity,
      marketRegime: regimeInfo.regime,
      orderFlowScore: input.orderFlowScore,
      volatilityScore: input.volatilityScore,
      liquidityScore: input.liquidityScore,
      correlationScore: input.correlationScore,
    };

    const quality = TradeQualityEngine.calculateQuality(tqsInput);

    // 3. Evaluate Systemic Portfolio Risk
    const portfolioRisk = PortfolioOptimizer.evaluateSystemicRisk(
      input.activeEquity,
      input.openPositionsNotional
    );

    // Gating Decision
    const approved = quality.allowedToExecute && !portfolioRisk.systemicRiskAlert;

    const result = {
      symbol: input.symbol,
      marketRegime: regimeInfo.regime,
      tradeQualityScore: quality.tradeQualityScore,
      action: quality.action,
      sizingMultiplier: quality.sizingMultiplier,
      approved,
      expectedEdgeR: +(0.5 + (quality.tradeQualityScore - 50) * 0.015).toFixed(2),
      portfolioHeatPct: portfolioRisk.portfolioHeatPct,
      var95Pct: portfolioRisk.var95Pct,
    };

    // Log quality
    await TradeQualityEngine.logQuality(tqsInput, quality);

    return result;
  }
}
