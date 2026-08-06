/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Agent 6: Strategy Agent
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  QuantumAgent,
  AgentContext,
  AgentSignal,
  AgentHealth,
} from "../types.js";
import { computeSnapshot } from "../../indicatorService.js";
import { evaluateLakshmi } from "../../strategies/lakshmiStrategy.js";
import { evaluateAaryan } from "../../strategies/aaryanStrategy.js";
import { evaluateAayush } from "../../strategies/aayushStrategy.js";
import { evaluateGayatri } from "../../strategies/gayatriStrategy.js";
import { evaluateOhmkara } from "../../strategies/ohmkaraStrategy.js";

export class StrategyAgent implements QuantumAgent {
  public name = "StrategyAgent";
  public priority = 6;

  private evaluationsCount = 0;
  private errorsCount = 0;
  private startTime = Date.now();

  public async evaluate(ctx: AgentContext): Promise<AgentSignal> {
    const start = Date.now();
    this.evaluationsCount++;

    try {
      // 1. Convert ctx.bars into indicators required by legacy strategies
      const legacyBars = ctx.bars.map(b => ({
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }));
      const indSnapshot = computeSnapshot(legacyBars);

      // 2. Evaluate all 5 strategies in parallel
      const lakshmi = evaluateLakshmi(indSnapshot);
      const aaryan = evaluateAaryan(indSnapshot);
      const aayush = evaluateAayush(indSnapshot);
      const gayatri = evaluateGayatri(indSnapshot);
      const ohmkara = evaluateOhmkara(indSnapshot);

      // 3. Regime-based weighting
      // Define baseline weights
      const weights: Record<string, number> = {
        LAKSHMI: 0.25,  // Fusion trend/momentum
        AARYAN: 0.20,   // Confirmed breakout
        AAYUSH: 0.20,   // Swing trend rider
        GAYATRI: 0.20,  // Mean reversion (RSI/Bollinger)
        OHMKARA: 0.15,  // Pivot / Support-Resistance breakout
      };

      // Adjust weights according to market regime
      const regime = ctx.regime;
      if (regime === "SIDEWAYS" || regime === "LOW_VOLATILITY") {
        // Boost mean-reversion, nerf trend
        weights.GAYATRI = 0.40;
        weights.LAKSHMI = 0.15;
        weights.AARYAN = 0.10;
        weights.AAYUSH = 0.15;
        weights.OHMKARA = 0.20;
      } else if (regime === "STRONG_BULL" || regime === "STRONG_BEAR") {
        // Boost trend following and breakouts
        weights.LAKSHMI = 0.35;
        weights.AARYAN = 0.30;
        weights.AAYUSH = 0.20;
        weights.GAYATRI = 0.05;
        weights.OHMKARA = 0.10;
      } else if (regime === "HIGH_VOLATILITY" || regime === "CORRELATION_SHOCK") {
        // Increase OHMKARA (levels/pivots) and LAKSHMI (robust fusion)
        weights.LAKSHMI = 0.30;
        weights.OHMKARA = 0.30;
        weights.GAYATRI = 0.10;
        weights.AARYAN = 0.15;
        weights.AAYUSH = 0.15;
      }

      // 4. Compute weighted signals
      let longWeightedScore = 0;
      let shortWeightedScore = 0;
      let totalWeight = 0;

      const evalStrategy = (name: string, result: any) => {
        const w = weights[name] || 0.2;
        totalWeight += w;
        if (result.signal === "BUY") {
          longWeightedScore += result.confidence * w;
        } else if (result.signal === "SELL") {
          shortWeightedScore += result.confidence * w;
        }
      };

      evalStrategy("LAKSHMI", lakshmi);
      evalStrategy("AARYAN", aaryan);
      evalStrategy("AAYUSH", aayush);
      evalStrategy("GAYATRI", gayatri);
      evalStrategy("OHMKARA", ohmkara);

      longWeightedScore /= totalWeight;
      shortWeightedScore /= totalWeight;

      let direction: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
      let strength = 0;
      let confidence = 0.5;

      const threshold = 0.25; // Weighted threshold for buy/sell bias
      if (longWeightedScore > threshold && longWeightedScore > shortWeightedScore) {
        direction = "LONG";
        strength = longWeightedScore;
        confidence = 0.7;
      } else if (shortWeightedScore > threshold && shortWeightedScore > longWeightedScore) {
        direction = "SHORT";
        strength = -shortWeightedScore; // negative represents short bias
        confidence = 0.7;
      }

      const latencyMs = Date.now() - start;

      return {
        agentName: this.name,
        direction,
        confidence,
        strength,
        timeHorizon: "1h",
        timestamp: Date.now(),
        metadata: {
          strategySignals: {
            LAKSHMI: { signal: lakshmi.signal, confidence: lakshmi.confidence },
            AARYAN: { signal: aaryan.signal, confidence: aaryan.confidence },
            AAYUSH: { signal: aayush.signal, confidence: aayush.confidence },
            GAYATRI: { signal: gayatri.signal, confidence: gayatri.confidence },
            OHMKARA: { signal: ohmkara.signal, confidence: ohmkara.confidence },
          },
          strategyWeights: weights,
          longWeightedScore,
          shortWeightedScore,
          latencyMs,
        },
      };
    } catch (err) {
      this.errorsCount++;
      throw err;
    }
  }

  public getHealth(): AgentHealth {
    return {
      name: this.name,
      status: this.errorsCount > 0 ? (this.errorsCount / this.evaluationsCount > 0.1 ? "DEGRADED" : "HEALTHY") : "HEALTHY",
      lastEvaluation: Date.now(),
      latencyMs: 1,
      errorRate: this.evaluationsCount > 0 ? this.errorsCount / this.evaluationsCount : 0,
      uptime: (Date.now() - this.startTime) / 1000,
    };
  }

  public canVeto(): boolean {
    return false;
  }
}
