/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Agent 4: Whale Tracking Agent
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  QuantumAgent,
  AgentContext,
  AgentSignal,
  AgentHealth,
} from "../types.js";

export class WhaleAgent implements QuantumAgent {
  public name = "WhaleAgent";
  public priority = 4;

  private evaluationsCount = 0;
  private errorsCount = 0;
  private startTime = Date.now();

  public async evaluate(ctx: AgentContext): Promise<AgentSignal> {
    const start = Date.now();
    this.evaluationsCount++;

    try {
      let volumeSpikeRatio = 1.0;
      let largeOrderCount = 0;
      let whaleActivity: "ACCUMULATION" | "DISTRIBUTION" | "NONE" = "NONE";

      // Calculate volume spikes from historical bars (aligned with Saraswati)
      if (ctx.bars && ctx.bars.length > 20) {
        const lastBar = ctx.bars[ctx.bars.length - 1];
        const lastBarVol = lastBar?.volume ?? 0;
        const historicalBars = ctx.bars.slice(-21, -1);
        const totalHistVol = historicalBars.reduce((sum, b) => sum + (b.volume ?? 0), 0);
        const avgHistVol = totalHistVol / historicalBars.length;

        if (avgHistVol > 0) {
          volumeSpikeRatio = lastBarVol / avgHistVol;
        }

        const stdDevLimit = 1.5;
        const highVolBars = historicalBars.filter(
          b => b.volume && avgHistVol > 0 && b.volume > avgHistVol * stdDevLimit
        );
        largeOrderCount = highVolBars.length;

        if (volumeSpikeRatio > 1.8) {
          largeOrderCount += Math.floor((volumeSpikeRatio - 1.0) * 3);
        }

        const rsi = ctx.indicators.rsi14 ?? 50;
        if (volumeSpikeRatio > 1.4) {
          if (rsi < 40) {
            whaleActivity = "ACCUMULATION"; // Large buying at lower price
          } else if (rsi > 65) {
            whaleActivity = "DISTRIBUTION"; // Large selling at higher price
          }
        }
      }

      // Check Order Book walls and icebergs
      const orderBookIntel = ctx.orderBook;
      let absorptionSide: "BID" | "ASK" | "NONE" = "NONE";
      if (orderBookIntel) {
        // Detect bid vs ask absorption as whale signatures
        const bidsMean = this.mean(orderBookIntel.bids.map(b => b.quantity));
        const asksMean = this.mean(orderBookIntel.asks.map(a => a.quantity));
        if (orderBookIntel.bids[0] && orderBookIntel.bids[0].quantity > bidsMean * 4) {
          absorptionSide = "BID";
        } else if (orderBookIntel.asks[0] && orderBookIntel.asks[0].quantity > asksMean * 4) {
          absorptionSide = "ASK";
        }
      }

      let direction: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
      let strength = 0;
      let confidence = 0.5;

      if (whaleActivity === "ACCUMULATION" || absorptionSide === "BID") {
        direction = "LONG";
        strength = volumeSpikeRatio > 2.0 ? 0.95 : 0.65;
        confidence = 0.75;
      } else if (whaleActivity === "DISTRIBUTION" || absorptionSide === "ASK") {
        direction = "SHORT";
        strength = volumeSpikeRatio > 2.0 ? -0.95 : -0.65;
        confidence = 0.75;
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
          whaleActivity,
          volumeSpikeRatio,
          largeOrderCount,
          absorptionSide,
          latencyMs,
        },
      };
    } catch (err) {
      this.errorsCount++;
      throw err;
    }
  }

  private mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
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
