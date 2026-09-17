/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Indian Stock Market (NSE / BSE / NIFTY 50) Symbols & Lots
 * ═══════════════════════════════════════════════════════════════════
 */

export interface IndianSymbolConfig {
  symbol: string;
  exchange: "NSE" | "BSE";
  name: string;
  assetClass: "INDEX" | "EQUITY" | "FUTURES" | "OPTIONS";
  lotSize: number;
  tickSize: number;
  category: "NIFTY50" | "BANKNIFTY" | "LARGE_CAP" | "MID_CAP";
}

export const INDIAN_SYMBOLS: Record<string, IndianSymbolConfig> = {
  // Indices
  "NIFTY50": {
    symbol: "NIFTY50",
    exchange: "NSE",
    name: "NIFTY 50 INDEX",
    assetClass: "INDEX",
    lotSize: 75,
    tickSize: 0.05,
    category: "NIFTY50",
  },
  "BANKNIFTY": {
    symbol: "BANKNIFTY",
    exchange: "NSE",
    name: "NIFTY BANK INDEX",
    assetClass: "INDEX",
    lotSize: 15,
    tickSize: 0.05,
    category: "BANKNIFTY",
  },
  "SENSEX": {
    symbol: "SENSEX",
    exchange: "BSE",
    name: "BSE SENSEX INDEX",
    assetClass: "INDEX",
    lotSize: 10,
    tickSize: 0.05,
    category: "LARGE_CAP",
  },

  // Key NIFTY 50 Stocks (NSE & BSE Dual Listed)
  "RELIANCE": {
    symbol: "RELIANCE",
    exchange: "NSE",
    name: "Reliance Industries Ltd",
    assetClass: "EQUITY",
    lotSize: 250,
    tickSize: 0.05,
    category: "NIFTY50",
  },
  "TCS": {
    symbol: "TCS",
    exchange: "NSE",
    name: "Tata Consultancy Services Ltd",
    assetClass: "EQUITY",
    lotSize: 175,
    tickSize: 0.05,
    category: "NIFTY50",
  },
  "HDFCBANK": {
    symbol: "HDFCBANK",
    exchange: "NSE",
    name: "HDFC Bank Ltd",
    assetClass: "EQUITY",
    lotSize: 550,
    tickSize: 0.05,
    category: "BANKNIFTY",
  },
  "INFY": {
    symbol: "INFY",
    exchange: "NSE",
    name: "Infosys Ltd",
    assetClass: "EQUITY",
    lotSize: 400,
    tickSize: 0.05,
    category: "NIFTY50",
  },
  "ICICIBANK": {
    symbol: "ICICIBANK",
    exchange: "NSE",
    name: "ICICI Bank Ltd",
    assetClass: "EQUITY",
    lotSize: 700,
    tickSize: 0.05,
    category: "BANKNIFTY",
  },
  "TATASTEEL": {
    symbol: "TATASTEEL",
    exchange: "NSE",
    name: "Tata Steel Ltd",
    assetClass: "EQUITY",
    lotSize: 5500,
    tickSize: 0.05,
    category: "NIFTY50",
  },
  "SBIN": {
    symbol: "SBIN",
    exchange: "NSE",
    name: "State Bank of India",
    assetClass: "EQUITY",
    lotSize: 750,
    tickSize: 0.05,
    category: "BANKNIFTY",
  },
  "AXISBANK": {
    symbol: "AXISBANK",
    exchange: "NSE",
    name: "Axis Bank Ltd",
    assetClass: "EQUITY",
    lotSize: 625,
    tickSize: 0.05,
    category: "BANKNIFTY",
  },
  "KOTAKBANK": {
    symbol: "KOTAKBANK",
    exchange: "NSE",
    name: "Kotak Mahindra Bank Ltd",
    assetClass: "EQUITY",
    lotSize: 400,
    tickSize: 0.05,
    category: "BANKNIFTY",
  },
  "BHARTIARTL": {
    symbol: "BHARTIARTL",
    exchange: "NSE",
    name: "Bharti Airtel Ltd",
    assetClass: "EQUITY",
    lotSize: 950,
    tickSize: 0.05,
    category: "LARGE_CAP",
  },
  "TATAMOTORS": {
    symbol: "TATAMOTORS",
    exchange: "NSE",
    name: "Tata Motors Ltd",
    assetClass: "EQUITY",
    lotSize: 500,
    tickSize: 0.05,
    category: "NIFTY50",
  },
};

export const SUPPORTED_INDIAN_SYMBOLS = Object.keys(INDIAN_SYMBOLS);

/**
 * Canonical list of Indian paper-account types. Single source of truth — this
 * literal was copy-pasted across ~10 query sites and had already drifted (the
 * 15:15 square-off scope omitted INDIAN_FNO, so F&O positions carried
 * overnight). Import this everywhere instead of re-listing the array.
 */
export const INDIAN_ACCOUNT_TYPES = [
  "INDIAN_NSE",
  "INDIAN_BSE",
  "INDIAN_NIFTY50",
  "INDIAN_FNO",
] as const;

/** Open (not-yet-terminal) Indian trade statuses used by position queries. */
export const OPEN_INDIAN_TRADE_STATUSES = [
  "OPEN",
  "TARGET_TRIGGERED",
  "STOP_TRIGGERED",
  "EXIT_PENDING",
  "EXIT_PARTIALLY_FILLED",
] as const;

export function isSupportedIndianSymbol(symbol: string): boolean {
  if (!symbol) return false;
  const clean = symbol.toUpperCase().trim();
  return (
    clean in INDIAN_SYMBOLS ||
    clean === "NIFTY" ||
    clean.startsWith("NIFTY") ||
    clean.startsWith("BANKNIFTY") ||
    clean.startsWith("FINNIFTY") ||
    clean.startsWith("SENSEX")
  );
}
