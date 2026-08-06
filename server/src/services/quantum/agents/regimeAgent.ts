/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Agent 1: Regime Detector
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  QuantumAgent,
  AgentContext,
  AgentSignal,
  AgentHealth,
} from "../types.js";
import { getRegimeReport } from "../../spectralRegimeService.js";

export class RegimeAgent implements QuantumAgent {
  public name = "RegimeAgent";
  public priority = 1; // Highest priority, runs first

  private evaluationsCount = 0;
  private errorsCount = 0;
  private startTime = Date.now();

  public async evaluate(ctx: AgentContext): Promise<AgentSignal> {
    const start = Date.now();
    this.evaluationsCount++;

    try {
      // 1. Fetch spectral regime report
      const spectralReport = getRegimeReport();
      const absorptionRatio = spectralReport.absorptionRatio;
      const shieldActive = spectralReport.shieldActive;

      // 2. Extract local indicators
      const hurst = ctx.indicators.hurstExponent ?? 0.5; // 0.5 is random walk
      const volatility = ctx.regime;

      // Determine trending vs mean-reverting regime
      // Hurst > 0.55 -> trending (persistent)
      // Hurst < 0.45 -> mean-reverting (anti-persistent)
      // Otherwise -> random walk
      let trendingType = "RANDOM_WALK";
      if (hurst > 0.55) trendingType = "PERSISTENT_TREND";
      if (hurst < 0.45) trendingType = "MEAN_REVERTING";

      // Veto logic: veto if spectral shield active or extreme correlation shock
      const shouldVeto = shieldActive || absorptionRatio > 0.70 || volatility === "CORRELATION_SHOCK";

      let direction: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
      let strength = 0;
      let confidence = 0.5;

      if (shouldVeto) {
        direction = "NEUTRAL";
        strength = -1.0; // strong defense
        confidence = 0.99;
      } else {
        // Evaluate directional bias from regime
        if (volatility === "STRONG_BULL" || volatility === "BULL") {
          direction = "LONG";
          strength = volatility === "STRONG_BULL" ? 0.8 : 0.4;
          confidence = 0.7;
        } else if (volatility === "STRONG_BEAR" || volatility === "BEAR") {
          direction = "SHORT";
          strength = volatility === "STRONG_BEAR" ? -0.8 : -0.4;
          confidence = 0.7;
        }
      }

      const latencyMs = Date.now() - start;

      return {
        agentName: this.name,
        direction,
        confidence,
        strength,
        timeHorizon: "1h", // standard evaluation timeframe
        timestamp: Date.now(),
        metadata: {
          absorptionRatio,
          shieldActive,
          hurstExponent: hurst,
          trendingType,
          volatilityRegime: volatility,
          shouldVeto,
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
      latencyMs: 1, // updated dynamically during execution
      errorRate: this.evaluationsCount > 0 ? this.errorsCount / this.evaluationsCount : 0,
      uptime: (Date.now() - this.startTime) / 1000,
    };
  }

  public canVeto(): boolean {
    return true; // Regime Detector has veto power
  }
}
