/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Quant Strategy Specialists Layer (Phase 4)
 * ═══════════════════════════════════════════════════════════════════
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
    const maFast = f.tensorVector[8];
    const maSlow = f.tensorVector[9];
    const macdHist = f.macd.histogram;
    const isBull = (maFast > maSlow || f.macd.momentum.includes("BULL")) && f.rsi.rsi14 >= 45 && f.rsi.rsi14 <= 75;
    const isBear = (maFast < maSlow || f.macd.momentum.includes("BEAR")) && f.rsi.rsi14 <= 55 && f.rsi.rsi14 >= 25;

    let direction: "LONG" | "SHORT" | "HOLD" = isBull ? "LONG" : (isBear ? "SHORT" : "HOLD");
    let confidence = isBull || isBear ? 0.76 : 0.40;
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
      meta: { maDiff: maFast - maSlow, macdHist }
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

    let direction: "LONG" | "SHORT" | "HOLD" = hasBullSMC ? "LONG" : (hasBearSMC ? "SHORT" : "HOLD");
    let confidence = hasBullSMC || hasBearSMC ? 0.82 : 0.40;

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
    const isAbsorptionBuy = f.cvd.cvdScore > 10 || f.orderBook.imbalance > 0.10;
    const isAbsorptionSell = f.cvd.cvdScore < -10 || f.orderBook.imbalance < -0.10;

    let direction: "LONG" | "SHORT" | "HOLD" = isAbsorptionBuy ? "LONG" : (isAbsorptionSell ? "SHORT" : "HOLD");
    let confidence = isAbsorptionBuy || isAbsorptionSell ? 0.75 : 0.45;

    return {
      strategyId: "ORDER_FLOW_CVD",
      name: "Order Flow & CVD Delta",
      direction,
      confidence,
      expectedMovePercent: f.atr.atrPercent * 1.0,
      timeHorizon: "SCALP",
      riskScore: 0.22,
      regimeCompatibility: 0.90,
      meta: { cvd: f.cvd.cvdScore, imbalance: f.orderBook.imbalance }
    };
  }

  public static evaluateGayatri(f: Standardized15Features): QuantExpertSignal {
    let alignedBullish = 0;
    let alignedBearish = 0;

    if (f.tensorVector[8] >= f.tensorVector[9]) alignedBullish++; else alignedBearish++;
    if (f.macd.histogram >= 0) alignedBullish++; else alignedBearish++;
    if (f.rsi.rsi14 >= 45 && f.rsi.rsi14 <= 75) alignedBullish++;
    if (f.rsi.rsi14 <= 55 && f.rsi.rsi14 >= 25) alignedBearish++;
    if (f.ohlcv.close >= f.bollinger.middle) alignedBullish++; else alignedBearish++;
    if (f.cvd.cvdScore >= 0) alignedBullish++; else alignedBearish++;
    if (f.orderBook.imbalance >= 0) alignedBullish++; else alignedBearish++;
    if (f.smc.structuralTrend === "BULLISH" || f.smc.orderBlock || f.smc.bos) alignedBullish++;

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
      meta: { alignedBullish, alignedBearish, totalChecks: 24, harmonicRatio: bullRatio - bearRatio }
    };
  }

  public static evaluateOhmkara(f: Standardized15Features): QuantExpertSignal {
    const rsi = f.rsi.rsi14;
    const midDist = Math.abs(f.ohlcv.close - f.bollinger.middle) / Math.max(1, f.bollinger.middle);
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
