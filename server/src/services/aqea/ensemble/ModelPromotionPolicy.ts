/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Model Promotion Policy & Governance Engine (Phase 17)
 * ═══════════════════════════════════════════════════════════════════
 * Strict fail-closed policy enforcing that NO shadow/benchmark/proxy
 * model is promoted to live voting weight without statistically
 * validated out-of-sample forward evidence.
 */

import { CompleteModelScorecard } from "./ModelScorecard.js";

export interface PromotionEvaluationResult {
  modelName: string;
  eligible: boolean;
  decision: "PROMOTED_TO_PRODUCTION" | "REMAIN_BENCHMARK" | "REMAIN_SHADOW" | "QUARANTINED";
  reasons: string[];
  metricsSnapshot: {
    sampleCount: number;
    brierScore: number;
    profitFactor: number;
    expectancyPercent: number;
    maxDrawdownPercent: number;
    deltaEV: number;
  };
}

export class ModelPromotionPolicy {
  public static readonly MIN_FORWARD_SAMPLES = 100;
  public static readonly MAX_ALLOWED_BRIER = 0.22;
  public static readonly MIN_PROFIT_FACTOR = 1.30;
  public static readonly MAX_ALLOWED_DRAWDOWN = 15.0;
  public static readonly MIN_DELTA_EV = 0.0;

  /**
   * Evaluates if a candidate or benchmark qualifies for live production voting weight.
   */
  public static evaluateCandidate(scorecard: CompleteModelScorecard): PromotionEvaluationResult {
    const reasons: string[] = [];
    const pred = scorecard.predictive;
    const trade = scorecard.trading;
    const inc = scorecard.incremental;

    const sampleCount = Math.max(pred.totalPredictions, trade.totalTrades);
    let eligible = true;

    if (sampleCount < this.MIN_FORWARD_SAMPLES) {
      eligible = false;
      reasons.push(`INSUFFICIENT_FORWARD_SAMPLES: ${sampleCount}/${this.MIN_FORWARD_SAMPLES} required`);
    }

    if (pred.brierScore > this.MAX_ALLOWED_BRIER) {
      eligible = false;
      reasons.push(`BRIER_SCORE_EXCEEDED: ${pred.brierScore.toFixed(4)} > ${this.MAX_ALLOWED_BRIER} threshold`);
    }

    if (trade.profitFactor < this.MIN_PROFIT_FACTOR) {
      eligible = false;
      reasons.push(`PROFIT_FACTOR_INSUFFICIENT: ${trade.profitFactor.toFixed(2)} < ${this.MIN_PROFIT_FACTOR} threshold`);
    }

    if (trade.expectancyPercent <= 0) {
      eligible = false;
      reasons.push(`EXPECTANCY_NON_POSITIVE: ${trade.expectancyPercent.toFixed(2)}% <= 0`);
    }

    if (trade.maxDrawdownPercent > this.MAX_ALLOWED_DRAWDOWN) {
      eligible = false;
      reasons.push(`DRAWDOWN_EXCESSIVE: ${trade.maxDrawdownPercent.toFixed(2)}% > ${this.MAX_ALLOWED_DRAWDOWN}% limit`);
    }

    if (inc.deltaEV < this.MIN_DELTA_EV) {
      eligible = false;
      reasons.push(`NEGATIVE_INCREMENTAL_EV: Delta EV ${inc.deltaEV.toFixed(4)}% < 0`);
    }

    let decision: "PROMOTED_TO_PRODUCTION" | "REMAIN_BENCHMARK" | "REMAIN_SHADOW" | "QUARANTINED" = "REMAIN_SHADOW";
    if (eligible) {
      decision = "PROMOTED_TO_PRODUCTION";
    } else if (scorecard.status === "BENCHMARK") {
      decision = "REMAIN_BENCHMARK";
    } else if (pred.brierScore > 0.30 || trade.maxDrawdownPercent > 25.0) {
      decision = "QUARANTINED";
    }

    return {
      modelName: scorecard.modelName,
      eligible,
      decision,
      reasons: reasons.length > 0 ? reasons : ["ALL_INSTITUTIONAL_CRITERIA_MET"],
      metricsSnapshot: {
        sampleCount,
        brierScore: pred.brierScore,
        profitFactor: trade.profitFactor,
        expectancyPercent: trade.expectancyPercent,
        maxDrawdownPercent: trade.maxDrawdownPercent,
        deltaEV: inc.deltaEV
      }
    };
  }
}
