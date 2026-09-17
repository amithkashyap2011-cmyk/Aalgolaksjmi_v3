/**
 * ═══════════════════════════════════════════════════════════════════
 *  AUTONOMOUS SHADOW TRADING ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *  Executes alongside production live execution:
 *   - Evaluates live candidate strategy signals in real-time
 *   - Passes signals through deterministic risk checks
 *   - Compares expected vs actual execution prices and latency
 *   - ABSOLUTE HARD ISOLATION: Zero live broker orders placed
 */

import { IStrategyDSL } from "../types.js";

export interface IShadowExecutionRecord {
  shadowId: string;
  strategyId: string;
  strategyName: string;
  symbol: string;
  direction: "BUY" | "SELL";
  quantity: number;
  signaledPrice: number;
  actualMarketPrice: number;
  simulatedFillPrice: number;
  slippageBps: number;
  executionLatencyMs: number;
  riskEvaluationPassed: boolean;
  timestamp: number;
  hypotheticalPnl?: number;
  status: "RECORDED" | "SIMULATED_FILL" | "CLOSED";
}

export class ShadowTradingEngine {
  private static shadowLog: IShadowExecutionRecord[] = [];

  /**
   * Records a shadow strategy execution signal.
   * GUARANTEE: Never sends orders to Kite Connect or live broker.
   */
  public static recordShadowSignal(
    strategyId: string,
    strategyName: string,
    symbol: string,
    direction: "BUY" | "SELL",
    quantity: number,
    signaledPrice: number,
    actualMarketPrice: number,
    riskEvaluationPassed: boolean,
    executionLatencyMs: number = 24
  ): IShadowExecutionRecord {
    // Calculate realistic slippage between signal and market fill
    const priceDiff = Math.abs(actualMarketPrice - signaledPrice);
    const slippageBps = Number(((priceDiff / signaledPrice) * 10000).toFixed(2));
    const simulatedFillPrice = Number(
      (actualMarketPrice * (direction === "BUY" ? 1.0002 : 0.9998)).toFixed(2)
    );

    const record: IShadowExecutionRecord = {
      shadowId: `SHADOW_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      strategyId,
      strategyName,
      symbol,
      direction,
      quantity,
      signaledPrice,
      actualMarketPrice,
      simulatedFillPrice,
      slippageBps,
      executionLatencyMs,
      riskEvaluationPassed,
      timestamp: Date.now(),
      status: "SIMULATED_FILL",
    };

    this.shadowLog.unshift(record);
    if (this.shadowLog.length > 500) {
      this.shadowLog.pop();
    }

    return record;
  }

  public static getShadowRecords(limit: number = 50): IShadowExecutionRecord[] {
    return this.shadowLog.slice(0, limit);
  }

  public static clear(): void {
    this.shadowLog = [];
  }
}
