import { describe, it, expect } from "@jest/globals";
import {
  FinancialTruthBoundary,
  FinancialTruthViolationError,
  FinancialProvenance,
} from "../src/services/financialTruthBoundary.js";
import { AgentKernel } from "../src/services/agentic/AgentKernel.js";
import { MarketIsolationGuard, MarketIsolationViolationError } from "../src/services/market/MarketIsolationGuard.js";
import { IndianMarketAdapter, CryptoMarketAdapter } from "../src/services/market/MarketAdapter.js";

describe("AALGOLAKSHMI V3: Authoritative Financial Truth Boundary & Safety Invariants", () => {
  describe("1. Provenance Classification & Mutation Barriers", () => {
    it("allows AUTHORITATIVE and DERIVED provenance to mutate financial state", () => {
      const authVal = FinancialTruthBoundary.createAuthoritativeValue({
        value: 20000,
        currency: "INR",
        market: "INDIA",
        accountType: "INDIAN_NSE",
        mode: "PAPER",
        source: "PAPER_INITIALIZATION",
      });

      expect(authVal.provenance).toBe("AUTHORITATIVE");
      expect(authVal.isAuthoritative).toBe(true);
      expect(() => {
        FinancialTruthBoundary.assertAuthoritativeForMutation(authVal, "CREDIT_WALLET");
      }).not.toThrow();

      const derivedVal = FinancialTruthBoundary.createDerivedValue({
        value: 20000,
        currency: "INR",
        market: "INDIA",
        accountType: "INDIAN_NSE",
        mode: "PAPER",
        source: "EQUITY_RECONCILIATION",
        inputProvenances: [authVal],
      });

      expect(derivedVal.provenance).toBe("DERIVED");
      expect(derivedVal.isAuthoritative).toBe(true);
      expect(() => {
        FinancialTruthBoundary.assertAuthoritativeForMutation(derivedVal, "UPDATE_EQUITY");
      }).not.toThrow();
    });

    it("STRICTLY REJECTS AI_ESTIMATE from mutating authoritative financial state", () => {
      const aiVal = FinancialTruthBoundary.createAiEstimate({
        value: 50000,
        currency: "INR",
        market: "INDIA",
        agentId: "STRATEGY_AGENT",
        modelVersion: "2.1.0",
        confidence: 0.94,
        rationale: "Strong breakout detected with high probability",
      });

      expect(aiVal.provenance).toBe("AI_ESTIMATE");
      expect(aiVal.isAuthoritative).toBe(false);

      expect(() => {
        FinancialTruthBoundary.assertAuthoritativeForMutation(aiVal, "MUTATE_WALLET_BALANCE");
      }).toThrow(FinancialTruthViolationError);
    });

    it("STRICTLY REJECTS DISPLAY_ONLY conversion from mutating or creating crypto buying power", () => {
      const inrAuth = FinancialTruthBoundary.createAuthoritativeValue({
        value: 20000,
        currency: "INR",
        market: "INDIA",
        accountType: "INDIAN_NSE",
        mode: "PAPER",
        source: "PAPER_INITIALIZATION",
      });

      const displayUsd = FinancialTruthBoundary.createDisplayConversion({
        convertedValue: 20000 / 95.61,
        targetCurrency: "USD",
        sourceProvenance: inrAuth,
        fxRate: 95.61,
        fxSource: "RBI Reference Rate",
      });

      expect(displayUsd.provenance).toBe("DISPLAY_ONLY");
      expect(displayUsd.isAuthoritative).toBe(false);
      expect(displayUsd.market).toBe("GLOBAL");

      expect(() => {
        FinancialTruthBoundary.assertAuthoritativeForMutation(displayUsd, "CREDIT_BINANCE_WALLET");
      }).toThrow(FinancialTruthViolationError);
    });

    it("STRICTLY REJECTS UNKNOWN_STALE data from substituting fabricated zero balance", () => {
      const staleVal = FinancialTruthBoundary.createUnknownStale({
        currency: "INR",
        market: "INDIA",
        accountType: "INDIAN_NSE",
        mode: "LIVE",
        reason: "Angel One WebSocket disconnected",
        lastKnownValue: 15000,
      });

      expect(staleVal.provenance).toBe("UNKNOWN_STALE");
      expect(staleVal.isAuthoritative).toBe(false);

      expect(() => {
        FinancialTruthBoundary.assertAuthoritativeForMutation(staleVal, "REPLACE_ACTIVE_BALANCE");
      }).toThrow(FinancialTruthViolationError);
    });
  });

  describe("2. Agent Kernel Financial Permission Barrier", () => {
    it("forbids Agent Kernel and autonomous agents from directly mutating capital or ledgers", () => {
      expect(() => {
        AgentKernel.assertDirectMutationForbidden("MUTATE_WALLET_BALANCE");
      }).toThrow(/AGENT_KERNEL_CANNOT_MUTATE_FINANCIAL_STATE/);

      expect(() => {
        AgentKernel.assertDirectMutationForbidden("CREDIT_PAPER_CAPITAL");
      }).toThrow(/SECURITY_VIOLATION/);

      expect(() => {
        AgentKernel.assertDirectMutationForbidden("REWRITE_LEDGER_TRANSACTION");
      }).toThrow(/SECURITY_VIOLATION/);
    });
  });

  describe("3. Market Context Isolation & Proposal Boundary", () => {
    it("rejects ambiguous proposals without explicit market context", () => {
      expect(() => {
        MarketIsolationGuard.validateProposalMarketContext({
          instrument: "RELIANCE",
        } as any);
      }).toThrow(MarketIsolationViolationError);
    });

    it("rejects cross-market proposal: Crypto BTCUSDT in INDIA market", () => {
      expect(() => {
        MarketIsolationGuard.validateProposalMarketContext({
          market: "INDIA",
          instrument: "BTCUSDT",
        });
      }).toThrow(/conflicts with instrument 'BTCUSDT' domain \(CRYPTO\)/);
    });

    it("rejects cross-market proposal: Indian NIFTY in CRYPTO market", () => {
      expect(() => {
        MarketIsolationGuard.validateProposalMarketContext({
          market: "CRYPTO",
          instrument: "NIFTY26SEP24500CE",
        });
      }).toThrow(/conflicts with instrument 'NIFTY26SEP24500CE' domain \(INDIA\)/);
    });

    it("approves valid proposals with matched market context", () => {
      const indiaCheck = MarketIsolationGuard.validateProposalMarketContext({
        market: "INDIA",
        instrument: "RELIANCE",
      });
      expect(indiaCheck.valid).toBe(true);

      const cryptoCheck = MarketIsolationGuard.validateProposalMarketContext({
        market: "CRYPTO",
        instrument: "BTCUSDT",
      });
      expect(cryptoCheck.valid).toBe(true);
    });
  });

  describe("4. Market Adapter Operational Contract", () => {
    const indianAdapter = new IndianMarketAdapter();
    const cryptoAdapter = new CryptoMarketAdapter();

    it("IndianMarketAdapter implements operational contract for Indian exchange", async () => {
      expect(indianAdapter.market).toBe("INDIA");

      const validCheck = await indianAdapter.validateOrder({
        market: "INDIA",
        symbol: "RELIANCE",
        side: "BUY",
        quantity: 50,
      } as any);
      expect(validCheck.valid).toBe(true);

      const invalidCheck = await indianAdapter.validateOrder({
        market: "CRYPTO",
        symbol: "RELIANCE",
        side: "BUY",
        quantity: 50,
      } as any);
      expect(validCheck.valid).toBe(true);
      expect(invalidCheck.valid).toBe(false);

      const fees = await indianAdapter.calculateFees({
        symbol: "RELIANCE",
        price: 3000,
        quantity: 10,
      } as any);
      expect(fees.feeCurrency).toBe("INR");
      expect(fees.fee).toBeGreaterThan(0);

      const margin = await indianAdapter.calculateMargin({
        symbol: "RELIANCE",
        price: 3000,
        quantity: 10,
        productType: "MIS",
      } as any);
      expect(margin.currency).toBe("INR");
      expect(margin.requiredMargin).toBe(6000); // 20% of 30,000 notional
    });

    it("CryptoMarketAdapter implements operational contract for Binance exchange", async () => {
      expect(cryptoAdapter.market).toBe("CRYPTO");

      const validCheck = await cryptoAdapter.validateOrder({
        market: "CRYPTO",
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 0.1,
      } as any);
      expect(validCheck.valid).toBe(true);

      const invalidCheck = await cryptoAdapter.validateOrder({
        market: "INDIA",
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 0.1,
      } as any);
      expect(invalidCheck.valid).toBe(false);

      const fees = await cryptoAdapter.calculateFees({
        symbol: "BTCUSDT",
        price: 60000,
        quantity: 0.1,
      } as any);
      expect(fees.feeCurrency).toBe("USDT");
      expect(fees.fee).toBe(2.4); // 0.04% of 6,000 notional

      const margin = await cryptoAdapter.calculateMargin({
        symbol: "BTCUSDT",
        price: 60000,
        quantity: 0.1,
        leverage: 10,
      } as any);
      expect(margin.currency).toBe("USDT");
      expect(margin.requiredMargin).toBe(600); // 6,000 / 10 leverage
    });
  });
});
