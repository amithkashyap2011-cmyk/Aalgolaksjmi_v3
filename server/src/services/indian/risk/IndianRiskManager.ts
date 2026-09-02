/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Indian Market Pre-Trade Risk Governance & Safety Engine
 * ═══════════════════════════════════════════════════════════════════
 */

import { IndianTradeObject, IndianRiskConfig, IndianTradeSignal } from "../types.js";
import { InstrumentMaster } from "../InstrumentMaster.js";

export interface RiskValidationResult {
  allowed: boolean;
  blockReason?: string;
  adjustedQuantity: number;
  riskAmountINR: number;
  marginRequiredINR: number;
  fingerprint: string;
}

export class IndianRiskManager {
  private static panicStopEnabled: boolean = false;
  private static dailyLossLocked: Map<string, boolean> = new Map();
  private static activeFingerprints: Map<string, number> = new Map(); // fingerprint -> timestamp
  private static COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes cooldown per trade setup

  public static setPanicStop(enabled: boolean): void {
    this.panicStopEnabled = enabled;
    console.log(`🚨 [INDIAN_RISK_MANAGER] PANIC STOP ${enabled ? 'ACTIVATED' : 'DEACTIVATED'}`);
  }

  public static isPanicStopActive(): boolean {
    return this.panicStopEnabled;
  }

  public static isDailyLossLocked(userId: string): boolean {
    return this.dailyLossLocked.get(userId) || false;
  }

  public static resetDailyLossLock(userId: string): void {
    this.dailyLossLocked.set(userId, false);
  }

  /**
   * Evaluates Indian Market Trading Hours (09:15 AM to 03:30 PM IST, Monday - Friday)
   */
  public static getSessionStatus(): { isOpen: boolean; canEnterNewTrades: boolean; reason: string } {
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istDate = new Date(utcTime + (5.5 * 3600000));

    const day = istDate.getDay();
    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();
    const currentMinutes = (hours * 60) + minutes;

    // Weekend check
    if (day === 0 || day === 6) {
      return { isOpen: false, canEnterNewTrades: false, reason: "MARKET_CLOSED_WEEKEND" };
    }

    const marketOpen = (9 * 60) + 15;   // 09:15 AM IST
    const entryCutoff = (15 * 60) + 10; // 03:10 PM IST (Cutoff for new intraday MIS orders)
    const marketClose = (15 * 60) + 30; // 03:30 PM IST

    if (currentMinutes < marketOpen) {
      return { isOpen: false, canEnterNewTrades: false, reason: "PRE_MARKET_HOURS" };
    }
    if (currentMinutes >= marketClose) {
      return { isOpen: false, canEnterNewTrades: false, reason: "POST_MARKET_HOURS" };
    }
    if (currentMinutes >= entryCutoff) {
      return { isOpen: true, canEnterNewTrades: false, reason: "MIS_ENTRY_CUTOFF_REACHED" };
    }

    return { isOpen: true, canEnterNewTrades: true, reason: "MARKET_SESSION_ACTIVE" };
  }

  /**
   * Generates unique duplicate trade fingerprint
   */
  public static generateFingerprint(signal: IndianTradeSignal, strike?: number, expiry?: string): string {
    const s = Math.round(strike || 0);
    const exp = expiry || "CURR";
    return `${signal.underlying}:${signal.strategy}:${signal.direction}:${s}:${exp}`;
  }

  /**
   * Position sizing formula:
   * riskCapital = accountBalance * maxRiskPercent
   * positionSize = floor(riskCapital / (slPoints * lotSize)) * lotSize
   */
  public static calculatePositionSize(
    underlying: string,
    accountBalanceINR: number,
    entryPrice: number,
    slPrice: number,
    maxRiskPct: number = 0.02, // 2% max risk per trade
    leverage: number = 1
  ): { quantity: number; lots: number; riskAmountINR: number; marginRequiredINR: number } {
    const lotSize = InstrumentMaster.getLotSize(underlying);
    const slDistance = Math.max(1, Math.abs(entryPrice - slPrice));
    const riskCapital = accountBalanceINR * Math.max(0.005, Math.min(0.05, maxRiskPct));
    const lossPerLot = slDistance * lotSize;

    let lots = Math.floor(riskCapital / lossPerLot);
    if (lots < 1) lots = 1; // Minimum 1 lot
    if (lots > 20) lots = 20; // Hard max 20 lots for risk containment

    const quantity = lots * lotSize;
    const totalNotional = quantity * entryPrice;
    const marginRequiredINR = totalNotional / Math.max(1, leverage);

    // If margin required exceeds account balance, scale down lots
    if (marginRequiredINR > accountBalanceINR && accountBalanceINR > 0) {
      const maxAffordableLots = Math.max(1, Math.floor(accountBalanceINR / ((lotSize * entryPrice) / leverage)));
      lots = Math.min(lots, maxAffordableLots);
    }

    const finalQuantity = lots * lotSize;
    const finalNotional = finalQuantity * entryPrice;
    const finalMargin = finalNotional / Math.max(1, leverage);
    const finalRiskINR = Math.round(slDistance * finalQuantity);

    return {
      quantity: finalQuantity,
      lots,
      riskAmountINR: finalRiskINR,
      marginRequiredINR: Number(finalMargin.toFixed(2))
    };
  }

  /**
   * Comprehensive pre-trade risk validation
   */
  public static validatePreTrade(
    userId: string,
    signal: IndianTradeSignal,
    accountBalanceINR: number,
    entryPrice: number,
    slPrice: number,
    config: IndianRiskConfig,
    strike?: number,
    expiry?: string,
    mode: "PAPER" | "LIVE" | "BACKTEST" = "PAPER"
  ): RiskValidationResult {
    const fingerprint = this.generateFingerprint(signal, strike, expiry);

    // 1. Panic Stop Check
    if (this.panicStopEnabled) {
      return { allowed: false, blockReason: "PANIC_STOP_ACTIVE", adjustedQuantity: 0, riskAmountINR: 0, marginRequiredINR: 0, fingerprint };
    }

    // 2. Daily Loss Lock
    if (this.isDailyLossLocked(userId)) {
      return { allowed: false, blockReason: "DAILY_RISK_LOCK_TRIGGERED", adjustedQuantity: 0, riskAmountINR: 0, marginRequiredINR: 0, fingerprint };
    }

    // 3. Trade Score Gate
    if (signal.tradeScore < (config.minTradeScore || 70)) {
      return { allowed: false, blockReason: `TRADE_SCORE_BELOW_THRESHOLD: ${signal.tradeScore} < ${config.minTradeScore || 70}`, adjustedQuantity: 0, riskAmountINR: 0, marginRequiredINR: 0, fingerprint };
    }

    // 4. Duplicate Check
    const lastTime = this.activeFingerprints.get(fingerprint);
    if (lastTime && (Date.now() - lastTime) < this.COOLDOWN_MS) {
      return { allowed: false, blockReason: "STRATEGY_COOLDOWN_DUPLICATE", adjustedQuantity: 0, riskAmountINR: 0, marginRequiredINR: 0, fingerprint };
    }

    // 5. Position Sizing & Margin Check
    const sizing = this.calculatePositionSize(
      signal.underlying,
      accountBalanceINR,
      entryPrice,
      slPrice,
      config.maxRiskPerTradePercent || 0.02,
      5 // 5x intraday MIS leverage
    );

    if (accountBalanceINR < sizing.marginRequiredINR && mode !== "BACKTEST") {
      return { allowed: false, blockReason: `INSUFFICIENT_MARGIN: Balance ₹${accountBalanceINR} < Margin ₹${sizing.marginRequiredINR}`, adjustedQuantity: 0, riskAmountINR: sizing.riskAmountINR, marginRequiredINR: sizing.marginRequiredINR, fingerprint };
    }

    // Record fingerprint on approval
    this.activeFingerprints.set(fingerprint, Date.now());

    return {
      allowed: true,
      adjustedQuantity: sizing.quantity,
      riskAmountINR: sizing.riskAmountINR,
      marginRequiredINR: sizing.marginRequiredINR,
      fingerprint
    };
  }
}
