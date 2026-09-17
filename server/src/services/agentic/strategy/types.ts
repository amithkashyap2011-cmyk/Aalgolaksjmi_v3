/**
 * ═══════════════════════════════════════════════════════════════════
 *  PHASE 10 — AUTONOMOUS AI STRATEGY RESEARCH, BACKTESTING &
 *             SHADOW-TO-LIVE PIPELINE TYPE DEFINITIONS
 * ═══════════════════════════════════════════════════════════════════
 */

import { OHLC } from "../../indicatorService.js";
import { UnderlyingSymbol, MarketRegime } from "../../indianMarket/strategyTypes.js";

export type StrategyLifecycleStatus =
  | "DRAFT"
  | "RESEARCH"
  | "VALIDATING"
  | "BACKTESTING"
  | "PAPER"
  | "SHADOW"
  | "APPROVED"
  | "LIVE_STAGE_1"
  | "LIVE_STAGE_2"
  | "LIVE"
  | "PAUSED"
  | "DEGRADED"
  | "RETIRED"
  | "REJECTED";

export type StrategyType =
  | "MOMENTUM"
  | "TREND_FOLLOWING"
  | "MEAN_REVERSION"
  | "BREAKOUT"
  | "OPTIONS_SPREAD"
  | "VOLATILITY"
  | "REGIME_ADAPTIVE";

export type MarketSegment = "EQUITY" | "FUTURES" | "OPTIONS";

export type DSLOperator =
  | "ABOVE"
  | "BELOW"
  | "CROSS_ABOVE"
  | "CROSS_BELOW"
  | "BETWEEN"
  | "EQUALS"
  | "GREATER_THAN_OR_EQUAL"
  | "LESS_THAN_OR_EQUAL";

export type DSLIndicatorName =
  | "EMA"
  | "SMA"
  | "RSI"
  | "MACD"
  | "ATR"
  | "BOLLINGER"
  | "VWAP"
  | "ADX"
  | "SUPERTREND"
  | "STOCHASTIC"
  | "IV"
  | "PCR"
  | "MAX_PAIN"
  | "CLOSE"
  | "OPEN"
  | "HIGH"
  | "LOW"
  | "VOLUME";

export interface IDSLCondition {
  indicator: DSLIndicatorName;
  period?: number;
  period2?: number; // e.g., for MACD slow period
  signalPeriod?: number; // e.g., for MACD signal
  field?: "value" | "histogram" | "signal" | "upper" | "lower" | "middle";
  operator: DSLOperator;
  value: number | string; // numeric literal or another indicator reference like "EMA(50)"
  tolerance?: number;
}

export interface IDSLEntryRules {
  direction: "BUY" | "SELL";
  instrumentType: "EQUITY" | "FUTURE" | "CE" | "PE";
  strikeSelection?: "ATM" | "ITM1" | "ITM2" | "OTM1" | "OTM2";
  expiryType?: "WEEKLY" | "MONTHLY";
  conditions: IDSLCondition[];
  timeframe: string; // e.g. "5m", "15m"
  tradingHours?: {
    startTime: string; // "09:20"
    endTime: string;   // "15:15"
  };
}

export interface IDSLLegExitRule {
  type: "STOP_LOSS" | "TARGET" | "TRAILING_STOP" | "TIME_EXIT" | "EXPIRY_EXIT" | "CONDITION";
  value: number; // percentage (e.g. 1.5 for 1.5%) or absolute points
  unit: "PERCENT" | "POINTS" | "ATR_MULTIPLE" | "MINUTES";
  condition?: IDSLCondition;
}

export interface IDSLLegRiskRules {
  positionSizingType: "FIXED_LOT" | "PERCENT_EQUITY" | "KELLY_FRACTION";
  sizingValue: number; // e.g. 1 lot, or 2% of capital
  maxDailyTrades: number;
  maxDailyLoss: number;
  maxDrawdownPct: number;
  stopLossPct: number;
  targetPct: number;
  trailingStopPct?: number;
}

export interface IStrategyDSL {
  dslVersion: string;
  name: string;
  description: string;
  underlying: UnderlyingSymbol;
  marketSegment: MarketSegment;
  entry: IDSLEntryRules;
  exit: {
    rules: IDSLLegExitRule[];
    maxHoldingMinutes?: number;
    eodSquareOffTime?: string; // e.g. "15:15"
  };
  risk: IDSLLegRiskRules;
  targetRegimes: MarketRegime[];
}

export interface IStrategyAuditTrace {
  strategyId: string;
  version: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  parentStrategyId?: string;
  modelVersion: string;
  promptVersion: string;
  codeVersion: string;
  riskConfigHash: string;
  applicationVersion: string;
}

export interface IBacktestTradeRecord {
  tradeId: string;
  entryTimestamp: number;
  exitTimestamp: number;
  symbol: string;
  direction: "BUY" | "SELL";
  instrumentType: "EQUITY" | "FUTURE" | "CE" | "PE";
  strike?: number;
  expiry?: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  grossPnl: number;
  brokerage: number;
  stt: number;
  exchangeFee: number;
  sebiFee: number;
  stampDuty: number;
  gst: number;
  totalCharges: number;
  netPnl: number;
  exitReason: string;
  slippageIncurred: number;
  holdingDurationMinutes: number;
  regime: MarketRegime;
}

export interface IBacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  totalCharges: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  cagr: number;
  calmarRatio: number;
  averageTradePnl: number;
  averageHoldingPeriodMinutes: number;
  largestWin: number;
  largestLoss: number;
}

export interface IWalkForwardFold {
  foldIndex: number;
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  inSampleSharpe: number;
  outOfSampleSharpe: number;
  walkForwardEfficiency: number; // OOS Sharpe / IS Sharpe
  inSamplePnl: number;
  outOfSamplePnl: number;
}

export interface IMonteCarloResults {
  iterations: number;
  p5NetPnl: number;
  p50NetPnl: number;
  p95NetPnl: number;
  maxDrawdownP95: number;
  riskOfRuinPct: number; // probability of losing > 20%
  winRateP5: number;
  winRateP95: number;
}

export interface IDataQualityReport {
  symbol: string;
  totalCandles: number;
  missingCandlesCount: number;
  duplicateCandlesCount: number;
  outOfOrderCount: number;
  invalidOhlcCount: number;
  zeroPriceCount: number;
  sessionGapCount: number;
  qualityScore: number; // 0 - 100
  passed: boolean;
  issues: string[];
}

export interface IStrategyDriftMetrics {
  strategyId: string;
  version: string;
  status: "NORMAL" | "WARNING" | "DEGRADED" | "CRITICAL";
  expectedWinRate: number;
  actualWinRate: number;
  expectedDrawdownPct: number;
  actualDrawdownPct: number;
  slippageDriftBps: number;
  winRateZScore: number;
  latencyDriftMs: number;
  recommendation: "CONTINUE" | "ALERT" | "PAUSE_NEW_ENTRIES" | "RETIRE";
  reasons: string[];
}

export interface IChampionChallengerDuel {
  strategyName: string;
  championId: string;
  championVersion: string;
  challengerId: string;
  challengerVersion: string;
  championSharpe: number;
  challengerSharpe: number;
  championDrawdownPct: number;
  challengerDrawdownPct: number;
  deltaSharpe: number;
  deltaDrawdown: number;
  evaluatedTrades: number;
  isEligibleForPromotion: boolean;
  rejectionReasons: string[];
}

export interface IAIStrategyExplanation {
  thesis: string;
  marketBehaviorExploited: string;
  underlyingAssumptions: string[];
  expectedFailureConditions: string[];
  vulnerabilities: string[];
  trainingDatasetsUsed: string[];
  validationCompleted: string[];
  promotionRationale?: string;
  rejectionRationale?: string;
}
