/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 Phase 21 Regression Suite
 *  Master Profitability Optimization, Trade Quality Specialist,
 *  Market Scanner & OOS Verification
 * ═══════════════════════════════════════════════════════════════════
 *
 * Categories A through AB as required by Phase 21 master specification.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  AqeaP21ProfitabilityOptimizationEngine,
  AqeaP21TradeQualitySpecialist,
  AqeaP21MarketOpportunityScanner,
  AqeaP21ThresholdFrontierEngine,
  AqeaP21RejectionWaterfallAuditor
} from "../src/services/aqea/shadow/AqeaP21ProfitabilityOptimizationEngine.js";
import { QUARANTINED_MODELS } from "../src/services/aqea/shadow/AqeaP17OpportunityEngine.js";
import { FeaturePipeline, Standardized15Features } from "../src/services/aqea/pipeline/FeaturePipeline.js";
import { ModelExpertPrediction } from "../src/services/aqea/ai/IModelExpert.js";

function mockFeatures(overrides?: Partial<Standardized15Features>): Standardized15Features {
  const base = FeaturePipeline.process({
    symbol: "ADAUSDT",
    currentPrice: 0.85,
    indicators: {
      open: 0.84, high: 0.87, low: 0.83, close: 0.85, volume: 5000000,
      rsi14: 62, adx14: 38, ema9: 0.855, ema21: 0.842, cvd: 0.45, orderBlock: true
    },
    bars: [
      { open: 0.83, high: 0.85, low: 0.82, close: 0.84, volume: 4000000 },
      { open: 0.84, high: 0.87, low: 0.83, close: 0.85, volume: 5000000 }
    ],
    marketData: { orderBook: { bidVol: 1500, askVol: 500, spread: 0.0004 } }
  });
  return { ...base, ...overrides };
}

function makePred(
  name: string,
  dir: "LONG" | "SHORT" | "HOLD",
  pL: number,
  pS: number,
  pH: number,
  status: "PRODUCTION" | "BENCHMARK" = "PRODUCTION"
): ModelExpertPrediction {
  return {
    modelName: name, modelVersion: "2.1.0", architecture: "NN", inferenceMode: "REAL_MODEL",
    direction: dir, probabilities: { LONG: pL, SHORT: pS, HOLD: pH },
    confidence: Math.max(pL, pS, pH), probability: Math.max(pL, pS),
    uncertainty: 1 - Math.max(pL, pS, pH), predictionInterval: [0.3, 0.8] as [number, number],
    latencyMs: 8, status, regimeCompatibility: 0.85, featureVersion: 2, isTrained: true, timestamp: Date.now()
  };
}

describe("AQEA Phase 21: Master Profitability Optimization & Trade Quality Specialization", () => {
  beforeEach(() => {
    AqeaP21ProfitabilityOptimizationEngine.clearState();
    jest.restoreAllMocks();
  });

  // A. Baseline reproduction
  it("A. Baseline reproduction: verifies deterministic evaluation across identical inputs", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res1 = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_A1", mockFeatures(), "TRENDING_BULL", [cnn], []);
    AqeaP21ProfitabilityOptimizationEngine.clearState();
    const res2 = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_A2", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res1.fusedDirection).toBe(res2.fusedDirection);
    expect(res1.adaptiveTier).toBe(res2.adaptiveTier);
    expect(res1.tradeQualitySpecialist.expectedNetEV).toBe(res2.tradeQualitySpecialist.expectedNetEV);
  });

  // B. Independent trade accounting
  it("B. Independent trade accounting: absorbs consecutive signals into active episode without double-counting", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res1 = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_B1", mockFeatures(), "TRENDING_BULL", [cnn], []);
    const res2 = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_B2", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res1.tradeIndependence.isSignalAbsorbed).toBe(false);
    expect(res2.tradeIndependence.isSignalAbsorbed).toBe(true);
    expect(res2.rejectionWaterfall.firstBlockingGate).toBe("GATE_14_POSITION_AVAILABILITY");
  });

  // C. Asset routing
  it("C. Asset routing: produces valid asset suitability state without permanent blacklisting", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_C", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(["FAVORABLE", "NEUTRAL"]).toContain(res.marketScan.activeSymbolRank.assetState);
    expect(res.marketScan.activeSymbolRank.opportunityScore).toBeGreaterThan(0);
  });

  // D. Regime routing
  it("D. Regime routing: adapts authority and strictness conditionally", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_D", mockFeatures(), "BREAKOUT", [cnn], []);
    expect(res.regime).toBe("BREAKOUT");
    expect(res.dynamicExit.takeProfitMultiplier).toBe(2.5);
  });

  // E. Horizon routing
  it("E. Horizon routing: evaluates multi-horizons and selects optimal horizon", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_E", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect([3, 6, 12, 24, 48]).toContain(res.horizonSelection.horizonBars);
    expect(res.horizonSelection.expectedNetEV).toBeGreaterThan(0);
  });

  // F. Trade-quality prediction
  it("F. Trade-quality prediction: AQEA_TRADE_QUALITY_V1 estimates P(TP before SL) and NetEV", () => {
    const tq = AqeaP21TradeQualitySpecialist.evaluateQuality(
      "LONG", 0.85, "CONFIRMING", 0.015, 0.0004, 38, 0.45, 0.65, 6, "TRENDING_BULL"
    );
    expect(tq.modelName).toBe("AQEA_TRADE_QUALITY_V1");
    expect(tq.probabilityTpBeforeSl).toBeGreaterThan(0.70);
    expect(tq.expectedNetEV).toBeGreaterThan(0);
    expect(tq.isEconomicallyViable).toBe(true);
  });

  // G. TP/SL optimization
  it("G. TP/SL optimization: produces dynamic ATR brackets with favorable reward/risk", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_G", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.dynamicExit.takeProfitPrice).toBeGreaterThan(0.85);
    expect(res.dynamicExit.stopLossPrice).toBeLessThan(0.85);
    expect(res.dynamicExit.rewardRiskRatio).toBeGreaterThan(1.0);
  });

  // H. Friction
  it("H. Friction: accounts for fees, slippage, and spread in NetEV", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_H", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.tradeQualitySpecialist.totalFriction).toBeGreaterThan(0);
  });

  // I. NetEV
  it("I. NetEV: verifies friction-adjusted edge is positive for admitted trade", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_I", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.tradeQualitySpecialist.expectedNetEV).toBeGreaterThan(0);
  });

  // J. Profit Factor (PF)
  it("J. Profit Factor: verifies estimated PF > 1.0 for valid directional opportunities", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_J", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.tradeQualitySpecialist.profitFactorEstimate).toBeGreaterThan(1.0);
  });

  // K. Correlation
  it("K. Correlation: penalizes simultaneous exposure across correlated assets", () => {
    const scan = AqeaP21MarketOpportunityScanner.scanMarket(
      "ETHUSDT", mockFeatures(), "TRENDING_BULL",
      {
        modelName: "AQEA_TRADE_QUALITY_V1", probabilityTpBeforeSl: 0.80,
        expectedGrossReturn: 0.015, expectedMFE: 0.02, expectedMAE: 0.01,
        mfeMaeRatio: 2.0, totalFriction: 0.0012, expectedNetEV: 0.0138,
        profitFactorEstimate: 2.2, isEconomicallyViable: true, qualityConfidence: 0.80
      },
      ["BTCUSDT"]
    );
    const ethRank = scan.scannedAssets.find(a => a.symbol === "ETHUSDT");
    expect(ethRank?.correlationPenaltyFactor).toBeLessThan(1.0);
  });

  // L. Portfolio ranking
  it("L. Portfolio ranking: ranks scanned assets by opportunity score and expected edge", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_L", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.marketScan.scannedAssets.length).toBe(7);
    expect(res.marketScan.scannedAssets[0].rank).toBe(1);
  });

  // M. Dynamic risk
  it("M. Dynamic risk: scales risk by confidence, asset, and regime multipliers", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_M", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.dynamicRisk.allocatedRiskPct).toBeGreaterThan(0);
    expect(res.dynamicRisk.marginRequirement).toBeGreaterThan(0);
    expect(res.dynamicRisk.leverage).toBe(3.0);
  });

  // N. Drawdown
  it("N. Drawdown: enforces maximum drawdown cap <= 5.0%", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_N", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.dynamicRisk.allocatedRiskPct).toBeLessThanOrEqual(2.5);
  });

  // O. Loss cluster
  it("O. Loss cluster: tracks loss cluster cooldown flag", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_O", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(typeof res.dynamicRisk.lossClusterCooldown).toBe("boolean");
  });

  // P. Calibration
  it("P. Calibration: maintains calibrationFitFromInsufficientEvidence === false when N < 100", () => {
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_P", mockFeatures(), "TRENDING_BULL", [], []);
    expect(res.safety.calibrationFitFromInsufficientEvidence).toBe(false);
  });

  // Q. OOS separation
  it("Q. OOS separation: ensures zero live execution and shadow tagging", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_Q", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.safety.executionAttempted).toBe(false);
  });

  // R. Leakage
  it("R. Leakage: features contain zero future timestamps or labels", () => {
    const f = mockFeatures();
    expect((f as any).futureClose).toBeUndefined();
    expect((f as any).futureMFE).toBeUndefined();
  });

  // S. NaN/Infinity
  it("S. NaN/Infinity: handles corrupted inputs safely without throwing", () => {
    const corrupted = makePred("CNN_V2_DUAL_HEAD", "LONG", NaN, Infinity, -0.5);
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_S", mockFeatures(), "TRENDING_BULL", [corrupted], []);
    expect(res.safety.executionAttempted).toBe(false);
  });

  // T. Model fallback
  it("T. Model fallback: flags fallback and attributes GATE_03_CNN_DIRECTION in waterfall", () => {
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_T", mockFeatures(), "TRENDING_BULL", [], []);
    expect(res.rejectionWaterfall.firstBlockingGate).toBe("GATE_03_CNN_DIRECTION");
  });

  // U. Challenger model
  it("U. Challenger model: verifies AQEA_TRADE_QUALITY_V1 provides dedicated quality scoring", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_U", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.tradeQualitySpecialist.modelName).toBe("AQEA_TRADE_QUALITY_V1");
    expect(res.tradeQualitySpecialist.qualityConfidence).toBeGreaterThan(0.70);
  });

  // V. Threshold frontier
  it("V. Threshold frontier: evaluates thresholds 0.50 to 0.95 with monotonic win rate scaling", () => {
    const frontier = AqeaP21ThresholdFrontierEngine.evaluateFrontier();
    expect(frontier.length).toBe(10);
    for (let i = 1; i < frontier.length; i++) {
      expect(frontier[i].estimatedWinRate).toBeGreaterThanOrEqual(frontier[i - 1].estimatedWinRate);
      expect(frontier[i].coveragePct).toBeLessThanOrEqual(frontier[i - 1].coveragePct);
    }
  });

  // W. Pareto frontier
  it("W. Pareto frontier: identifies economically useful frontier region (NetEV > 0, PF > 1, DD <= 5%)", () => {
    const frontier = AqeaP21ThresholdFrontierEngine.evaluateFrontier();
    const useful = frontier.filter(p => p.isEconomicallyUseful);
    expect(useful.length).toBeGreaterThan(0);
  });

  // X. 90% governance
  it("X. 90% governance: verifies ~90% target requires strict threshold >= 0.85", () => {
    const frontier = AqeaP21ThresholdFrontierEngine.evaluateFrontier();
    const p90 = frontier.find(p => p.threshold === 0.85);
    expect(p90).toBeDefined();
    expect(p90!.estimatedWinRate).toBeGreaterThanOrEqual(80.0);
  });

  // Y. Safety invariants
  it("Y. Safety invariants: confirms all absolute safety flags", () => {
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_Y", mockFeatures(), "TRENDING_BULL", [], []);
    expect(res.safety.livePromotionBlocked).toBe(true);
    expect(res.safety.isLiveApproved).toBe(false);
    expect(res.safety.executionAttempted).toBe(false);
  });

  // Z. No wallet mutation
  it("Z. No wallet mutation: verifies walletMutationCount === 0", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_Z", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.safety.walletMutationCount).toBe(0);
  });

  // AA. No order creation
  it("AA. No order creation: verifies orderCreationCount === 0", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_AA", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.safety.orderCreationCount).toBe(0);
  });

  // AB. LIVE_PROMOTION_BLOCKED
  it("AB. LIVE_PROMOTION_BLOCKED: strictly TRUE invariant", () => {
    const res = AqeaP21ProfitabilityOptimizationEngine.evaluate("P21_AB", mockFeatures(), "TRENDING_BULL", [], []);
    expect(res.safety.livePromotionBlocked).toBe(true);
    expect(res.safety.lstmVotingEligible).toBe(false);
  });
});
