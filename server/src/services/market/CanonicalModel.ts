/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — CANONICAL MARKET MODEL
 * ═══════════════════════════════════════════════════════════════════
 *  Normalizes market, exchange, and instrument data structures across
 *  both INDIAN (NSE/BSE/NFO) and CRYPTO (Binance Spot & USD-M Futures)
 *  markets into a single unified schema without losing market-specific
 *  fidelity.
 */

export type MarketDomain = "INDIA" | "CRYPTO";

export type ExchangeName = "NSE" | "BSE" | "NFO" | "BINANCE_SPOT" | "BINANCE_FUTURES";

export type AssetClass = "EQUITY" | "FUTURES" | "OPTIONS" | "CRYPTO_SPOT" | "CRYPTO_PERP";

export type OrderSide = "BUY" | "SELL";

export type OrderType = "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT" | "TRAILING_STOP";

export type ProductType = "CNC" | "MIS" | "NRML" | "SPOT" | "CROSS" | "ISOLATED";

export interface CanonicalQuote {
  symbol: string;
  market: MarketDomain;
  exchange: ExchangeName;
  ltp: number;
  bid: number;
  ask: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change24h?: number;
  changePct24h?: number;
  timestamp: string;
  // Market-specific extensions
  indian?: {
    instrumentToken?: number;
    lotSize?: number;
    strike?: number;
    optionType?: "CE" | "PE";
    expiry?: string;
    oi?: number;
    pcr?: number;
    iv?: number;
  };
  crypto?: {
    markPrice?: number;
    indexPrice?: number;
    fundingRate?: number;
    nextFundingTime?: number;
    openInterest?: number;
  };
}

export interface CanonicalOrderBook {
  symbol: string;
  market: MarketDomain;
  exchange: ExchangeName;
  bids: Array<[price: number, quantity: number]>;
  asks: Array<[price: number, quantity: number]>;
  timestamp: string;
}

export interface CanonicalPosition {
  id: string;
  userId: string;
  symbol: string;
  market: MarketDomain;
  exchange: ExchangeName;
  assetClass: AssetClass;
  side: "LONG" | "SHORT";
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  realizedPnl: number;
  margin: number;
  productType: ProductType;
  leverage?: number;
  liquidationPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  strategyId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CanonicalOrderRequest {
  clientOrderId: string;
  userId: string;
  symbol: string;
  market: MarketDomain;
  exchange: ExchangeName;
  side: OrderSide;
  orderType: OrderType;
  productType: ProductType;
  quantity: number;
  price?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  leverage?: number;
  tag?: string;
  strategyId?: string;
}

export interface CanonicalOrderResult {
  ok: boolean;
  orderId: string;
  clientOrderId: string;
  symbol: string;
  market: MarketDomain;
  exchange: ExchangeName;
  side: OrderSide;
  status: "OPEN" | "FILLED" | "CANCELLED" | "REJECTED";
  filledQuantity: number;
  averagePrice: number;
  fee: number;
  feeCurrency: string;
  rejectionReason?: string;
  executionTimestamp: string;
}

export interface CanonicalOrder {
  orderId: string;
  clientOrderId: string;
  userId: string;
  symbol: string;
  market: MarketDomain;
  exchange: ExchangeName;
  side: OrderSide;
  orderType: OrderType;
  productType: ProductType;
  quantity: number;
  price?: number;
  averagePrice?: number;
  filledQuantity: number;
  status: "OPEN" | "FILLED" | "CANCELLED" | "REJECTED";
  createdAt: string;
}

export interface CanonicalOrderUpdates {
  price?: number;
  quantity?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
}

export interface CanonicalAccount {
  userId: string;
  market: MarketDomain;
  currency: string; // "INR" or "USDT"
  totalEquity: number;
  availableCash: number;
  usedMargin: number;
  availableMargin: number;
  unrealizedPnl: number;
  realizedPnl: number;
  timestamp: string;
}

export interface ReconciliationResult {
  market: MarketDomain;
  isSynchronized: boolean;
  localPositionsCount: number;
  brokerPositionsCount: number;
  discrepancies: Array<{
    symbol: string;
    field: string;
    localValue: any;
    brokerValue: any;
  }>;
  timestamp: string;
}
