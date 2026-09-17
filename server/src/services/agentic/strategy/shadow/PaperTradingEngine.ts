/**
 * ═══════════════════════════════════════════════════════════════════
 *  AUTONOMOUS PAPER TRADING ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *  Simulates real-time execution against live market feeds with:
 *   - Realistic simulated slippage and statutory costs (IndianCostModel)
 *   - Virtual position tracking and ledger isolation
 *   - ABSOLUTE HARD ISOLATION: Zero real broker orders permitted
 */

import { IStrategyDSL, IBacktestTradeRecord } from "../types.js";
import { IndianCostModel } from "../../../indianMarket/costModel.js";
import { InstrumentType, OrderAction } from "../../../indianMarket/strategyTypes.js";

export interface IPaperPosition {
  tradeId: string;
  strategyId: string;
  symbol: string;
  direction: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  entryTime: number;
  currentPrice: number;
  unrealizedPnl: number;
  totalCharges: number;
}

export class PaperTradingEngine {
  private static activePositions: Map<string, IPaperPosition> = new Map();
  private static completedTrades: IBacktestTradeRecord[] = [];
  private static virtualCapital: number = 100_000;

  /**
   * Evaluates simulated entry under Paper mode.
   * STRICT GUARANTEE: Never invokes broker gateway.
   */
  public static simulateEntry(
    strategyId: string,
    dsl: IStrategyDSL,
    symbol: string,
    direction: "BUY" | "SELL",
    marketPrice: number,
    quantity: number
  ): IPaperPosition {
    // 1. Simulate 2 bps slippage and spread penalty
    const slippageBps = 2.0;
    const slippageMultiplier = 1 + (direction === "BUY" ? 1 : -1) * (slippageBps / 10000);
    const executedPrice = Number((marketPrice * slippageMultiplier).toFixed(2));

    // 2. Calculate entry statutory charges
    const entryCosts = IndianCostModel.calculateOrderCost({
      instrumentType: (dsl.entry.instrumentType as InstrumentType) || "FUTURE",
      action: direction === "BUY" ? "BUY" : "SELL",
      price: executedPrice,
      quantity,
    });

    const tradeId = `PAPER_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const position: IPaperPosition = {
      tradeId,
      strategyId,
      symbol,
      direction,
      quantity,
      entryPrice: executedPrice,
      entryTime: Date.now(),
      currentPrice: executedPrice,
      unrealizedPnl: 0,
      totalCharges: entryCosts.totalCharges,
    };

    this.activePositions.set(tradeId, position);
    return position;
  }

  /**
   * Evaluates simulated exit under Paper mode.
   */
  public static simulateExit(
    tradeId: string,
    dsl: IStrategyDSL,
    exitMarketPrice: number,
    exitReason: string
  ): IBacktestTradeRecord | null {
    const pos = this.activePositions.get(tradeId);
    if (!pos) return null;

    const slippageBps = 2.0;
    const slippageMultiplier = 1 - (pos.direction === "BUY" ? 1 : -1) * (slippageBps / 10000);
    const executedExitPrice = Number((exitMarketPrice * slippageMultiplier).toFixed(2));

    const exitCosts = IndianCostModel.calculateOrderCost({
      instrumentType: (dsl.entry.instrumentType as InstrumentType) || "FUTURE",
      action: pos.direction === "BUY" ? "SELL" : "BUY",
      price: executedExitPrice,
      quantity: pos.quantity,
    });

    const grossPnl =
      pos.direction === "BUY"
        ? (executedExitPrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - executedExitPrice) * pos.quantity;

    const totalCharges = Number((pos.totalCharges + exitCosts.totalCharges).toFixed(2));
    const netPnl = Number((grossPnl - totalCharges).toFixed(2));

    const completed: IBacktestTradeRecord = {
      tradeId: pos.tradeId,
      entryTimestamp: pos.entryTime,
      exitTimestamp: Date.now(),
      symbol: pos.symbol,
      direction: pos.direction,
      instrumentType: dsl.entry.instrumentType || "FUTURE",
      entryPrice: pos.entryPrice,
      exitPrice: executedExitPrice,
      quantity: pos.quantity,
      grossPnl: Number(grossPnl.toFixed(2)),
      brokerage: 40.0,
      stt: exitCosts.stt,
      exchangeFee: exitCosts.exchangeTxn,
      sebiFee: exitCosts.sebi,
      stampDuty: pos.totalCharges > 50 ? 5.0 : 0,
      gst: exitCosts.gst,
      totalCharges,
      netPnl,
      exitReason,
      slippageIncurred: Number((Math.abs(exitMarketPrice - executedExitPrice) * pos.quantity).toFixed(2)),
      holdingDurationMinutes: Number(((Date.now() - pos.entryTime) / (60 * 1000)).toFixed(1)),
      regime: "RANGING",
    };

    this.completedTrades.push(completed);
    this.activePositions.delete(tradeId);
    this.virtualCapital += netPnl;

    return completed;
  }

  public static getActivePositions(): IPaperPosition[] {
    return Array.from(this.activePositions.values());
  }

  public static getCompletedTrades(): IBacktestTradeRecord[] {
    return [...this.completedTrades];
  }

  public static getVirtualCapital(): number {
    return this.virtualCapital;
  }

  public static reset(): void {
    this.activePositions.clear();
    this.completedTrades = [];
    this.virtualCapital = 100_000;
  }
}
