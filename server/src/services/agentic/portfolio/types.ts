/**
 * ═══════════════════════════════════════════════════════════════════
 *  PHASE 11 — AUTONOMOUS PORTFOLIO INTELLIGENCE DOMAIN CONTRACTS
 * ═══════════════════════════════════════════════════════════════════
 *  Authoritative contracts for Capital, Exposure, Greeks, Risk Budgets,
 *  Sizing, Reserves, Stress Scenarios, and Agent Kernel Proposals.
 */

export type AssetClass = "EQUITY" | "FUTURES" | "OPTIONS" | "CASH";
export type TradeDirection = "BUY" | "SELL";
export type ExposureDirection = "LONG" | "SHORT" | "DELTA_NEUTRAL";

export type PortfolioDrawdownState =
  | "NORMAL"
  | "CAUTION"
  | "REDUCE_RISK"
  | "STOP_NEW_ENTRIES"
  | "EMERGENCY";

export type VolatilityRegime = "LOW" | "NORMAL" | "HIGH" | "EXTREME";

export type PortfolioActionType =
  | "ALLOCATE"
  | "DEALLOCATE"
  | "REDUCE_EXPOSURE"
  | "INCREASE_RESERVE"
  | "REBALANCE"
  | "HOLD"
  | "EMERGENCY_HALT";

export interface IAuthoritativeCapitalState {
  startingCapital: number;
  deposits: number;
  withdrawals: number;
  realizedPnl: number;
  unrealizedPnl: number;
  charges: number;
  availableCash: number;
  usedMargin: number;
  blockedMargin: number;
  freeMargin: number;
  collateral: number;
  netEquity: number;
  withdrawableAmount: number;
  marginUtilizationPct: number;
  timestamp: string;
}

export interface IPortfolioPositionItem {
  positionId: string;
  strategyId: string;
  strategyName: string;
  agentId?: string;
  symbol: string;
  underlying: string; // "NIFTY", "BANKNIFTY", "RELIANCE", etc.
  assetClass: AssetClass;
  instrumentType: "EQUITY" | "FUTURE" | "CE" | "PE";
  side: "BUY" | "SELL";
  quantity: number;
  lotSize: number;
  lots: number;
  entryPrice: number;
  currentLtp: number;
  strike?: number;
  expiry?: string;
  dte?: number; // Days to expiry
  iv?: number;
  notionalValue: number;
  marketValue: number;
  marginRequired: number;
  unrealizedPnl: number;
  realizedPnl: number;
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
  isOvernight?: boolean;
}

export interface IPortfolioGreeks {
  portfolioDelta: number; // Aggregate directional delta in INR / points
  portfolioGamma: number;
  portfolioTheta: number; // Rupee decay per calendar day
  portfolioVega: number;  // Rupee impact per 1% IV shift
  deltaByUnderlying: Record<string, number>;
  deltaByStrategy: Record<string, number>;
  thetaByUnderlying: Record<string, number>;
  vegaByUnderlying: Record<string, number>;
}

export interface IPortfolioExposure {
  grossExposure: number;
  netExposure: number;
  longExposure: number;
  shortExposure: number;
  exposureByAssetClass: Record<AssetClass, number>;
  exposureByUnderlying: Record<string, number>;
  exposureByDirection: Record<ExposureDirection, number>;
  exposureByStrategy: Record<string, number>;
  exposureByAgent: Record<string, number>;
  leverageRatio: number;
  greeks: IPortfolioGreeks;
  timestamp: string;
}

export interface IHiddenExposureCluster {
  underlying: string;
  totalEquivalentDelta: number;
  compositeInstruments: Array<{
    symbol: string;
    assetClass: AssetClass;
    direction: "BUY" | "SELL";
    quantity: number;
    deltaEquivalent: number;
  }>;
  correlationRiskLevel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
}

export interface IRiskBudget {
  portfolioDailyRiskInr: number;
  portfolioDailyRiskPct: number;
  strategyRiskInr: Record<string, number>;
  underlyingRiskInr: Record<string, number>;
  maxSinglePositionRiskPct: number;
  maxOptionsDeltaInr: number;
  maxOvernightExposurePct: number;
  remainingDailyRiskInr: number;
}

export interface IReserveCapital {
  totalEquity: number;
  activeAllocationInr: number;
  activeAllocationPct: number;
  marginReserveInr: number;
  marginReservePct: number;
  riskReserveInr: number;
  riskReservePct: number;
  emergencyReserveInr: number;
  emergencyReservePct: number;
  totalReserveInr: number;
  totalReservePct: number; // Must be >= 25% by governance rule
}

export interface IStrategyAllocation {
  strategyId: string;
  strategyName: string;
  targetWeightPct: number;
  actualWeightPct: number;
  allocatedCapitalInr: number;
  utilizedCapitalInr: number;
  availableCapitalInr: number;
  riskBudgetInr: number;
  currentExposureInr: number;
  realizedPnlInr: number;
  unrealizedPnlInr: number;
  drawdownPct: number;
  sharpeRatio: number;
  status: "ACTIVE" | "REDUCED" | "PAUSED" | "RETIRED";
  driftPct: number;
}

export type SizingModel =
  | "FIXED_QUANTITY"
  | "FIXED_CAPITAL"
  | "FIXED_RISK"
  | "VOLATILITY_ADJUSTED"
  | "HALF_KELLY"
  | "QUARTER_KELLY"
  | "PORTFOLIO_OPTIMIZED";

export interface IPositionSizingRequest {
  strategyId: string;
  symbol: string;
  underlying: string;
  entryPrice: number;
  stopLossPrice?: number;
  targetPrice?: number;
  lotSize: number;
  atr?: number;
  winRate?: number;
  payoffRatio?: number;
  model: SizingModel;
  maxTradeRiskPct?: number;
}

export interface IPositionSizingResult {
  suggestedQuantity: number;
  suggestedLots: number;
  capitalRequiredInr: number;
  riskAmountInr: number;
  sizingModelUsed: SizingModel;
  kellyFraction?: number;
  cappedBy: "NONE" | "MARGIN" | "LOT_SIZE" | "RISK_BUDGET" | "STRATEGY_CAP" | "MAX_SINGLE_TRADE";
  rationale: string;
}

export interface IPreTradeSimulationResult {
  allowed: boolean;
  rejectionReason?: string;
  warnings: string[];
  currentPortfolio: {
    netEquity: number;
    usedMargin: number;
    freeMargin: number;
    grossExposure: number;
    marginUtilizationPct: number;
    netDelta: number;
  };
  projectedPortfolio: {
    usedMargin: number;
    freeMargin: number;
    grossExposure: number;
    marginUtilizationPct: number;
    netDelta: number;
    projectedDrawdownRiskPct: number;
  };
  checks: {
    marginSufficient: boolean;
    reserveIntact: boolean;
    exposureLimitRespected: boolean;
    correlationLimitRespected: boolean;
    riskBudgetRespected: boolean;
    concentrationLimitRespected: boolean;
    drawdownPermitsNewTrades: boolean;
  };
}

export interface IStressScenarioResult {
  scenarioName: string;
  marketShockDescription: string;
  niftyShiftPct: number;
  bankNiftyShiftPct: number;
  ivShiftPoints: number;
  estimatedPnlImpactInr: number;
  estimatedPnlImpactPct: number;
  projectedUsedMargin: number;
  projectedMarginUtilizationPct: number;
  marginCallRisk: boolean;
  riskBreach: boolean;
}

export interface IVaRResult {
  confidenceLevel: 0.95 | 0.99;
  timeHorizonDays: number;
  historicalVaRInr: number;
  historicalVaRPct: number;
  parametricVaRInr: number;
  parametricVaRPct: number;
  monteCarloVaRInr: number;
  monteCarloVaRPct: number;
  cVaRExpectedShortfallInr: number;
  cVaRExpectedShortfallPct: number;
  calculationDate: string;
}

export interface IPortfolioProposal {
  proposalId: string;
  action: PortfolioActionType;
  strategyId?: string;
  targetWeightPct?: number;
  capitalDeltaInr?: number;
  reason: string;
  urgency: "LOW" | "NORMAL" | "HIGH" | "EMERGENCY";
  confidence: number;
  agentId: string;
  timestamp: string;
}

export interface IPortfolioDecisionAudit {
  auditId: string;
  timestamp: string;
  event: string;
  portfolioStateSnapshot: Partial<IAuthoritativeCapitalState>;
  marketRegime: VolatilityRegime;
  drawdownState: PortfolioDrawdownState;
  allocationsBefore: Record<string, number>;
  allocationsAfter: Record<string, number>;
  proposal?: IPortfolioProposal;
  decidingAgent: string;
  policyVersion: string;
  approved: boolean;
  rationale: string;
}
