/*
 * ─── Phase 25: Self Learning AI & Model Retraining Loop ───────
 *
 * Outcome-driven retrain evaluator and statistics updater.
 */

export class SelfLearningEngine {
  public static evaluateRetrainNeed(accuracyHistory: number[]): { shouldRetrain: boolean; reason: string } {
    const recentAvg = accuracyHistory.length > 0
      ? accuracyHistory.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, accuracyHistory.length)
      : 60.0;

    if (recentAvg < 50.0) {
      return { shouldRetrain: true, reason: "ACCURACY_DEGRADE_BELOW_50" };
    }
    return { shouldRetrain: false, reason: "MODEL_STABLE" };
  }
}
