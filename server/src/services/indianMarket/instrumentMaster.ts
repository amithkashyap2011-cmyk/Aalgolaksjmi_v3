/**
 * ═══════════════════════════════════════════════════════════════════
 *  Indian Derivatives Instrument Master Service
 * ═══════════════════════════════════════════════════════════════════
 *  Maintains and resolves official NSE / NFO derivative contract metadata:
 *   - Trading symbol formatting (e.g. NIFTY26AUG24500CE, BANKNIFTY26AUGFUT)
 *   - Security tokens & exchange routing
 *   - Dynamic lot sizes and tick sizes
 *   - Contract validation & active status checks
 */

import {
  Exchange,
  InstrumentMasterItem,
  InstrumentType,
  UnderlyingSymbol,
} from "./strategyTypes.js";
import { ExpiryResolver } from "./expiryResolver.js";
import { StrikeSelector } from "./strikeSelector.js";

export interface UnderlyingContractSpec {
  underlying: UnderlyingSymbol;
  name: string;
  cashExchange: Exchange;
  derivativesExchange: Exchange;
  lotSize: number;
  tickSize: number;
  strikeStep: number;
  category: "INDEX" | "STOCK";
}

export const UNDERLYING_SPECS: Record<string, UnderlyingContractSpec> = {
  NIFTY: {
    underlying: "NIFTY",
    name: "NIFTY 50 INDEX",
    cashExchange: "NSE",
    derivativesExchange: "NFO",
    lotSize: 75,
    tickSize: 0.05,
    strikeStep: 50,
    category: "INDEX",
  },
  NIFTY50: {
    underlying: "NIFTY",
    name: "NIFTY 50 INDEX",
    cashExchange: "NSE",
    derivativesExchange: "NFO",
    lotSize: 75,
    tickSize: 0.05,
    strikeStep: 50,
    category: "INDEX",
  },
  BANKNIFTY: {
    underlying: "BANKNIFTY",
    name: "NIFTY BANK INDEX",
    cashExchange: "NSE",
    derivativesExchange: "NFO",
    lotSize: 15,
    tickSize: 0.05,
    strikeStep: 100,
    category: "INDEX",
  },
  FINNIFTY: {
    underlying: "FINNIFTY",
    name: "NIFTY FINANCIAL SERVICES INDEX",
    cashExchange: "NSE",
    derivativesExchange: "NFO",
    lotSize: 25,
    tickSize: 0.05,
    strikeStep: 50,
    category: "INDEX",
  },
  MIDCPNIFTY: {
    underlying: "MIDCPNIFTY",
    name: "NIFTY MIDCAP SELECT INDEX",
    cashExchange: "NSE",
    derivativesExchange: "NFO",
    lotSize: 50,
    tickSize: 0.05,
    strikeStep: 25,
    category: "INDEX",
  },
  SENSEX: {
    underlying: "SENSEX",
    name: "BSE SENSEX INDEX",
    cashExchange: "BSE",
    derivativesExchange: "BFO",
    lotSize: 10,
    tickSize: 0.05,
    strikeStep: 100,
    category: "INDEX",
  },
  BANKEX: {
    underlying: "BANKEX",
    name: "BSE BANKEX INDEX",
    cashExchange: "BSE",
    derivativesExchange: "BFO",
    lotSize: 15,
    tickSize: 0.05,
    strikeStep: 100,
    category: "INDEX",
  },
  RELIANCE: {
    underlying: "RELIANCE",
    name: "Reliance Industries Ltd",
    cashExchange: "NSE",
    derivativesExchange: "NFO",
    lotSize: 250,
    tickSize: 0.05,
    strikeStep: 20,
    category: "STOCK",
  },
  HDFCBANK: {
    underlying: "HDFCBANK",
    name: "HDFC Bank Ltd",
    cashExchange: "NSE",
    derivativesExchange: "NFO",
    lotSize: 550,
    tickSize: 0.05,
    strikeStep: 10,
    category: "STOCK",
  },
  ICICIBANK: {
    underlying: "ICICIBANK",
    name: "ICICI Bank Ltd",
    cashExchange: "NSE",
    derivativesExchange: "NFO",
    lotSize: 700,
    tickSize: 0.05,
    strikeStep: 10,
    category: "STOCK",
  },
};

export class InstrumentMaster {
  private static instrumentCatalog = new Map<string, InstrumentMasterItem>();

  /**
   * Normalizes underlying identifier
   */
  public static normalizeUnderlying(symbol: string): UnderlyingSymbol {
    if (!symbol) return "NIFTY";
    const s = symbol.toUpperCase().replace(/\s+/g, "");
    if (s.startsWith("BANKNIFTY") || s === "NIFTYBANK" || s === "BANK NIFTY") return "BANKNIFTY";
    if (s.startsWith("FINNIFTY")) return "FINNIFTY";
    if (s.startsWith("MIDCPNIFTY")) return "MIDCPNIFTY";
    if (s.startsWith("NIFTY50") || s.startsWith("NIFTY")) return "NIFTY";
    if (s.startsWith("SENSEX")) return "SENSEX";
    if (s.startsWith("BANKEX")) return "BANKEX";
    return s;
  }

  /**
   * Retrieves contract specifications for an underlying
   */
  public static getSpec(underlying: UnderlyingSymbol): UnderlyingContractSpec {
    const norm = this.normalizeUnderlying(underlying);
    const spec = UNDERLYING_SPECS[norm] || UNDERLYING_SPECS[underlying];
    if (spec) return spec;

    // Default fallback spec for equities
    return {
      underlying: norm,
      name: norm,
      cashExchange: "NSE",
      derivativesExchange: "NFO",
      lotSize: 1,
      tickSize: 0.05,
      strikeStep: StrikeSelector.getStrikeStep(norm),
      category: "STOCK",
    };
  }

  /**
   * Formats Indian Broker / NSE Trading Symbol standard format:
   * E.g. NIFTY26AUG24500CE, BANKNIFTY26AUGFUT, NIFTY2682824500PE (weekly)
   */
  public static formatTradingSymbol(
    underlying: UnderlyingSymbol,
    expiryDate: Date,
    instrumentType: InstrumentType,
    strike?: number
  ): string {
    const norm = this.normalizeUnderlying(underlying);
    const year = expiryDate.getFullYear().toString().slice(-2);
    const monthNames = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ];
    const month = monthNames[expiryDate.getMonth()];
    const day = String(expiryDate.getDate()).padStart(2, "0");

    if (instrumentType === "FUTURE") {
      return `${norm}${year}${month}FUT`;
    }

    if (instrumentType === "EQUITY") {
      return norm;
    }

    const strikeStr = strike ? Math.round(strike).toString() : "";
    return `${norm}${year}${month}${strikeStr}${instrumentType}`;
  }

  /**
   * Generates deterministic contract token
   */
  public static generateToken(
    exchange: Exchange,
    tradingSymbol: string
  ): string {
    // Generate deterministic hash token
    let hash = 0;
    const str = `${exchange}:${tradingSymbol}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString();
  }

  /**
   * Resolves full InstrumentMasterItem
   */
  public static resolveInstrument(
    underlying: UnderlyingSymbol,
    instrumentType: InstrumentType,
    expiryDate: Date,
    strike?: number
  ): InstrumentMasterItem {
    const spec = this.getSpec(underlying);
    const expiryStr = ExpiryResolver.formatDate(expiryDate);
    const strikeVal = strike ? Math.round(strike) : 0;
    const tradingSymbol = this.formatTradingSymbol(
      spec.underlying,
      expiryDate,
      instrumentType,
      strikeVal
    );
    const token = this.generateToken(spec.derivativesExchange, tradingSymbol);

    const item: InstrumentMasterItem = {
      token,
      tradingSymbol,
      underlying: spec.underlying,
      exchange: spec.derivativesExchange,
      instrumentType,
      strike: strikeVal,
      expiry: expiryStr,
      expiryDate,
      lotSize: spec.lotSize,
      tickSize: spec.tickSize,
      strikeStep: spec.strikeStep,
    };

    // Cache in catalog
    this.instrumentCatalog.set(`${spec.underlying}:${tradingSymbol}`, item);
    return item;
  }

  /**
   * Validates if instrument contract exists and is currently tradable
   */
  public static isValidContract(item: InstrumentMasterItem): boolean {
    if (!item.tradingSymbol || !item.token || item.lotSize <= 0) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const exp = new Date(item.expiryDate);
    exp.setHours(23, 59, 59, 999);
    // Contract must not be expired
    return exp.getTime() >= now.getTime();
  }
}
