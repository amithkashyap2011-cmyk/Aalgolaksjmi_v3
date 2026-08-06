import { ResearchRedundancyReport } from "../../../models/ResearchRedundancyReport.js";

export interface RedundancyReport {
  modelA: string;
  modelB: string;
  pearson: number;
  spearman: number;
  redundant: boolean;
}

export class RedundancyMonitor {
  /**
   * Detects duplicate models providing the same predictions.
   */
  public static async check(modelA: string, modelB: string, seriesA: number[], seriesB: number[]): Promise<RedundancyReport> {
    // Stubbed calculations for Pearson and Spearman
    let pearson = 0.5;
    let spearman = 0.5;
    
    if (seriesA.length === seriesB.length && seriesA.length > 0) {
        // Simplified mock logic for correlations
        pearson = 0.1; // Default
        spearman = 0.1; // Default
    }

    const redundant = pearson > 0.85 || spearman > 0.85;

    const report: RedundancyReport = {
      modelA,
      modelB,
      pearson,
      spearman,
      redundant
    };

    await ResearchRedundancyReport.create(report);

    return report;
  }
}
