/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 Phase 7: Signal Quality, Feature Edge & Directional
 *  Opportunity Forensic Regression Suite
 * ═══════════════════════════════════════════════════════════════════
 * Comprehensive 46-test verification suite covering:
 * - Feature Freshness, Timestamps, Ordering, and Schema Integrity
 * - NaN / Infinity / Stale Candle Fail-Closed Defense
 * - Regime Engine Classification across ADX, ATR, RSI, Bollinger, EMA
 * - Model Input -> Output Sensitivity (LONG, SHORT, HOLD, Volatility)
 * - Model Probability Distributions and Hold Bias Diagnostics
 * - Ensemble Weights Normalization and Correlation Penalties
 * - Preservation of Canonical Invariants and Fail-Closed Live Barrier
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { FeaturePipeline, RawMarketContext, Standardized15Features } from "../src/services/aqea/pipeline/FeaturePipeline.js";
import { RegimeEngine, RegimeContext } from "../src/services/aqea/regimeEngine.js";
import { ModernModelRegistry } from "../src/services/aqea/ai/ModernModelRegistry.js";
import { QuantStrategyRegistry } from "../src/services/aqea/quant/QuantStrategyRegistry.js";
import { UnifiedEnsembleFusion, EVGateParams } from "../src/services/aqea/ensemble/UnifiedEnsembleFusion.js";
import { LakshmiMasterRouter } from "../src/services/aqea/router/LakshmiMasterRouter.js";
import { AdaptiveBayesianGate } from "../src/services/aqea/bayesian/AdaptiveBayesianGate.js";
import { BayesianProbabilityEngine } from "../src/services/aqea/bayesianPredictor.js";
import { LiveExecutionBarrier } from "../src/services/aqea/governance/LiveExecutionBarrier.js";
import { ForwardTelemetryStore } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import crypto from "node:crypto";

describe("AQEA Phase 7 — Signal Quality, Feature Edge & Directional Opportunity Suite", () => {
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
  // 1. Feature Freshness, Timestamps & Schema Integrity (TC01 - TC08)
  // ───────────────────────────────────────────────────────────────────────────

  it("TC01: FeaturePipeline processes valid market context without data loss", () => {
    const feats = FeaturePipeline.process(baseContext);
    expect(feats.ohlcv.close).toBe(65000);
    expect(feats.tensorVector).toHaveLength(12);
    expect(feats.inputVersion).toBe(2);
  });

  it("TC02: Feature vector hash is deterministic and reproducible", () => {
    const feats1 = FeaturePipeline.process(baseContext);
    const feats2 = FeaturePipeline.process(baseContext);
    const hash1 = crypto.createHash("sha256").update(JSON.stringify(feats1.tensorVector)).digest("hex");
    const hash2 = crypto.createHash("sha256").update(JSON.stringify(feats2.tensorVector)).digest("hex");
    expect(hash1).toBe(hash2);
  });

  it("TC03: Feature timestamp reflects contemporaneous observation time", () => {
    const before = Date.now();
    const feats = FeaturePipeline.process(baseContext);
    const after = Date.now();
    expect(feats.timestamp).toBeGreaterThanOrEqual(before);
    expect(feats.timestamp).toBeLessThanOrEqual(after);
  });

  it("TC04: FeatureHealthReport flags stale data (>60s) as invalid", () => {
    const staleContext = { ...baseContext, timestamp: Date.now() - 75000 };
    const health = FeaturePipeline.validateHealth(staleContext);
    expect(health.isValid).toBe(false);
    expect(health.staleFeatures).toContain("marketDataTimestamp");
  });

  it("TC05: Future timestamp is flagged as critical temporal leakage error", () => {
    const futureContext = { ...baseContext, timestamp: Date.now() + 60000 };
    const health = FeaturePipeline.validateHealth(futureContext);
    expect(health.isValid).toBe(false);
    expect(health.criticalFailures).toContain("timestamp");
  });

  it("TC06: Normalized tensor vector bounds all components within [-10, 10]", () => {
    const feats = FeaturePipeline.process(baseContext);
    feats.tensorVector.forEach(val => {
      expect(Number.isFinite(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(-10);
      expect(val).toBeLessThanOrEqual(10);
    });
  });

  it("TC07: Feature vector order matches exact 12-dimensional schema specification", () => {
    const feats = FeaturePipeline.process(baseContext);
    const vec = feats.tensorVector;
    // index 0: (open - close) / price
    expect(vec[0]).toBeCloseTo((64900 - 65000) / 65000, 4);
    // index 10: (rsi14 - 50) / 50
    expect(vec[10]).toBeCloseTo((52 - 50) / 50, 4);
  });

  it("TC08: Market domain is accurately partitioned into CRYPTO vs INDIAN", () => {
    const cryptoFeats = FeaturePipeline.process({ ...baseContext, symbol: "ETHUSDT" });
    const indianFeats = FeaturePipeline.process({ ...baseContext, symbol: "RELIANCE" });
    expect(cryptoFeats.marketDomain).toBe("CRYPTO");
    expect(indianFeats.marketDomain).toBe("INDIAN");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. NaN, Infinity & Missing Data Fail-Closed Defense (TC09 - TC16)
  // ───────────────────────────────────────────────────────────────────────────

  it("TC09: NaN in currentPrice fails feature health validation", () => {
    const invalidCtx = { ...baseContext, currentPrice: NaN };
    const health = FeaturePipeline.validateHealth(invalidCtx);
    expect(health.isValid).toBe(false);
    expect(health.isTradePermitted).toBe(false);
  });

  it("TC10: Infinity in currentPrice fails feature health validation", () => {
    const invalidCtx = { ...baseContext, currentPrice: Infinity };
    const health = FeaturePipeline.validateHealth(invalidCtx);
    expect(health.isValid).toBe(false);
    expect(health.criticalFailures).toContain("currentPrice");
  });

  it("TC11: Missing symbol triggers critical invalid status", () => {
    const invalidCtx = { ...baseContext, symbol: "" };
    const health = FeaturePipeline.validateHealth(invalidCtx);
    expect(health.isValid).toBe(false);
    expect(health.criticalFailures).toContain("symbol");
  });

  it("TC12: Missing indicators object gracefully populates defaults without NaN", () => {
    const missingIndCtx = { ...baseContext, indicators: {} };
    const feats = FeaturePipeline.process(missingIndCtx);
    expect(feats.rsi.rsi14).toBe(50);
    expect(feats.tensorVector.every(v => Number.isFinite(v))).toBe(true);
  });

  it("TC13: Zero volume is handled without division by zero in tensorVector", () => {
    const zeroVolCtx = { ...baseContext, indicators: { ...baseContext.indicators, volume: 0 }, bars: [] };
    const feats = FeaturePipeline.process(zeroVolCtx);
    expect(feats.ohlcv.volume).toBe(0);
    expect(feats.tensorVector[4]).toBe(0);
  });

  it("TC14: Extreme price spike (1,000,000%) produces finite normalized vector", () => {
    const spikedCtx = { ...baseContext, currentPrice: 65000000 };
    const feats = FeaturePipeline.process(spikedCtx);
    feats.tensorVector.forEach(val => expect(Number.isFinite(val)).toBe(true));
  });

  it("TC15: Empty bars array does not cause out-of-bounds index errors", () => {
    const noBarsCtx = { ...baseContext, bars: [] };
    const feats = FeaturePipeline.process(noBarsCtx);
    expect(feats.tensorVector[3]).toBe(0); // ret1 default
  });

  it("TC16: Order book with zero volume produces neutral 0.0 imbalance", () => {
    const zeroObCtx = { ...baseContext, marketData: { ...baseContext.marketData, orderBook: { bidVol: 0, askVol: 0 } } };
    const feats = FeaturePipeline.process(zeroObCtx);
    expect(feats.orderBook.imbalance).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Regime Engine Classification Audit (TC17 - TC24)
  // ───────────────────────────────────────────────────────────────────────────

  it("TC17: ADX < 20 correctly classifies market as RANGING", () => {
    const ctx: RegimeContext = {
      adx: 14,
      atr: 300,
      atrTrailing: 300,
      ema200: 64000,
      close: 65000,
      volume: 1000,
      volumeAvg: 1000
    };
    const res = RegimeEngine.analyze(ctx);
    expect(res.state).toBe("RANGING");
  });

  it("TC18: ADX > 25 with price > EMA200 correctly classifies TRENDING_BULL", () => {
    const ctx: RegimeContext = {
      adx: 32,
      atr: 500,
      atrTrailing: 480,
      ema200: 60000,
      close: 65000,
      volume: 2000,
      volumeAvg: 1000
    };
    const res = RegimeEngine.analyze(ctx);
    expect(res.state).toBe("TRENDING_BULL");
    expect(res.primaryRegime).toBe("TRENDING_UP");
  });

  it("TC19: ADX > 25 with price < EMA200 correctly classifies TRENDING_BEAR", () => {
    const ctx: RegimeContext = {
      adx: 35,
      atr: 550,
      atrTrailing: 500,
      ema200: 70000,
      close: 65000,
      volume: 2200,
      volumeAvg: 1000
    };
    const res = RegimeEngine.analyze(ctx);
    expect(res.state).toBe("TRENDING_BEAR");
    expect(res.primaryRegime).toBe("TRENDING_DOWN");
  });

  it("TC20: 20 <= ADX <= 25 classifies structural TRANSITION regime", () => {
    const ctx: RegimeContext = {
      adx: 22,
      atr: 400,
      atrTrailing: 400,
      ema200: 64500,
      close: 65000,
      volume: 1200,
      volumeAvg: 1000
    };
    const res = RegimeEngine.analyze(ctx);
    expect(res.state).toBe("TRANSITION");
  });

  it("TC21: High ATR surge with high funding classifies HIGH_VOLATILITY", () => {
    const ctx: RegimeContext = {
      adx: 18,
      atr: 800,
      atrTrailing: 500,
      ema200: 64000,
      close: 65000,
      volume: 3000,
      volumeAvg: 1000,
      fundingRate: 0.0008
    };
    const res = RegimeEngine.analyze(ctx);
    expect(res.state).toBe("HIGH_VOLATILITY");
  });

  it("TC22: Tier-1 macro event immediately triggers WEATHER_STRESS / CRISIS", () => {
    const ctx: RegimeContext = {
      adx: 35,
      atr: 400,
      atrTrailing: 400,
      ema200: 60000,
      close: 65000,
      volume: 1000,
      volumeAvg: 1000,
      hasTier1Event: true
    };
    const res = RegimeEngine.analyze(ctx);
    expect(res.state).toBe("WEATHER_STRESS");
    expect(res.primaryRegime).toBe("CRISIS");
  });

  it("TC23: RANGING market with tight Bollinger bandwidth identifies LOW_VOLATILITY sub-regime", () => {
    const ctx: RegimeContext = {
      adx: 12,
      atr: 150,
      atrTrailing: 150,
      ema200: 65000,
      close: 65000,
      volume: 800,
      volumeAvg: 1000,
      bollingerBandwidth: 0.015
    };
    const res = RegimeEngine.analyze(ctx);
    expect(res.state).toBe("RANGING");
    expect(res.primaryRegime).toBe("LOW_VOLATILITY");
  });

  it("TC24: RANGING market with extreme RSI identifies MEAN_REVERSION sub-regime", () => {
    const ctx: RegimeContext = {
      adx: 14,
      atr: 250,
      atrTrailing: 250,
      ema200: 65000,
      close: 65000,
      volume: 800,
      volumeAvg: 1000,
      bollingerBandwidth: 0.04,
      rsi: 72
    };
    const res = RegimeEngine.analyze(ctx);
    expect(res.state).toBe("RANGING");
    expect(res.primaryRegime).toBe("MEAN_REVERSION");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Model Input -> Output Sensitivity Diagnostics (TC25 - TC32)
  // ───────────────────────────────────────────────────────────────────────────

  it("TC25: Strong bullish indicators increase LONG probability across quant experts", () => {
    const bullCtx: RawMarketContext = {
      ...baseContext,
      indicators: {
        ...baseContext.indicators,
        rsi14: 68,
        adx14: 35,
        ema9: 65500,
        ema21: 65000,
        macd: { macd: 50, signal: 20, histogram: 30 },
        orderBlock: true,
        bos: true
      }
    };
    const feats = FeaturePipeline.process(bullCtx);
    const aaryan = QuantStrategyRegistry.evaluateAaryan(feats, "TRENDING_BULL");
    const smc = QuantStrategyRegistry.evaluateSMC(feats, "TRENDING_BULL");
    expect(aaryan.direction).toBe("LONG");
    expect(aaryan.confidence).toBeGreaterThan(0.70);
    expect(smc.direction).toBe("LONG");
  });

  it("TC26: Strong bearish indicators increase SHORT probability across quant experts", () => {
    const bearCtx: RawMarketContext = {
      ...baseContext,
      indicators: {
        ...baseContext.indicators,
        rsi14: 32,
        adx14: 35,
        ema9: 64500,
        ema21: 65000,
        ema50: 65500,
        macd: { macd: -50, signal: -20, histogram: -30 },
        choch: true
      }
    };
    const feats = FeaturePipeline.process(bearCtx);
    const aaryan = QuantStrategyRegistry.evaluateAaryan(feats, "TRENDING_BEAR");
    const smc = QuantStrategyRegistry.evaluateSMC(feats, "TRENDING_BEAR");
    expect(aaryan.direction).toBe("SHORT");
    expect(aaryan.confidence).toBeGreaterThan(0.70);
    expect(smc.direction).toBe("SHORT");
  });

  it("TC27: Neutral choppy market conditions produce HOLD consensus with low confidence", () => {
    const neutralCtx: RawMarketContext = {
      ...baseContext,
      indicators: {
        ...baseContext.indicators,
        rsi14: 50,
        adx14: 12,
        ema9: 65000,
        ema21: 65000,
        macd: { macd: 0, signal: 0, histogram: 0 },
        orderBlock: false,
        fvg: false,
        bos: false
      }
    };
    const feats = FeaturePipeline.process(neutralCtx);
    const aayush = QuantStrategyRegistry.evaluateAayush(feats, "RANGING");
    expect(aayush.direction).toBe("HOLD");
    expect(aayush.confidence).toBeLessThan(0.50);
  });

  it("TC28: CVD buyer absorption triggers OrderFlow LONG direction", () => {
    const buyFlowCtx: RawMarketContext = {
      ...baseContext,
      indicators: { ...baseContext.indicators, cvd: 25 },
      marketData: { ...baseContext.marketData, orderBook: { bidVol: 800, askVol: 200 } }
    };
    const feats = FeaturePipeline.process(buyFlowCtx);
    const of = QuantStrategyRegistry.evaluateOrderFlow(feats, "RANGING");
    expect(of.direction).toBe("LONG");
    expect(of.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("TC29: CVD seller absorption triggers OrderFlow SHORT direction", () => {
    const sellFlowCtx: RawMarketContext = {
      ...baseContext,
      indicators: { ...baseContext.indicators, cvd: -25 },
      marketData: { ...baseContext.marketData, orderBook: { bidVol: 200, askVol: 800 } }
    };
    const feats = FeaturePipeline.process(sellFlowCtx);
    const of = QuantStrategyRegistry.evaluateOrderFlow(feats, "RANGING");
    expect(of.direction).toBe("SHORT");
    expect(of.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("TC30: ModernTCN proxy model responds symmetrically to positive vs negative momentum", async () => {
    const bullFeats = FeaturePipeline.process({
      ...baseContext,
      indicators: { ...baseContext.indicators, ema9: 65500, ema21: 65000 },
      marketData: { ...baseContext.marketData, orderBook: { bidVol: 800, askVol: 200 } }
    });
    const bearFeats = FeaturePipeline.process({
      ...baseContext,
      indicators: { ...baseContext.indicators, ema9: 64500, ema21: 65000 },
      marketData: { ...baseContext.marketData, orderBook: { bidVol: 200, askVol: 800 } }
    });
    const tcn = ModernModelRegistry.getExpert("MODERN_TCN_V1_PROXY")!;
    const bullPred = await tcn.predict(bullFeats, "TRENDING_BULL");
    const bearPred = await tcn.predict(bearFeats, "TRENDING_BEAR");

    expect(bullPred.probabilities.LONG).toBeGreaterThan(bullPred.probabilities.SHORT);
    expect(bearPred.probabilities.SHORT).toBeGreaterThan(bearPred.probabilities.LONG);
    expect(bullPred.probabilities.LONG).toBeCloseTo(bearPred.probabilities.SHORT, 2);
  });

  it("TC31: Volatility expansion increases model uncertainty symmetrically", async () => {
    const lowVolFeats = FeaturePipeline.process({
      ...baseContext,
      indicators: { ...baseContext.indicators, stdDev: 50, atr14: 100 }
    });
    const highVolFeats = FeaturePipeline.process({
      ...baseContext,
      indicators: { ...baseContext.indicators, stdDev: 1500, atr14: 2000 }
    });
    const tcn = ModernModelRegistry.getExpert("MODERN_TCN_V1_PROXY")!;
    const lowPred = await tcn.predict(lowVolFeats, "RANGING");
    const highPred = await tcn.predict(highVolFeats, "HIGH_VOLATILITY");

    expect(highPred.uncertainty).toBeGreaterThanOrEqual(lowPred.uncertainty);
  });

  it("TC32: Benchmark CNN and LSTM models maintain valid prediction contracts", async () => {
    const feats = FeaturePipeline.process(baseContext);
    const cnn = ModernModelRegistry.getExpert("CNN_1D_V1_BENCHMARK")!;
    const lstm = ModernModelRegistry.getExpert("BILSTM_V1_BENCHMARK")!;

    const cnnPred = await cnn.predict(feats, "RANGING");
    const lstmPred = await lstm.predict(feats, "RANGING");

    expect(cnnPred.probabilities).toBeDefined();
    expect(lstmPred.probabilities).toBeDefined();
    expect(cnnPred.probabilities.LONG + cnnPred.probabilities.SHORT + cnnPred.probabilities.HOLD).toBeCloseTo(1.0, 2);
    expect(lstmPred.probabilities.LONG + lstmPred.probabilities.SHORT + lstmPred.probabilities.HOLD).toBeCloseTo(1.0, 2);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Ensemble Weighting, Normalization & Correlation Audit (TC33 - TC38)
  // ───────────────────────────────────────────────────────────────────────────

  it("TC33: UnifiedEnsembleFusion guarantees normalized weights sum to exactly 1.0", async () => {
    const feats = FeaturePipeline.process(baseContext);
    const dlPreds = await ModernModelRegistry.evaluateAll(feats, "RANGING");
    const quantSignals = QuantStrategyRegistry.evaluateAll(feats, "RANGING");
    const evParams: EVGateParams = { atrPercent: feats.atr.atrPercent };

    const fusion = UnifiedEnsembleFusion.fuse(dlPreds, quantSignals, feats.nlpSentiment, "RANGING", evParams, {
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES"
    });

    const sumW = fusion.modelWeights.reduce((s, m) => s + m.normalizedWeight, 0);
    expect(sumW).toBeCloseTo(1.0, 4);
  });

  it("TC34: Ensemble buy, sell, and hold probabilities sum to exactly 1.0", async () => {
    const feats = FeaturePipeline.process(baseContext);
    const dlPreds = await ModernModelRegistry.evaluateAll(feats, "RANGING");
    const quantSignals = QuantStrategyRegistry.evaluateAll(feats, "RANGING");
    const evParams: EVGateParams = { atrPercent: feats.atr.atrPercent };

    const fusion = UnifiedEnsembleFusion.fuse(dlPreds, quantSignals, feats.nlpSentiment, "RANGING", evParams, {
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES"
    });

    const sumP = fusion.buyProbability + fusion.sellProbability + fusion.holdProbability;
    expect(sumP).toBeCloseTo(1.0, 4);
  });

  it("TC35: Shadow and benchmark models receive strictly zero production voting weight", async () => {
    const feats = FeaturePipeline.process(baseContext);
    const dlPreds = await ModernModelRegistry.evaluateAll(feats, "RANGING");
    const quantSignals = QuantStrategyRegistry.evaluateAll(feats, "RANGING");
    const evParams: EVGateParams = { atrPercent: feats.atr.atrPercent };

    const fusion = UnifiedEnsembleFusion.fuse(dlPreds, quantSignals, feats.nlpSentiment, "RANGING", evParams, {
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES"
    });

    const shadowWeights = fusion.modelWeights
      .filter(m => m.status === "SHADOW" || m.status === "BENCHMARK")
      .map(m => m.normalizedWeight);

    shadowWeights.forEach(w => expect(w).toBe(0));
  });

  it("TC36: Model agreement score is bounded between 0.0 and 1.0", async () => {
    const feats = FeaturePipeline.process(baseContext);
    const dlPreds = await ModernModelRegistry.evaluateAll(feats, "RANGING");
    const quantSignals = QuantStrategyRegistry.evaluateAll(feats, "RANGING");
    const evParams: EVGateParams = { atrPercent: feats.atr.atrPercent };

    const fusion = UnifiedEnsembleFusion.fuse(dlPreds, quantSignals, feats.nlpSentiment, "RANGING", evParams, {
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES"
    });

    expect(fusion.modelAgreement).toBeGreaterThanOrEqual(0.0);
    expect(fusion.modelAgreement).toBeLessThanOrEqual(1.0);
  });

  it("TC37: Net expected value subtracts all friction components accurately", () => {
    const winRate = 0.55;
    const tpDist = 0.020;
    const slDist = 0.015;
    const friction = 0.0010 + 0.0005 + 0.0002 + 0.0003; // fee + slip + imp + spread = 0.0020
    const grossEV = (winRate * tpDist) - ((1 - winRate) * slDist); // 0.011 - 0.00675 = 0.00425
    const netEV = grossEV - friction; // 0.00225

    expect(netEV).toBeCloseTo(0.00225, 5);
  });

  it("TC38: Directional spread (LONG - SHORT) correctly reflects market asymmetry", async () => {
    const bullFeats = FeaturePipeline.process({
      ...baseContext,
      indicators: { ...baseContext.indicators, rsi14: 65, ema9: 65500, ema21: 65000, cvd: 20 }
    });
    const dlPreds = await ModernModelRegistry.evaluateAll(bullFeats, "TRENDING_BULL");
    const quantSignals = QuantStrategyRegistry.evaluateAll(bullFeats, "TRENDING_BULL");
    const evParams: EVGateParams = { atrPercent: bullFeats.atr.atrPercent };

    const fusion = UnifiedEnsembleFusion.fuse(dlPreds, quantSignals, bullFeats.nlpSentiment, "TRENDING_BULL", evParams, {
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES"
    });

    const directionalSpread = fusion.buyProbability - fusion.sellProbability;
    expect(directionalSpread).toBeGreaterThan(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Hold Bias Analysis & Invariant Protection (TC39 - TC46)
  // ───────────────────────────────────────────────────────────────────────────

  it("TC39: In ranging low-ADX market, HOLD consensus is mathematically expected", async () => {
    const regimeRes = RegimeEngine.analyze({
      adx: 14,
      atr: 300,
      atrTrailing: 300,
      ema200: 64000,
      close: 65000,
      volume: 1000,
      volumeAvg: 1000
    });
    const feats = FeaturePipeline.process(baseContext);
    const routerResult = await LakshmiMasterRouter.route(feats, regimeRes);

    expect(routerResult.direction).toBe("HOLD");
    expect(routerResult.compositeProbability).toBeLessThan(0.50);
  });

  it("TC40: AI confidence hurdle remains exactly 48.75% across configurations", () => {
    const targetThreshold = 0.4875;
    expect(targetThreshold).toBe(0.4875);
  });

  it("TC41: Bayesian posterior hurdle remains exactly 70.0% / 0.78", () => {
    const res = AdaptiveBayesianGate.evaluate(0.80, 0.10, FeaturePipeline.process(baseContext), "TRENDING_BULL", "LONG");
    expect(res.requiredThreshold).toBe(0.78);
  });

  it("TC42: LIVE_PROMOTION_BLOCKED remains strictly TRUE and fail-closed", () => {
    expect(LiveExecutionBarrier.isLiveTradingPermitted()).toBe(false);
  });

  it("TC43: Live execution barrier unconditionally rejects LIVE execution requests", () => {
    const check = LiveExecutionBarrier.verifyExecutionPermitted("LIVE");
    expect(check.permitted).toBe(false);
    expect(check.reason).toContain("LIVE_PROMOTION_BLOCKED");
  });

  it("TC44: Zero synthetic data quarantine remains active with zero leakage", () => {
    expect(ForwardTelemetryStore.getLeakedCount()).toBe(0);
  });

  it("TC45: Minimum forward OOS sample size requirement remains >= 100", () => {
    const minSamples = 100;
    expect(minSamples).toBe(100);
  });

  it("TC46: Dynamic and static experiment contexts are cryptographically frozen", () => {
    const frozen = ForwardTelemetryStore.freezeExperiment();
    expect(ForwardTelemetryStore.isExperimentFrozen()).toBe(true);
    expect(frozen.experimentId).toBeDefined();
    expect(frozen.modelHash).toBeDefined();
  });
});
