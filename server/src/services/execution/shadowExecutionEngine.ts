/*
 * ─── Live Shadow Execution Engine ───────────────────────────
 *
 * Flow: Market → AI → Generate Order → DO NOT EXECUTE REAL MONEY →
 * Shadow Execution → Compare with Exchange → Analytics
 */

import { ShadowTrade } from "../../models/ShadowTrade.js";
import { SlippageSimulator } from "./slippageSimulator.js";
import { LatencyEngine } from "./latencyEngine.js";
import { ExecutionQualityService } from "./executionQualityService.js";
import { ExchangeSimulator } from "./exchangeSimulator.js";

export interface ShadowOrderInput {
  symbol: string;
  side: "BUY" | "SELL";
  requestedQty: number;
  requestedPrice: number;
  exchangeType?: "BINANCE_TESTNET" | "BYBIT_TESTNET" | "OKX_DEMO";
}

export class ShadowExecutionEngine {
  /**
   * Executes a live shadow trade simulation without real capital.
   */
  public static async executeShadowOrder(input: ShadowOrderInput): Promise<any> {
    const exchangeType = input.exchangeType || "BINANCE_TESTNET";

    // 1. Measure Latency
    const latencyMs = LatencyEngine.measurePipelineLatency();

    // 2. Simulate Slippage & Spread
    const slippage = SlippageSimulator.simulate(input.side, input.requestedPrice, input.requestedQty);

    // 3. Simulate Partial Fill
    const fill = ExchangeSimulator.simulateFill(input.requestedQty, exchangeType);

    // 4. Calculate Execution Quality Score (EQS)
    const eqs = ExecutionQualityService.calculateEQS(
      latencyMs.total,
      slippage.slippagePct,
      fill.fillRatio,
      slippage.spreadPct
    );

    // 5. Persist Shadow Trade
    const shadowTradeId = "SHADOW_" + Date.now();
    const trade = await ShadowTrade.create({
      shadowTradeId,
      symbol: input.symbol,
      side: input.side,
      requestedQty: input.requestedQty,
      filledQty: fill.filledQty,
      remainingQty: fill.remainingQty,
      requestedPrice: input.requestedPrice,
      executedPrice: slippage.executedPrice,
      slippagePct: slippage.slippagePct,
      spreadPct: slippage.spreadPct,
      marketImpactPct: slippage.marketImpactPct,
      latencyMs,
      executionQualityScore: eqs.overallQualityScore,
      exchangeType,
      createdAt: new Date(),
    });

    // Log EQS
    await ExecutionQualityService.logEQS(input.symbol, eqs);

    return trade;
  }

  public static async getShadowTrades(limit: number = 50): Promise<any[]> {
    return ShadowTrade.find().sort({ createdAt: -1 }).limit(limit).lean();
  }
}
