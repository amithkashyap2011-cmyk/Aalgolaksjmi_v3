import { ResearchAlphaAttribution } from "../../../models/ResearchAlphaAttribution.js";

export interface AlphaAttribution {
  modelName: string;
  totalSignals: number;
  winningSignals: number;
  losingSignals: number;
  uniqueAlphaRate: number;
  profitFactorContribution: number;
  sharpeContribution: number;
  sortinoContribution: number;
  drawdownImpact: number;
  correlationToEnsemble: number;
  promotionEligible: boolean;
}

export class AlphaAttributionEngine {
  /**
   * Evaluates a model's unique alpha contribution and persists it.
   */
  public static async evaluate(model: string, predictions: any[], baselineOutcomes: any[]): Promise<AlphaAttribution> {
    const totalSignals = predictions.length;
    let winningSignals = 0;
    let losingSignals = 0;
    let correctNotCapturedByBaseline = 0;

    for (let i = 0; i < totalSignals; i++) {
      const pred = predictions[i];
      const baseline = baselineOutcomes[i];
      
      const isCorrect = pred.correct;
      if (isCorrect) winningSignals++;
      else losingSignals++;

      // Unique Alpha = CorrectPredictionsNotCapturedByBaseline / TotalPredictions
      if (isCorrect && (!baseline || !baseline.correct)) {
        correctNotCapturedByBaseline++;
      }
    }

    const uniqueAlphaRate = totalSignals > 0 ? correctNotCapturedByBaseline / totalSignals : 0;
    
    // In a real scenario, these would be computed from full equity curves
    const profitFactorContribution = uniqueAlphaRate * 0.5; // Stubbed logic
    const sharpeContribution = uniqueAlphaRate * 0.3; // Stubbed logic
    const sortinoContribution = uniqueAlphaRate * 0.25; // Stubbed logic
    const drawdownImpact = -uniqueAlphaRate * 0.1; // Stubbed logic
    const correlationToEnsemble = 0.5; // Stubbed logic

    const result: AlphaAttribution = {
      modelName: model,
      totalSignals,
      winningSignals,
      losingSignals,
      uniqueAlphaRate,
      profitFactorContribution,
      sharpeContribution,
      sortinoContribution,
      drawdownImpact,
      correlationToEnsemble,
      promotionEligible: uniqueAlphaRate >= 0.10 && profitFactorContribution >= 0.05
    };

    await ResearchAlphaAttribution.create(result);

    return result;
  }
}
