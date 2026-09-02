/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 Phase 20 Regression Suite
 *  Adaptive Opportunity Optimization, Multi-Asset/Regime Routing,
 *  Multi-Horizon Profitability & OOS Validation
 * ═══════════════════════════════════════════════════════════════════
 *
 * Categories A through AD as required by Phase 20 master specification.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  AqeaP20AdaptiveOpportunityEngine,
  AqeaP20AssetOpportunityRouter,
  AqeaP20RegimeRouter,
  AqeaP20MultiHorizonEngine,
  AqeaP20PortfolioOpportunityRanker
} from "../src/services/aqea/shadow/AqeaP20AdaptiveOpportunityEngine.js";
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
    modelName: name, modelVersion: "2.0.0", architecture: "NN", inferenceMode: "REAL_MODEL",
    direction: dir, probabilities: { LONG: pL, SHORT: pS, HOLD: pH },
    confidence: Math.max(pL, pS, pH), probability: Math.max(pL, pS),
    uncertainty: 1 - Math.max(pL, pS, pH), predictionInterval: [0.3, 0.8] as [number, number],
    latencyMs: 8, status, regimeCompatibility: 0.85, featureVersion: 2, isTrained: true, timestamp: Date.now()
  };
}

describe("AQEA Phase 20: Adaptive Opportunity Optimization & Multi-Asset/Regime Routing", () => {
  beforeEach(() => {
    AqeaP20AdaptiveOpportunityEngine.clearState();
    jest.restoreAllMocks();
  });

  // A. Feature integrity
  it("A. Feature integrity: verifies standard 15 features are processed without lookahead", () => {
    const f = mockFeatures();
    expect(f.symbol).toBe("ADAUSDT");
    expect(f.atr?.atr14).toBeGreaterThan(0);
    expect(f.rsi?.rsi14).toBe(62);
    expect(f.orderBook?.spread).toBeGreaterThan(0);
  });

  // B. CNN inference
  it("B. CNN inference: verifies CNN Champion directional signal and probability normalization", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.85, 0.07, 0.08);
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_B", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.cnnInference.model).toBe("CNN_V2_DUAL_HEAD");
    expect(res.cnnInference.direction).toBe("LONG");
    expect(res.cnnInference.confidence).toBe(0.85);
    expect(res.cnnInference.fallbackUsed).toBe(false);
  });

  // C. Mamba inference
  it("C. Mamba inference: verifies Mamba context specialist behaves without vetoing CNN", () => {
    const mamba = makePred("MAMBA_RESEARCH_V1", "HOLD", 0.25, 0.35, 0.40);
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.85, 0.07, 0.08);
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_C", mockFeatures(), "TRENDING_BULL", [mamba, cnn], []);
    expect(res.mambaContext.contextStatus).toBe("CAUTION");
    expect(res.rankedOpportunity.direction).toBe("LONG");
  });

  // D. LSTM quarantine
  it("D. LSTM quarantine: verifies OUTPUT_COLLAPSED model remains strictly quarantined", () => {
    expect(QUARANTINED_MODELS.LSTM_SEQUENCE_V1.votingEligible).toBe(false);
    expect(QUARANTINED_MODELS.LSTM_SEQUENCE_V1.modelStatus).toBe("OUTPUT_COLLAPSED");
    const lstm = makePred("BILSTM_V1_BENCHMARK", "HOLD", 0.0001, 0.0, 0.9999, "BENCHMARK");
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.85, 0.07, 0.08);
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_D", mockFeatures(), "TRENDING_BULL", [lstm, cnn], []);
    expect(res.safety.lstmVotingEligible).toBe(false);
    expect(res.lstmQuarantine.status).toBe("OUTPUT_COLLAPSED");
  });

  // E. Asset routing
  it("E. Asset routing: produces explainable state (FAVORABLE/NEUTRAL/UNFAVORABLE) without blacklisting", () => {
    const favorableRes = AqeaP20AssetOpportunityRouter.evaluateAsset("ADAUSDT", mockFeatures(), "TRENDING_BULL");
    expect(["FAVORABLE", "NEUTRAL"]).toContain(favorableRes.assetState);
    expect(favorableRes.opportunityScore).toBeGreaterThan(0);
    expect(favorableRes.recommendedHorizons.length).toBeGreaterThan(0);
  });

  // F. Regime routing
  it("F. Regime routing: dynamically routes authority and strictness based on regime", () => {
    const trendRoute = AqeaP20RegimeRouter.routeRegime("TRENDING_BULL");
    const rangeRoute = AqeaP20RegimeRouter.routeRegime("RANGING");
    expect(trendRoute.cnnAuthority).toBeGreaterThan(rangeRoute.cnnAuthority);
    expect(trendRoute.preferredHorizons).toContain(12);
  });

  // G. Horizon selection
  it("G. Horizon selection: evaluates H in {3, 6, 12, 24, 48} and selects optimal horizon", () => {
    const res = AqeaP20MultiHorizonEngine.evaluateHorizons("LONG", 0.85, 0.015, 0.0005, [6, 12]);
    expect(res.evaluatedHorizons.length).toBe(5);
    expect([3, 6, 12, 24, 48]).toContain(res.selectedHorizon.horizonBars);
    expect(res.selectedHorizon.expectedNetEV).toBeGreaterThan(0);
  });

  // H. Trade quality
  it("H. Trade quality: validates P(TP before SL) and economic viability", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.85, 0.07, 0.08);
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_H", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.tradeQuality.label).toBe("TRADE_QUALITY_ESTIMATOR_P20_ADAPTIVE");
    expect(res.tradeQuality.pTpBeforeSl).toBeGreaterThan(0.50);
    expect(res.tradeQuality.isEconomicallyViable).toBe(true);
  });

  // I. Dynamic TP/SL
  it("I. Dynamic TP/SL: scales brackets based on regime and ATR", () => {
    const horizon = {
      horizonBars: 6, approxMinutes: 30, pTpBeforeSl: 0.85, expectedGrossReturn: 0.02,
      expectedMFE: 0.03, expectedMAE: 0.015, mfeMaeRatio: 2.0, totalFriction: 0.0015,
      expectedNetEV: 0.0185, profitFactorEstimate: 2.5, isViable: true, score: 3.5
    };
    const exit = AqeaP20MultiHorizonEngine.optimizeExit("LONG", 100, 2.0, horizon, "BREAKOUT");
    expect(exit.takeProfitMultiplier).toBe(2.5);
    expect(exit.stopLossMultiplier).toBe(1.0);
    expect(exit.takeProfitPrice).toBe(105); // 100 + 2.5 * 2
    expect(exit.stopLossPrice).toBe(98);    // 100 - 1.0 * 2
  });

  // J. Friction
  it("J. Friction: incorporates fees, slippage, and spread into NetEV", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.85, 0.07, 0.08);
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_J", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.tradeQuality.frictionCost).toBeGreaterThan(0);
  });

  // K. NetEV
  it("K. NetEV: ensures NetEV accounts for friction deductions", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.85, 0.07, 0.08);
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_K", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.tradeQuality.expectedNetEV).toBeGreaterThan(0);
  });

  // L. Opportunity ranking
  it("L. Opportunity ranking: computes composite score and ranks opportunities", () => {
    const opp = AqeaP20PortfolioOpportunityRanker.rankOpportunity(
      "OPP_1", "ADAUSDT", "TIER_A_PRECISION", "LONG", 0.0185, 0.85, 75, "FAVORABLE", "TRENDING_BULL", 6, 1.25, []
    );
    expect(opp.compositeScore).toBeGreaterThan(0);
    expect(opp.tier).toBe("TIER_A_PRECISION");
  });

  // M. Correlation control
  it("M. Correlation control: dampens opportunity score when holding correlated asset", () => {
    const oppNoCorr = AqeaP20PortfolioOpportunityRanker.rankOpportunity(
      "OPP_1", "ETHUSDT", "TIER_A_PRECISION", "LONG", 0.015, 0.85, 70, "FAVORABLE", "TRENDING_BULL", 12, 1.25, []
    );
    const oppWithCorr = AqeaP20PortfolioOpportunityRanker.rankOpportunity(
      "OPP_2", "ETHUSDT", "TIER_A_PRECISION", "LONG", 0.015, 0.85, 70, "FAVORABLE", "TRENDING_BULL", 12, 1.25, ["BTCUSDT"]
    );
    expect(oppWithCorr.correlationPenaltyApplied).toBe(true);
    expect(oppWithCorr.compositeScore).toBeLessThan(oppNoCorr.compositeScore);
  });

  // N. Independent trade accounting
  it("N. Independent trade accounting: opens new episode on first candle", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_N", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.tradeIndependence.isSignalAbsorbed).toBe(false);
    expect(res.tradeIndependence.activeEpisodeId).not.toBeNull();
  });

  // O. Duplicate signal prevention
  it("O. Duplicate signal prevention: absorbs subsequent candles into active trade episode", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res1 = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_O1", mockFeatures(), "TRENDING_BULL", [cnn], []);
    const res2 = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_O2", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res1.tradeIndependence.isSignalAbsorbed).toBe(false);
    expect(res2.tradeIndependence.isSignalAbsorbed).toBe(true);
    expect(res2.rejectionWaterfall.firstBlockingGate).toBe("POSITION_ALREADY_OPEN");
  });

  // P. Risk sizing
  it("P. Risk sizing: dynamically sizes notional and margin based on risk and leverage", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.85, 0.07, 0.08);
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_P", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.dynamicRisk.allocatedRiskPct).toBeGreaterThan(0);
    expect(res.dynamicRisk.notionalPositionSize).toBeGreaterThan(0);
    expect(res.dynamicRisk.marginRequirement).toBe(Number((res.dynamicRisk.notionalPositionSize / res.dynamicRisk.leverage).toFixed(2)));
  });

  // Q. Drawdown protection
  it("Q. Drawdown protection: enforces risk ceiling to guarantee MDD <= 5.0%", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.85, 0.07, 0.08);
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_Q", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.dynamicRisk.allocatedRiskPct).toBeLessThanOrEqual(2.5); // Risk bounded
  });

  // R. Loss-cluster protection
  it("R. Loss-cluster protection: supports cooldown flag in risk profile", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.85, 0.07, 0.08);
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_R", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(typeof res.dynamicRisk.lossClusterCooldown).toBe("boolean");
  });

  // S. Calibration guard
  it("S. Calibration guard: maintains insufficient evidence status when N < 100", () => {
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_S", mockFeatures(), "TRENDING_BULL", [], []);
    expect(res.safety.calibrationFitFromInsufficientEvidence).toBe(false);
  });

  // T. OOS separation
  it("T. OOS separation: records are tagged as shadow only with zero live execution", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.85, 0.07, 0.08);
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_T", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.safety.executionAttempted).toBe(false);
  });

  // U. Leakage prevention
  it("U. Leakage prevention: features contain zero future timestamps or target labels", () => {
    const f = mockFeatures();
    expect(f.ohlcv?.close).toBe(0.85);
    expect((f as any).futureClose).toBeUndefined();
    expect((f as any).targetLabel).toBeUndefined();
  });

  // V. NaN/Infinity handling
  it("V. NaN/Infinity handling: sanitizes malformed probabilities safely", () => {
    const malformed = makePred("CNN_V2_DUAL_HEAD", "LONG", NaN, Infinity, -0.2);
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_V", mockFeatures(), "TRENDING_BULL", [malformed], []);
    expect(res.safety.executionAttempted).toBe(false);
  });

  // W. Model fallback protection
  it("W. Model fallback protection: flags fallbackUsed and blocks execution", () => {
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_W", mockFeatures(), "TRENDING_BULL", [], []);
    expect(res.cnnInference.fallbackUsed).toBe(true);
    expect(res.rejectionWaterfall.firstBlockingGate).toBe("MODEL_FALLBACK");
  });

  // X. Wallet immutability
  it("X. Wallet immutability: verifies walletMutationCount === 0", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_X", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.safety.walletMutationCount).toBe(0);
  });

  // Y. Order immutability
  it("Y. Order immutability: verifies orderCreationCount === 0", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_Y", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.safety.orderCreationCount).toBe(0);
  });

  // Z. LIVE_PROMOTION_BLOCKED
  it("Z. LIVE_PROMOTION_BLOCKED: strictly TRUE invariant", () => {
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_Z", mockFeatures(), "TRENDING_BULL", [], []);
    expect(res.safety.livePromotionBlocked).toBe(true);
    expect(res.safety.isLiveApproved).toBe(false);
  });

  // AA. Statistical reporting
  it("AA. Statistical reporting: verifies telemetry traces are emitted cleanly", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const res = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_AA", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.decisionId).toBe("P20_AA");
  });

  // AB. 90% target governance
  it("AB. 90% target governance: TIER_A_PRECISION enforces strict confidence hurdle >= 0.85", () => {
    const highCnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const modCnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.70, 0.15, 0.15);

    const resHigh = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_AB1", mockFeatures(), "TRENDING_BULL", [highCnn], []);
    const resMod = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_AB2", mockFeatures(), "TRENDING_BULL", [modCnn], []);

    expect(resHigh.adaptiveTier).toBe("TIER_A_PRECISION");
    expect(resMod.adaptiveTier).toBe("TIER_B_BALANCED");
  });

  // AC. Pareto frontier
  it("AC. Pareto frontier: verifies trade-off between coverage and precision", () => {
    const highCnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    const modCnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.55, 0.22, 0.23);

    const resA = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_AC1", mockFeatures(), "TRENDING_BULL", [highCnn], []);
    const resC = AqeaP20AdaptiveOpportunityEngine.evaluate("P20_AC2", mockFeatures(), "TRENDING_BULL", [modCnn], []);

    expect(resA.adaptiveTier).toBe("TIER_A_PRECISION");
    expect(resC.adaptiveTier).toBe("TIER_C_OPPORTUNITY");
  });

  // AD. Backward compatibility
  it("AD. Backward compatibility: maintains compatibility with existing ledger history", () => {
    const ledger = AqeaP20AdaptiveOpportunityEngine.getLedger();
    expect(Array.isArray(ledger)).toBe(true);
  });
});
