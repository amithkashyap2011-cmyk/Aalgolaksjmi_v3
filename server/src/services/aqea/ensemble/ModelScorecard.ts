/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Model Scorecard & Attribution Architecture (Phase 4 & 5)
 * ═══════════════════════════════════════════════════════════════════
 * Provides distinct tracking and evaluation of:
 * 1. Predictive Performance (Classification, calibration, accuracy, Brier, ECE)
 * 2. Trading Performance (PnL, win rate, expectancy, profit factor, Sharpe, drawdowns, MFE/MAE)
 * 3. Regime-Specific Breakdown (8 market regimes)
 * 4. Leave-One-Out Incremental Ensemble Attribution
 */

export interface PredictiveMetrics {
  totalPredictions: number;
  actionablePredictions: number;
  buyPredictions: number;
  sellPredictions: number;
  holdPredictions: number;
  correctPredictions: number;
  accuracy: number;
  balancedAccuracy: number;       // Phase 22: Accounts for class imbalance
  precision: number;
  recall: number;
  f1Score: number;
  brierScore: number;
  brierReliability: number;       // Phase 22: Brier decomposition — reliability term
  brierResolution: number;        // Phase 22: Brier decomposition — resolution term
  expectedCalibrationError: number;
  calibrationSlope: number;       // Phase 22: Platt regression slope (ideal = 1.0)
  calibrationIntercept: number;   // Phase 22: Platt regression intercept (ideal = 0.0)
  logLoss: number;
  averageConfidence: number;
  confidenceWhenCorrect: number;
  confidenceWhenWrong: number;
}

export interface TradingMetrics {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  lossRate: number;
  grossProfit: number;
  grossLoss: number;
  averageWinPercent: number;
  averageLossPercent: number;
  expectancyPercent: number;
  profitFactor: number;
  rollingSharpe: number;
  rollingSortino: number;
  calmarRatio: number;               // Phase 22: AnnualizedReturn / MaxDrawdown
  maxDrawdownPercent: number;
  averageMFEPercent: number; // Max Favorable Excursion
  averageMAEPercent: number; // Max Adverse Excursion
  averageHoldingDurationMs: number;
}

export interface RegimeMetricRecord {
  regime: string;
  sampleCount: number;
  accuracy: number;
  brierScore: number;
  winRate: number;
  profitFactor: number;
  expectancyPercent: number;
  dynamicFitMultiplier: number;
}

export interface IncrementalContributionRecord {
  modelName: string;
  sampleCount: number;
  ensembleAccuracyWith: number;
  ensembleAccuracyWithout: number;
  deltaAccuracy: number;
  ensembleBrierWith: number;
  ensembleBrierWithout: number;
  deltaBrier: number;
  ensembleProfitFactorWith: number;
  ensembleProfitFactorWithout: number;
  deltaProfitFactor: number;
  ensembleEVWith: number;
  ensembleEVWithout: number;
  deltaEV: number;
  incrementalValueScore: number; // 0.50 to 1.50 multiplier
}

export interface CompleteModelScorecard {
  modelName: string;
  evidenceFamily: string;
  status: string;
  inferenceMode: string;
  currentLiveWeight: number;
  predictive: PredictiveMetrics;
  trading: TradingMetrics;
  regimes: Record<string, RegimeMetricRecord>;
  incremental: IncrementalContributionRecord;
  economicScore: number;
  lastUpdated: number;
}

export class ModelScorecardRegistry {
  private static scorecards: Map<string, CompleteModelScorecard> = new Map();

  /**
   * Initializes or gets a complete scorecard for a model.
   */
  public static getOrCreate(
    modelName: string,
    evidenceFamily: string = "PRICE_MOMENTUM",
    status: string = "PRODUCTION",
    inferenceMode: string = "REAL_MODEL"
  ): CompleteModelScorecard {
    if (!this.scorecards.has(modelName)) {
      this.scorecards.set(modelName, {
        modelName,
        evidenceFamily,
        status,
        inferenceMode,
        currentLiveWeight: 0,
        predictive: {
          totalPredictions: 0,
          actionablePredictions: 0,
          buyPredictions: 0,
          sellPredictions: 0,
          holdPredictions: 0,
          correctPredictions: 0,
          accuracy: 0.50,
          balancedAccuracy: 0.50,
          precision: 0.50,
          recall: 0.50,
          f1Score: 0.50,
          brierScore: 0.20,
          brierReliability: 0.0,
          brierResolution: 0.0,
          expectedCalibrationError: 0.05,
          calibrationSlope: 1.0,
          calibrationIntercept: 0.0,
          logLoss: 0.693,
          averageConfidence: 0.50,
          confidenceWhenCorrect: 0.50,
          confidenceWhenWrong: 0.50
        },
        trading: {
          totalTrades: 0,
          winCount: 0,
          lossCount: 0,
          winRate: 0.50,
          lossRate: 0.50,
          grossProfit: 0,
          grossLoss: 0,
          averageWinPercent: 0,
          averageLossPercent: 0,
          expectancyPercent: 0,
          profitFactor: 1.50,
          rollingSharpe: 1.20,
          rollingSortino: 1.50,
          calmarRatio: 0.0,
          maxDrawdownPercent: 0,
          averageMFEPercent: 1.50,
          averageMAEPercent: 0.80,
          averageHoldingDurationMs: 60000
        },
        regimes: {},
        incremental: {
          modelName,
          sampleCount: 0,
          ensembleAccuracyWith: 0.50,
          ensembleAccuracyWithout: 0.50,
          deltaAccuracy: 0,
          ensembleBrierWith: 0.20,
          ensembleBrierWithout: 0.20,
          deltaBrier: 0,
          ensembleProfitFactorWith: 1.50,
          ensembleProfitFactorWithout: 1.50,
          deltaProfitFactor: 0,
          ensembleEVWith: 1.0,
          ensembleEVWithout: 1.0,
          deltaEV: 0,
          incrementalValueScore: 1.0
        },
        economicScore: 1.0,
        lastUpdated: Date.now()
      });
    }
    return this.scorecards.get(modelName)!;
  }

  public static updateScorecard(modelName: string, update: Partial<CompleteModelScorecard>): void {
    const card = this.getOrCreate(modelName);
    Object.assign(card, update, { lastUpdated: Date.now() });
  }

  public static getAllScorecards(): CompleteModelScorecard[] {
    return Array.from(this.scorecards.values());
  }

  public static clearAll(): void {
    this.scorecards.clear();
  }
}
