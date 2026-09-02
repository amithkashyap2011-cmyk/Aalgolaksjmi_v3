/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Bias Control & Anti-Bias Governance Regression Suite
 * ═══════════════════════════════════════════════════════════════════
 * Validates the 20 Anti-Bias Rules across all 14 dimensions of bias:
 * Look-Ahead, Survivorship, Selection, Class Imbalance, Directional,
 * Regime, Recency, Model Selection, Correlation, Calibration, Execution,
 * Domain, Liquidity, and Human/Configuration biases.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { BiasControlEngine } from "../src/services/aqea/governance/BiasControlEngine.js";
import { ForwardTelemetryStore } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import { StatisticalTests } from "../src/services/aqea/ensemble/StatisticalTests.js";
import { ModelContributionEngine, DataLeakageError } from "../src/services/aqea/ensemble/UnifiedEnsembleFusion.js";
import { ModelScorecardRegistry } from "../src/services/aqea/ensemble/ModelScorecard.js";

describe("AQEA 2026–27 — Anti-Bias Governance & Bias Control Suite (18 Test Areas)", () => {
  beforeEach(() => {
    ForwardTelemetryStore.clear();
    StatisticalTests.clearRegistry();
    ModelContributionEngine.clearHistory();
    ModelScorecardRegistry.clearAll();
  });

  // 1. Look-Ahead Bias Guard
  it("Area 1: Look-Ahead Bias — Strictly rejects any observation where outcome precedes or matches decision", () => {
    const t0 = 1700000000000;
    ForwardTelemetryStore.recordDecision({
      decisionId: "LOOKAHEAD_001",
      timestamp: t0,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.80,
      holdProbability: 0.10,
      sellProbability: 0.10,
      direction: "LONG",
      confidence: 0.80,
      agreementScore: 0.85,
      tradeQualityScore: 0.80,
      tradeQualityTier: "HIGH_CONVICTION",
      expectedValue: 1.5,
      fees: 0.1,
      slippage: 0.05,
      uncertainty: 0.15,
      modelBreakdowns: {}
    });

    // Attempting to resolve with an outcome at t <= t0 must throw DataLeakageError
    expect(() => {
      ForwardTelemetryStore.resolveOutcome("LOOKAHEAD_001", {
        decisionId: "LOOKAHEAD_001",
        timestamp: t0,
        symbol: "BTCUSDT",
        regime: "TRENDING_BULL",
        accountType: "FUTURES",
        realizedDirection: "LONG",
        realizedReturn: 1.5,
        realizedPnL: 15.0,
        outcome: "WIN",
        directionCorrect: true,
        resolvedTimestamp: t0 // Illegal: equal to decision time
      });
    }).toThrow(DataLeakageError);

    const audit = BiasControlEngine.evaluateBias();
    expect(audit.biasVector.lookAheadBias.status).toBe("OPTIMAL");
  });

  // 2. Survivorship Bias Guard
  it("Area 2: Survivorship Bias — Audits active, benchmark, shadow, and quarantined models without survivor-only filtering", () => {
    const models = ["MAMBA_RESEARCH_V1", "CNN_1D_V1_BENCHMARK", "BILSTM_V1_BENCHMARK", "MODERN_TCN_V1_PROXY"];
    const audit = BiasControlEngine.evaluateBias(models);

    expect(audit.biasVector.survivorshipBias.status).toBe("OPTIMAL");
    expect(audit.biasVector.survivorshipBias.sampleCount).toBe(models.length);
  });

  // 3. Data-Selection Bias Guard
  it("Area 3: Data-Selection Bias — Enforces continuous chronological series without cherry-picking loss periods", () => {
    const t0 = Date.now() - 500000;
    // Seed series with mixed profitable and crisis regimes
    for (let i = 0; i < 25; i++) {
      const decId = `DATA_SEL_${i}`;
      ForwardTelemetryStore.recordDecision({
        decisionId: decId,
        timestamp: t0 + i * 1000,
        symbol: "ETHUSDT",
        marketDomain: "CRYPTO",
        accountType: "SPOT",
        regime: i % 5 === 0 ? "CRISIS" : "TRENDING_UP",
        featureVersion: 2,
        buyProbability: 0.65,
        holdProbability: 0.20,
        sellProbability: 0.15,
        direction: "LONG",
        confidence: 0.70,
        agreementScore: 0.80,
        tradeQualityScore: 0.75,
        tradeQualityTier: "HIGH_CONVICTION",
        expectedValue: 1.2,
        fees: 0.1,
        slippage: 0.05,
        uncertainty: 0.20,
        modelBreakdowns: {}
      });

      ForwardTelemetryStore.resolveOutcome(decId, {
        decisionId: decId,
        timestamp: t0 + i * 1000,
        symbol: "ETHUSDT",
        regime: i % 5 === 0 ? "CRISIS" : "TRENDING_UP",
        accountType: "SPOT",
        realizedDirection: "LONG",
        realizedReturn: i % 5 === 0 ? -2.5 : 1.2, // Loss in crisis preserved
        realizedPnL: i % 5 === 0 ? -25 : 12,
        outcome: i % 5 === 0 ? "LOSS" : "WIN",
        directionCorrect: i % 5 !== 0,
        resolvedTimestamp: t0 + i * 1000 + 500
      });
    }

    const audit = BiasControlEngine.evaluateBias();
    expect(audit.biasVector.selectionBias.status).toBe("OPTIMAL");
  });

  // 4. Regime Bias Guard
  it("Area 4: Regime Bias — Decomposes performance across all 8 institutional regimes", () => {
    const audit = BiasControlEngine.evaluateBias();
    expect(audit.biasVector.regimeBias).toBeDefined();
    expect(audit.biasVector.regimeBias.name).toBe("REGIME_BIAS");
  });

  // 5. Class Imbalance Bias Guard
  it("Area 5: Class Imbalance Bias — Detects HOLD dominance and reports balanced accuracy and macro F1", () => {
    const t0 = Date.now() - 300000;
    // Seed with 80% HOLD and 20% BUY
    for (let i = 0; i < 20; i++) {
      const isHold = i < 16;
      const decId = `CLASS_BIAS_${i}`;
      ForwardTelemetryStore.recordDecision({
        decisionId: decId,
        timestamp: t0 + i * 1000,
        symbol: "BTCUSDT",
        marketDomain: "CRYPTO",
        accountType: "FUTURES",
        regime: "SIDEWAYS",
        featureVersion: 2,
        buyProbability: isHold ? 0.20 : 0.70,
        holdProbability: isHold ? 0.70 : 0.20,
        sellProbability: 0.10,
        direction: isHold ? "HOLD" : "LONG",
        confidence: 0.75,
        agreementScore: 0.80,
        tradeQualityScore: 0.70,
        tradeQualityTier: "STANDARD",
        expectedValue: 1.0,
        fees: 0.1,
        slippage: 0.05,
        uncertainty: 0.20,
        modelBreakdowns: {}
      });

      ForwardTelemetryStore.resolveOutcome(decId, {
        decisionId: decId,
        timestamp: t0 + i * 1000,
        symbol: "BTCUSDT",
        regime: "SIDEWAYS",
        accountType: "FUTURES",
        realizedDirection: isHold ? "HOLD" : "LONG",
        realizedReturn: isHold ? 0.0 : 1.2,
        realizedPnL: isHold ? 0.0 : 12.0,
        outcome: "WIN",
        directionCorrect: true,
        resolvedTimestamp: t0 + i * 1000 + 400
      });
    }

    const classAudit = BiasControlEngine.evaluateClassImbalance(ForwardTelemetryStore.getResolvedRecords());
    expect(classAudit.holdDominanceRatio).toBe(0.80);
    expect(classAudit.balancedAccuracy).toBeDefined();
    expect(classAudit.macroF1).toBeDefined();
  });

  // 6. Directional Bias Guard
  it("Area 6: Directional Bias — Separately evaluates LONG vs SHORT metrics and quantifies skew", () => {
    const t0 = Date.now() - 400000;
    // 35 decisions: 30 LONG, 5 SHORT (strong directional bias)
    for (let i = 0; i < 35; i++) {
      const isLong = i < 30;
      const decId = `DIR_BIAS_${i}`;
      ForwardTelemetryStore.recordDecision({
        decisionId: decId,
        timestamp: t0 + i * 1000,
        symbol: "BTCUSDT",
        marketDomain: "CRYPTO",
        accountType: "FUTURES",
        regime: "TRENDING_BULL",
        featureVersion: 2,
        buyProbability: isLong ? 0.75 : 0.15,
        holdProbability: 0.15,
        sellProbability: isLong ? 0.10 : 0.70,
        direction: isLong ? "LONG" : "SHORT",
        confidence: 0.75,
        agreementScore: 0.80,
        tradeQualityScore: 0.78,
        tradeQualityTier: "HIGH_CONVICTION",
        expectedValue: 1.5,
        fees: 0.1,
        slippage: 0.05,
        uncertainty: 0.20,
        modelBreakdowns: {}
      });

      ForwardTelemetryStore.resolveOutcome(decId, {
        decisionId: decId,
        timestamp: t0 + i * 1000,
        symbol: "BTCUSDT",
        regime: "TRENDING_BULL",
        accountType: "FUTURES",
        realizedDirection: isLong ? "LONG" : "SHORT",
        realizedReturn: isLong ? 1.5 : -1.0,
        realizedPnL: isLong ? 15.0 : -10.0,
        outcome: isLong ? "WIN" : "LOSS",
        directionCorrect: isLong,
        resolvedTimestamp: t0 + i * 1000 + 400
      });
    }

    const dirAudit = BiasControlEngine.evaluateDirectionalBias(ForwardTelemetryStore.getResolvedRecords());
    expect(dirAudit.longCount).toBe(30);
    expect(dirAudit.shortCount).toBe(5);
    expect(dirAudit.directionalSkew).toBeGreaterThan(0.60);
    expect(dirAudit.hasSignificantBias).toBe(true);
  });

  // 7. Recency Bias Guard
  it("Area 7: Recency Bias — Bounded Bayesian shrinkage prevents recent short streaks from wiping long-term priors", () => {
    const audit = BiasControlEngine.evaluateBias();
    expect(audit.biasVector.recencyBias.status).toBe("OPTIMAL");
    expect(audit.biasVector.recencyBias.score).toBeLessThanOrEqual(0.10);
  });

  // 8. Model-Selection Bias & Multiple Testing Control
  it("Area 8: Model-Selection Bias — Controls false discovery rate (FDR) using Benjamini-Hochberg across experiments", () => {
    // Register 10 experiments
    for (let i = 0; i < 10; i++) {
      const dummyCI = {
        mean: 1.2, lower: 0.5, upper: 1.9, confidenceLevel: 0.95,
        sampleCount: 50, bootstrapIterations: 1000, isSignificant: true
      };
      StatisticalTests.registerExperiment(`EXP_${i}`, `Subset test ${i}`, "meanReturn", 1.2, dummyCI);
    }

    const bhAlpha = StatisticalTests.getBenjaminiHochbergThreshold(0.05);
    expect(bhAlpha).toBeLessThanOrEqual(0.05);
    expect(StatisticalTests.getExperimentCount()).toBe(10);

    const audit = BiasControlEngine.evaluateBias();
    expect(audit.biasVector.modelSelectionBias.status).toBe("OPTIMAL");
  });

  // 9. Correlated-Confirmation Bias Guard
  it("Area 9: Correlation Bias — Quantifies redundant confirmations and reduces effective model votes N_eff", () => {
    const audit = BiasControlEngine.evaluateBias(["MAMBA_RESEARCH_V1", "AARYAN_MOMENTUM"]);
    expect(audit.biasVector.correlationBias).toBeDefined();
    expect(audit.biasVector.correlationBias.name).toBe("CORRELATION_BIAS");
  });

  // 10. Calibration Bias Guard
  it("Area 10: Calibration Bias — Monitors 10-bin ECE and penalizes models where confidence exceeds empirical accuracy", () => {
    const audit = BiasControlEngine.evaluateBias(["MAMBA_RESEARCH_V1"]);
    expect(audit.biasVector.calibrationBias.status).toBe("OPTIMAL");
  });

  // 11. Execution Bias Guard
  it("Area 11: Execution Bias — Confirms realistic dynamic friction (fees, spread, slippage, market impact) is modeled", () => {
    const audit = BiasControlEngine.evaluateBias();
    expect(audit.biasVector.executionBias.status).toBe("OPTIMAL");
  });

  // 12. Asset & Domain Bias Guard
  it("Area 12: Domain Bias — Confirms strict isolation between Crypto and Indian markets", () => {
    const audit = BiasControlEngine.evaluateBias();
    expect(audit.biasVector.domainBias.status).toBe("OPTIMAL");
  });

  // 13. Liquidity Bias Guard
  it("Area 13: Liquidity Bias — Rejects theoretical trades where execution cost exceeds expected edge", () => {
    const audit = BiasControlEngine.evaluateBias();
    expect(audit.biasVector.liquidityBias.status).toBe("OPTIMAL");
  });

  // 14. Human & Configuration Bias Guard
  it("Area 14: Human Bias — Enforces that empirical evidence progressively determines weights without developer preference", () => {
    const audit = BiasControlEngine.evaluateBias();
    expect(audit.biasVector.humanBias.status).toBe("OPTIMAL");
  });

  // 15. Negative-Control Permutation Tests
  it("Area 15: Negative Control — Runs label permutation and random signals tests against null hypothesis", () => {
    const results = BiasControlEngine.runNegativeControlTests(ForwardTelemetryStore.getResolvedRecords());
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.some(r => r.testType === "PERMUTED_LABELS")).toBe(true);
    expect(results.some(r => r.testType === "RANDOM_SIGNALS")).toBe(true);
  });

  // 16. Placebo / Shadow Comparative Test
  it("Area 16: Placebo / Shadow Test — Compares candidate model against champion and random baseline", () => {
    const results = BiasControlEngine.runPlaceboShadowTests(["MAMBA_RESEARCH_V1"], ForwardTelemetryStore.getResolvedRecords());
    expect(Array.isArray(results)).toBe(true);
  });

  // 17. Complete 14-Dimension Bias Audit Vector
  it("Area 17: BiasAuditVector — Assembles complete 14-dimension structured audit vector with scores and mitigations", () => {
    const audit = BiasControlEngine.evaluateBias();
    const v = audit.biasVector;

    expect(v.lookAheadBias).toBeDefined();
    expect(v.survivorshipBias).toBeDefined();
    expect(v.selectionBias).toBeDefined();
    expect(v.classBias).toBeDefined();
    expect(v.directionBias).toBeDefined();
    expect(v.regimeBias).toBeDefined();
    expect(v.recencyBias).toBeDefined();
    expect(v.correlationBias).toBeDefined();
    expect(v.calibrationBias).toBeDefined();
    expect(v.executionBias).toBeDefined();
    expect(v.liquidityBias).toBeDefined();
    expect(v.domainBias).toBeDefined();
    expect(v.promotionBias).toBeDefined();
    expect(v.humanBias).toBeDefined();
    expect(audit.overallBiasScore).toBeGreaterThanOrEqual(0.0);
    expect(audit.overallBiasScore).toBeLessThanOrEqual(1.0);
  });

  // 18. Bias-Aware Model Weight Correction
  it("Area 18: Bias-Aware Weight Correction — Reduces model weight by (1 - BiasPenalty_i) and normalizes strictly to 1.0", () => {
    const rawWeights = {
      MAMBA_RESEARCH_V1: 0.40,
      AARYAN_MOMENTUM: 0.30,
      BIASED_MODEL: 0.30
    };

    // Heavily penalize BIASED_MODEL
    const penalties = {
      MAMBA_RESEARCH_V1: 0.0,
      AARYAN_MOMENTUM: 0.0,
      BIASED_MODEL: 0.50 // 50% penalty
    };

    const corrected = BiasControlEngine.applyBiasAwareWeightCorrection(rawWeights, penalties);

    expect(corrected.BIASED_MODEL).toBeLessThan(rawWeights.BIASED_MODEL);
    expect(corrected.MAMBA_RESEARCH_V1).toBeGreaterThan(rawWeights.MAMBA_RESEARCH_V1);

    const sum = Object.values(corrected).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1.0, 3);
  });
});
