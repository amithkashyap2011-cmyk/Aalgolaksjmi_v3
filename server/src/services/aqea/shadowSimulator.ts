/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Shadow Mode Simulator
 * ═══════════════════════════════════════════════════════════════════
 */

import { ExitEngine, type TradeExitState } from "./exitEngine.js";
import { AqeaAnalyticsService } from "./tradeAnalytics.js";
import { AqeaAuditService } from "./AqeaAudit.js";

export interface ShadowPosition extends TradeExitState {
  userId: string;
  symbol: string;
  quantity: number;
  openedAt: number;
  virtual: true;
}

/**
 * Manages virtual positions for AQEA Shadow Mode.
 * Ensures NO exchange calls are ever made.
 */
export class ShadowSimulator {
  // Key: userId:symbol
  private static positions = new Map<string, ShadowPosition>();

  /**
   * Opens a virtual shadow position.
   */
  public static openPosition(
    userId: string,
    symbol: string,
    side: "BUY" | "SELL",
    entryPrice: number,
    levels: { tp1: number; tp2: number; tp3: number; sl: number },
    quantity: number
  ): void {
    const key = `${userId}:${symbol}`;
    if (this.positions.has(key)) return;

    const pos: ShadowPosition = {
      userId,
      symbol,
      side,
      entryPrice,
      ...levels,
      tp1Hit: false,
      tp2Hit: false,
      tp3Hit: false,
      openedAt: Date.now(),
      virtual: true,
      quantity
    };

    this.positions.set(key, pos);
    AqeaAuditService.info(userId, symbol, "shadowSimulator", `Virtual ${side} Opened @ ${entryPrice}`);
  }

  /**
   * Updates virtual positions and checks for exits using ExitEngine.
   */
  public static async update(userId: string, symbol: string, currentPrice: number): Promise<void> {
    const key = `${userId}:${symbol}`;
    const pos = this.positions.get(key);
    if (!pos) return;

    // Use ExitEngine to evaluate signal
    const signal = ExitEngine.evaluateExit(currentPrice, pos);

    if (signal.shouldExit) {
      if (signal.type === "FULL") {
        await this.closePosition(pos, currentPrice, signal.reason);
      } else {
        // Partial Exit
        await this.handlePartialExit(pos, currentPrice, signal);
      }
    }
  }

  private static async handlePartialExit(pos: ShadowPosition, price: number, signal: any): Promise<void> {
    if (signal.reason === "TP1_HIT") pos.tp1Hit = true;
    if (signal.reason === "TP2_HIT") {
       pos.tp2Hit = true;
       if (signal.newStopLoss) pos.sl = signal.newStopLoss;
    }
    
    AqeaAuditService.info(pos.userId, pos.symbol, "shadowSimulator", `Partial Exit: ${signal.reason} @ ${price}`);
  }

  private static async closePosition(pos: ShadowPosition, exitPrice: number, reason: string): Promise<void> {
    const pnl = pos.side === "BUY" 
      ? (exitPrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - exitPrice) * pos.quantity;

    await AqeaAnalyticsService.record({
      userId: pos.userId,
      symbol: pos.symbol,
      decision: "EXIT",
      regimeState: "SHADOW_EXIT",
      regimeScore: 0,
      multiTfScore: 0,
      atr: 0,
      adx: 0,
      btcDominance: 0,
      fundingRate: 0,
      riskScore: 100,
      positionSize: pos.quantity * pos.entryPrice,
      exitReason: reason,
      pnl,
      meta: { openedAt: pos.openedAt, closedAt: Date.now(), virtual: true }
    });

    this.positions.delete(`${pos.userId}:${pos.symbol}`);
    AqeaAuditService.info(pos.userId, pos.symbol, "shadowSimulator", `Virtual Closed: ${reason} PnL: ${pnl.toFixed(2)}`);
  }

  public static hasPosition(userId: string, symbol: string): boolean {
    return this.positions.has(`${userId}:${symbol}`);
  }
}
