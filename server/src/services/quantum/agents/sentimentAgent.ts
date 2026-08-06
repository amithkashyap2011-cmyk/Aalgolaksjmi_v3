/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Agent 3: Sentiment Agent
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  QuantumAgent,
  AgentContext,
  AgentSignal,
  AgentHealth,
} from "../types.js";

export class SentimentAgent implements QuantumAgent {
  public name = "SentimentAgent";
  public priority = 3;

  private evaluationsCount = 0;
  private errorsCount = 0;
  private startTime = Date.now();

  public async evaluate(ctx: AgentContext): Promise<AgentSignal> {
    const start = Date.now();
    this.evaluationsCount++;

    try {
      // 1. Fetch funding rate positioning as a proxy for market crowd sentiment
      const fundingRate = ctx.fundingRate?.fundingRate ?? 0.0001;
      const oi = ctx.openInterest?.openInterest ?? 0;

      // 2. Real-world sentiment derived from funding rate and price divergence
      // Positive funding rate = longs paying shorts (bullish crowd)
      // Negative funding rate = shorts paying longs (bearish crowd)
      const price = ctx.currentPrice;
      const ema = ctx.indicators.ema21 ?? price;
      const priceToEmaRatio = price / ema;

      // Calculate sentiment score based on funding rate intensity and price momentum
      // Funding rate is typically in range [-0.01, 0.01] (1% per 8h)
      // We amplify it to map to [-1, 1]
      let sentimentScore = fundingRate * 150; 
      
      // Momentum confirmation
      sentimentScore += (priceToEmaRatio - 1.0) * 10;
      sentimentScore = Math.max(-1.0, Math.min(1.0, sentimentScore));

      // Calculate institutional engagement proxy via Volume/OI ratio
      // High volume relative to OI implies aggressive market orders (high sentiment conviction)
      const volumeRatio = ctx.indicators.volumeRatio ?? 1.0;
      const oiValue = ctx.openInterest?.openInterestValue ?? 1;
      const engagementScore = oiValue > 0 ? (volumeRatio * (price * ctx.bars[ctx.bars.length-1].volume) / oiValue) : 1.0;
      const socialVolumeMultiplier = Math.min(1.5, Math.max(1.0, engagementScore));

      let direction: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
      let strength = 0;
      let confidence = 0.5;

      const biasThreshold = 0.15;
      if (sentimentScore > biasThreshold) {
        direction = "LONG";
        strength = sentimentScore * socialVolumeMultiplier;
        confidence = 0.6 + Math.abs(fundingRate) * 20;
      } else if (sentimentScore < -biasThreshold) {
        direction = "SHORT";
        strength = sentimentScore * socialVolumeMultiplier;
        confidence = 0.6 + Math.abs(fundingRate) * 20;
      }

      // Cap strength to [-1.0, 1.0]
      strength = Math.max(-1.0, Math.min(1.0, strength));

      const latencyMs = Date.now() - start;

      return {
        agentName: this.name,
        direction,
        confidence,
        strength,
        timeHorizon: "4h", // Sentiment has a medium-term horizon
        timestamp: Date.now(),
        metadata: {
          sentimentScore,
          socialVolumeMultiplier,
          crowdPositioning: fundingRate > 0 ? "BULLISH_BIAS" : "BEARISH_BIAS",
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
