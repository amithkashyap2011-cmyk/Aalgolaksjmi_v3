export interface EnsembleModelContribution {
  modelName: string;
  category: string;
  weight: number;
  longProbability: number;
  shortProbability: number;
  confidence: number;
  expectedReturn: number;
  expectedDrawdown: number;
  notes: string;
}

export interface EnsembleRiskSizing {
  recommendedPositionPct: number;
  kellyPct: number;
  volatilityAdjustedPct: number;
  maxDailyDrawdownPct: number;
  maxWeeklyDrawdownPct: number;
  maxMonthlyDrawdownPct: number;
  emergencyKillActive: boolean;
}

export interface EnsembleReport {
  symbol: string;
  interval: string;
  computedAt: string;
  regime: string;
  regimeScore: number;
  marketPulse: {
    vwap: number;
    fundingRate: number;
    openInterest: number;
    orderBookImbalance: number;
    volatilityScore: number;
    liquidityPulse: number;
  };
  models: EnsembleModelContribution[];
  longProbability: number;
  shortProbability: number;
  confidence: number;
  expectedReturn: number;
  expectedDrawdown: number;
  riskSizing: EnsembleRiskSizing;
  selfLearning?: {
    retrainWeekly: boolean;
    strategyDecayDetected: boolean;
    regimeChangeDetected: boolean;
    overfittingRisk: boolean;
    notes: string[];
  };
}
