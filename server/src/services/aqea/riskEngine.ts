/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Institutional Risk Engine (v2.4I Emergency Patch)
 * ═══════════════════════════════════════════════════════════════════
 */

import { AQEA_CONFIG } from "./config.js";
import { AqeaAuditService } from "./AqeaAudit.js";
import { Trade } from "../../models/Trade.js";
import { Settings } from "../../models/Settings.js";
import * as paper from "../paperState.js";
import { weatherIntelligenceEngine } from "../weatherIntelligenceEngine.js";
import mongoose from "mongoose";
import { toValidObjectId } from "../../utils/mongoUtils.js";

export interface RiskResponse {
  allowed: boolean;
  riskScore: number;
  positionSize: number; // Notional value
  maxLoss: number;
  leverage: number;
  reason: string;
}

export interface TradeContext {
  userId: string;
  symbol: string;
  mode: "PAPER" | "LIVE";
  accountType: "SPOT" | "FUTURES" | "INDIAN_NSE" | "INDIAN_BSE" | "INDIAN_NIFTY50";
  currentPrice: number;
  atr: number;
  winRate: number;
  rewardRisk: number;
  fundingRate: number;
}

export class RiskEngine {
  /**
   * Validates a trade against institutional risk parameters.
   * SINGLE SOURCE OF TRUTH for position sizing.
   */
  public static async validateTrade(ctx: TradeContext): Promise<RiskResponse> {
    // 1. Get Wallet Balance
    const wallet = paper.getWallet(ctx.userId, ctx.mode, ctx.accountType);
    const balance = wallet.get("USDT") ?? 0;

    if (ctx.mode === "LIVE" && balance <= 0) {
      return this.reject("BALANCE_ZERO");
    }

    // In PAPER mode with 0 balance, use standard $10,000 virtual baseline for hypothetical evidence sizing
    const effectiveBalance = (ctx.mode === "PAPER" && balance <= 0) ? 10000 : Math.max(0, balance);

    // 2. Open Positions Check (Recalculate from actual DB positions)
    // Scoped to this trade's own accountType — SPOT and FUTURES have fully independent wallets
    const isDbConnected = Boolean(mongoose?.connection?.readyState === 1);
    const openTrades = isDbConnected ? await Trade.find({
       userId: toValidObjectId(ctx.userId),
       mode: ctx.mode,
       accountType: ctx.accountType,
       status: "OPEN"
    }).lean() : [];
    
    if (openTrades.length >= AQEA_CONFIG.MAX_CONCURRENT_POSITIONS) {
       return this.reject(`MAX_POSITIONS_BREACH: ${openTrades.length}`);
    }

    // 3. Portfolio Exposure Check
    let totalMargin = 0;
    openTrades.forEach(t => {
       const lev = t.leverage || 1;
       totalMargin += (t.quantity * t.entryPrice) / lev;
    });
    
    if (totalMargin / effectiveBalance > AQEA_CONFIG.MAX_PORTFOLIO_EXPOSURE) {
       return this.reject("PORTFOLIO_EXPOSURE_LIMIT_REACHED");
    }

    // 4. Daily / Weekly / Monthly Drawdown Checks
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    const dayOfWeek = todayStart.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStart.setDate(todayStart.getDate() - diffToMonday);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    const [monthTrades, allTrades] = isDbConnected ? await Promise.all([
      Trade.find({ userId: toValidObjectId(ctx.userId), mode: ctx.mode, accountType: ctx.accountType, openedAt: { $gte: monthStart } }).lean(),
      Trade.find({ userId: toValidObjectId(ctx.userId), mode: ctx.mode, accountType: ctx.accountType, status: "CLOSED" }).lean(),
    ]) : [[], []];
    const tradesToday = monthTrades.filter(t => new Date(t.openedAt).getTime() >= todayStart.getTime());
    const weekTrades = monthTrades.filter(t => new Date(t.openedAt).getTime() >= weekStart.getTime());

    const dailyPnl = tradesToday.reduce((s, t) => s + (t.pnl ?? 0), 0);
    if (dailyPnl < 0 && Math.abs(dailyPnl) / effectiveBalance > AQEA_CONFIG.DAILY_DRAWDOWN_LIMIT) {
       return this.reject("DAILY_DRAWDOWN_BREACH");
    }

    const weeklyPnl = weekTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const monthlyPnl = monthTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const allTimePnl = allTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);

    if (weeklyPnl < 0 && Math.abs(weeklyPnl) / effectiveBalance > AQEA_CONFIG.WEEKLY_DRAWDOWN_LIMIT) {
       return this.reject("WEEKLY_DRAWDOWN_BREACH");
    }
    if (monthlyPnl < 0 && Math.abs(monthlyPnl) / effectiveBalance > AQEA_CONFIG.MONTHLY_DRAWDOWN_LIMIT) {
       return this.reject("MONTHLY_DRAWDOWN_BREACH");
    }
    if (allTimePnl < 0 && Math.abs(allTimePnl) / effectiveBalance > AQEA_CONFIG.PORTFOLIO_DRAWDOWN_LIMIT) {
       return this.reject("PORTFOLIO_DRAWDOWN_BREACH");
    }

    // 5. Position Sizing (Fixed Risk amount)
    // Formula: Risk Amount / Stop Loss Distance
    const riskAmount = effectiveBalance * AQEA_CONFIG.MAX_RISK_PER_TRADE;
    const slDistance = (ctx.atr || 1.0) * 2.5; // 2.5 ATR Stop (v2.8)
    const slPct = slDistance / (ctx.currentPrice || 1.0);

    // positionSize = riskAmount / slPct
    let positionSize = riskAmount / Math.max(slPct, 0.001);
    
    // Safety cap: Never allocate more than 10% notional in a single trade
    positionSize = Math.min(positionSize, effectiveBalance * 0.10);

    // Ensure positionSize is a finite number (Prevents NaN Quantity)
    if (!Number.isFinite(positionSize) || positionSize <= 0) {
       console.warn(`[AQEA_RISK] Invalid position size calculated (${positionSize}). Using safe default: 0.`);
       positionSize = 0;
    }

    // 6. Leverage Calculation & Enforcement
    // Futures: Required leverage to reach positionSize with 1% risk
    // Spot: Always 1x
    let leverage = 1;
    if (ctx.accountType === "FUTURES") {
       // We cap leverage at 10x
       leverage = Math.min(AQEA_CONFIG.MAX_LEVERAGE, positionSize / Math.max(riskAmount, 1));
       if (leverage < 1) leverage = 1;
    }

    const riskScore = this.calculateRiskScore(ctx, openTrades.length);

    // Weather Intelligence Multipliers (V1.0)
    const weatherRisk = weatherIntelligenceEngine.getRiskAdjustment();
    positionSize *= weatherRisk.sizeMultiplier;
    leverage = Math.max(1, Math.round(leverage * weatherRisk.leverageMultiplier));

    return {
      allowed: true,
      riskScore,
      positionSize: parseFloat(positionSize.toFixed(2)),
      maxLoss: parseFloat(riskAmount.toFixed(2)),
      leverage: Math.round(leverage),
      reason: `Risk Approved (Weather Adj: ${weatherRisk.sizeMultiplier.toFixed(2)}x)`
    };
  }

  private static calculateRiskScore(ctx: TradeContext, posCount: number): number {
    let score = 100;
    if (posCount >= 3) score -= 15;
    if (ctx.winRate < 0.50) score -= 20;
    if (ctx.rewardRisk < 1.0) score -= 10;
    if (ctx.fundingRate > 0.03) score -= 20;
    return Math.max(0, score);
  }

  private static reject(reason: string): RiskResponse {
    if (process.env.NODE_ENV !== "test") console.warn(`[AQEA_RISK_REJECT] ${reason}`);
    return {
      allowed: false,
      riskScore: 0,
      positionSize: 0,
      maxLoss: 0,
      leverage: 1,
      reason
    };
  }
}
