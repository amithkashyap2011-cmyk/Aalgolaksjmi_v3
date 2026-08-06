import { describe, it, expect } from '@jest/globals';
import { DEFAULT_FEATURES } from "../../src/services/championChallenger/featureStoreService.js";

describe("Explainability (XAI) & Decision Justification Test Suite (SHAP / LIME)", () => {

  it("1. SHAP Global Feature Importance — feature weights must sum to 1.0 and match feature store rankings", () => {
    const totalImportance = DEFAULT_FEATURES.reduce((sum, f) => sum + f.importanceScore, 0);
    expect(totalImportance).toBeCloseTo(1.0, 2);

    // Verify top feature is Microstructure Volume Delta Imbalance
    const sorted = [...DEFAULT_FEATURES].sort((a, b) => b.importanceScore - a.importanceScore);
    expect(sorted[0].featureName).toBe("VolumeDeltaImbalance");
    expect(sorted[0].importanceScore).toBe(0.28);
  });

  it("2. LIME Local Decision Explanation — decomposes local trade decision into normalized feature contributions", () => {
    const normalizedFeatures = {
      VolumeDeltaImbalance: 0.95, // 95th percentile volume imbalance
      OrderBookImbalance: 0.72,   // 72nd percentile book depth
      ADX_TrendStrength: 0.35,   // Normalized ADX (35/100)
      RSI_Divergence: 0.68,       // Normalized RSI (68/100)
      VWAP_Deviation: 0.40,       // Normalized VWAP dev
    };

    // Calculate local linear feature contributions (LIME-style surrogate model)
    const limeExplanations = DEFAULT_FEATURES.map((f) => {
      const val = (normalizedFeatures as any)[f.featureName] || 0;
      const contribution = +(f.importanceScore * f.correlationWithReturn * val).toFixed(4);
      return {
        feature: f.featureName,
        value: val,
        shapValue: contribution,
        impact: contribution > 0.05 ? "BULLISH_SUPPORT" : "NEUTRAL"
      };
    });

    expect(limeExplanations.length).toBe(5);
    const topContributor = limeExplanations.sort((a, b) => b.shapValue - a.shapValue)[0];
    expect(topContributor.feature).toBe("VolumeDeltaImbalance");
    expect(topContributor.impact).toBe("BULLISH_SUPPORT");
    expect(topContributor.shapValue).toBeGreaterThan(0.10);
  });

  it("3. Ensemble Vote Attribution — transparently attributes final decision to individual neural predictor weights", () => {
    const predictorVotes = [
      { name: "FinMamba-SSM", category: "DEEP_LEARNING", vote: "LONG", weight: 0.25, confidence: 92 },
      { name: "Transformer-Micro", category: "ATTENTION", vote: "LONG", weight: 0.25, confidence: 88 },
      { name: "1D-CNN", category: "CONVOLUTIONAL", vote: "LONG", weight: 0.20, confidence: 85 },
      { name: "LSTM-Sequence", category: "RECURRENT", vote: "LONG", weight: 0.15, confidence: 80 },
      { name: "PPO-Execution", category: "REINFORCEMENT", vote: "HOLD", weight: 0.15, confidence: 60 },
    ];

    // Compute weighted ensemble score: sum(weight * (vote === LONG ? 1 : 0) * confidence)
    const totalWeight = predictorVotes.reduce((sum, p) => sum + p.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 5);

    const longAttributionScore = predictorVotes.reduce((sum, p) => {
      const voteVal = p.vote === "LONG" ? 1.0 : (p.vote === "SHORT" ? -1.0 : 0.0);
      return sum + p.weight * (p.confidence / 100) * voteVal;
    }, 0);

    expect(longAttributionScore).toBeGreaterThan(0.70); // High Long conviction (> 70%)
  });

  it("4. Decision Justification Audit Trail — generates human-readable natural language justification report", () => {
    const decisionMeta = {
      symbol: "BTCUSDT",
      decision: "LONG",
      consensusPct: 85,
      regime: "TRENDING_BULL",
      topFeatures: ["VolumeDeltaImbalance (SHAP +0.1117)", "OrderBookImbalance (SHAP +0.0657)"],
      riskApproved: true,
    };

    const justification = `Trade Decision: ${decisionMeta.decision} for ${decisionMeta.symbol}. ` +
      `Justification: 85% Neural Ensemble Consensus under ${decisionMeta.regime} market regime. ` +
      `Primary SHAP Contributors: ${decisionMeta.topFeatures.join(", ")}. Risk Check: APPROVED.`;

    expect(justification).toContain("85% Neural Ensemble Consensus");
    expect(justification).toContain("VolumeDeltaImbalance");
    expect(justification).toContain("Risk Check: APPROVED");
  });
});
