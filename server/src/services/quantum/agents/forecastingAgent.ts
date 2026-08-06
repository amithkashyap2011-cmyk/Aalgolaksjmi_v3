/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Agent 2: Forecasting Agent
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  QuantumAgent,
  AgentContext,
  AgentSignal,
  AgentHealth,
} from "../types.js";
import { ForecastingEngine } from "../forecastingEngine.js";

export class ForecastingAgent implements QuantumAgent {
  public name = "ForecastingAgent";
  public priority = 2; // Runs second

  private evaluationsCount = 0;
  private errorsCount = 0;
  private startTime = Date.now();

  public async evaluate(ctx: AgentContext): Promise<AgentSignal> {
    const start = Date.now();
    this.evaluationsCount++;

    try {
      const forecastEngine = ForecastingEngine.getInstance();
      
      // 1. Generate forecasts across all horizons
      const forecasts = await forecastEngine.generateForecasts(
        ctx.symbol,
        ctx.exchange,
        ctx.bars,
        ctx.indicators,
        ctx.regime
      );

      // 2. Synthesize multi-horizon signals into one unified forecast
      // We weight shorter timeframes (1m, 5m, 15m) higher for immediate trade execution
      // but long-term timeframes (1h, 4h, 1d) provide the structural trend filter.
      const weights: Record<string, number> = {
        "1m": 0.05,
        "5m": 0.15,
        "15m": 0.25,
        "1h": 0.25,
        "4h": 0.15,
        "1d": 0.10,
        "1w": 0.05,
      };

      let weightedLongProb = 0;
      let weightedShortProb = 0;
      let weightedConfidence = 0;
      let totalWeight = 0;

      forecasts.forEach(f => {
        const w = weights[f.timeframe] || 0.1;
        weightedLongProb += f.longProbability * w;
        weightedShortProb += f.shortProbability * w;
        weightedConfidence += f.confidence * w;
        totalWeight += w;
      });

      weightedLongProb /= totalWeight;
      weightedShortProb /= totalWeight;
      weightedConfidence /= totalWeight;

      let direction: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
      let strength = 0;
      
      const threshold = 0.53; // edge threshold
      if (weightedLongProb > threshold && weightedLongProb > weightedShortProb) {
        direction = "LONG";
        strength = (weightedLongProb - 0.5) * 2; // Scale between 0 and 1
      } else if (weightedShortProb > threshold && weightedShortProb > weightedLongProb) {
        direction = "SHORT";
        strength = -(weightedShortProb - 0.5) * 2; // Scale between -1 and 0
      }

      const latencyMs = Date.now() - start;

      return {
        agentName: this.name,
        direction,
        confidence: weightedConfidence,
        strength,
        timeHorizon: "15m", // primary execution signal horizon
        timestamp: Date.now(),
        metadata: {
          forecasts,
          weightedLongProb,
          weightedShortProb,
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
