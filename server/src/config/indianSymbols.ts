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
};

export const SUPPORTED_INDIAN_SYMBOLS = Object.keys(INDIAN_SYMBOLS);
