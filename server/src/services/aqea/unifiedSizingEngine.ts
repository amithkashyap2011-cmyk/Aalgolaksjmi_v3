/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Unified Position Sizing Engine
 *
 *  Single source of truth for position sizing. Replaces the split
 *  between AdaptiveRiskEngine (hardcoded $100) and RiskEngine (discarded).
 *
 *  Formula:
 *    positionSize = Balance
 *                 × effectiveRiskPct   (Kelly-capped, ≤ MAX_RISK_PER_TRADE)
 *                 ÷ slPct              (SL distance as % of price)
 *                 × heatMultiplier     (capital-at-risk heat scalar)
 *                 × regimeMultiplier   (market regime scalar)
 *                 × qualityMultiplier  (trade quality scalar)
 * ═══════════════════════════════════════════════════════════════════
 */

import mongoose from "mongoose";
import { Trade } from "../../models/Trade.js";
import { AQEA_CONFIG } from "./config.js";
import { toValidObjectId } from "../../utils/mongoUtils.js";
import type { MarketRegime } from "../regimeDetectionEngine.js";
import type { RegimeStatus } from "../regimeDetectionEngine.js";
import type { TradeQualityScore } from "../tradeQualityEngine.js";

export interface SizingInput {
  balance: number;
  atr: number;
  price: number;
  regime: RegimeStatus;
  quality: TradeQualityScore;
  portfolioHeat: number;  // capital-at-risk % (0–100)
  userId: string;
  mode: "PAPER" | "LIVE";
}

export interface SizingOutput {
  positionSize: number;      // notional USDT to allocate
  leverage: number;          // integer 1–MAX_LEVERAGE
  kellyFraction: number;     // raw Kelly value (for audit/telemetry)
  effectiveRiskPct: number;  // actual risk % applied after Kelly cap
  heatMultiplier: number;
  regimeMultiplier: number;
  qualityMultiplier: number;
  reason: string;
}

export class UnifiedSizingEngine {
  /**
   * Main entry point. Computes the unified position size incorporating
   * all five factors: balance, Kelly, risk limits, portfolio heat, and regime.
   */
  static async compute(input: SizingInput): Promise<SizingOutput> {
    const { balance, atr, price, regime, quality, portfolioHeat, userId, mode } = input;

    // 1. Rolling Kelly from last 30 closed trades
    const kelly = await this.computeRollingKelly(userId, mode);

    // Half-Kelly for variance reduction; capped at MAX_RISK_PER_TRADE (1%)
    const halfKelly = kelly * 0.5;
    const effectiveRiskPct = Math.max(
      AQEA_CONFIG.MAX_RISK_PER_TRADE * 0.25,          // floor: 0.25% (avoid sizing to zero on new accounts)
      Math.min(halfKelly, AQEA_CONFIG.MAX_RISK_PER_TRADE)  // ceiling: 1%
    );

    // 2. SL distance as % of price — must match exitEngine SL = 1.5 ATR
    const effectiveAtr = Math.max(atr, price * 0.004); // same 0.4% ATR floor as exitEngine
    const slPct = (effectiveAtr * 1.5) / Math.max(price, 1);

    // 3. Base position size (risk-proportional to balance)
    // In PAPER mode with 0 balance, use standard $10,000 virtual baseline for hypothetical evidence sizing
    const effectiveBalance = (balance <= 0 && mode === "PAPER") ? 10000 : Math.max(0, balance);
    const riskAmount = effectiveBalance * effectiveRiskPct;
    let baseSize = slPct > 0 ? riskAmount / slPct : riskAmount * 10;

    // 3b. Volatility-Scaled Exposure Cap (VSE) — scales MAX_PORTFOLIO_EXPOSURE by asset relative volatility
    // Benchmark ATR ratio = 0.015 (1.5% ATR). High-volatility altcoins (e.g. ATR > 3.0%) receive smaller caps.
    const atrRatio = effectiveAtr / Math.max(price, 1);
    const benchmarkAtrRatio = 0.015;
    const volatilityScalar = Math.max(0.25, Math.min(1.0, benchmarkAtrRatio / atrRatio));
    const dynamicExposureCap = AQEA_CONFIG.MAX_PORTFOLIO_EXPOSURE * volatilityScalar;

    // Hard cap: single trade never exceeds dynamic Volatility-Scaled Exposure Cap of account
    baseSize = Math.min(baseSize, effectiveBalance * dynamicExposureCap);

    // 4. Multipliers
    const heatMul    = this.heatMultiplier(portfolioHeat);
    const regimeMul  = this.regimeMultiplier(regime.regime);
    const qualityMul = this.qualityMultiplier(quality.rating);

    // 5. Final size and leverage
    const finalSize    = baseSize * heatMul * regimeMul * qualityMul;
    const positionSize = parseFloat(Math.max(0, finalSize).toFixed(2));

    // AI-decided leverage — scales within [1, MAX_LEVERAGE] by CONVICTION rather
    // than the notional/margin ratio (which always blew past the cap, so every
    // trade clamped to a flat value). Strong signal quality + favourable regime +
    // low capital heat + tight (low-volatility) stop → lever up toward the cap;
    // weak / choppy / volatile / crowded setups stay near 1x.
    const qN   = Math.min(qualityMul / 1.5, 1);               // 0 (REJECT) … 1 (AGGRESSIVE)
    const rN   = Math.min(regimeMul / 1.2, 1);                // 0 (CRISIS)  … 1 (BULL_EXPANSION)
    const volN = Math.max(0, Math.min(1, 1 - slPct / 0.02));  // tight stop → 1, ≥2% vol → 0
    const conviction = Math.max(0, Math.min(1,
      0.40 * qN + 0.30 * rN + 0.15 * heatMul + 0.15 * volN,
    ));
    let leverage = Math.round(1 + (AQEA_CONFIG.MAX_LEVERAGE - 1) * conviction);
    leverage = Math.max(1, Math.min(AQEA_CONFIG.MAX_LEVERAGE, leverage));

    const reason = [
      `Bal:$${balance.toFixed(0)}`,
      `Kelly:${(kelly * 100).toFixed(1)}%→Risk:${(effectiveRiskPct * 100).toFixed(2)}%`,
      `Heat:${portfolioHeat.toFixed(1)}%(×${heatMul.toFixed(2)})`,
      `${regime.regime}(×${regimeMul.toFixed(2)})`,
      `${quality.rating}(×${qualityMul.toFixed(2)})`,
      `Size:$${positionSize}@${leverage}x`,
    ].join(" | ");

    return {
      positionSize,
      leverage,
      kellyFraction: kelly,
      effectiveRiskPct,
      heatMultiplier: heatMul,
      regimeMultiplier: regimeMul,
      qualityMultiplier: qualityMul,
      reason,
    };
  }

  /**
   * Computes rolling Kelly fraction from the last 30 closed trades.
   * Returns MAX_RISK_PER_TRADE when fewer than 10 trades exist (insufficient data).
   * Returns 0 when the system is in a losing streak (Kelly goes negative).
   */
  static async computeRollingKelly(userId: string, mode: "PAPER" | "LIVE"): Promise<number> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return AQEA_CONFIG.MAX_RISK_PER_TRADE;
      }
      const trades = await Trade.find({
        userId: toValidObjectId(userId),
        mode,
        status: "CLOSED",
      })
        .sort({ closedAt: -1 })
        .limit(30)
        .select("pnl")
        .lean();

      // Insufficient history — use conservative default (full 1% risk)
      if (!trades || trades.length < 10) return AQEA_CONFIG.MAX_RISK_PER_TRADE;

    const wins   = trades.filter(t => (t.pnl ?? 0) > 0);
    const losses = trades.filter(t => (t.pnl ?? 0) <= 0);

    if (wins.length === 0)   return 0;                              // all losses → Kelly = 0
    if (losses.length === 0) return AQEA_CONFIG.MAX_RISK_PER_TRADE; // all wins → use max

    const W      = wins.length / trades.length;
    const avgWin = wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length;
    const avgLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0) / losses.length);

    if (avgLoss === 0) return AQEA_CONFIG.MAX_RISK_PER_TRADE;

    const R     = avgWin / avgLoss;
    const kelly = W - (1 - W) / R;

    // Floor at 0 (never risk more than 0), cap at 25% (half-Kelly max = 12.5%)
    return Math.max(0, Math.min(0.25, kelly));
    } catch {
      return AQEA_CONFIG.MAX_RISK_PER_TRADE;
    }
  }

  /**
   * Capital-at-risk heat scalar.
   * Reduces size as more capital is deployed; hard-blocks at ≥ 40%.
   */
  private static heatMultiplier(heat: number): number {
    if (heat >= 40) return 0.00;   // hard block — already handled by heat enforcement gate
    if (heat >= 30) return 0.25;   // 75% reduction — approaching limit
    if (heat >= 20) return 0.60;   // 40% reduction — elevated exposure
    if (heat >= 10) return 0.85;   // 15% reduction — moderate exposure
    return 1.00;                    // full size — low exposure
  }

  /**
   * Market regime scalar. Increases size in trending conditions,
   * reduces in choppy/volatile/stress regimes.
   */
  private static regimeMultiplier(regime: MarketRegime): number {
    const multipliers: Record<MarketRegime, number> = {
      BULL_EXPANSION:        1.20,   // trend following — increase size
      BREAKOUT_IMMINENT:     1.00,   // neutral until breakout confirmed
      SIDEWAYS_ACCUMULATION: 0.80,   // slightly reduce — no directional edge
      TREND_EXHAUSTION:      0.60,   // reduce — reversal risk elevated
      BEAR_CAPITULATION:     0.70,   // reduce — high uncertainty
      VOLATILITY_SPIKE:      0.50,   // halve — wide spreads, whipsaw risk
      WEATHER_STRESS_CRISIS: 0.00,   // block all entries
    };
    return multipliers[regime] ?? 1.0;
  }

  /**
   * Trade quality scalar based on AQEA signal confidence rating.
   */
  private static qualityMultiplier(rating: TradeQualityScore["rating"]): number {
    const multipliers: Record<TradeQualityScore["rating"], number> = {
      AGGRESSIVE: 1.50,
      NORMAL:     1.00,
      SMALL:      0.50,
      REJECT:     0.00,
    };
    return multipliers[rating] ?? 1.0;
  }

  /**
   * Computes capital-at-risk portfolio heat from open trade records.
   * Replaces the count-based formula: (openCount / maxPositions) × 100
   *
   * New formula: (totalMarginDeployed / balance) × 100
   */
  static async computeCapitalHeat(
    userId: string,
    mode: "PAPER" | "LIVE",
    balance: number,
    accountType?: "SPOT" | "FUTURES" | string
  ): Promise<number> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return 0;
      }

      if (balance <= 0) {
        if (mode === "PAPER") {
          const query: any = { userId: toValidObjectId(userId), mode, status: "OPEN" };
          if (accountType) query.accountType = accountType === "SPOT" ? { $in: ["SPOT", undefined, null] } : accountType;
          const openTrades = await Trade.find(query).select("quantity entryPrice leverage").lean();
          if (openTrades.length === 0) return 0;
          const totalMargin = openTrades.reduce((sum, t) => sum + (t.quantity * t.entryPrice) / Math.max(t.leverage || 1, 1), 0);
          return (totalMargin / 10000) * 100;
        }
        return 100; // treat zero balance in LIVE as max heat
      }

      const query: any = {
        userId: toValidObjectId(userId),
        mode,
        status: "OPEN",
      };

      if (accountType) {
        if (accountType === "SPOT") {
          query.accountType = { $in: ["SPOT", undefined, null] };
        } else if (accountType === "FUTURES") {
          query.accountType = "FUTURES";
        } else {
          query.accountType = accountType;
        }
      }

      const openTrades = await Trade.find(query)
        .select("quantity entryPrice leverage")
        .lean();

      const totalMargin = openTrades.reduce(
        (sum, t) => sum + (t.quantity * t.entryPrice) / Math.max(t.leverage || 1, 1),
        0
      );

      return (totalMargin / balance) * 100;
    } catch {
      return 0;
    }
  }
}
