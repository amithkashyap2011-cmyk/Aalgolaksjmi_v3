/*
 * ─── Institutional Model Health Service ───────────────────────
 *
 * Computes 7-factor institutional health score (0–100):
 * Health = 0.20*Acc + 0.20*PF + 0.15*Sharpe + 0.15*Contrib + 0.10*Cal + 0.10*Stab + 0.10*(1-Drift)
 */

import { ModelHealth } from "../../models/ModelHealth.js";

export interface RawModelPerformance {
  winRatePct: number;
  profitFactor: number;
  sharpeRatio: number;
  contributionR: number;
  brierScore: number;
  predictionVariance: number;
  conceptDriftScore: number;
}

export class ModelHealthService {
  /**
   * Calculates 7-factor health score normalized between 0 and 100.
   */
  public static calculateHealth(perf: RawModelPerformance): any {
    const accuracyScore = Math.max(0, Math.min(100, perf.winRatePct));
    const profitFactorScore = Math.max(0, Math.min(100, (perf.profitFactor / 2.0) * 100));
    const sharpeScore = Math.max(0, Math.min(100, (perf.sharpeRatio / 2.5) * 100));
    const contributionScore = Math.max(0, Math.min(100, 50 + perf.contributionR * 20));
    const calibrationScore = Math.max(0, Math.min(100, (1 - perf.brierScore) * 100));
    const stabilityScore = Math.max(0, Math.min(100, 100 - perf.predictionVariance * 500));
    const driftScore = Math.max(0, Math.min(100, (1 - perf.conceptDriftScore) * 100));

    const overallHealthScore = +(
      (0.20 * accuracyScore) +
      (0.20 * profitFactorScore) +
      (0.15 * sharpeScore) +
      (0.15 * contributionScore) +
      (0.10 * calibrationScore) +
      (0.10 * stabilityScore) +
      (0.10 * driftScore)
    ).toFixed(2);

    return {
      accuracyScore: +accuracyScore.toFixed(1),
      profitFactorScore: +profitFactorScore.toFixed(1),
      sharpeScore: +sharpeScore.toFixed(1),
      contributionScore: +contributionScore.toFixed(1),
      calibrationScore: +calibrationScore.toFixed(1),
      stabilityScore: +stabilityScore.toFixed(1),
      driftScore: +driftScore.toFixed(1),
      overallHealthScore,
    };
  }

  public static async recordHealth(modelName: string, perf: RawModelPerformance): Promise<any> {
    const health = this.calculateHealth(perf);
    const record = await ModelHealth.create({
      modelName,
      ...health,
      evaluatedAt: new Date(),
    });
    return record;
  }
}
