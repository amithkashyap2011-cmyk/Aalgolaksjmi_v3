/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Agent 5: On-Chain Agent
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  QuantumAgent,
  AgentContext,
  AgentSignal,
  AgentHealth,
} from "../types.js";

export class OnChainAgent implements QuantumAgent {
  public name = "OnChainAgent";
  public priority = 5;

  private evaluationsCount = 0;
  private errorsCount = 0;
  private startTime = Date.now();

  public async evaluate(ctx: AgentContext): Promise<AgentSignal> {
    const start = Date.now();
    this.evaluationsCount++;

    try {
      // 1. Evaluate open interest dynamics and funding rate as proxies for on-chain activity
      const openInterestVal = ctx.openInterest?.openInterestValue ?? 0;
      const fundingRate = ctx.fundingRate?.fundingRate ?? 0;

      // 2. Generate simulated on-chain flow vectors for Phase 1
      // Stablecoin inflow is bullish (money waiting to buy)
      // Asset inflow to exchange is bearish (supply pressure to sell)
      // Gas price spikes represent high transaction density / DeFi activity
      let stablecoinNetInflowUSDT = 5000000; // default positive
      let exchangeTokenInflow = 1000000; // default normal
      
      // Correlate simulated flows with price momentum & open interest
      if (ctx.indicators.rsi14 && ctx.indicators.rsi14 > 60) {
        // High price -> whales depositing to exchanges to take profit
        exchangeTokenInflow = 8000000;
        stablecoinNetInflowUSDT = 2000000;
      } else if (ctx.indicators.rsi14 && ctx.indicators.rsi14 < 40) {
        // Low price -> buy pressure, stablecoins entering exchanges
        stablecoinNetInflowUSDT = 15000000;
        exchangeTokenInflow = 1500000;
      }

      // Calculate net flow score
      const totalFlow = stablecoinNetInflowUSDT + (exchangeTokenInflow * ctx.currentPrice);
      let flowScore = 0;
      if (totalFlow > 0) {
        flowScore = (stablecoinNetInflowUSDT - (exchangeTokenInflow * ctx.currentPrice)) / totalFlow;
      }

      let direction: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
      let strength = 0;
      let confidence = 0.5;

      const inflowThreshold = 0.3;
      if (flowScore > inflowThreshold) {
        direction = "LONG";
        strength = flowScore;
        confidence = 0.6;
      } else if (flowScore < -inflowThreshold) {
        direction = "SHORT";
        strength = flowScore; // negative represents short bias
        confidence = 0.6;
      }

      const latencyMs = Date.now() - start;

      return {
        agentName: this.name,
        direction,
        confidence,
        strength,
        timeHorizon: "1d", // On-chain dynamics operate on longer horizons
        timestamp: Date.now(),
        metadata: {
          stablecoinNetInflowUSDT,
          exchangeTokenInflow,
          flowScore,
          gasPriceGwei: 28.5,
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
