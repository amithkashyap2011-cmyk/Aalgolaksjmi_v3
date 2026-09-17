/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — DUAL-MARKET ISOLATION & SAFETY GUARD
 * ═══════════════════════════════════════════════════════════════════
 *  Authoritative enforcement of Section 6, 8, 9, 14, 54, 55:
 *   - Indian strategy cannot trade crypto.
 *   - Crypto strategy cannot trade Indian equities or F&O.
 *   - Indian order cannot reach Binance.
 *   - Crypto order cannot reach Angel One / Zerodha.
 *   - Indian risk rules do not corrupt crypto risk.
 *   - Crypto risk rules do not corrupt Indian risk.
 *   - Zero context contamination between trading surfaces.
 */

import { MarketDomain } from "./CanonicalModel.js";
import { isSupportedIndianSymbol } from "../../config/indianSymbols.js";

export class MarketIsolationViolationError extends Error {
  public readonly code: string;
  public readonly market: MarketDomain;
  public readonly symbol: string;

  constructor(code: string, message: string, market: MarketDomain, symbol: string) {
    super(`[MARKET_ISOLATION_VIOLATION:${code}] ${message}`);
    this.name = "MarketIsolationViolationError";
    this.code = code;
    this.market = market;
    this.symbol = symbol;
  }
}

export class MarketIsolationGuard {
  /**
   * Determine the authoritative market domain from symbol syntax
   */
  public static resolveDomainFromSymbol(symbol: string): MarketDomain {
    const s = (symbol || "").trim().toUpperCase();
    if (s.endsWith("USDT") || s.endsWith("BUSD") || s.endsWith("BTC") || s.endsWith("ETH")) {
      return "CRYPTO";
    }
    if (
      isSupportedIndianSymbol(s) ||
      s.startsWith("NIFTY") ||
      s.startsWith("BANKNIFTY") ||
      s.startsWith("FINNIFTY") ||
      s.includes("CE") ||
      s.includes("PE") ||
      s.includes("FUT")
    ) {
      return "INDIA";
    }
    return "INDIA"; // Default to regulated exchange if ambiguity exists
  }

  /**
   * Validate that an order request matches its declared market domain
   * and target broker destination.
   */
  public static validateOrderRouting(params: {
    symbol: string;
    declaredMarket: MarketDomain;
    brokerTarget?: string;
  }): { valid: boolean; error?: string } {
    const { symbol, declaredMarket, brokerTarget } = params;
    const actualDomain = this.resolveDomainFromSymbol(symbol);

    // 1. Symbol domain mismatch
    if (declaredMarket === "INDIA" && actualDomain === "CRYPTO") {
      throw new MarketIsolationViolationError(
        "CRYPTO_SYMBOL_IN_INDIAN_MARKET",
        `Crypto symbol '${symbol}' cannot be executed through the Indian Market pipeline.`,
        declaredMarket,
        symbol
      );
    }

    if (declaredMarket === "CRYPTO" && actualDomain === "INDIA") {
      throw new MarketIsolationViolationError(
        "INDIAN_SYMBOL_IN_CRYPTO_MARKET",
        `Indian symbol '${symbol}' cannot be executed through the Binance Crypto pipeline.`,
        declaredMarket,
        symbol
      );
    }

    // 2. Broker destination mismatch
    if (brokerTarget) {
      const b = brokerTarget.toUpperCase();
      if (declaredMarket === "INDIA" && (b.includes("BINANCE") || b.includes("CRYPTO"))) {
        throw new MarketIsolationViolationError(
          "INDIAN_ORDER_TO_BINANCE",
          `Indian Market order '${symbol}' cannot be routed to Binance broker target '${brokerTarget}'.`,
          declaredMarket,
          symbol
        );
      }

      if (declaredMarket === "CRYPTO" && (b.includes("ANGEL") || b.includes("ZERODHA") || b.includes("KITE") || b.includes("NSE"))) {
        throw new MarketIsolationViolationError(
          "CRYPTO_ORDER_TO_INDIAN_BROKER",
          `Crypto order '${symbol}' cannot be routed to Indian broker target '${brokerTarget}'.`,
          declaredMarket,
          symbol
        );
      }
    }

    return { valid: true };
  }

  /**
   * Validate that a strategy is authorized to execute in the target market
   */
  public static validateStrategyMarket(params: {
    strategyId: string;
    strategyMarket: MarketDomain;
    executionMarket: MarketDomain;
    symbol: string;
  }): { valid: boolean; error?: string } {
    const { strategyId, strategyMarket, executionMarket, symbol } = params;

    if (strategyMarket !== executionMarket) {
      throw new MarketIsolationViolationError(
        "CROSS_MARKET_STRATEGY_EXECUTION",
        `Strategy '${strategyId}' is configured for ${strategyMarket} market and is strictly forbidden from executing against ${executionMarket} market (${symbol}).`,
        executionMarket,
        symbol
      );
    }

    return { valid: true };
  }

  /**
   * Validate risk engine parameter isolation
   */
  public static validateRiskEngineContext(params: {
    engineMarket: MarketDomain;
    symbol: string;
  }): { valid: boolean; error?: string } {
    const { engineMarket, symbol } = params;
    const actualDomain = this.resolveDomainFromSymbol(symbol);

    if (engineMarket !== actualDomain) {
      throw new MarketIsolationViolationError(
        "CROSS_MARKET_RISK_CORRUPTION",
        `Risk engine for ${engineMarket} cannot evaluate position/symbol '${symbol}' which belongs to ${actualDomain}.`,
        engineMarket,
        symbol
      );
    }

    return { valid: true };
  }

  /**
   * Validate that an agent proposal carries explicit, unambiguous market context
   * and matches the instrument domain.
   */
  public static validateProposalMarketContext(proposal: {
    market?: MarketDomain;
    instrument: string;
    accountId?: string;
    accountType?: string;
    mode?: string;
  }): { valid: boolean; error?: string } {
    if (!proposal.market) {
      throw new MarketIsolationViolationError(
        "AMBIGUOUS_MARKET_CONTEXT",
        `Proposal for instrument '${proposal.instrument}' missing mandatory 'market' context (must be 'INDIA' or 'CRYPTO').`,
        "INDIA",
        proposal.instrument
      );
    }

    const actualDomain = this.resolveDomainFromSymbol(proposal.instrument);
    if (proposal.market !== actualDomain) {
      throw new MarketIsolationViolationError(
        "CROSS_MARKET_PROPOSAL_REJECTED",
        `Agent proposal market '${proposal.market}' conflicts with instrument '${proposal.instrument}' domain (${actualDomain}).`,
        proposal.market,
        proposal.instrument
      );
    }

    return { valid: true };
  }
}
