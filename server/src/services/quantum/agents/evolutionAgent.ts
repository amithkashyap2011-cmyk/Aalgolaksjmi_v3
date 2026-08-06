/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Agent 10: Self-Evolution Agent
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  QuantumAgent,
  AgentContext,
  AgentSignal,
  AgentHealth,
} from "../types.js";
import { summarize } from "../../selfLearningService.js";

export class EvolutionAgent implements QuantumAgent {
  public name = "EvolutionAgent";
  public priority = 10; // Runs last as an audit layer

  private evaluationsCount = 0;
  private errorsCount = 0;
  private startTime = Date.now();

  public async evaluate(ctx: AgentContext): Promise<AgentSignal> {
    const start = Date.now();
    this.evaluationsCount++;

    try {
      // 1. Summarize trade outcomes for this user
      const selfLearningSummary = await summarize(ctx.userId).catch(() => ({
        retrainWeekly: false,
        strategyDecayDetected: false,
        regimeChangeDetected: false,
        overfittingRisk: false,
        notes: ["Self-learning summary offline."],
      }));

      // 2. Adjust directional strength or confidence if issues are detected
      let confidenceAdjuster = 1.0;
      let decayPenalty = 0.0;

      if (selfLearningSummary.strategyDecayDetected) {
        confidenceAdjuster = 0.8; // Penalize signal confidence due to strategy decay
        decayPenalty = -0.15;
      }

      if (selfLearningSummary.overfittingRisk) {
        confidenceAdjuster *= 0.9; // Slight discount due to overfitting concerns
      }

      const latencyMs = Date.now() - start;

      return {
        agentName: this.name,
        direction: "NEUTRAL", // evolution does not predict entry direction
        confidence: confidenceAdjuster,
        strength: decayPenalty,
        timeHorizon: "1d",
        timestamp: Date.now(),
        metadata: {
          selfLearningSummary,
          confidenceAdjuster,
          decayPenalty,
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
