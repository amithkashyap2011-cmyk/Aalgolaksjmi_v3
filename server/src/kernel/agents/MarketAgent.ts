/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — MARKET AGENT
 * ═══════════════════════════════════════════════════════════════════
 * Ingests and validates market freshness, orderbook state, and OHLCV bars.
 */

import { BaseAgent } from "./BaseAgent.js";
import { ToolCapability, IAgentObservation, IAgentObservationResult } from "../types.js";

export class MarketAgent extends BaseAgent {
  public readonly id = "MarketAgent";
  public readonly name = "Market Data Specialist Agent";
  public readonly version = "3.0.0";
  public readonly capabilities: ToolCapability[] = ["READ_MARKET"];

  protected override async onObserve(input: IAgentObservation): Promise<IAgentObservationResult> {
    const data = input.data || {};
    const hasPrice = typeof data.currentPrice === "number" && data.currentPrice > 0;
    const hasBars = Array.isArray(data.bars) && data.bars.length > 0;
    const isFresh = (Date.now() - (input.timestamp || Date.now())) < 60000;

    return {
      valid: hasPrice && hasBars && isFresh,
      metrics: {
        currentPrice: data.currentPrice,
        barCount: data.bars?.length || 0,
        isFresh,
      },
      anomalyDetected: !isFresh,
      anomalyReason: !isFresh ? "Market data latency exceeds 60s freshness budget" : undefined,
    };
  }
}
