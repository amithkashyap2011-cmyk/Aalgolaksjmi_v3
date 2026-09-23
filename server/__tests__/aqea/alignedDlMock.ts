/**
 * Mock for ModernModelRegistry in "all layers align" engine tests.
 *
 * These suites mocked the legacy PredictorRegistry, but the ensemble now reads
 * DL votes from ModernModelRegistry, whose production CNN calls the quant
 * engine over HTTP — unavailable in tests, so it returned HOLD and every
 * "aligned LONG" fixture decided HOLD. This supplies the aligned CNN vote the
 * fixtures describe.
 */
export const alignedDlMockFactory = () => ({
  ModernModelRegistry: {
    initialize: () => {},
    getExpert: () => undefined,
    evaluateAll: async () => [{
      modelName: "CNN_1D_V1_BENCHMARK",
      modelVersion: "test",
      architecture: "1D_TEMPORAL_CNN",
      inferenceMode: "REAL_MODEL",
      direction: "LONG",
      probabilities: { LONG: 0.86, SHORT: 0.04, HOLD: 0.10 },
      confidence: 0.86,
      probability: 0.86,
      uncertainty: 0.1,
      predictionInterval: [0.5, 2.0],
      expectedMovePercent: 1.5,
      latencyMs: 5,
      status: "PRODUCTION",
      regimeCompatibility: 0.9,
      featureVersion: 2,
    }],
  },
});

/**
 * The AdaptiveBayesianGate starts uncalibrated in a test process and falls
 * back to its strict analytical prior (0.78 required), vetoing every aligned
 * fixture. The gate has its own suites; engine-plumbing tests stub it to pass.
 */
export async function approveBayesianGate(jestObj: any): Promise<void> {
  const { AdaptiveBayesianGate } = await import("../../src/services/aqea/bayesian/AdaptiveBayesianGate.js");
  jestObj.spyOn(AdaptiveBayesianGate, "evaluate").mockImplementation((...args: any[]) => ({
    passesGate: true, posteriorProbability: 0.9, calibratedProbability: 0.9, requiredThreshold: 0.78,
    priorOdds: 1, likelihoodRatio: 9, calibrationMethod: "EMPIRICAL_BASE_RATE", sampleCount: 100,
    calibrationConfidence: 1, rejectionReason: null, regime: args[1] ?? "TRENDING_BULL", meta: {},
  }));
}
