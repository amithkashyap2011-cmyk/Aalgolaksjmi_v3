/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Model Drift & Governance Framework (Phase 7)
 * ═══════════════════════════════════════════════════════════════════
 * Continuous out-of-sample evaluation, empirical Brier tracking,
 * Sharpe/Sortino computation, and multi-metric promotion evaluation.
 */

export interface ModelTelemetryRecord {
  modelName: string;
  timestamp: number;
  predictedDirection: "LONG" | "SHORT" | "HOLD";
  predictedProbability: number;
  realizedOutcome: "WIN" | "LOSS" | "SCRATCH";
  realizedPnLPercent: number;
  regime: string;
}

export interface ModelMetricsReport {
  modelName: string;
  totalEvaluated: number;
  winCount: number;
  lossCount: number;
  accuracy: number;        // 0.0 to 1.0
  precision: number;       // 0.0 to 1.0
  recall: number;          // 0.0 to 1.0
  f1Score: number;         // 0.0 to 1.0
  brierScore: number;      // 0.0 to 1.0 (Lower is better)
  calibrationError: number;// ECE approximation
  profitFactor: number;
  expectancyPercent: number;
  rollingSharpe: number;
  rollingSortino: number;
  maxDrawdownPercent: number;
  driftStatus: "STABLE" | "WARNING_DEGRADED" | "CRITICAL_DRIFT";
  weightPenalty: number;   // 1.0 = no penalty, 0.5 = 50% cut, 0.0 = disabled
  lastEvaluatedTime: number;
}

export class ModelDriftMonitor {
  private static records: ModelTelemetryRecord[] = [];
  private static previousModelVersions: Map<string, string> = new Map();

  public static recordPrediction(record: ModelTelemetryRecord): void {
    this.records.push(record);
    if (this.records.length > 5000) {
      this.records.shift(); // Keep rolling 5,000 observations
    }
  }

  public static getReport(modelName: string): ModelMetricsReport {
    const subset = this.records.filter(r => r.modelName === modelName);
    if (subset.length === 0) {
      return {
        modelName,
        totalEvaluated: 0,
        winCount: 0,
        lossCount: 0,
        accuracy: 0.50,
        precision: 0.50,
        recall: 0.50,
        f1Score: 0.50,
        brierScore: 0.20,
        calibrationError: 0.05,
        profitFactor: 1.50,
        expectancyPercent: 0.5,
        rollingSharpe: 1.20,
        rollingSortino: 1.50,
        maxDrawdownPercent: 0.0,
        driftStatus: "STABLE",
        weightPenalty: 1.0,
        lastEvaluatedTime: Date.now()
      };
    }

    let wins = 0;
    let losses = 0;
    let brierSum = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let totalPnL = 0;
    const returns: number[] = [];

    subset.forEach(r => {
      const actualBinary = r.realizedOutcome === "WIN" ? 1 : 0;
      brierSum += Math.pow(r.predictedProbability - actualBinary, 2);
      returns.push(r.realizedPnLPercent);
      totalPnL += r.realizedPnLPercent;

      if (r.realizedOutcome === "WIN") {
        wins++;
        grossProfit += Math.max(0, r.realizedPnLPercent);
      } else if (r.realizedOutcome === "LOSS") {
        losses++;
        grossLoss += Math.abs(r.realizedPnLPercent);
      }
    });

    const total = subset.length;
    const accuracy = wins / total;
    const precision = wins / Math.max(1, wins + losses);
    const recall = accuracy;
    const f1Score = (2 * precision * recall) / Math.max(0.001, precision + recall);
    const brierScore = brierSum / total;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 5.0 : 1.0);
    const expectancy = totalPnL / total;

    // Rolling Sharpe & Sortino calculation
    const meanReturn = totalPnL / total;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / Math.max(1, total - 1);
    const stdDev = Math.sqrt(variance);
    const rollingSharpe = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(252) : 1.20;

    const downsideReturns = returns.filter(r => r < 0);
    const downsideVariance = downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / Math.max(1, downsideReturns.length);
    const downsideStdDev = Math.sqrt(downsideVariance);
    const rollingSortino = downsideStdDev > 0 ? (meanReturn / downsideStdDev) * Math.sqrt(252) : rollingSharpe;

    // Max Drawdown calculation
    let peak = 0;
    let runningPnL = 0;
    let maxDD = 0;
    returns.forEach(r => {
      runningPnL += r;
      if (runningPnL > peak) peak = runningPnL;
      const dd = peak - runningPnL;
      if (dd > maxDD) maxDD = dd;
    });

    let driftStatus: "STABLE" | "WARNING_DEGRADED" | "CRITICAL_DRIFT" = "STABLE";
    let weightPenalty = 1.0;

    if (brierScore > 0.32 || accuracy < 0.40 || maxDD > 20.0) {
      driftStatus = "CRITICAL_DRIFT";
      weightPenalty = 0.0; // Disabled / Quarantined
    } else if (brierScore > 0.25 || accuracy < 0.48 || maxDD > 12.0) {
      driftStatus = "WARNING_DEGRADED";
      weightPenalty = 0.5; // 50% cut
    }

    return {
      modelName,
      totalEvaluated: total,
      winCount: wins,
      lossCount: losses,
      accuracy: Number(accuracy.toFixed(4)),
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      f1Score: Number(f1Score.toFixed(4)),
      brierScore: Number(brierScore.toFixed(4)),
      calibrationError: Number(Math.abs(accuracy - meanReturn).toFixed(4)),
      profitFactor: Number(profitFactor.toFixed(2)),
      expectancyPercent: Number(expectancy.toFixed(2)),
      rollingSharpe: Number(Math.min(5.0, Math.max(-2.0, rollingSharpe)).toFixed(2)),
      rollingSortino: Number(Math.min(6.0, Math.max(-2.0, rollingSortino)).toFixed(2)),
      maxDrawdownPercent: Number(maxDD.toFixed(2)),
      driftStatus,
      weightPenalty,
      lastEvaluatedTime: Date.now()
    };
  }

  /**
   * Evaluates if a candidate model qualifies for PRODUCTION promotion.
   */
  public static evaluatePromotionEligibility(modelName: string): { eligible: boolean; reasons: string[] } {
    const report = this.getReport(modelName);
    const reasons: string[] = [];
    let eligible = true;

    if (report.totalEvaluated < 100) {
      eligible = false;
      reasons.push(`INSUFFICIENT_SAMPLE_SIZE: ${report.totalEvaluated}/100 minimum required trades`);
    }
    if (report.profitFactor < 1.30) {
      eligible = false;
      reasons.push(`PROFIT_FACTOR_LOW: ${report.profitFactor} < 1.30 minimum`);
    }
    if (report.expectancyPercent <= 0) {
      eligible = false;
      reasons.push(`EXPECTANCY_NON_POSITIVE: ${report.expectancyPercent}% <= 0`);
    }
    if (report.brierScore > 0.24) {
      eligible = false;
      reasons.push(`CALIBRATION_POOR: Brier Score ${report.brierScore} > 0.24 maximum`);
    }
    if (report.maxDrawdownPercent > 15.0) {
      eligible = false;
      reasons.push(`DRAWDOWN_EXCESSIVE: Max DD ${report.maxDrawdownPercent}% > 15% maximum`);
    }

    return { eligible, reasons };
  }

  public static getMetrics(modelName: string): { status: "STABLE" | "WARNING_DEGRADED" | "CRITICAL_DRIFT"; accuracy: number; brierScore: number } {
    const report = this.getReport(modelName);
    return {
      status: report.driftStatus,
      accuracy: report.accuracy,
      brierScore: report.brierScore
    };
  }

  public static recordRollbackVersion(modelName: string, previousVersion: string): void {
    this.previousModelVersions.set(modelName, previousVersion);
  }

  public static getRollbackVersion(modelName: string): string | undefined {
    return this.previousModelVersions.get(modelName);
  }
}
