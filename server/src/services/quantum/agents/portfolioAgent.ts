/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Agent 9: Portfolio Agent
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  QuantumAgent,
  AgentContext,
  AgentSignal,
  AgentHealth,
} from "../types.js";

export class PortfolioAgent implements QuantumAgent {
  public name = "PortfolioAgent";
  public priority = 9; // Runs after Risk evaluations

  private evaluationsCount = 0;
  private errorsCount = 0;
  private startTime = Date.now();

  public async evaluate(ctx: AgentContext): Promise<AgentSignal> {
    const start = Date.now();
    this.evaluationsCount++;

    try {
      // 1. Inspect portfolio state
      const portfolio = ctx.portfolioState;
      const currentPositionsCount = portfolio.positions.length;
      
      // Calculate current systematic exposure (total size of open positions relative to total equity)
      const totalExposureVal = portfolio.positions.reduce((acc, p) => acc + (p.size * p.currentPrice), 0);
      const totalExposurePct = portfolio.totalEquity > 0 ? totalExposureVal / portfolio.totalEquity : 0;

      // 2. Correlation-aware rebalancing checks
      // We check if the target symbol has a high correlation to existing open positions
      let averageCorrelation = 0;
      let highlyCorrelatedCount = 0;
      let totalCorrsCount = 0;

      portfolio.positions.forEach(pos => {
        const corr = portfolio.correlationMatrix[ctx.symbol]?.[pos.symbol] ?? 0;
        averageCorrelation += corr;
        totalCorrsCount++;
        if (corr > 0.70) {
          highlyCorrelatedCount++;
        }
      });

      if (totalCorrsCount > 0) {
        averageCorrelation /= totalCorrsCount;
      }

      // 3. Size allocation scaling
      // Base allocation is 2.5% of total equity
      let targetAllocationPct = 0.025; 

      // Scale down if portfolio exposure is already high
      if (totalExposurePct > 0.30) { // >30% portfolio exposure
        targetAllocationPct *= 0.5; // Halve the size
      }
      
      // Scale down if high correlation exists
      if (highlyCorrelatedCount > 0) {
        targetAllocationPct *= 0.6; // Reduce size by 40%
      }

      // Scale up if we have low exposure and low correlation
      if (totalExposurePct < 0.10 && averageCorrelation < 0.30) {
        targetAllocationPct *= 1.2; // 20% size boost
      }

      const latencyMs = Date.now() - start;

      return {
        agentName: this.name,
        direction: "NEUTRAL", // allocation only
        confidence: 1.0,
        strength: 0.0,
        timeHorizon: "4h",
        timestamp: Date.now(),
        metadata: {
          totalExposurePct,
          currentPositionsCount,
          averageCorrelation,
          highlyCorrelatedCount,
          targetAllocationPct,
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
