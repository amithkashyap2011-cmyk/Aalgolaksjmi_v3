/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Indian Market Quantitative Trading Engine Types & Enums
 * ═══════════════════════════════════════════════════════════════════
 */

export type IndianUnderlying = 
  | "NIFTY" 
  | "BANKNIFTY" 
  | "FINNIFTY" 
  | "MIDCPNIFTY" 
  | "SENSEX" 
  | "BANKEX"
  | "RELIANCE"
  | "HDFCBANK"
  | "ICICIBANK"
  | "INFY"
  | "TCS"
  | "SBIN"
  | string;

export type IndianExchange = "NSE" | "BSE" | "NFO" | "BFO";

export type IndianInstrumentType = "FUTURE" | "CE" | "PE" | "EQUITY";

export type IndianPositionDirection = "LONG" | "SHORT";

export type IndianOrderAction = "BUY" | "SELL";

export type IndianTradeStatus = 
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

export type IndianStrategyType =
  // Directional Options
  | "LONG_CALL"
  | "LONG_PUT"
  | "SHORT_CALL"
  | "SHORT_PUT"
  // Directional Futures
  | "LONG_FUTURE"
  | "SHORT_FUTURE"
  // Vertical Spreads
  | "BULL_CALL_SPREAD"
  | "BEAR_PUT_SPREAD"
  | "BULL_PUT_SPREAD"
  | "BEAR_CALL_SPREAD"
  // Non-Directional / Volatility
  | "LONG_STRADDLE"
  | "SHORT_STRADDLE"
  | "LONG_STRANGLE"
  | "SHORT_STRANGLE"
  | "IRON_CONDOR"
  | "IRON_BUTTERFLY"
  // Technical / Algorithmic
  | "OPENING_RANGE_BREAKOUT"
  | "SUPPORT_RESISTANCE_BREAKOUT"
  | "EMA_TREND"
  | "VWAP_TREND"
  | "RSI_MOMENTUM"
  | "INDIAN_AI_AUTOTRADER";

export type StrikeSelectionMethod = 
  | "ATM" 
  | "ATM_OFFSET" 
  | "DELTA" 
  | "PREMIUM" 
  | "OTM" 
  | "ITM";

export type ExpirySelectionType = 
  | "NEAREST_VALID_EXPIRY" 
  | "NEXT_EXPIRY" 
  | "MONTHLY" 
  | "NEXT_MONTHLY";

export type IndianExitReason =
  | "TARGET"
  | "STOP_LOSS"
  | "TRAILING_STOP"
  | "SIGNAL_REVERSAL"
  | "TIME_EXIT"
  | "EOD_EXIT"
  | "MANUAL_EXIT"
  | "MAX_LOSS_EXIT"
  | "RISK_ENGINE_EXIT"
  | "PANIC_STOP"
  | "STRATEGY_INVALIDATION";

export interface IndianStrategyLeg {
  legId: string;
  action: IndianOrderAction;
  instrument: IndianInstrumentType;
  strike?: number;
  expiry?: string;
  quantity: number;
  lotSize: number;
  entryPrice?: number;
  exitPrice?: number;
  currentPrice?: number;
  status: "PENDING" | "FILLED" | "CLOSED" | "FAILED";
  pnl?: number;
  pnlPercent?: number;
  brokerOrderId?: string;
}

export interface IndianTradeSignal {
  signalId: string;
  timestamp: number;
  underlying: IndianUnderlying;
  direction: IndianPositionDirection;
  strategy: IndianStrategyType;
  confidence: number;
  tradeScore: number;
  entryReasons: string[];
  suggestedStrikeMethod?: StrikeSelectionMethod;
  strikeOffset?: number;
  expiryType?: ExpirySelectionType;
  indicators: {
    rsi?: number;
    adx?: number;
    vwap?: number;
    atr?: number;
    ema9?: number;
    ema21?: number;
    supertrend?: string;
    pcr?: number;
  };
}

export interface IndianTradeObject {
  tradeId: string;
  tradeGroupId?: string;
  userId: string;
  exchange: IndianExchange;
  underlying: IndianUnderlying;
  instrument: IndianInstrumentType;
  position: IndianPositionDirection;
  strategy: IndianStrategyType;
  strike?: number;
  expiry?: string;
  quantity: number;
  lotSize: number;
  entryType: "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";
  entryPrice: number;
  averageEntryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  target: number;
  trailingStop?: {
    enabled: boolean;
    type: "POINTS" | "PERCENT" | "ATR" | "BREAKEVEN_SHIFT";
    step: number;
    currentSL: number;
    highestPriceReached?: number;
    lowestPriceReached?: number;
  };
  risk: {
    riskAmountINR: number;
    riskPercent: number;
    maxLossPerLotINR: number;
  };
  legs?: IndianStrategyLeg[];
  status: IndianTradeStatus;
  entryReasons: string[];
  exitReason?: IndianExitReason;
  brokerOrderIds: string[];
  mode: "PAPER" | "LIVE" | "BACKTEST";
  accountType: "INDIAN_NSE" | "INDIAN_BSE" | "INDIAN_NIFTY50" | "INDIAN_FNO";
  productType: "MIS" | "CNC" | "NRML";
  pnl: number;
  pnlPercent: number;
  openedAt: Date;
  closedAt?: Date;
  greeksAtEntry?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
    iv?: number;
  };
}

export interface IndianRiskConfig {
  autoTradeEnabled: boolean;
  maxRiskPerTradePercent: number;
  maxDailyLossAmountINR: number;
  maxTradesPerDay: number;
  maxConcurrentTrades: number;
  maxNiftyTrades: number;
  maxBankNiftyTrades: number;
  strategyCooldownMinutes: number;
  panicStop: boolean;
  minTradeScore: number;
  minConfidence: number;
}
