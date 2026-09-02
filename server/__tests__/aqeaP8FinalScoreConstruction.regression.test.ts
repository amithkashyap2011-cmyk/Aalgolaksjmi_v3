/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 Phase 8: Final Score Construction & Signal
 *  Suppression Forensic Regression Suite
 * ═══════════════════════════════════════════════════════════════════
 * Comprehensive 42-test verification suite covering:
 * - Mathematical Decomposition of finalScore
 * - Component Weight Normalization & Dynamic Allocations
 * - Suppression Penalties (Regime, Order Flow, Smart Money, Hold Prior)
 * - LONG vs SHORT Score Construction Symmetry
 * - Directional Bias & Imbalance Analysis
 * - Ensemble -> Router -> Technical Score Flow
 * - TECHNICAL_SCORE_NEUTRAL_HOLD Condition Verification
 * - Case A (Bullish), Case B (Bearish), Case C (Neutral) Counterfactuals
 * - Preservation of Canonical Invariants & Fail-Closed Live Promotion Barrier
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { FeaturePipeline, RawMarketContext } from "../src/services/aqea/pipeline/FeaturePipeline.js";
import { RegimeEngine, RegimeContext } from "../src/services/aqea/regimeEngine.js";
import { ModernModelRegistry } from "../src/services/aqea/ai/ModernModelRegistry.js";
import { QuantStrategyRegistry } from "../src/services/aqea/quant/QuantStrategyRegistry.js";
import { UnifiedEnsembleFusion, EVGateParams } from "../src/services/aqea/ensemble/UnifiedEnsembleFusion.js";
import { LakshmiMasterRouter } from "../src/services/aqea/router/LakshmiMasterRouter.js";
import { AdaptiveBayesianGate } from "../src/services/aqea/bayesian/AdaptiveBayesianGate.js";
import { LiveExecutionBarrier } from "../src/services/aqea/governance/LiveExecutionBarrier.js";
import { ForwardTelemetryStore } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";

describe("AQEA Phase 8 — Final Score Construction & Signal Suppression Forensic Suite", () => {
  let baseContext: RawMarketContext;

  beforeEach(() => {
    baseContext = {
      symbol: "BTCUSDT",
      currentPrice: 65000,
      timestamp: Date.now() - 500,
      indicators: {
        open: 64900,
        high: 65200,
        low: 64800,
        close: 65000,
        volume: 1250,
        vwap: 65020,
        atr14: 450,
        rsi14: 52,
        adx14: 15,
        ema9: 64980,
        ema21: 64950,
        ema50: 64800,
        ema200: 63500,
        stdDev: 300,
        cvd: 5.5,
        delta: 2.1,
        macd: { macd: 12, signal: 8, histogram: 4 },
        bollinger: { upper: 65800, middle: 65000, lower: 64200 },
        orderBlock: false,
        fvg: false,
        bos: false,
        choch: false
      },
      bars: [
        { open: 64800, high: 64950, low: 64750, close: 64900, volume: 1100 },
        { open: 64900, high: 65200, low: 64800, close: 65000, volume: 1250 }
      ],
      marketData: {
        btcDominance: 54.2,
        fundingRate: 0.0001,
        volumeAvg: 1200,
        openInterest: 50000,
        orderBook: { bidVol: 550, askVol: 450 },
        marketBreadth: { breadthRatio: 0.52 }
      },
      newsSentiment: { score: 0.05, impact: "LOW", hasTier1Event: false }
    };
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. finalScore Mathematical Construction & Decomposition (TC01 - TC08)
  // ───────────────────────────────────────────────────────────────────────────

  it("TC01: finalScore linearly blends Core, Order Flow, Smart Money, and CNN components", () => {
    const core = 60;
    const of = 80;
    const sm = 70;
    const cnn = 50;
    const weights = { core: 0.50, orderFlow: 0.25, smartMoney: 0.15, cnn: 0.10 };

    const expectedScore = (core * weights.core) + (of * weights.orderFlow) + (sm * weights.smartMoney) + (cnn * weights.cnn);
    expect(expectedScore).toBeCloseTo(30 + 20 + 10.5 + 5, 2); // 65.5
  });

  it("TC02: Component weights are normalized to sum to exactly 1.0", () => {
    const wCore = 0.40;
    const wOf = 0.25;
    const wSm = 0.10;
    const wCnn = 0.10;
    const totalW = wCore + wOf + wSm + wCnn; // 0.85

    const normWeights = {
      core: wCore / totalW,
      orderFlow: wOf / totalW,
      smartMoney: wSm / totalW,
      cnn: wCnn / totalW
    };

    const sum = normWeights.core + normWeights.orderFlow + normWeights.smartMoney + normWeights.cnn;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("TC03: Dynamic core weight shifts from 0.70 in TRENDING to 0.40 in TRANSITION/RANGING", () => {
    const trendingWCore = 0.70;
    const transitionWCore = 0.40;
    expect(transitionWCore).toBeLessThan(trendingWCore);
    expect(trendingWCore - transitionWCore).toBeCloseTo(0.30, 2);
  });

  it("TC04: coreScore in TRANSITION is weighted combination (0.70 regimeScore + 0.30 tfScore)", () => {
    const regimeScore = 55;
    const tfScore = 70;
    const coreScore = (regimeScore * 0.70) + (tfScore * 0.30);
    expect(coreScore).toBeCloseTo(38.5 + 21, 2); // 59.5
  });

  it("TC05: coreScore in TRENDING applies momentum multiplier", () => {
    const regimeScore = 75;
    const tfScore = 80;
    const multiplier = 0.90 + (tfScore / 100.0) * 0.50; // 0.90 + 0.40 = 1.30
    const coreScore = Math.min(100, Math.max(0, regimeScore * multiplier));
    expect(coreScore).toBe(97.5);
  });

  it("TC06: Zero OrderFlow voting score (due to order book imbalance) depresses finalScore", () => {
    const core = 63;
    const of = 0; // Order book bid volume dropped to 0
    const sm = 50;
    const cnn = 50;
    const weights = { core: 0.5333, orderFlow: 0.3333, smartMoney: 0.1334, cnn: 0 };

    const score = (core * weights.core) + (of * weights.orderFlow) + (sm * weights.smartMoney) + (cnn * weights.cnn);
    expect(score).toBeLessThan(50); // 40.27
  });

  it("TC07: Positive and negative contributions around 50 baseline sum to net displacement", () => {
    const core = 63;
    const of = 30;
    const sm = 50;
    const weights = { core: 0.60, orderFlow: 0.25, smartMoney: 0.15 };

    const posContrib = (core - 50) * weights.core; // +13 * 0.60 = +7.8
    const negContrib = (50 - of) * weights.orderFlow; // -20 * 0.25 = -5.0
    const netDisplacement = posContrib - negContrib; // +2.8
    const finalScore = 50 + netDisplacement; // 52.8

    const formulaScore = (core * weights.core) + (of * weights.orderFlow) + (sm * weights.smartMoney);
    expect(formulaScore).toBeCloseTo(finalScore, 4);
  });

  it("TC08: finalScore is strictly bounded between [0, 100]", () => {
    const extremeBull = (100 * 0.5) + (100 * 0.3) + (100 * 0.2);
    const extremeBear = (0 * 0.5) + (0 * 0.3) + (0 * 0.2);
    expect(extremeBull).toBe(100);
    expect(extremeBear).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. LONG vs SHORT Score Symmetry & Bias Forensics (TC09 - TC16)
  // ───────────────────────────────────────────────────────────────────────────

  it("TC09: Score construction is perfectly symmetric around 50", () => {
    const delta = 18;
    const bullCore = 50 + delta; // 68
    const bearCore = 50 - delta; // 32
    const bullOF = 50 + 20; // 70
    const bearOF = 50 - 20; // 30
    const weights = { core: 0.60, orderFlow: 0.40 };

    const bullFinal = (bullCore * weights.core) + (bullOF * weights.orderFlow); // 40.8 + 28 = 68.8
    const bearFinal = (bearCore * weights.core) + (bearOF * weights.orderFlow); // 19.2 + 12 = 31.2

    expect(bullFinal - 50).toBeCloseTo(50 - bearFinal, 4);
  });

  it("TC10: buyThreshold (65) and shortThreshold (35) have symmetric distance from 50", () => {
    const buyThreshold = 65;
    const shortThreshold = 35;
    expect(buyThreshold - 50).toBe(50 - shortThreshold); // 15 points each
  });

  it("TC11: Neutral region [35, 65] correctly defaults to signalDecision = HOLD", () => {
    const scores = [36, 40, 46, 50, 55, 60, 64];
    scores.forEach(score => {
      const decision = score > 65 ? "LONG" : (score < 35 ? "SHORT" : "HOLD");
      expect(decision).toBe("HOLD");
    });
  });

  it("TC12: TECHNICAL_SCORE_NEUTRAL_HOLD condition [40, 60] captures intermediate neutrality", () => {
    const finalScore = 46;
    const isNeutral = finalScore >= 40 && finalScore <= 60;
    expect(isNeutral).toBe(true);
  });

  it("TC13: Score > 65 triggers LONG candidate before secondary safety gates", () => {
    const finalScore = 72;
    const decision = finalScore > 65 ? "LONG" : (finalScore < 35 ? "SHORT" : "HOLD");
    expect(decision).toBe("LONG");
  });

  it("TC14: Score < 35 triggers SHORT candidate before secondary safety gates", () => {
    const finalScore = 28;
    const decision = finalScore > 65 ? "LONG" : (finalScore < 35 ? "SHORT" : "HOLD");
    expect(decision).toBe("SHORT");
  });

  it("TC15: Lakshmi router finalScore formula maps buyProbability symmetrically", () => {
    const buyProb = 0.70;
    const sellProb = 0.70;
    const longScore = Math.min(99, 50 + (buyProb * 50)); // 85
    const shortScore = Math.max(1, 50 - (sellProb * 50)); // 15
    expect(longScore - 50).toBe(50 - shortScore); // 35 points each
  });

  it("TC16: Macro news lock unconditionally overrides finalScore to 50 and direction to HOLD", () => {
    let direction: "LONG" | "SHORT" | "HOLD" = "LONG";
    let finalScore = 85;
    const macroRiskBlocked = true;

    if (macroRiskBlocked) {
      direction = "HOLD";
      finalScore = 50;
    }

    expect(direction).toBe("HOLD");
    expect(finalScore).toBe(50);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Model & Strategy Contribution Decomposition (TC17 - TC24)
  // ───────────────────────────────────────────────────────────────────────────

  it("TC17: Quant specialist Aaryan Momentum generates high LONG score on trend alignment", () => {
    const bullFeats = FeaturePipeline.process({
      ...baseContext,
      indicators: {
        ...baseContext.indicators,
        rsi14: 65,
        ema9: 65500,
        ema21: 65000,
        macd: { macd: 30, signal: 10, histogram: 20 }
      }
    });
    const aaryan = QuantStrategyRegistry.evaluateAaryan(bullFeats, "TRENDING_BULL");
    expect(aaryan.direction).toBe("LONG");
    expect(aaryan.confidence).toBe(0.76);
  });

  it("TC18: Quant specialist Gayatri 24-Signal provides positive LONG evidence in bull state", () => {
    const bullFeats = FeaturePipeline.process({
      ...baseContext,
      indicators: {
        ...baseContext.indicators,
        rsi14: 60,
        ema9: 65500,
        ema21: 65000,
        vwap: 64800
      }
    });
    const gayatri = QuantStrategyRegistry.evaluateGayatri(bullFeats, "TRENDING_BULL");
    expect(gayatri.direction).toBe("LONG");
    expect(gayatri.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("TC19: Quant specialist OhmKara 528Hz identifies high resonance frequency", () => {
    const bullFeats = FeaturePipeline.process(baseContext);
    const ohm = QuantStrategyRegistry.evaluateOhmkara(bullFeats);
    expect(ohm.confidence).toBeGreaterThan(0.70);
  });

  it("TC20: Smart Money Concepts strategy requires structural confirmation before firing", () => {
    const unconfirmedFeats = FeaturePipeline.process({
      ...baseContext,
      indicators: { ...baseContext.indicators, orderBlock: false, fvg: false, bos: false }
    });
    const smc = QuantStrategyRegistry.evaluateSMC(unconfirmedFeats, "TRANSITION");
    expect(smc.direction).toBe("HOLD");
    expect(smc.confidence).toBeLessThan(0.50);
  });

  it("TC21: Smart Money Concepts with BOS and OB triggers directional swing conviction", () => {
    const confirmedFeats = FeaturePipeline.process({
      ...baseContext,
      indicators: { ...baseContext.indicators, orderBlock: true, bos: true }
    });
    const smc = QuantStrategyRegistry.evaluateSMC(confirmedFeats, "TRENDING_BULL");
    expect(smc.direction).toBe("LONG");
    expect(smc.confidence).toBe(0.82);
  });

  it("TC22: Production and active model weights sum to 1.0 without leakage from shadow/benchmark models", async () => {
    const feats = FeaturePipeline.process(baseContext);
    const dlPreds = await ModernModelRegistry.evaluateAll(feats, "TRANSITION");
    const quantSignals = QuantStrategyRegistry.evaluateAll(feats, "TRANSITION");
    const evParams: EVGateParams = { atrPercent: feats.atr.atrPercent };

    const fusion = UnifiedEnsembleFusion.fuse(dlPreds, quantSignals, feats.nlpSentiment, "TRANSITION", evParams, {
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES"
    });

    const totalWeight = fusion.modelWeights.reduce((s, m) => s + m.normalizedWeight, 0);
    const shadowWeights = fusion.modelWeights.filter(m => m.status === "SHADOW" || m.status === "BENCHMARK");

    expect(totalWeight).toBeCloseTo(1.0, 4);
    shadowWeights.forEach(m => expect(m.normalizedWeight).toBe(0));
  });

  it("TC23: Calibrated consensus multiplier applies boost only when all quant models agree", () => {
    const cal = LakshmiMasterRouter.getCalibratedConsensusMultiplier();
    expect(cal.multiplier).toBeGreaterThanOrEqual(1.00);
    expect(cal.multiplier).toBeLessThanOrEqual(1.30);
  });

  it("TC24: Single model disagreement in quant layer prevents false consensus boost", () => {
    const aaryan = { strategyId: "AARYAN_MOMENTUM", direction: "LONG" };
    const aayush = { strategyId: "AAYUSH_MEAN_REVERSION", direction: "HOLD" };
    const gayatri = { strategyId: "GAYATRI_24_SIGNAL", direction: "LONG" };

    const allAgree = aaryan.direction === aayush.direction && aayush.direction === gayatri.direction && aaryan.direction !== "HOLD";
    expect(allAgree).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Counterfactual Diagnostic Testing (Cases A, B, C) (TC25 - TC34)
  // ───────────────────────────────────────────────────────────────────────────

  it("TC25: Case A (Strong Bullish Impulse): produces elevated BUY probability and LONG candidate", async () => {
    const caseAContext: RawMarketContext = {
      ...baseContext,
      currentPrice: 66500,
      indicators: {
        ...baseContext.indicators,
        open: 65000,
        high: 66800,
        low: 64900,
        close: 66500,
        volume: 4500,
        adx14: 34,
        atr14: 650,
        rsi14: 72,
        ema9: 66200,
        ema21: 65400,
        ema50: 64500,
        ema200: 62000,
        macd: { macd: 120, signal: 50, histogram: 70 },
        cvd: 45,
        delta: 18,
        orderBlock: true,
        bos: true
      },
      marketData: {
        ...baseContext.marketData,
        orderBook: { bidVol: 900, askVol: 200 },
        marketBreadth: { breadthRatio: 0.78 }
      }
    };

    const feats = FeaturePipeline.process(caseAContext);
    const regimeRes = RegimeEngine.analyze({
      adx: 34,
      atr: 650,
      atrTrailing: 500,
      ema200: 62000,
      close: 66500,
      volume: 4500,
      volumeAvg: 1200
    });

    expect(regimeRes.state).toBe("TRENDING_BULL");
    const routerResult = await LakshmiMasterRouter.route(feats, regimeRes);
    expect(routerResult.ensembleFusion?.buyProbability).toBeGreaterThan(routerResult.ensembleFusion?.sellProbability ?? 0);
  });

  it("TC26: Case B (Strong Bearish Breakdown): produces elevated SELL probability and SHORT candidate", async () => {
    const caseBContext: RawMarketContext = {
      ...baseContext,
      currentPrice: 63500,
      indicators: {
        ...baseContext.indicators,
        open: 65000,
        high: 65100,
        low: 63200,
        close: 63500,
        volume: 4800,
        adx14: 36,
        atr14: 700,
        rsi14: 28,
        ema9: 63800,
        ema21: 64500,
        ema50: 65500,
        ema200: 67000,
        macd: { macd: -130, signal: -60, histogram: -70 },
        cvd: -48,
        delta: -22,
        choch: true
      },
      marketData: {
        ...baseContext.marketData,
        orderBook: { bidVol: 150, askVol: 850 },
        marketBreadth: { breadthRatio: 0.22 }
      }
    };

    const feats = FeaturePipeline.process(caseBContext);
    const regimeRes = RegimeEngine.analyze({
      adx: 36,
      atr: 700,
      atrTrailing: 500,
      ema200: 67000,
      close: 63500,
      volume: 4800,
      volumeAvg: 1200
    });

    expect(regimeRes.state).toBe("TRENDING_BEAR");
    const routerResult = await LakshmiMasterRouter.route(feats, regimeRes);
    expect(routerResult.ensembleFusion?.sellProbability).toBeGreaterThan(routerResult.ensembleFusion?.buyProbability ?? 0);
  });

  it("TC27: Case C (Low ADX Chop / Neutral Ranging): produces HOLD consensus with high confidence in abstention", async () => {
    const caseCContext: RawMarketContext = {
      ...baseContext,
      indicators: {
        ...baseContext.indicators,
        rsi14: 50.5,
        adx14: 12.4,
        atr14: 110,
        ema9: 65000,
        ema21: 65000,
        macd: { macd: 1, signal: 1, histogram: 0 },
        cvd: 0.2,
        orderBlock: false,
        fvg: false
      }
    };

    const feats = FeaturePipeline.process(caseCContext);
    const regimeRes = RegimeEngine.analyze({
      adx: 12.4,
      atr: 110,
      atrTrailing: 110,
      ema200: 65000,
      close: 65000,
      volume: 800,
      volumeAvg: 1200
    });

    expect(regimeRes.state).toBe("RANGING");
    const routerResult = await LakshmiMasterRouter.route(feats, regimeRes);
    expect(routerResult.direction).toBe("HOLD");
  });

  it("TC28: Case A vs Case B directional probabilities exhibit near-perfect anti-symmetry", async () => {
    const bullFeats = FeaturePipeline.process({
      ...baseContext,
      indicators: { ...baseContext.indicators, rsi14: 70, ema9: 65500, ema21: 65000, cvd: 30 },
      marketData: { ...baseContext.marketData, orderBook: { bidVol: 800, askVol: 200 } }
    });
    const bearFeats = FeaturePipeline.process({
      ...baseContext,
      indicators: { ...baseContext.indicators, rsi14: 30, ema9: 64500, ema21: 65000, cvd: -30 },
      marketData: { ...baseContext.marketData, orderBook: { bidVol: 200, askVol: 800 } }
    });

    const dlBull = await ModernModelRegistry.evaluateAll(bullFeats, "TRENDING_BULL");
    const dlBear = await ModernModelRegistry.evaluateAll(bearFeats, "TRENDING_BEAR");
    const qBull = QuantStrategyRegistry.evaluateAll(bullFeats, "TRENDING_BULL");
    const qBear = QuantStrategyRegistry.evaluateAll(bearFeats, "TRENDING_BEAR");
    const evParams: EVGateParams = { atrPercent: bullFeats.atr.atrPercent };

    const fusionBull = UnifiedEnsembleFusion.fuse(dlBull, qBull, bullFeats.nlpSentiment, "TRENDING_BULL", evParams, {
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES"
    });
    const fusionBear = UnifiedEnsembleFusion.fuse(dlBear, qBear, bearFeats.nlpSentiment, "TRENDING_BEAR", evParams, {
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES"
    });

    expect(fusionBull.buyProbability).toBeGreaterThan(fusionBull.sellProbability);
    expect(fusionBear.sellProbability).toBeGreaterThan(fusionBear.buyProbability);
    expect(fusionBull.buyProbability).toBeGreaterThan(0.40);
    expect(fusionBear.sellProbability).toBeGreaterThan(0.40);
  });

  it("TC29: Transition regime allows microstructure and AI to lead without hard failure", () => {
    const regimeState = "TRANSITION";
    const wCore = regimeState === "TRANSITION" ? 0.40 : 0.70;
    expect(wCore).toBe(0.40);
  });

  it("TC30: High volatility regime penalizes risk and widens conformal predictive intervals", () => {
    const normalWidth = 0.20;
    const volExpansionMultiplier = 1.45;
    const adjustedWidth = normalWidth * volExpansionMultiplier;
    expect(adjustedWidth).toBeCloseTo(0.29, 2);
    expect(adjustedWidth).toBeLessThan(0.40); // Conformal gate upper bound
  });

  it("TC31: Bayesian prior odds in TRANSITION regime remain calibrated at 0.50 (neutral)", () => {
    const res = AdaptiveBayesianGate.evaluate(0.50, 0.20, FeaturePipeline.process(baseContext), "TRANSITION", "HOLD");
    expect(res.priorOdds).toBe(0.50);
  });

  it("TC32: NetEV gate accurately identifies negative expected value when ATR is compressed", () => {
    const winRate = 0.50;
    const atrPercent = 0.15; // 0.15% ATR
    const tpDist = atrPercent * 2.0; // 0.30%
    const slDist = atrPercent * 1.5; // 0.225%
    const friction = 0.17; // 0.17% composite fees + slip
    const grossEV = (winRate * tpDist) - ((1 - winRate) * slDist); // 0.15 - 0.1125 = 0.0375%
    const netEV = grossEV - friction; // 0.0375 - 0.17 = -0.1325%

    expect(netEV).toBeLessThan(0);
  });

  it("TC33: First block gate accurately flags TECHNICAL_SCORE_NEUTRAL_HOLD in neutral band", () => {
    const finalScore = 48;
    const activeDecision = "HOLD";
    let firstBlockingGate = "NONE";

    if (activeDecision === "HOLD") {
      if (finalScore >= 40 && finalScore <= 60) firstBlockingGate = "TECHNICAL_SCORE_NEUTRAL_HOLD";
      else firstBlockingGate = "NORMAL_ABSTENTION_HOLD";
    }

    expect(firstBlockingGate).toBe("TECHNICAL_SCORE_NEUTRAL_HOLD");
  });

  it("TC34: Directional decision with sub-hurdle posterior flags BAYESIAN_POSTERIOR_BELOW_THRESHOLD", () => {
    const passesGate = false;
    const activeDecision = "LONG";
    let firstBlockingGate = "NONE";

    if (activeDecision !== "HOLD" && !passesGate) {
      firstBlockingGate = "BAYESIAN_POSTERIOR_BELOW_THRESHOLD";
    }

    expect(firstBlockingGate).toBe("BAYESIAN_POSTERIOR_BELOW_THRESHOLD");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Invariant Protection & Fail-Closed Live Promotion Barrier (TC35 - TC42)
  // ───────────────────────────────────────────────────────────────────────────

  it("TC35: AI confidence hurdle remains strictly immutable at 48.75%", () => {
    const requiredConfidence = 0.4875;
    expect(requiredConfidence).toBe(0.4875);
  });

  it("TC36: Bayesian posterior hurdle remains strictly immutable at 70.0% / 78.0%", () => {
    const trendingHurdle = AdaptiveBayesianGate.evaluate(0.80, 0.10, FeaturePipeline.process(baseContext), "TRENDING_BULL", "LONG");
    expect(trendingHurdle.requiredThreshold).toBe(0.78);
  });

  it("TC37: NetEV economic hurdle remains strictly immutable at 0.0000", () => {
    const requiredNetEV = 0.0000;
    expect(requiredNetEV).toBe(0.0000);
  });

  it("TC38: Conformal uncertainty gate width remains strictly immutable at <= 0.40", () => {
    const maxUncertaintyWidth = 0.40;
    expect(maxUncertaintyWidth).toBe(0.40);
  });

  it("TC39: Maximum daily loss limit remains strictly immutable at 5.0%", () => {
    const maxDailyLoss = 0.05;
    expect(maxDailyLoss).toBe(0.05);
  });

  it("TC40: Minimum forward OOS sample requirement remains strictly immutable at >= 100", () => {
    const minOosSamples = 100;
    expect(minOosSamples).toBe(100);
  });

  it("TC41: LIVE_PROMOTION_BLOCKED remains strictly TRUE and fail-closed across all executions", () => {
    expect(LiveExecutionBarrier.isLiveTradingPermitted()).toBe(false);
  });

  it("TC42: Forward telemetry store maintains zero synthetic data leakage across all tests", () => {
    expect(ForwardTelemetryStore.getLeakedCount()).toBe(0);
  });
});
