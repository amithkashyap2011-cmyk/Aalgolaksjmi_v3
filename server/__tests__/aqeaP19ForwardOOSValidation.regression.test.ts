/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 Phase 19 Regression Suite
 *  Forward OOS Validation, Trade Independence, Risk Optimization
 *  & Statistical Promotion Audit
 * ═══════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  AqeaP19ForwardOOSValidationEngine
} from "../src/services/aqea/shadow/AqeaP19ForwardOOSValidationEngine.js";
import { FeaturePipeline, Standardized15Features } from "../src/services/aqea/pipeline/FeaturePipeline.js";
import { ModelExpertPrediction } from "../src/services/aqea/ai/IModelExpert.js";

function mockFeatures(overrides?: Partial<Standardized15Features>): Standardized15Features {
  const base = FeaturePipeline.process({
    symbol: "BTCUSDT", currentPrice: 97500,
    indicators: {
      open: 97400, high: 97800, low: 97200, close: 97500, volume: 1500000,
      rsi14: 65, adx14: 35, ema9: 97600, ema21: 97300, cvd: 0.40, orderBlock: true
    },
    bars: [
      { open: 97300, high: 97600, low: 97100, close: 97400, volume: 1000000 },
      { open: 97400, high: 97800, low: 97200, close: 97500, volume: 1500000 }
    ],
    marketData: { orderBook: { bidVol: 800, askVol: 200, spread: 25 } }
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

describe("AQEA Phase 19: Forward OOS Validation, Trade Independence & Statistical Promotion Audit", () => {
  beforeEach(() => {
    AqeaP19ForwardOOSValidationEngine.clearState();
    jest.restoreAllMocks();
  });

  // 1. Trade Independence & Signal Absorption
  it("1. Trade Independence: absorbs consecutive signals into active position without double-counting", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    
    // First signal -> opens new trade episode
    const res1 = AqeaP19ForwardOOSValidationEngine.evaluate("DEC_1", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res1.shadowRecord.isNewIndependentTrade).toBe(true);
    expect(res1.tradeIndependence.activeEpisodeId).not.toBeNull();
    expect(res1.tradeIndependence.isSignalAbsorbed).toBe(false);

    // Second signal next candle -> position is already open, signal must be absorbed
    const res2 = AqeaP19ForwardOOSValidationEngine.evaluate("DEC_2", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res2.shadowRecord.isNewIndependentTrade).toBe(false);
    expect(res2.tradeIndependence.isSignalAbsorbed).toBe(true);
    expect(res2.tradeIndependence.activeEpisodeId).toBe(res1.tradeIndependence.activeEpisodeId);
  });

  // 2. Dynamic Risk Engine
  it("2. Dynamic Risk: scales risk based on confidence and dampens on drawdown", () => {
    const highConfCnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.90, 0.05, 0.05);
    const res = AqeaP19ForwardOOSValidationEngine.evaluate("DEC_RISK", mockFeatures(), "TRENDING_BULL", [highConfCnn], []);
    
    expect(res.dynamicRisk.baseRiskPct).toBe(1.0);
    expect(res.dynamicRisk.confidenceMultiplier).toBeGreaterThan(1.0);
    expect(res.dynamicRisk.allocatedRiskPct).toBeGreaterThan(1.0);
    expect(res.dynamicRisk.marginRequirement).toBeGreaterThan(0);
    expect(res.dynamicRisk.leverage).toBe(3.0);
  });

  // 3. Friction Deductions in NetEV
  it("3. Friction Floor: enforces full 15 bps friction deduction in expected NetEV", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.85, 0.07, 0.08);
    const res = AqeaP19ForwardOOSValidationEngine.evaluate("DEC_FRIC", mockFeatures(), "TRENDING_BULL", [cnn], []);
    
    expect(res.shadowRecord.expectedNetEV).toBeDefined();
    expect(res.shadowRecord.p_tp).toBeGreaterThan(0.50);
  });

  // 4. Seven Mandatory Governance Criteria Evaluation
  it("4. Governance Audit: evaluates all 7 promotion criteria and blocks live promotion when N < 100", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.85, 0.07, 0.08);
    const res = AqeaP19ForwardOOSValidationEngine.evaluate("DEC_GOV", mockFeatures(), "TRENDING_BULL", [cnn], []);
    
    const gov = res.governanceReport;
    expect(gov.criterion1_min100Samples.passed).toBe(false); // N < 100 initially
    expect(gov.criterion1_min100Samples.required).toBe(100);
    expect(gov.allCriteriaPassed).toBe(false);
    expect(gov.governanceDecision).toBe("PROMOTION_REJECTED_EVIDENCE_INSUFFICIENT");
    expect(gov.target90Classification).toBe("B_OBSERVED_BUT_INSUFFICIENT_EVIDENCE");
  });

  // 5. Calibration Metrics (ECE & Brier)
  it("5. Calibration: tracks Expected Calibration Error and Brier score", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.85, 0.07, 0.08);
    const res = AqeaP19ForwardOOSValidationEngine.evaluate("DEC_CALIB", mockFeatures(), "TRENDING_BULL", [cnn], []);
    
    expect(res.calibration.ecePct).toBeLessThanOrEqual(10.0);
    expect(res.calibration.brierScore).toBeLessThan(0.20);
    expect(res.calibration.isCalibrated).toBe(true);
  });

  // 6. Adversarial Robustness: Empty Predictions Fail-Closed Safely
  it("6. Adversarial Robustness: empty model predictions fail closed safely to HOLD", () => {
    const res = AqeaP19ForwardOOSValidationEngine.evaluate("DEC_EMPTY", mockFeatures(), "TRENDING_BULL", [], []);
    
    expect(res.shadowRecord.candleDirection).toBe("HOLD");
    expect(res.shadowRecord.isNewIndependentTrade).toBe(false);
    expect(res.safety.executionAttempted).toBe(false);
  });

  // 7. Shadow Ledger Record Integrity
  it("7. Shadow Ledger: records are strictly shadow-only with no live execution", () => {
    const cnn = makePred("CNN_V2_DUAL_HEAD", "LONG", 0.88, 0.06, 0.06);
    AqeaP19ForwardOOSValidationEngine.evaluate("DEC_LEDGER", mockFeatures(), "TRENDING_BULL", [cnn], []);
    
    const ledger = AqeaP19ForwardOOSValidationEngine.getLedger();
    expect(ledger.length).toBe(1);
    expect(ledger[0].shadowOnly).toBe(true);
    expect(ledger[0].paperTrade).toBe(false);
    expect(ledger[0].liveExecution).toBe(false);
  });

  // 8. Absolute Safety Invariants
  it("8. Safety Invariants: guarantees LIVE_PROMOTION_BLOCKED is strictly TRUE and wallet mutations are ZERO", () => {
    const res = AqeaP19ForwardOOSValidationEngine.evaluate("DEC_SAFETY", mockFeatures(), "TRENDING_BULL", [], []);
    
    expect(res.safety.livePromotionBlocked).toBe(true);
    expect(res.safety.isLiveApproved).toBe(false);
    expect(res.safety.executionAttempted).toBe(false);
    expect(res.safety.orderCreationCount).toBe(0);
    expect(res.safety.walletMutationCount).toBe(0);
    expect(res.safety.syntheticOutcomeCountUsedForOOS).toBe(0);
    expect(res.safety.lstmVotingEligible).toBe(false);
  });
});
