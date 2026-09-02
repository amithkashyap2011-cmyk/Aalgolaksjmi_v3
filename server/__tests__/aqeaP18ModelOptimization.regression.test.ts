/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 Phase 18 Regression Suite
 *  Adaptive Model Optimization, Retraining, Champion/Challenger &
 *  High-Profitability Research
 * ═══════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  AqeaP18ModelOptimizationEngine,
  P18_CHAMPION_SCORECARDS,
  P18_PRECISION_COVERAGE_CURVE
} from "../src/services/aqea/shadow/AqeaP18ModelOptimizationEngine.js";
import { QUARANTINED_MODELS } from "../src/services/aqea/shadow/AqeaP17OpportunityEngine.js";
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
    modelName: name, modelVersion: "1.0.0", architecture: "NN", inferenceMode: "REAL_MODEL",
    direction: dir, probabilities: { LONG: pL, SHORT: pS, HOLD: pH },
    confidence: Math.max(pL, pS, pH), probability: Math.max(pL, pS),
    uncertainty: 1 - Math.max(pL, pS, pH), predictionInterval: [0.3, 0.8] as [number, number],
    latencyMs: 8, status, regimeCompatibility: 0.85, featureVersion: 2, isTrained: true, timestamp: Date.now()
  };
}

describe("AQEA Phase 18: Adaptive Model Optimization & High-Precision Research", () => {
  beforeEach(() => {
    AqeaP18ModelOptimizationEngine.clearLedger();
    jest.restoreAllMocks();
  });

  // 1. Model Champion Scorecards
  it("1. Scorecards: verifies Champion, Challenger, and Quarantined roles", () => {
    expect(P18_CHAMPION_SCORECARDS.CNN_1D_V1_CHAMPION.role).toBe("PRIMARY_DIRECTIONAL_CHAMPION");
    expect(P18_CHAMPION_SCORECARDS.CNN_V2_CHALLENGER.role).toBe("PRIMARY_DIRECTIONAL_CHALLENGER");
    expect(P18_CHAMPION_SCORECARDS.MAMBA_RESEARCH_V1.role).toBe("CONTEXT_REGIME_CHAMPION");
    expect(P18_CHAMPION_SCORECARDS.LSTM_SEQUENCE_V1.status).toBe("QUARANTINED");
    expect(P18_CHAMPION_SCORECARDS.CNN_V2_CHALLENGER.directionalAccuracy).toBeGreaterThan(
      P18_CHAMPION_SCORECARDS.CNN_1D_V1_CHAMPION.directionalAccuracy
    );
  });

  // 2. LSTM Quarantine Enforcement
  it("2. LSTM Quarantine: verifies OUTPUT_COLLAPSED model remains strictly quarantined", () => {
    expect(QUARANTINED_MODELS.LSTM_SEQUENCE_V1.votingEligible).toBe(false);
    expect(QUARANTINED_MODELS.LSTM_SEQUENCE_V1.modelStatus).toBe("OUTPUT_COLLAPSED");

    const lstm = makePred("BILSTM_V1_BENCHMARK", "HOLD", 0.0001, 0.0, 0.9999, "BENCHMARK");
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.85, 0.05, 0.10, "BENCHMARK");
    const res = AqeaP18ModelOptimizationEngine.evaluate("P18_TEST_LSTM", mockFeatures(), "TRENDING_BULL", [lstm, cnn], []);
    expect(res.safety.lstmVotingEligible).toBe(false);
    expect(res.lstmQuarantineStatus.modelStatus).toBe("OUTPUT_COLLAPSED");
  });

  // 3. Dedicated Trade Quality Model
  it("3. Trade Quality: computes P(TP before SL), Expected Net Return, and MFE/MAE ratio", () => {
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.80, 0.10, 0.10, "BENCHMARK");
    const res = AqeaP18ModelOptimizationEngine.evaluate("P18_TEST_TQ", mockFeatures(), "TRENDING_BULL", [cnn], []);
    expect(res.tradeQuality.label).toBe("TRADE_QUALITY_ESTIMATOR_P18_VALIDATED");
    expect(res.tradeQuality.probabilityTpBeforeSl).toBeGreaterThan(0.50);
    expect(res.tradeQuality.mfeMaeRatio).toBeGreaterThan(1.0);
    expect(res.tradeQuality.totalFriction).toBeGreaterThan(0);
    expect(res.tradeQuality.expectedMFE).toBeGreaterThan(res.tradeQuality.totalFriction);
  });

  // 4. Precision/Coverage Curve
  it("4. Precision/Coverage Curve: confirms curve monotonicity and ~90% precision at high confidence", () => {
    expect(P18_PRECISION_COVERAGE_CURVE.length).toBeGreaterThanOrEqual(6);
    // Coverage must decrease as threshold increases
    for (let i = 1; i < P18_PRECISION_COVERAGE_CURVE.length; i++) {
      expect(P18_PRECISION_COVERAGE_CURVE[i].tradeCoveragePct).toBeLessThan(
        P18_PRECISION_COVERAGE_CURVE[i - 1].tradeCoveragePct
      );
      expect(P18_PRECISION_COVERAGE_CURVE[i].estimatedWinRatePct).toBeGreaterThanOrEqual(
        P18_PRECISION_COVERAGE_CURVE[i - 1].estimatedWinRatePct
      );
    }
    // High confidence tier (threshold >= 0.85) achieves ~90% win rate
    const highConfPoint = P18_PRECISION_COVERAGE_CURVE.find(p => p.confidenceThreshold === 0.85);
    expect(highConfPoint).toBeDefined();
    expect(highConfPoint!.estimatedWinRatePct).toBeGreaterThanOrEqual(90.0);
    expect(highConfPoint!.target90Achieved).toBe(true);
  });

  // 5. Research Precision Tiers (PRECISION_90_TARGET vs BALANCED vs OPPORTUNITY_MAX)
  it("5. Precision Tiers: enforces stricter confidence hurdle for PRECISION_90_TARGET", () => {
    const moderateCnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.68, 0.16, 0.16, "BENCHMARK");
    
    // In PRECISION_90_TARGET (hurdle >= 0.85), moderate CNN should abstain
    const res90 = AqeaP18ModelOptimizationEngine.evaluate(
      "P18_TEST_TIER_90", mockFeatures(), "TRENDING_BULL", [moderateCnn], [], undefined, undefined, "PRECISION_90_TARGET"
    );
    expect(res90.selectiveAbstention).toBe(true);
    expect(res90.rejectionWaterfall.firstBlockingGate).toBe("AI_CONFIDENCE_BELOW_THRESHOLD");

    // In OPPORTUNITY_MAX (hurdle >= 0.50), moderate CNN is accepted for execution consideration
    const resMax = AqeaP18ModelOptimizationEngine.evaluate(
      "P18_TEST_TIER_MAX", mockFeatures(), "TRENDING_BULL", [moderateCnn], [], undefined, undefined, "OPPORTUNITY_MAX"
    );
    expect(resMax.cnnChallengerInference.confidence).toBeGreaterThanOrEqual(0.50);
  });

  // 6. Selective Abstention on Neutral / Negative NetEV
  it("6. Selective Abstention: abstains on neutral signal or negative expected return", () => {
    const neutralCnn = makePred("CNN_1D_V1_BENCHMARK", "HOLD", 0.3333, 0.3333, 0.3334, "BENCHMARK");
    const res = AqeaP18ModelOptimizationEngine.evaluate("P18_TEST_ABSTAIN", mockFeatures(), "RANGING", [neutralCnn], []);
    expect(res.selectiveAbstention).toBe(true);
    expect(res.selectedDirection).toBe("HOLD");
    expect(["NORMAL_ABSTENTION_HOLD", "AI_CONFIDENCE_BELOW_THRESHOLD", "NET_EV_NEGATIVE"]).toContain(
      res.rejectionWaterfall.firstBlockingGate
    );
  });

  // 7. Mamba Context Preservation
  it("7. Mamba Context: verifies Mamba acts as contextual advisor without crashing", () => {
    const mamba = makePred("MAMBA_RESEARCH_V1", "HOLD", 0.25, 0.35, 0.40);
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.88, 0.06, 0.06, "BENCHMARK");
    const res = AqeaP18ModelOptimizationEngine.evaluate("P18_TEST_MAMBA", mockFeatures(), "TRENDING_BULL", [mamba, cnn], []);
    expect(res.mambaContextInference.contractStatus).toBe("VALID_REAL_INFERENCE");
  });

  // 8. Adversarial / Robustness Handling (NaN / Empty predictions)
  it("8. Adversarial Robustness: handles empty / malformed predictions safely", () => {
    const res = AqeaP18ModelOptimizationEngine.evaluate("P18_TEST_EMPTY", mockFeatures(), "TRENDING_BULL", [], []);
    expect(res.selectedDirection).toBe("HOLD");
    expect(res.selectiveAbstention).toBe(true);
    expect(res.safety.executionAttempted).toBe(false);
  });

  // 9. Shadow Ledger Record Integrity
  it("9. Shadow Ledger: records are strictly shadow-only with no live execution", () => {
    const cnn = makePred("CNN_1D_V1_BENCHMARK", "LONG", 0.88, 0.06, 0.06, "BENCHMARK");
    AqeaP18ModelOptimizationEngine.evaluate("P18_TEST_LEDGER", mockFeatures(), "TRENDING_BULL", [cnn], []);
    const ledger = AqeaP18ModelOptimizationEngine.getLedger();
    expect(ledger.length).toBe(1);
    expect(ledger[0].shadowOnly).toBe(true);
    expect(ledger[0].paperTrade).toBe(false);
    expect(ledger[0].liveExecution).toBe(false);
  });

  // 10. Non-Negotiable Safety Barriers (LIVE_PROMOTION_BLOCKED)
  it("10. Safety Invariants: guarantees LIVE_PROMOTION_BLOCKED is strictly TRUE and wallet mutations are ZERO", () => {
    const res = AqeaP18ModelOptimizationEngine.evaluate("P18_TEST_SAFETY", mockFeatures(), "TRENDING_BULL", [], []);
    expect(res.safety.livePromotionBlocked).toBe(true);
    expect(res.safety.isLiveApproved).toBe(false);
    expect(res.safety.executionAttempted).toBe(false);
    expect(res.safety.orderCreationCount).toBe(0);
    expect(res.safety.walletMutationCount).toBe(0);
    expect(res.safety.syntheticOutcomeCountUsedForOOS).toBe(0);
    expect(res.safety.lstmVotingEligible).toBe(false);
  });
});
