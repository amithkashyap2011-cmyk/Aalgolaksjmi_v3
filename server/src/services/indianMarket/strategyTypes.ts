/**
 * ═══════════════════════════════════════════════════════════════════
 *  Indian Derivatives & Strategy Engine — Core Type Definitions
 * ═══════════════════════════════════════════════════════════════════
 */

export type UnderlyingSymbol =
  | "NIFTY"
  | "BANKNIFTY"
  | "FINNIFTY"
  | "MIDCPNIFTY"
  | "SENSEX"
  | "BANKEX"
  | string;

export type Exchange = "NSE" | "NFO" | "BSE" | "BFO";

export type InstrumentType = "FUTURE" | "CE" | "PE" | "EQUITY";

export type TradeDirection = "LONG" | "SHORT";

export type OrderAction = "BUY" | "SELL";

export type EntryType =
  | "MARKET"
  | "LIMIT"
  | "STOP"
  | "STOP_LIMIT"
  | "ENTER_ABOVE_PRICE"
  | "ENTER_BELOW_PRICE"
  | "ENTER_ON_CANDLE_CLOSE"
  | "ENTER_ON_BREAKOUT_CONFIRMATION";

export type ExitType =
  | "TARGET"
  | "STOP_LOSS"
  | "TRAILING_STOP"
  | "SIGNAL_REVERSAL"
  | "TIME_EXIT"
  | "EOD_EXIT"
  | "MANUAL_EXIT"
  | "MAX_LOSS_EXIT"
  | "RISK_ENGINE_EXIT"
  | "STRATEGY_INVALIDATION";

export type TradeStatus =
  | "SIGNAL_GENERATED"
  | "VALIDATING"
  | "REJECTED"
  | "READY_TO_EXECUTE"
  | "ORDER_SUBMITTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "OPEN"
  | "EXIT_PENDING"
  | "CLOSED"
  | "CANCELLED"
  | "FAILED";

export type MarketRegime =
  | "TRENDING_BULL"
  | "TRENDING_BEAR"
  | "RANGING"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "BREAKOUT"
  | "UNCERTAIN";

export type StrategyCategory =
  | "DIRECTIONAL"
  | "BREAKOUT"
  | "TREND_FOLLOWING"
  | "MOMENTUM"
  | "MEAN_REVERSION"
  | "OPTIONS_SPREADS";

export type StrategyId =
  // Directional
  | "LONG_CALL"
  | "LONG_PUT"
  | "LONG_FUTURE"
  | "SHORT_FUTURE"
  // Breakout
  | "OPENING_RANGE_BREAKOUT"
  | "SUPPORT_RESISTANCE_BREAKOUT"
  | "HIGH_LOW_BREAKOUT"
  | "VOLUME_BREAKOUT"
  | "ATR_BREAKOUT"
  // Trend Following
  | "EMA_TREND"
  | "EMA_CROSSOVER"
  | "VWAP_TREND"
  | "SUPERTREND"
  | "MACD_TREND"
  | "ADX_TREND"
  // Momentum
  | "RSI_MOMENTUM"
  | "MACD_MOMENTUM"
  | "PRICE_MOMENTUM"
  | "VOLUME_MOMENTUM"
  | "BREAKOUT_MOMENTUM"
  // Mean Reversion
  | "RSI_REVERSAL"
  | "VWAP_REVERSION"
  | "BOLLINGER_REVERSION"
  | "SUPPORT_RESISTANCE_REVERSAL"
  // Options Spreads
  | "BULL_CALL_SPREAD"
  | "BEAR_PUT_SPREAD"
  | "BULL_PUT_SPREAD"
  | "BEAR_CALL_SPREAD"
  | "LONG_STRADDLE"
  | "SHORT_STRADDLE"
  | "LONG_STRANGLE"
  | "SHORT_STRANGLE"
  | "IRON_CONDOR"
  | "IRON_BUTTERFLY"
  | "CALL_RATIO_SPREAD"
  | "PUT_RATIO_SPREAD"
  | "BUTTERFLY"
  | "CALENDAR_SPREAD"
  | "DIAGONAL_SPREAD";

export type StrikeSelectionMethod =
  | "ATM_OFFSET"
  | "DELTA"
  | "PREMIUM"
  | "EXACT_STRIKE";

export interface StrikeSelectionConfig {
  method: StrikeSelectionMethod;
  offset?: number; // 0 = ATM, 1 = ATM+1, -1 = ATM-1
  targetDelta?: number; // e.g. 0.30 to 0.50
  targetPremium?: number; // e.g. 150
  exactStrike?: number;
}

export type ExpiryType =
  | "NEAREST_VALID_EXPIRY"
  | "NEXT_EXPIRY"
  | "MONTHLY"
  | "NEXT_MONTHLY"
  | "SPECIFIC_DATE";

export interface ExpirySelectionConfig {
  type: ExpiryType;
  specificDate?: string; // YYYY-MM-DD
}

export interface InstrumentMasterItem {
  token: string;
  tradingSymbol: string;
  underlying: UnderlyingSymbol;
  exchange: Exchange;
  instrumentType: InstrumentType;
  strike: number;
  expiry: string; // ISO date string (YYYY-MM-DD)
  expiryDate: Date;
  lotSize: number;
  tickSize: number;
  strikeStep: number;
}

export interface OptionGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho?: number;
  iv: number;
}

export interface OptionChainStrike {
  strike: number;
  isATM: boolean;
  distanceFromATM: number;
  call: {
    token: string;
    tradingSymbol: string;
    ltp: number;
    bid: number;
    ask: number;
    bidQty: number;
    askQty: number;
    volume: number;
    oi: number;
    prevOi: number;
    changeOi: number;
    greeks: OptionGreeks;
  };
  put: {
    token: string;
    tradingSymbol: string;
    ltp: number;
    bid: number;
    ask: number;
    bidQty: number;
    askQty: number;
    volume: number;
    oi: number;
    prevOi: number;
    changeOi: number;
    greeks: OptionGreeks;
  };
}

export interface OptionChainData {
  underlying: UnderlyingSymbol;
  spotPrice: number;
  futuresPrice: number;
  atmStrike: number;
  expiry: string;
  totalCallOI: number;
  totalPutOI: number;
  pcr: number;
  maxPainStrike: number;
  strikes: OptionChainStrike[];
  updatedAt: string;
}

export interface SignalModel {
  signalId: string;
  timestamp: string;
  underlying: UnderlyingSymbol;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number; // 0.0 to 1.0 (or 0-100)
  tradeScore: number; // 0 to 100
  strategy: StrategyId;
  timeframe: string;
  entryReason: string[];
  indicators: {
    rsi?: number;
    adx?: number;
    atr?: number;
    vwap?: number;
    supertrend?: string;
    emaTrend?: string;
    volumeRatio?: number;
    [key: string]: any;
  };
  regime: MarketRegime;
}

export interface StopLossConfig {
  type:
    | "FIXED_PERCENT"
    | "FIXED_POINTS"
    | "ATR_BASED"
    | "CANDLE_LOW_HIGH"
    | "STRUCTURE_BASED"
    | "PREMIUM_PERCENT"
    | "INDEX_BASED";
  value: number; // percentage (e.g. 15), points (e.g. 30), or ATR multiplier (e.g. 1.5)
}

export interface TargetConfig {
  type: "FIXED_PERCENT" | "FIXED_POINTS" | "RISK_REWARD" | "ATR" | "STRUCTURE";
  value: number; // RR multiplier (e.g. 2.0 = 1:2) or points / percent
}

export interface TrailingStopConfig {
  enabled: boolean;
  type: "PERCENT" | "POINTS" | "ATR" | "BREAK_EVEN_AT_1R" | "STEP";
  stepPoints?: number;
  profitLockAt?: number; // e.g. at 1.5R lock 0.5R
  trailDistance?: number;
}

export interface TradeLeg {
  legId: string;
  action: OrderAction; // BUY | SELL
  instrumentType: InstrumentType; // CE | PE | FUTURE
  strike: number;
  expiry: string;
  tradingSymbol: string;
  token: string;
  quantity: number;
  lotSize: number;
  entryPrice: number;
  exitPrice?: number;
  status: TradeStatus;
  pnl: number;
  brokerOrderId?: string;
  greeksAtEntry?: OptionGreeks;
}

export interface StructuredTrade {
  tradeId: string;
  strategyInstanceId: string;
  tradeGroupId?: string;
  userId: string;
  mode: "BACKTEST" | "PAPER" | "LIVE";
  exchange: Exchange;
  underlying: UnderlyingSymbol;
  instrument: InstrumentType;
  position: TradeDirection; // LONG | SHORT
  strategy: StrategyId;
  strike?: number;
  expiry?: string;
  quantity: number;
  lotSize: number;
  entryType: EntryType;
  entryPrice: number;
  averageEntryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  target: number;
  trailingStop: TrailingStopConfig;
  risk: {
    riskAmount: number;
    riskPercent: number;
    rewardRiskRatio: number;
  };
  tradeScore: number;
  status: TradeStatus;
  entryReason: string[];
  exitReason?: string;
  exitType?: ExitType;
  legs: TradeLeg[];
  brokerOrderIds: string[];
  clientOrderId: string;
  realizedPnl: number;
  unrealizedPnl: number;
  charges: {
    brokerage: number;
    stt: number;
    exchangeTxn: number;
    sebi: number;
    stampDuty: number;
    gst: number;
    total: number;
  };
  openedAt: Date;
  closedAt?: Date;
  updatedAt: Date;
}

export interface MarketEvaluationContext {
  underlying: UnderlyingSymbol;
  spotPrice: number;
  futuresPrice?: number;
  bars1m: any[];
  bars5m: any[];
  bars15m: any[];
  optionChain?: OptionChainData;
  regime: MarketRegime;
  timestamp: Date;
}

export interface RiskSettings {
  autoTrade: boolean;
  niftyAutoTrade: boolean;
  bankNiftyAutoTrade: boolean;
  optionsAutoTrade: boolean;
  futuresAutoTrade: boolean;
  maxRiskPerTradePercent: number; // e.g. 1.0%
  maxDailyLossPercent: number; // e.g. 3.0%
  maxDailyLossAmount: number; // e.g. ₹5,000
  maxTradesPerDay: number; // e.g. 10
  maxConcurrentTrades: number; // e.g. 3
  maxNiftyTrades: number; // e.g. 2
  maxBankNiftyTrades: number; // e.g. 2
  maxConsecutiveLosses: number; // e.g. 3
  strategyCooldownMinutes: number; // e.g. 15
  maxCapitalUtilizationPercent: number; // e.g. 50%
  panicStop: boolean;
  dailyRiskLock: boolean;
}
