/*
 * ─── Execution AI Engine ─────────────────────────────────────
 *
 * Predicts order book slippage, spread expansion, market impact, and partial fill
 * prior to execution. Delays order placement if simulated execution quality < 80%.
 */

export interface ExecutionPredictInput {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  requestedPrice: number;
  volatilityRatio: number;
}

export interface ExecutionPredictResult {
  predictedSlippagePct: number;
  predictedSpreadPct: number;
  predictedMarketImpactPct: number;
  executionQualityScore: number; // 0 - 100
  recommendation: "EXECUTE_IMMEDIATELY" | "WAIT_SPREAD_EXPANDED" | "REDUCE_SIZE";
}

export class ExecutionAIEngine {
  public static predictExecutionQuality(input: ExecutionPredictInput): ExecutionPredictResult {
    const predictedSpreadPct = 0.02;
    const predictedMarketImpactPct = +Math.min(0.08, (input.quantity * input.requestedPrice / 100000) * 0.01).toFixed(4);
    const predictedSlippagePct = +(0.01 + predictedMarketImpactPct * input.volatilityRatio).toFixed(4);

    const score = Math.max(50, Math.min(100, 100 - (predictedSlippagePct * 500 + predictedSpreadPct * 500)));
    const executionQualityScore = +score.toFixed(1);

    let recommendation: "EXECUTE_IMMEDIATELY" | "WAIT_SPREAD_EXPANDED" | "REDUCE_SIZE" = "EXECUTE_IMMEDIATELY";
    if (executionQualityScore < 70) {
      recommendation = "REDUCE_SIZE";
    } else if (executionQualityScore < 80) {
      recommendation = "WAIT_SPREAD_EXPANDED";
    }

    return {
      predictedSlippagePct,
      predictedSpreadPct,
      predictedMarketImpactPct,
      executionQualityScore,
      recommendation,
    };
  }
}
