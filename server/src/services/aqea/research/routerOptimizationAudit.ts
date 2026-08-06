/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.2C — Router Optimization Audit (Phases 3, 4, 5)
 * ═══════════════════════════════════════════════════════════════════
 */

import { RegimeState } from "../regimeEngine.js";

export class RouterOptimizationAudit {
  /**
   * Phase 3: Counterfactual Simulation
   */
  public static runCounterfactual(samples: any[]): number {
    let bestPossibleWins = 0;
    let routerWins = 0;

    samples.forEach(s => {
      if (s.routerCorrect) routerWins++;
      
      // Best Possible: If any model was correct, count it as a best possible win
      if (s.modelA_Correct || s.modelB_Correct || s.modelC_Correct) {
        bestPossibleWins++;
      }
    });

    // Efficiency Score = RouterWins / BestPossibleWins
    return bestPossibleWins > 0 ? routerWins / bestPossibleWins : 0;
  }

  /**
   * Phase 4: Regime Confidence Calibration
   */
  public static calibrateConfidence(samples: any[]): any {
    const buckets = [0.5, 0.6, 0.7, 0.8, 0.9];
    const results: any = {};

    buckets.forEach(minConf => {
      const filtered = samples.filter(s => s.regimeConfidence >= minConf);
      if (filtered.length === 0) return;

      const wins = filtered.filter(s => s.routerCorrect).length;
      const pf = (wins * 1.5) / (filtered.length - wins);
      results[minConf] = { pf, count: filtered.length };
    });

    return results;
  }

  /**
   * Phase 5: Hybrid Router Experiment
   */
  public static simulateHybrid(samples: any[]): any {
    let hybridWins = 0;
    
    samples.forEach(s => {
      // Hybrid Logic Example for TRANSITION: 70% Transformer, 30% CNN
      if (s.actualRegime === "TRANSITION") {
        const roll = Math.random();
        if (roll < 0.7) {
            if (s.transformerCorrect) hybridWins++;
        } else {
            if (s.cnnCorrect) hybridWins++;
        }
      } else {
        // Fallback to router choice
        if (s.routerCorrect) hybridWins++;
      }
    });

    return {
      pf: (hybridWins * 1.5) / (samples.length - hybridWins),
      winRate: hybridWins / samples.length
    };
  }

  /**
   * Generates synthetic data for Phases 3-5.
   */
  public static generateData(count: number = 5000): any[] {
    const samples = [];
    for (let i = 0; i < count; i++) {
      const actualRegime = "TRANSITION"; // Focus on transition for demonstration
      const cnnCorrect = Math.random() > 0.5;
      const mambaCorrect = Math.random() > 0.6;
      const transformerCorrect = Math.random() > 0.4;
      
      const routerChose = "CNN"; // Router incorrectly chose CNN for TRANSITION
      const routerCorrect = cnnCorrect;

      samples.push({
        actualRegime,
        routerCorrect,
        cnnCorrect,
        mambaCorrect,
        transformerCorrect,
        modelA_Correct: cnnCorrect,
        modelB_Correct: mambaCorrect,
        modelC_Correct: transformerCorrect,
        regimeConfidence: 0.5 + Math.random() * 0.45
      });
    }
    return samples;
  }
}
