/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.2C — Router Regime Accuracy Audit
 * ═══════════════════════════════════════════════════════════════════
 */

import { RegimeState } from "../regimeEngine.js";

export interface RegimeAuditResult {
  confusionMatrix: Record<RegimeState, Record<RegimeState, number>>;
  accuracy: number;
  pfLeakageByRegime: Record<RegimeState, number>;
  falseTrendRate: number;
  falseRangeRate: number;
  falseTransitionRate: number;
}

export class RouterRegimeAudit {
  /**
   * Analyzes regime classification accuracy and its impact on PF.
   */
  public static analyze(samples: any[]): RegimeAuditResult {
    const regimes: RegimeState[] = ["TRENDING_BULL", "TRENDING_BEAR", "RANGING", "TRANSITION", "HIGH_VOLATILITY", "WEATHER_STRESS"];
    const matrix: any = {};
    regimes.forEach(r => {
      matrix[r] = {};
      regimes.forEach(r2 => matrix[r][r2] = 0);
    });

    let correct = 0;
    const pfLeakage: Record<RegimeState, number> = {
      TRENDING_BULL: 0,
      TRENDING_BEAR: 0,
      RANGING: 0,
      TRANSITION: 0,
      HIGH_VOLATILITY: 0,
      WEATHER_STRESS: 0
    };

    let totalTrend = 0;
    let falseTrend = 0;
    let totalRange = 0;
    let falseRange = 0;
    let totalTransition = 0;
    let falseTransition = 0;

    samples.forEach(s => {
      const pred = s.predictedRegime as RegimeState;
      const actual = s.actualRegime as RegimeState;

      matrix[actual][pred]++;

      if (pred === actual) {
        correct++;
      } else {
        // If misclassified, calculate potential PF loss
        // PF Leakage = (Baseline PF - Misclassified PF)
        pfLeakage[actual] += s.pfImpact || 0.01;
      }

      if (pred === "TRENDING_BULL" || pred === "TRENDING_BEAR") {
        totalTrend++;
        if (!actual.includes("TRENDING")) falseTrend++;
      }

      if (pred === "RANGING") {
        totalRange++;
        if (actual !== "RANGING") falseRange++;
      }

      if (pred === "TRANSITION") {
        totalTransition++;
        if (actual !== "TRANSITION") falseTransition++;
      }
    });

    return {
      confusionMatrix: matrix,
      accuracy: correct / samples.length,
      pfLeakageByRegime: pfLeakage,
      falseTrendRate: totalTrend > 0 ? falseTrend / totalTrend : 0,
      falseRangeRate: totalRange > 0 ? falseRange / totalRange : 0,
      falseTransitionRate: totalTransition > 0 ? falseTransition / totalTransition : 0
    };
  }

  /**
   * Generates 5000+ synthetic decisions for audit.
   */
  public static generateAuditData(count: number = 5500): any[] {
    const regimes: RegimeState[] = ["TRENDING_BULL", "TRENDING_BEAR", "RANGING", "TRANSITION", "HIGH_VOLATILITY"];
    const samples = [];

    for (let i = 0; i < count; i++) {
      const actualRegime = regimes[Math.floor(Math.random() * regimes.length)];
      
      // Misclassification logic (e.g., 75% accuracy)
      let predictedRegime = actualRegime;
      if (Math.random() > 0.75) {
        predictedRegime = regimes[Math.floor(Math.random() * regimes.length)];
      }

      // PF Impact: Misclassifying HIGH_VOLATILITY as TRENDING is costly
      let pfImpact = 0;
      if (actualRegime !== predictedRegime) {
        if (actualRegime === "HIGH_VOLATILITY" && predictedRegime.includes("TRENDING")) pfImpact = 0.15;
        else if (actualRegime === "TRANSITION") pfImpact = 0.10;
        else pfImpact = 0.05;
      }

      samples.push({
        predictedRegime,
        actualRegime,
        pfImpact
      });
    }

    return samples;
  }
}
