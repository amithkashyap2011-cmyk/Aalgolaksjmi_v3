/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Indian Instrument Master & Contract Specification Service
 * ═══════════════════════════════════════════════════════════════════
 */

import { IndianUnderlying, IndianInstrumentType, IndianExchange } from "./types.js";

export interface IndianInstrumentSpec {
  symbol: string;
  underlying: IndianUnderlying;
  name: string;
  exchange: IndianExchange;
  lotSize: number;
  tickSize: number;
  strikeInterval: number;
  category: "INDEX_OPTION" | "INDEX_FUTURE" | "STOCK_OPTION" | "EQUITY";
}

export class InstrumentMaster {
  private static specs: Map<string, IndianInstrumentSpec> = new Map([
    // Indices
    ["NIFTY", {
      symbol: "NIFTY",
      underlying: "NIFTY",
      name: "NIFTY 50 INDEX",
      exchange: "NFO",
      lotSize: 75,
      tickSize: 0.05,
      strikeInterval: 50,
      category: "INDEX_OPTION",
    }],
    ["NIFTY50", {
      symbol: "NIFTY50",
      underlying: "NIFTY",
      name: "NIFTY 50 INDEX",
      exchange: "NFO",
      lotSize: 75,
      tickSize: 0.05,
      strikeInterval: 50,
      category: "INDEX_OPTION",
    }],
    ["BANKNIFTY", {
      symbol: "BANKNIFTY",
      underlying: "BANKNIFTY",
      name: "NIFTY BANK INDEX",
      exchange: "NFO",
      lotSize: 15,
      tickSize: 0.05,
      strikeInterval: 100,
      category: "INDEX_OPTION",
    }],
    ["FINNIFTY", {
      symbol: "FINNIFTY",
      underlying: "FINNIFTY",
      name: "NIFTY FINANCIAL SERVICES",
      exchange: "NFO",
      lotSize: 25,
      tickSize: 0.05,
      strikeInterval: 50,
      category: "INDEX_OPTION",
    }],
    ["MIDCPNIFTY", {
      symbol: "MIDCPNIFTY",
      underlying: "MIDCPNIFTY",
      name: "NIFTY MIDCAP SELECT",
      exchange: "NFO",
      lotSize: 50,
      tickSize: 0.05,
      strikeInterval: 25,
      category: "INDEX_OPTION",
    }],
    ["SENSEX", {
      symbol: "SENSEX",
      underlying: "SENSEX",
      name: "BSE SENSEX INDEX",
      exchange: "BFO",
      lotSize: 10,
      tickSize: 0.05,
      strikeInterval: 100,
      category: "INDEX_OPTION",
    }],
    // Top F&O Equities
    ["RELIANCE", {
      symbol: "RELIANCE",
      underlying: "RELIANCE",
      name: "Reliance Industries Ltd",
      exchange: "NFO",
      lotSize: 250,
      tickSize: 0.05,
      strikeInterval: 20,
      category: "STOCK_OPTION",
    }],
    ["HDFCBANK", {
      symbol: "HDFCBANK",
      underlying: "HDFCBANK",
      name: "HDFC Bank Ltd",
      exchange: "NFO",
      lotSize: 550,
      tickSize: 0.05,
      strikeInterval: 10,
      category: "STOCK_OPTION",
    }],
    ["ICICIBANK", {
      symbol: "ICICIBANK",
      underlying: "ICICIBANK",
      name: "ICICI Bank Ltd",
      exchange: "NFO",
      lotSize: 700,
      tickSize: 0.05,
      strikeInterval: 10,
      category: "STOCK_OPTION",
    }],
    ["TCS", {
      symbol: "TCS",
      underlying: "TCS",
      name: "Tata Consultancy Services",
      exchange: "NFO",
      lotSize: 175,
      tickSize: 0.05,
      strikeInterval: 20,
      category: "STOCK_OPTION",
    }],
    ["INFY", {
      symbol: "INFY",
      underlying: "INFY",
      name: "Infosys Ltd",
      exchange: "NFO",
      lotSize: 400,
      tickSize: 0.05,
      strikeInterval: 10,
      category: "STOCK_OPTION",
    }],
    ["SBIN", {
      symbol: "SBIN",
      underlying: "SBIN",
      name: "State Bank of India",
      exchange: "NFO",
      lotSize: 750,
      tickSize: 0.05,
      strikeInterval: 5,
      category: "STOCK_OPTION",
    }],
    ["TATASTEEL", {
      symbol: "TATASTEEL",
      underlying: "TATASTEEL",
      name: "Tata Steel Ltd",
      exchange: "NFO",
      lotSize: 5500,
      tickSize: 0.05,
      strikeInterval: 1,
      category: "STOCK_OPTION",
    }]
  ]);

  public static getSpec(underlying: string): IndianInstrumentSpec {
    const key = underlying.toUpperCase().replace(/\s+/g, "");
    const spec = this.specs.get(key) || this.specs.get("NIFTY");
    return spec!;
  }

  public static getLotSize(underlying: string): number {
    return this.getSpec(underlying).lotSize;
  }

  public static getStrikeInterval(underlying: string): number {
    return this.getSpec(underlying).strikeInterval;
  }

  public static getTickSize(underlying: string): number {
    return this.getSpec(underlying).tickSize;
  }

  public static formatTradingSymbol(
    underlying: string,
    instrument: IndianInstrumentType,
    strike?: number,
    expiryFormatted?: string
  ): string {
    const cleanUnderlying = underlying.toUpperCase().replace("50", "");
    const exp = expiryFormatted || "26AUG";
    if (instrument === "FUTURE") {
      return `${cleanUnderlying}${exp}FUT`;
    }
    const cleanStrike = Math.round(strike || 25000);
    return `${cleanUnderlying}${exp}${cleanStrike}${instrument}`;
  }
}
