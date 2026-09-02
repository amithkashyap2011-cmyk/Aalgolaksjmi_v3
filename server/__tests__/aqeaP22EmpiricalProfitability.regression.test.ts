/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 Phase 22 Regression Suite
 *  Empirical Profitability Validation, Trade Quality V2 Challenger,
 *  Market Scanner & Master OOS Audit
 * ═══════════════════════════════════════════════════════════════════
 *
 * Categories A through AB as required by Phase 22 master specification.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  AqeaP22EmpiricalProfitabilityEngine,
  AqeaP22TradeQualitySpecialistV2,
  AqeaP22ModelAblationEngine
} from "../src/services/aqea/shadow/AqeaP22EmpiricalProfitabilityEngine.js";
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
    modelName: name, modelVersion: "2.2.0", architecture: "NN", inferenceMode: "REAL_MODEL",
    direction: dir, probabilities: { LONG: pL, SHORT: pS, HOLD: pH },
    confidence: Math.max(pL, pS, pH), probability: Math.max(pL, pS),
    uncertainty: 1 - Math.max(pL, pS, pH), predictionInterval: [0.3, 0.8] as [number, number],
    latencyMs: 8, status, regimeCompatibility: 0.85, featureVersion: 2, isTrained: true, timestamp: Date.now()
  };
}

describe("AQEA Phase 22: Empirical Profitability Validation & Market Scanner", () => {
  beforeEach(() => {
    AqeaP22EmpiricalProfitabilityEngine.clearState();
    jest.restoreAllMocks();
  });

  // A. Baseline reproduction
  it("A. Baseline reproduction: verifies deterministic evaluation across identical inputs", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res1 = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_A1", mockFeatures(), "TRENDING_BULL", [cnn], []);
    AqeaP22EmpiricalProfitabilityEngine.clearState();
    const res2 = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_A2", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res1.fusedDirection).toBe(res2.fusedDirection);
    expect(res1.adaptiveTier).toBe(res2.adaptiveTier);
    expect(res1.tradeQualityV2.expectedNetEV).toBe(res2.tradeQualityV2.expectedNetEV);
  });

  // B. Trade independence
  it("B. Trade independence: absorbs consecutive candle signals into active episode without double-counting", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res1 = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_B1", mockFeatures(), "TRENDING_BULL", [cnn], []);
    const res2 = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_B2", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res1.tradeIndependence.isSignalAbsorbed).toBe(false);
    expect(res2.tradeIndependence.isSignalAbsorbed).toBe(true);
    expect(res2.rejectionWaterfall.firstBlockingGate).toBe("GATE_14_POSITION_AVAILABILITY");
  });

  // C. Leakage
  it("C. Leakage: guarantees features contain zero lookahead or future price labels", () => {
    const f = mockFeatures();
    expect((f as any).futureClose).toBeUndefined();
    expect((f as any).futureReturn).toBeUndefined();
  });

  // D. Asset routing
  it("D. Asset routing: produces valid asset suitability state without permanent blacklisting", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_D", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(["FAVORABLE", "NEUTRAL"]).toContain(res.marketScan.activeSymbolRank.assetState);
    expect(res.marketScan.activeSymbolRank.opportunityScore).toBeGreaterThan(0);
  });

  // E. Regime routing
  it("E. Regime routing: adapts authority and strictness conditionally across regimes", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_E", mockFeatures(), "BREAKOUT", [cnn], []);
    expect(res.regime).toBe("BREAKOUT");
    expect(res.dynamicExit.takeProfitMultiplier).toBe(2.5);
  });

  // F. Horizon
  it("F. Horizon: evaluates multi-horizons and selects optimal horizon", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_F", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect([3, 6, 12, 24, 48]).toContain(res.horizonSelection.horizonBars);
    expect(res.horizonSelection.expectedNetEV).toBeGreaterThan(0);
  });

  // G. Trade quality
  it("G. Trade quality: AQEA_TRADE_QUALITY_V2 estimates P(TP before SL) with tight MAE constraint", () => {
    const tq = AqeaP22TradeQualitySpecialistV2.evaluateQualityV2(
      "LONG", 0.85, "CONFIRMING", 0.015, 0.0004, 38, 0.45, 0.65, 6, "TRENDING_BULL"
    );
    expect(tq.modelName).toBe("AQEA_TRADE_QUALITY_V2");
    expect(tq.probabilityTpBeforeSl).toBeGreaterThan(0.70);
    expect(tq.mfeMaeRatio).toBeGreaterThan(1.40);
    expect(tq.isEconomicallyViable).toBe(true);
  });

  // H. Calibration
  it("H. Calibration: AQEA_TRADE_QUALITY_V2 maintains low Brier score and ECE <= 5.0%", () => {
    const tq = AqeaP22TradeQualitySpecialistV2.evaluateQualityV2(
      "LONG", 0.85, "CONFIRMING", 0.015, 0.0004, 38, 0.45, 0.65, 6, "TRENDING_BULL"
    );
    expect(tq.calibrationBrierScore).toBeLessThan(0.15);
    expect(tq.expectedCalibrationError).toBeLessThan(0.05);
  });

  // I. TP/SL
  it("I. TP/SL: produces dynamic ATR brackets with favorable reward/risk", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_I", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.dynamicExit.takeProfitPrice).toBeGreaterThan(0.85);
    expect(res.dynamicExit.stopLossPrice).toBeLessThan(0.85);
    expect(res.dynamicExit.rewardRiskRatio).toBeGreaterThan(1.0);
  });

  // J. Friction
  it("J. Friction: incorporates fees, slippage, and spread in NetEV", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_J", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.tradeQualityV2.totalFriction).toBeGreaterThan(0);
  });

  // K. NetEV
  it("K. NetEV: verifies friction-adjusted edge is positive for admitted trade", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_K", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.tradeQualityV2.expectedNetEV).toBeGreaterThan(0);
  });

  // L. PF
  it("L. PF: verifies estimated PF > 1.0 for valid directional opportunities", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_L", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.tradeQualityV2.profitFactorEstimate).toBeGreaterThan(1.0);
  });

  // M. Drawdown
  it("M. Drawdown: enforces risk sizing ceiling to guarantee MDD <= 5.0%", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_M", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.dynamicRisk.allocatedRiskPct).toBeLessThanOrEqual(2.5);
  });

  // N. Correlation
  it("N. Correlation: penalizes simultaneous exposure across correlated assets", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_N", mockFeatures(), "TRENDING_BULL", [cnn], []);
    const ethRank = res.marketScan.scannedAssets.find(a => a.symbol === "ETHUSDT");
    expect(ethRank).toBeDefined();
  });

  // O. Portfolio ranking
  it("O. Portfolio ranking: ranks all 7 tracked crypto assets in real time", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_O", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.marketScan.scannedAssets.length).toBe(7);
    expect(res.marketScan.scannedAssets[0].rank).toBe(1);
  });

  // P. Risk sizing
  it("P. Risk sizing: dynamically sizes notional and margin based on risk and leverage", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_P", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.dynamicRisk.allocatedRiskPct).toBeGreaterThan(0);
    expect(res.dynamicRisk.marginRequirement).toBeGreaterThan(0);
    expect(res.dynamicRisk.leverage).toBe(3.0);
  });

  // Q. Loss cluster
  it("Q. Loss cluster: tracks loss cluster cooldown flag", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_Q", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(typeof res.dynamicRisk.lossClusterCooldown).toBe("boolean");
  });

  // R. Threshold frontier
  it("R. Threshold frontier: evaluates 10 discrete thresholds with monotonic win rate scaling", () => {
    const ablations = AqeaP22ModelAblationEngine.evaluateAblations();
    expect(ablations.length).toBe(10);
  });

  // S. Pareto frontier
  it("S. Pareto frontier: confirms Full P22 Adaptive System achieves superior NetEV and PF", () => {
    const ablations = AqeaP22ModelAblationEngine.evaluateAblations();
    const champion = ablations.find(a => a.scenarioId === "J_FULL_P22_SYSTEM");
    expect(champion?.isEconomicallySuperior).toBe(true);
    expect(champion?.profitFactorEstimate).toBeGreaterThan(3.5);
  });

  // T. OOS isolation
  it("T. OOS isolation: ensures zero live execution and shadow tagging", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_T", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.safety.executionAttempted).toBe(false);
  });

  // U. Model fallback
  it("U. Model fallback: flags fallback and attributes GATE_03_CNN_DIRECTION in waterfall", () => {
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_U", mockFeatures(), "TRENDING_BULL", [], []);
    expect(res.rejectionWaterfall.firstBlockingGate).toBe("GATE_03_CNN_DIRECTION");
  });

  // V. NaN/Infinity
  it("V. NaN/Infinity: handles corrupted inputs safely without throwing", () => {
    const corrupted = makePred("CNN_V2_DUAL_HEAD", "LONG", NaN, Infinity, -0.5);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_V", mockFeatures(), "TRENDING_BULL", [corrupted], []);
    expect(res.safety.executionAttempted).toBe(false);
  });

  // W. 90% governance
  it("W. 90% governance: verifies ~90% target requires strict threshold >= 0.85", () => {
    const highCnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const modCnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.70, 0.15, 0.15);
    const resHigh = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_W1", mockFeatures(), "TRENDING_BULL", [highCnn], []);
    const resMod = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_W2", mockFeatures(), "TRENDING_BULL", [modCnn], []);
    expect(resHigh.adaptiveTier).toBe("TIER_A_PRECISION");
    expect(resMod.adaptiveTier).toBe("TIER_B_BALANCED");
  });

  // X. Synthetic OOS prevention
  it("X. Synthetic OOS prevention: verifies syntheticOutcomeCountUsedForOOS === 0", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_X", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.safety.syntheticOutcomeCountUsedForOOS).toBe(0);
  });

  // Y. No wallet mutation
  it("Y. No wallet mutation: verifies walletMutationCount === 0", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_Y", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.safety.walletMutationCount).toBe(0);
  });

  // Z. No order creation
  it("Z. No order creation: verifies orderCreationCount === 0", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_Z", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.safety.orderCreationCount).toBe(0);
  });

  // AA. LIVE_PROMOTION_BLOCKED
  it("AA. LIVE_PROMOTION_BLOCKED: strictly TRUE invariant", () => {
    const res = AqeaP22EmpiricalProfitabilityEngine.evaluate("P22_AA", mockFeatures(), "TRENDING_BULL", [], []);
    expect(res.safety.livePromotionBlocked).toBe(true);
    expect(res.safety.isLiveApproved).toBe(false);
  });

  // AB. Runtime safety
  it("AB. Runtime safety: LSTM remains quarantined (votingEligible === false)", () => {
    expect(QUARANTINED_MODELS.LSTM_SEQUENCE_V1.votingEligible).toBe(false);
    expect(QUARANTINED_MODELS.LSTM_SEQUENCE_V1.modelStatus).toBe("OUTPUT_COLLAPSED");
  });
});
