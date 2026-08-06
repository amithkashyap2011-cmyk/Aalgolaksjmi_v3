/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Agent 8: Risk Agent
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  QuantumAgent,
  AgentContext,
  AgentSignal,
  AgentHealth,
} from "../types.js";
import { RiskEngine } from "../riskEngine.js";

export class RiskAgent implements QuantumAgent {
  public name = "RiskAgent";
  public priority = 8; // Evaluates late in the pipeline

  private evaluationsCount = 0;
  private errorsCount = 0;
  private startTime = Date.now();

  public async evaluate(ctx: AgentContext): Promise<AgentSignal> {
    const start = Date.now();
    this.evaluationsCount++;

    try {
      const riskEngine = RiskEngine.getInstance();

      // Extract liquidation cascade metrics if present in context
      const cascadeRiskScore = ctx.recentLiquidations 
        ? (ctx.recentLiquidations.length > 5 ? 80 : 20) 
        : 0;

      // Extract absorption ratio if available in metadata/context
      const spectralRatio = ctx.portfolioState.maxDrawdownToday > 2.0 ? 0.75 : 0.20;

      // Evaluate order with 5% target size default
      const proposedSize = ctx.portfolioState.totalEquity * 0.05;
      const riskAssessment = riskEngine.evaluateOrder(
        ctx.symbol,
        "BUY", // default proposed side
        proposedSize,
        ctx.indicators,
        ctx.regime,
        ctx.portfolioState,
        cascadeRiskScore,
        spectralRatio
      );

      let direction: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
      let strength = 0;
      let confidence = 1.0;

      if (!riskAssessment.approved) {
        direction = "NEUTRAL";
        strength = -1.0; // Veto signal
        confidence = 1.0;
      } else {
        direction = "NEUTRAL";
        strength = 0.0; // Neutrally approved (delegates sizing to Portfolio Agent)
        confidence = 0.5;
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
          riskAssessment,
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
    return true; // Risk Agent has veto power
  }
}
