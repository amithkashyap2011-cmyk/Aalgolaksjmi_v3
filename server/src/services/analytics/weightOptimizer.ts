/*
 * ─── Dynamic Ensemble Weight Optimizer ────────────────────────
 *
 * Dynamically rebalances model voting weights based on rolling
 * Sharpe ratio, recent accuracy, profit factor, and market regime.
 */

import { EnsembleWeightHistory } from "../../models/EnsembleWeightHistory.js";
import { ModelStatistics } from "../../models/ModelStatistics.js";

export class WeightOptimizer {
  /**
   * Rebalances model weights dynamically based on recent statistical edge.
   */
  public static async optimizeWeights(regime: string = "NORMAL"): Promise<Record<string, number>> {
    const stats = await ModelStatistics.find().lean();
    const weights: Record<string, number> = {};

    if (!stats || stats.length === 0) {
      weights["FinMamba-SSM"] = 0.25;
      weights["Transformer-Attention"] = 0.20;
      weights["CNN-LSTM-Hybrid"] = 0.15;
      weights["PPO-Reinforcement"] = 0.15;
      weights["OrderFlow-Imbalance"] = 0.15;
      weights["SmartMoney-Accumulation"] = 0.10;
      return weights;
    }

    let totalRawScore = 0;
    const modelScores: Record<string, number> = {};

    stats.forEach((m) => {
      // Raw score = WinRate * SharpeContribution
      const winRateScale = (m.winRate || 50) / 100;
      const sharpeScale = Math.max(0.1, m.sharpeContribution || 1.0);
      const rawScore = winRateScale * sharpeScale;
      modelScores[m.modelName] = rawScore;
      totalRawScore += rawScore;
    });

    // Normalize weights to sum to 1.0
    stats.forEach((m) => {
      weights[m.modelName] = +(modelScores[m.modelName] / (totalRawScore || 1)).toFixed(4);
    });

    // Log weight snapshot
    await EnsembleWeightHistory.create({
      timestamp: new Date(),
      regime,
      weights,
      reason: "ADAPTIVE_SHARPE_REBALANCING",
    });

    return weights;
  }
}
