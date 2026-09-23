/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Quant Strategy Specialists Layer (Phase 4)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  The LIVE strategy layer (autoTradeEngine → AQEAEngine.decide →
 *  LakshmiMasterRouter → QuantStrategyRegistry.evaluateAll). The backtester
 *  and the quantum StrategyAgent run this same code over candles via
 *  quantSignalsFromBars (the old separate reimplementations were removed).
 */

import { Standardized15Features } from "../pipeline/FeaturePipeline.js";
import { AnyRegime } from "../regimeEngine.js";

export interface QuantExpertSignal {
  strategyId: "AARYAN_MOMENTUM" | "AAYUSH_MEAN_REVERSION" | "SMC_INSTITUTIONAL" | "ORDER_FLOW_CVD" | "GAYATRI_24_SIGNAL" | "OHMKARA_528HZ";
  name: string;
  direction: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  expectedMovePercent: number;
  timeHorizon: "SCALP" | "INTRADAY" | "SWING";
  riskScore: number;
  regimeCompatibility: number;
  meta: any;
}

export class QuantStrategyRegistry {
  public static evaluateAaryan(f: Standardized15Features, regime: AnyRegime): QuantExpertSignal {
    // tensorVector[8]/[9] are (ema9-close)/price and (ema21-close)/price. The
    // `>` comparison is algebraically identical to ema9 vs ema21 (the shared
    // -close and /price cancel), so this reads as a fast/slow MA cross despite
    // the transformed values — the names reflect that they are EMA distances.
    const emaFastDist = f.tensorVector[8];
    const emaSlowDist = f.tensorVector[9];
    const macdHist = f.macd.histogram;
    const isBull = (emaFastDist > emaSlowDist || f.macd.momentum.includes("BULL")) && f.rsi.rsi14 >= 45 && f.rsi.rsi14 <= 75;
    const isBear = (emaFastDist < emaSlowDist || f.macd.momentum.includes("BEAR")) && f.rsi.rsi14 <= 55 && f.rsi.rsi14 >= 25;

    // Contradictory evidence (both true, e.g. bull MA cross but bearish MACD
    // momentum in the 45-55 RSI overlap) or no evidence (both false) → HOLD,
    // instead of silently defaulting to LONG on a mixed signal.
    const direction: "LONG" | "SHORT" | "HOLD" = isBull === isBear ? "HOLD" : (isBull ? "LONG" : "SHORT");
    const confidence = direction === "HOLD" ? 0.40 : 0.76;
    const rStr = String(regime || ""); const isTrending = rStr.includes("TRENDING") || rStr === "BREAKOUT";

    return {
      strategyId: "AARYAN_MOMENTUM",
      name: "Aaryan Momentum",
      direction,
      confidence,
      expectedMovePercent: f.atr.atrPercent * 1.5,
      timeHorizon: "INTRADAY",
      riskScore: isTrending ? 0.20 : 0.60,
      regimeCompatibility: isTrending ? 0.95 : 0.45,
      meta: { maDiff: emaFastDist - emaSlowDist, macdHist }
    };
  }

  public static evaluateAayush(f: Standardized15Features, regime: AnyRegime): QuantExpertSignal {
    const isOversold = f.rsi.rsi14 < 35 || f.bollinger.percentB < 0.15;
    const isOverbought = f.rsi.rsi14 > 65 || f.bollinger.percentB > 0.85;
    const isRanging = regime === "SIDEWAYS" || regime === "MEAN_REVERSION" || regime === "LOW_VOLATILITY" || regime === "RANGING";

    let direction: "LONG" | "SHORT" | "HOLD" = isOversold ? "LONG" : (isOverbought ? "SHORT" : "HOLD");
    let confidence = isOversold || isOverbought ? 0.78 : 0.35;

    return {
      strategyId: "AAYUSH_MEAN_REVERSION",
      name: "Aayush Mean Reversion",
      direction,
      confidence,
      expectedMovePercent: f.atr.atrPercent * 1.2,
      timeHorizon: "SCALP",
      riskScore: isRanging ? 0.18 : 0.65,
      regimeCompatibility: isRanging ? 0.95 : 0.35,
      meta: { rsi: f.rsi.rsi14, percentB: f.bollinger.percentB }
    };
  }

  public static evaluateSMC(f: Standardized15Features, regime: AnyRegime): QuantExpertSignal {
    const hasBullSMC = (f.smc.orderBlock || f.smc.fvg || f.smc.bos) && f.smc.structuralTrend !== "BEARISH";
    const hasBearSMC = (f.smc.orderBlock || f.smc.fvg || f.smc.choch) && f.smc.structuralTrend !== "BULLISH";

    // A NEUTRAL-structure order block / FVG satisfies BOTH sides; resolve that
    // contradiction (and the no-signal case) to HOLD rather than forcing LONG.
    const direction: "LONG" | "SHORT" | "HOLD" = hasBullSMC === hasBearSMC ? "HOLD" : (hasBullSMC ? "LONG" : "SHORT");
    const confidence = direction === "HOLD" ? 0.40 : 0.82;

    return {
      strategyId: "SMC_INSTITUTIONAL",
      name: "Smart Money Concepts",
      direction,
      confidence,
      expectedMovePercent: f.atr.atrPercent * 2.0,
      timeHorizon: "SWING",
      riskScore: 0.25,
      regimeCompatibility: 0.88,
      meta: { orderBlock: f.smc.orderBlock, fvg: f.smc.fvg, bos: f.smc.bos }
    };
  }

  public static evaluateOrderFlow(f: Standardized15Features, regime: AnyRegime): QuantExpertSignal {
    // f.cvd.cvdNormalized is a NORMALIZED CVD persistence ratio ∈ [-1, 1]
    // (OrderFlowEngine.cvdNormalized = EMA(net delta)/EMA(|delta|), threaded in via
    // FeaturePipeline.orderFlow), so this fixed threshold is portable across BTC and
    // low-volume alts — unlike the old raw-cumulative ±10 gate on f.cvd.cvdScore,
    // whose magnitude drifted with session length and symbol volume. The ±0.25 bar
    // means "sustained one-sided flow ≥ 25% of gross flow". f.orderBook.imbalance
    // (∈ [-1, 1]) is the instantaneous book skew; the two OR-terms fire on either
    // persistent CVD pressure or a strong instantaneous skew. Callers that pass no
    // live order flow leave cvdNormalized at 0, so that term never fires and the
    // signal reduces to the imbalance test — matching the backtest/shadow paths.
    const isAbsorptionBuy = f.cvd.cvdNormalized > 0.25 || f.orderBook.imbalance > 0.10;
    const isAbsorptionSell = f.cvd.cvdNormalized < -0.25 || f.orderBook.imbalance < -0.10;

    // Divergent flow (both true, e.g. positive CVD but negative book imbalance)
    // or flat (both false) → HOLD, not a forced LONG.
    const direction: "LONG" | "SHORT" | "HOLD" = isAbsorptionBuy === isAbsorptionSell ? "HOLD" : (isAbsorptionBuy ? "LONG" : "SHORT");
    const confidence = direction === "HOLD" ? 0.45 : 0.75;

    return {
      strategyId: "ORDER_FLOW_CVD",
      name: "Order Flow & CVD Delta",
      direction,
      confidence,
      expectedMovePercent: f.atr.atrPercent * 1.0,
      timeHorizon: "SCALP",
      riskScore: 0.22,
      regimeCompatibility: 0.90,
      meta: { cvd: f.cvd.cvdScore, cvdNormalized: f.cvd.cvdNormalized, imbalance: f.orderBook.imbalance }
    };
  }

  public static evaluateGayatri(f: Standardized15Features): QuantExpertSignal {
    let alignedBullish = 0;
    let alignedBearish = 0;

    // Symmetric checks: each one votes bull, bear, or (no data / flat) neither.
    // Previously ties and missing data counted as bullish — cvdScore is always
    // 0 on the live path and imbalance is 0 without a book, so `>= 0` handed
    // LONG two free votes — and the SMC check had no bearish counterpart, so
    // LONG could reach 8/8 while SHORT capped at 6/8.
    const vote = (x: number, eps = 0) => { if (x > eps) alignedBullish++; else if (x < -eps) alignedBearish++; };
    vote(f.tensorVector[8] - f.tensorVector[9]);
    vote(f.macd.histogram);
    if (f.rsi.rsi14 >= 45 && f.rsi.rsi14 <= 75) alignedBullish++;
    if (f.rsi.rsi14 <= 55 && f.rsi.rsi14 >= 25) alignedBearish++;
    vote(f.ohlcv.close - f.bollinger.middle);
    vote(f.cvd.cvdNormalized, 0.05);
    vote(f.orderBook.imbalance, 0.02);
    if (f.smc.structuralTrend === "BULLISH" || (f.smc.bos && f.smc.structuralTrend !== "BEARISH")) alignedBullish++;
    else if (f.smc.structuralTrend === "BEARISH" || f.smc.choch) alignedBearish++;

    const totalChecks = 8;
    const bullRatio = alignedBullish / totalChecks;
    const bearRatio = alignedBearish / totalChecks;

    let direction: "LONG" | "SHORT" | "HOLD" = bullRatio >= 0.625 ? "LONG" : (bearRatio >= 0.625 ? "SHORT" : "HOLD");
    let confidence = Math.max(bullRatio, bearRatio);

    return {
      strategyId: "GAYATRI_24_SIGNAL",
      name: "Gayatri 24-Signal Resonance Matrix",
      direction,
      confidence: Number(confidence.toFixed(4)),
      expectedMovePercent: f.atr.atrPercent * 1.4,
      timeHorizon: "INTRADAY",
      riskScore: 0.20,
      regimeCompatibility: 0.90,
      meta: { alignedBullish, alignedBearish, totalChecks, harmonicRatio: bullRatio - bearRatio }
    };
  }

  public static evaluateOhmkara(f: Standardized15Features): QuantExpertSignal {
    const rsi = f.rsi.rsi14;
    // Relative distance from the Bollinger mid. It divided by max(1, mid), so
    // for sub-$1 coins (DOGE, SHIB, PEPE, BONK…) the distance was absolute and
    // ~0 — they could never register as stretched.
    const mid = f.bollinger.middle;
    const midDist = mid > 0 ? Math.abs(f.ohlcv.close - mid) / mid : 0;
    const rsiBalance = 1 - Math.abs(rsi - 50) / 50;
    const equilibriumScore = rsiBalance * 0.7 + (1 - Math.min(1, midDist * 20)) * 0.3;

    const isExtremeOverbought = rsi > 70 && midDist > 0.03;
    const isExtremeOversold = rsi < 30 && midDist > 0.03;

    let direction: "LONG" | "SHORT" | "HOLD" = isExtremeOversold ? "LONG" : (isExtremeOverbought ? "SHORT" : "HOLD");
    let confidence = isExtremeOversold || isExtremeOverbought ? 0.72 : equilibriumScore;

    return {
      strategyId: "OHMKARA_528HZ",
      name: "Ohmkara Harmonic Equilibrium",
      direction,
      confidence: Number(confidence.toFixed(4)),
      expectedMovePercent: f.atr.atrPercent,
      timeHorizon: "INTRADAY",
      riskScore: 0.18,
      regimeCompatibility: 0.92,
      meta: { equilibriumScore: Number(equilibriumScore.toFixed(4)), rsiBalance: Number(rsiBalance.toFixed(4)), midDist }
    };
  }

  public static evaluateAll(f: Standardized15Features, regime: AnyRegime): QuantExpertSignal[] {
    return [
      this.evaluateAaryan(f, regime),
      this.evaluateAayush(f, regime),
      this.evaluateSMC(f, regime),
      this.evaluateOrderFlow(f, regime),
      this.evaluateGayatri(f),
      this.evaluateOhmkara(f)
    ];
  }
}
