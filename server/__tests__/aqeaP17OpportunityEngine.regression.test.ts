/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 Phase 17 Regression Suite
 *  Evidence-Aware Opportunity Engine, Model Optimization & Shadow Profitability
 * ═══════════════════════════════════════════════════════════════════
 * Categories A–X as required by Phase 17 specification.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { AqeaP17OpportunityEngine, QUARANTINED_MODELS } from "../src/services/aqea/shadow/AqeaP17OpportunityEngine.js";
import { MODEL_INVENTORY } from "../src/services/aqea/shadow/AqeaP16ShadowLedger.js";
import { FeaturePipeline, Standardized15Features } from "../src/services/aqea/pipeline/FeaturePipeline.js";
import { ModelExpertPrediction } from "../src/services/aqea/ai/IModelExpert.js";
import { AdaptiveBayesianGate } from "../src/services/aqea/bayesian/AdaptiveBayesianGate.js";

function mockFeatures(overrides?: Partial<Standardized15Features>): Standardized15Features {
  const base = FeaturePipeline.process({
    symbol: "BTCUSDT", currentPrice: 97500,
    indicators: { open: 97400, high: 97800, low: 97200, close: 97500, volume: 1500000, rsi14: 65, adx14: 35, ema9: 97600, ema21: 97300, cvd: 0.40, orderBlock: true },
    bars: [
      { open: 97300, high: 97600, low: 97100, close: 97400, volume: 1000000 },
      { open: 97400, high: 97800, low: 97200, close: 97500, volume: 1500000 }
    ],
    marketData: { orderBook: { bidVol: 800, askVol: 200 } }
  });
  return { ...base, ...overrides };
}

function makePred(name: string, dir: "LONG"|"SHORT"|"HOLD", pL: number, pS: number, pH: number, status: "PRODUCTION"|"BENCHMARK" = "PRODUCTION"): ModelExpertPrediction {
  return {
    modelName: name, modelVersion: "1.0.0", architecture: "NN", inferenceMode: "REAL_MODEL",
    direction: dir, probabilities: { LONG: pL, SHORT: pS, HOLD: pH },
    confidence: Math.max(pL, pS, pH), probability: Math.max(pL, pS),
    uncertainty: 1 - Math.max(pL, pS, pH), predictionInterval: [0.3, 0.8] as [number, number],
    latencyMs: 8, status, regimeCompatibility: 0.85, featureVersion: 2, isTrained: true, timestamp: Date.now()
  };
}

describe("AQEA Phase 17: Evidence-Aware Opportunity Engine", () => {
  beforeEach(() => {
    AqeaP17OpportunityEngine.clearLedger();
    jest.restoreAllMocks();
  });

  // A. CNN inference integrity
  it("A. CNN inference: verifies checkpoint hash and probability normalization", () => {
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.78, 0.12, 0.10, "BENCHMARK");
    const res = AqeaP17OpportunityEngine.evaluate("P17_A", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.cnnInference.checkpointHash).toBe(MODEL_INVENTORY.CNN_1D_V1.checkpointHash);
    const sum = res.cnnInference.probabilities.LONG + res.cnnInference.probabilities.SHORT + res.cnnInference.probabilities.HOLD;
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
    expect(res.cnnInference.fallbackUsed).toBe(false);
  });

  // B. Mamba inference integrity
  it("B. Mamba inference: verifies contract status and non-veto behavior", () => {
    const mamba = makePred("MAMBA_RESEARCH_V1", "HOLD", 0.22, 0.35, 0.43);
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.78, 0.12, 0.10, "BENCHMARK");
    const res = AqeaP17OpportunityEngine.evaluate("P17_B", mockFeatures(), "TRENDING_BULL", [mamba, cnn], []);
    expect(res.mambaContext.contractStatus).toBe("VALID_REAL_INFERENCE");
    // CNN should NOT be vetoed by Mamba HOLD
    expect(res.evidenceAwareFusion.fusedDirection).toBe("LONG");
  });

  // C. LSTM quarantine
  it("C. LSTM quarantine: quarantined model cannot influence ensemble", () => {
    expect(QUARANTINED_MODELS.LSTM_SEQUENCE_V1.votingEligible).toBe(false);
    expect(QUARANTINED_MODELS.LSTM_SEQUENCE_V1.modelStatus).toBe("OUTPUT_COLLAPSED");
    expect(AqeaP17OpportunityEngine.isQuarantined("LSTM_SEQUENCE_V1")).toBe(true);
    expect(AqeaP17OpportunityEngine.isQuarantined("BILSTM_V1_BENCHMARK")).toBe(true);
    expect(AqeaP17OpportunityEngine.isQuarantined("CNN_1D_V1_BENCHMARK")).toBe(false);

    const lstm = makePred("BILSTM_V1_BENCHMARK", "HOLD", 0.0001, 0.0, 0.9999, "BENCHMARK");
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.82, 0.08, 0.10, "BENCHMARK");
    const res = AqeaP17OpportunityEngine.evaluate("P17_C", mockFeatures(), "TRENDING_BULL", [lstm, cnn], []);
    // LSTM must not drag result to HOLD
    expect(res.evidenceAwareFusion.fusedDirection).toBe("LONG");
    expect(res.safety.lstmVotingEligible).toBe(false);
  });

  // D. Probability normalization
  it("D. fused probabilities sum to 1.0", () => {
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.70, 0.15, 0.15, "BENCHMARK");
    const res = AqeaP17OpportunityEngine.evaluate("P17_D", mockFeatures(), "TRENDING_BULL", [cnn], []);
    const sum = res.evidenceAwareFusion.fusedProbabilities.LONG + res.evidenceAwareFusion.fusedProbabilities.SHORT + res.evidenceAwareFusion.fusedProbabilities.HOLD;
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
  });

  // E. Model fallback protection
  it("E. model fallback: detects CNN fallback when no CNN prediction available", () => {
    const mamba = makePred("MAMBA_RESEARCH_V1", "HOLD", 0.22, 0.35, 0.43);
    const res = AqeaP17OpportunityEngine.evaluate("P17_E", mockFeatures(), "TRENDING_BULL", [mamba], []);
    expect(res.cnnInference.fallbackUsed).toBe(true);
  });

  // F. Regime routing
  it("F. regime routing: CNN gets higher weight in TRENDING regimes", () => {
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.75, 0.10, 0.15, "BENCHMARK");
    const resTrending = AqeaP17OpportunityEngine.evaluate("P17_F1", mockFeatures(), "TRENDING_BULL", [cnn], []);
    const resRanging = AqeaP17OpportunityEngine.evaluate("P17_F2", mockFeatures(), "RANGING", [cnn], []);
    expect(resTrending.modelContributions.cnnContribution).toBeGreaterThanOrEqual(resRanging.modelContributions.cnnContribution);
  });

  // G. Evidence-aware fusion (CENTRAL TEST)
  it("G. evidence-aware fusion: CNN LONG + Mamba HOLD does NOT collapse to HOLD", () => {
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.82, 0.08, 0.10, "BENCHMARK");
    const mamba = makePred("MAMBA_RESEARCH_V1", "HOLD", 0.25, 0.35, 0.40);
    const res = AqeaP17OpportunityEngine.evaluate("P17_G", mockFeatures(), "TRENDING_BULL", [cnn, mamba], []);
    // Central fix: fused direction MUST remain LONG
    expect(res.evidenceAwareFusion.fusedDirection).toBe("LONG");
    expect(res.evidenceAwareFusion.cnnDirectionalSignal).toBe("STRONG");
    expect(res.evidenceAwareFusion.mambaContext).toBe("CAUTION");
    // Fused P(LONG) must be materially higher than simple average of 0.535
    expect(res.evidenceAwareFusion.fusedProbabilities.LONG).toBeGreaterThan(0.55);
  });

  // H. Opportunity classification
  it("H. opportunity engine: classifies stages correctly", () => {
    const strongCnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.82, 0.08, 0.10, "BENCHMARK");
    const confirmMamba = makePred("MAMBA_RESEARCH_V1", "LONG", 0.55, 0.20, 0.25);
    const res = AqeaP17OpportunityEngine.evaluate("P17_H", mockFeatures(), "TRENDING_BULL", [strongCnn, confirmMamba], []);
    expect(["EXECUTION_CANDIDATE", "TRADEABLE_CANDIDATE"]).toContain(res.opportunityStage);
  });

  // I. Trade quality calculation
  it("I. trade quality: estimator is labeled UNCALIBRATED", () => {
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.70, 0.15, 0.15, "BENCHMARK");
    const res = AqeaP17OpportunityEngine.evaluate("P17_I", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.tradeQuality.label).toBe("TRADE_QUALITY_ESTIMATOR_UNCALIBRATED");
    expect(res.tradeQuality.expectedMFE).toBeGreaterThan(0);
    expect(res.tradeQuality.expectedMAE).toBeGreaterThan(0);
  });

  // J. MFE/MAE calculation
  it("J. MFE/MAE: ratio is computed correctly", () => {
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.75, 0.10, 0.15, "BENCHMARK");
    const res = AqeaP17OpportunityEngine.evaluate("P17_J", mockFeatures(), "TRENDING_BULL", [cnn], []);
    const ratio = res.tradeQuality.expectedMFE / res.tradeQuality.expectedMAE;
    expect(Math.abs(ratio - res.tradeQuality.mfeMaeRatio)).toBeLessThan(0.01);
  });

  // K. Friction calculation
  it("K. friction: fees and slippage are non-zero deductions", () => {
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.70, 0.15, 0.15, "BENCHMARK");
    const res = AqeaP17OpportunityEngine.evaluate("P17_K", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.shadowRecord.fees).toBeGreaterThan(0);
    expect(res.shadowRecord.slippage).toBeGreaterThan(0);
    expect(res.tradeQuality.frictionCost).toBeGreaterThan(0);
  });

  // L. NetEV calculation
  it("L. NetEV: expectedEdge accounts for friction", () => {
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.80, 0.08, 0.12, "BENCHMARK");
    const res = AqeaP17OpportunityEngine.evaluate("P17_L", mockFeatures(), "TRENDING_BULL", [cnn], []);
    // expectedEdge = expectedGross - friction; must be less than expectedGross
    expect(res.tradeQuality.expectedEdge).toBeLessThan(res.tradeQuality.expectedMFE);
  });

  // M. Tier classification — Bayesian gate may legitimately block, so verify:
  //    (a) the opportunity IS classified as high-stage regardless
  //    (b) if Bayesian blocks, tier defaults to HOLD (correct behavior)
  it("M. tier: high-conviction opportunity correctly classified even if Bayesian blocks", () => {
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.85, 0.05, 0.10, "BENCHMARK");
    const mamba = makePred("MAMBA_RESEARCH_V1", "LONG", 0.55, 0.20, 0.25);
    const res = AqeaP17OpportunityEngine.evaluate("P17_M", mockFeatures(), "TRENDING_BULL", [cnn, mamba], []);
    // Opportunity stage must reflect strong CNN + confirming Mamba
    expect(["EXECUTION_CANDIDATE", "TRADEABLE_CANDIDATE"]).toContain(res.opportunityStage);
    // If Bayesian blocks, tier must be HOLD (not erroneously promoted)
    if (!res.evidenceAwareFusion.passesBayesian) {
      expect(res.executionTier).toBe("HOLD");
    } else {
      expect(["TIER_A_HIGH_CONVICTION", "TIER_B_CONDITIONAL"]).toContain(res.executionTier);
    }
  });

  // N. Risk sizing
  it("N. risk sizing: position sizing is risk-bounded and scales with tier", () => {
    const sizeA = AqeaP17OpportunityEngine.calculateRiskBasedSize(10000, 0.01, 0.02, "TIER_A_HIGH_CONVICTION", 5);
    const sizeB = AqeaP17OpportunityEngine.calculateRiskBasedSize(10000, 0.01, 0.02, "TIER_B_CONDITIONAL", 5);
    const sizeC = AqeaP17OpportunityEngine.calculateRiskBasedSize(10000, 0.01, 0.02, "TIER_C_LOW_CONVICTION", 5);
    
    // Tier A notional > Tier B > Tier C
    expect(sizeA.notional).toBeGreaterThan(sizeB.notional);
    expect(sizeB.notional).toBeGreaterThan(sizeC.notional);
    expect(sizeA.riskAmount).toBe(100); // 1% of $10,000
    expect(sizeA.margin).toBe(sizeA.notional / 5);
  });

  // O. Rejection waterfall
  it("O. rejection waterfall: identifies first blocking gate", () => {
    // Weak CNN should be blocked
    const weakCnn = makePred("CNN_1D_V1_BENCHMARK", "HOLD", 0.35, 0.30, 0.35, "BENCHMARK");
    const res = AqeaP17OpportunityEngine.evaluate("P17_O", mockFeatures(), "RANGING", [weakCnn], []);
    expect(res.rejectionWaterfall.firstBlockingGate).not.toBe("NONE");
  });

  // P. Shadow ledger
  it("P. shadow ledger: records are persisted with correct flags", () => {
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.70, 0.15, 0.15, "BENCHMARK");
    AqeaP17OpportunityEngine.evaluate("P17_P", mockFeatures(), "TRENDING_BULL", [cnn], []);
    const ledger = AqeaP17OpportunityEngine.getLedger();
    expect(ledger.length).toBe(1);
    expect(ledger[0].shadowOnly).toBe(true);
    expect(ledger[0].paperTrade).toBe(false);
    expect(ledger[0].liveExecution).toBe(false);
  });

  // Q. OOS population separation
  it("Q. OOS population separation: populations are strictly partitioned", () => {
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.70, 0.15, 0.15, "BENCHMARK");
    AqeaP17OpportunityEngine.evaluate("P17_Q1", mockFeatures(), "TRENDING_BULL", [cnn], []);
    AqeaP17OpportunityEngine.evaluate("P17_Q2", mockFeatures(), "RANGING", [], []);
    
    const pops = AqeaP17OpportunityEngine.getPopulations();
    expect(pops.DECISION_POPULATION).toBe(2);
    expect(pops.SHADOW_OBSERVATION_POPULATION).toBe(2);
    // Populations must never be silently merged
    expect(pops.OUTCOME_POPULATION).toBe(0); // unresolved
  });

  // R. Calibration guard
  it("R. calibration: remains INSUFFICIENT with N=0", () => {
    const res = AqeaP17OpportunityEngine.evaluate("P17_R", mockFeatures(), "TRENDING_BULL", [], []);
    expect(res.calibration.status).toBe("CALIBRATION_EVIDENCE_INSUFFICIENT");
    expect(res.calibration.resolvedOosCount).toBe(0);
  });

  // S. Service failure handling
  it("S. service failure: no predictions available fails safely to HOLD", () => {
    const res = AqeaP17OpportunityEngine.evaluate("P17_S", mockFeatures(), "TRENDING_BULL", [], []);
    expect(res.evidenceAwareFusion.fusedDirection).toBe("HOLD");
    expect(res.opportunityStage).toBe("ABSTAIN");
    expect(res.safety.executionAttempted).toBe(false);
  });

  // T. NaN/Infinity handling
  it("T. NaN/Infinity: invalid probabilities are handled safely", () => {
    const invalid = makePred("CNN_1D_V1_BENCHMARK", "LONG", NaN, Infinity, -0.5, "BENCHMARK");
    const res = AqeaP17OpportunityEngine.evaluate("P17_T", mockFeatures(), "TRENDING_BULL", [invalid], []);
    expect(res.safety.executionAttempted).toBe(false);
  });

  // U. Leverage correctness
  it("U. leverage correctness: margin and ROI formulas hold strictly", () => {
    const notional = 10000;
    const leverage = 10;
    const margin = notional / leverage; // 1000
    const netPnL = 50;
    const inv = AqeaP17OpportunityEngine.verifyPositionInvariants(notional, leverage, margin, netPnL);
    expect(inv.marginValid).toBe(true);
    expect(inv.roiValid).toBe(true);
    expect(inv.roiPct).toBe(5.0); // (50 / 1000) * 100 = 5.0%
  });

  // V. No wallet mutation
  it("V. no wallet mutation: walletMutationCount === 0", () => {
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.85, 0.05, 0.10, "BENCHMARK");
    const res = AqeaP17OpportunityEngine.evaluate("P17_V", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.safety.walletMutationCount).toBe(0);
    expect(res.safety.orderCreationCount).toBe(0);
  });

  // W. No order creation
  it("W. no order creation: orderCreationCount === 0", () => {
    const res = AqeaP17OpportunityEngine.evaluate("P17_W", mockFeatures(), "TRENDING_BULL", [], []);
    expect(res.safety.orderCreationCount).toBe(0);
  });

  // X. LIVE_PROMOTION_BLOCKED invariant
  it("X. LIVE_PROMOTION_BLOCKED is strictly TRUE", () => {
    const res = AqeaP17OpportunityEngine.evaluate("P17_X", mockFeatures(), "TRENDING_BULL", [], []);
    expect(res.safety.livePromotionBlocked).toBe(true);
    expect(res.safety.isLiveApproved).toBe(false);
    expect(res.safety.syntheticOutcomeCountUsedForOOS).toBe(0);
    expect(res.safety.calibrationFitFromInsufficientEvidence).toBe(false);
    expect(res.safety.lstmVotingEligible).toBe(false);
  });
});
