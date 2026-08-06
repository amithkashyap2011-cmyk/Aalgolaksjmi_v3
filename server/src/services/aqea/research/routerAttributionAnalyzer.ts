/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.2C — Router Model Attribution Analyzer
 * ═══════════════════════════════════════════════════════════════════
 */

import { PredictorType } from "../ai/types.js";

export interface AttributionResult {
  model: string;
  pfContribution: number;
  sharpeContribution: number;
  winRate: number;
  drawdown: number;
  failureMode: "ROUTING_ERROR" | "PREDICTION_ERROR" | "NONE";
}

export class RouterAttributionAnalyzer {
  /**
   * Analyzes model performance and identifies primary failure modes.
   */
  public static analyze(samples: any[]): Record<string, AttributionResult> {
    const models = ["CNN", "MAMBA", "TRANSFORMER"];
    const results: any = {};

    models.forEach(model => {
      const mSamples = samples.filter(s => s.selectedModel === model);
      if (mSamples.length === 0) return;

      const wins = mSamples.filter(s => s.correct).length;
      const winRate = wins / mSamples.length;
      const losses = mSamples.length - wins;
      const pf = losses > 0 ? (wins * 1.5) / losses : wins; // Mock PF calculation

      // Determine failure mode
      // ROUTING_ERROR: Model performs well, but was selected in the wrong regime
      // PREDICTION_ERROR: Model performs poorly even in its intended regime
      let failureMode: "ROUTING_ERROR" | "PREDICTION_ERROR" | "NONE" = "NONE";
      if (winRate < 0.55) failureMode = "PREDICTION_ERROR";
      else if (mSamples.some(s => s.regimeMismatch)) failureMode = "ROUTING_ERROR";

      results[model] = {
        model,
        pfContribution: pf - 1.0,
        sharpeContribution: (pf - 1.0) * 0.5,
        winRate,
        drawdown: 0.05 + Math.random() * 0.05,
        failureMode
      };
    });

    return results;
  }

  /**
   * Generates synthetic attribution data.
   */
  public static generateData(count: number = 5000): any[] {
    const models = ["CNN", "MAMBA", "TRANSFORMER"];
    const regimes = ["TRENDING_BULL", "TRENDING_BEAR", "RANGING", "TRANSITION", "HIGH_VOLATILITY"];
    const samples = [];

    for (let i = 0; i < count; i++) {
      const selectedModel = models[Math.floor(Math.random() * models.length)];
      const actualRegime = regimes[Math.floor(Math.random() * regimes.length)];
      
      // Intentional bias: MAMBA is weak in HIGH_VOLATILITY but sometimes selected
      const regimeMismatch = (selectedModel === "MAMBA" && actualRegime === "HIGH_VOLATILITY") ||
                             (selectedModel === "CNN" && actualRegime === "TRANSITION");

      let correct = Math.random() > 0.4; // Default 60% accuracy
      if (regimeMismatch) {
        correct = Math.random() > 0.55; // Drops to 45% accuracy in mismatch
      }

      samples.push({
        selectedModel,
        actualRegime,
        regimeMismatch,
        correct
      });
    }

    return samples;
  }
}
