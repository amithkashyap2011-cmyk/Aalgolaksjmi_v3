/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Agent 7: Execution Agent
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  QuantumAgent,
  AgentContext,
  AgentSignal,
  AgentHealth,
  ExecutionPlan,
  ExecutionStrategy,
} from "../types.js";

export class ExecutionAgent implements QuantumAgent {
  public name = "ExecutionAgent";
  public priority = 7;

  private evaluationsCount = 0;
  private errorsCount = 0;
  private startTime = Date.now();

  public async evaluate(ctx: AgentContext): Promise<AgentSignal> {
    const start = Date.now();
    this.evaluationsCount++;

    try {
      // 1. Analyze market liquidity
      const spreadBps = this.calculateSpread(ctx);
      const bookImbalance = this.calculateImbalance(ctx);

      // Determine typical execution plan parameters based on order books
      // Urgency level is determined by the regime and confidence
      // Trending/Breakout -> High urgency (MARKET or fast TWAP)
      // Sideways/Low Vol -> Low urgency (LIMIT or slow TWAP)
      const isTrending = ["STRONG_BULL", "STRONG_BEAR"].includes(ctx.regime);
      const isHighlyVolatile = ctx.regime === "HIGH_VOLATILITY";

      let strategy: ExecutionStrategy = "LIMIT";
      let sliceCount = 1;
      let sliceIntervalMs = 0;
      let maxSlippageBps = 10; // default 0.1%
      let urgency: "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY" = "MEDIUM";

      // Simple heuristic for sizing
      const proposedVolumeQuote = 5000; // e.g. 5,000 USDT order size
      const orderBookVolume20Levels = this.getBookVolume(ctx);

      // If proposed order represents more than 1% of the top 20 order book depth,
      // we must slice it using TWAP/VWAP or Iceberg.
      const pctOfDepth = orderBookVolume20Levels > 0 ? proposedVolumeQuote / orderBookVolume20Levels : 0;

      if (isHighlyVolatile) {
        urgency = "HIGH";
        maxSlippageBps = 30; // wider tolerance
      }

      if (pctOfDepth > 0.10) { // Large order (>10% of top 20 levels)
        strategy = "TWAP";
        sliceCount = Math.min(10, Math.ceil(pctOfDepth * 40));
        sliceIntervalMs = 60000; // slice every minute
        urgency = "LOW";
      } else if (pctOfDepth > 0.02) { // Medium order (>2% of depth)
        strategy = "ICEBERG";
        sliceCount = 4;
        sliceIntervalMs = 30000; // every 30 seconds
      } else {
        // Small order, can execute as LIMIT or MARKET directly
        strategy = isTrending ? "MARKET" : "LIMIT";
        sliceCount = 1;
        sliceIntervalMs = 0;
      }

      const executionPlan: ExecutionPlan = {
        strategy,
        symbol: ctx.symbol,
        exchange: ctx.exchange,
        side: "BUY", // updated dynamically by orchestrator
        totalQuantity: 0.0, // updated dynamically by orchestrator
        sliceCount,
        sliceIntervalMs,
        limitPrice: strategy === "LIMIT" ? ctx.currentPrice : null,
        maxSlippageBps,
        urgency,
      };

      const latencyMs = Date.now() - start;

      return {
        agentName: this.name,
        direction: "NEUTRAL", // Execution agent does not predict direction
        confidence: 1.0,
        strength: 0.0,
        timeHorizon: "1m",
        timestamp: Date.now(),
        metadata: {
          executionPlan,
          spreadBps,
          bookImbalance,
          orderBookVolume20Levels,
          pctOfDepth,
          latencyMs,
        },
      };
    } catch (err) {
      this.errorsCount++;
      throw err;
    }
  }

  private calculateSpread(ctx: AgentContext): number {
    if (!ctx.orderBook || ctx.orderBook.bids.length === 0 || ctx.orderBook.asks.length === 0) {
      return 5.0; // default 5 bps
    }
    const bestBid = ctx.orderBook.bids[0].price;
    const bestAsk = ctx.orderBook.asks[0].price;
    return ((bestAsk - bestBid) / ctx.currentPrice) * 10000;
  }

  private calculateImbalance(ctx: AgentContext): number {
    if (!ctx.orderBook || ctx.orderBook.bids.length === 0 || ctx.orderBook.asks.length === 0) {
      return 0.0;
    }
    const bidVol = ctx.orderBook.bids.slice(0, 5).reduce((acc, b) => acc + b.quantity, 0);
    const askVol = ctx.orderBook.asks.slice(0, 5).reduce((acc, a) => acc + a.quantity, 0);
    return bidVol + askVol > 0 ? (bidVol - askVol) / (bidVol + askVol) : 0.0;
  }

  private getBookVolume(ctx: AgentContext): number {
    if (!ctx.orderBook) return 0;
    let volume = 0;
    ctx.orderBook.bids.forEach(b => volume += b.price * b.quantity);
    ctx.orderBook.asks.forEach(a => volume += a.price * a.quantity);
    return volume;
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
