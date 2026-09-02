import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import {
  CurrencyService,
  isValidCurrencyRate,
  type IFXProvider,
  type CurrencyRateSource,
  OpenERProvider,
  ExchangeRateHostProvider,
  CoinGeckoProvider,
  CryptoCompareProvider,
} from "../src/services/currencyService.js";

describe("CurrencyService — Global Exchange Rate & Governance Suite", () => {
  beforeEach(() => {
    CurrencyService.resetForTesting();
  });

  afterEach(() => {
    CurrencyService.resetForTesting();
  });

  // ── 1. Validation Logic ──
  describe("Rate Validation", () => {
    it("accepts sane, positive finite rates between 50 and 200", () => {
      expect(isValidCurrencyRate(84.50)).toBe(true);
      expect(isValidCurrencyRate(50.0)).toBe(true);
      expect(isValidCurrencyRate(200.0)).toBe(true);
      expect(isValidCurrencyRate(83.1234)).toBe(true);
    });

    it("rejects non-numeric, NaN, Infinity and non-finite values", () => {
      expect(isValidCurrencyRate(NaN)).toBe(false);
      expect(isValidCurrencyRate(Infinity)).toBe(false);
      expect(isValidCurrencyRate(-Infinity)).toBe(false);
      expect(isValidCurrencyRate(null)).toBe(false);
      expect(isValidCurrencyRate(undefined)).toBe(false);
      expect(isValidCurrencyRate("84.50")).toBe(false);
    });

    it("rejects negative, zero, or out-of-bounds rates (< 50 or > 200)", () => {
      expect(isValidCurrencyRate(0)).toBe(false);
      expect(isValidCurrencyRate(-84.50)).toBe(false);
      expect(isValidCurrencyRate(49.99)).toBe(false);
      expect(isValidCurrencyRate(200.01)).toBe(false);
      expect(isValidCurrencyRate(1000)).toBe(false);
    });
  });

  // ── 2. Deterministic Test Isolation & Default Fallback ──
  describe("Deterministic Test Environment Isolation", () => {
    it("returns default safe fallback (84.50) with TEST_MOCK / CACHED in test mode without network access", async () => {
      const rate = await CurrencyService.refreshRate();
      expect(rate).toBe(84.50);

      const meta = CurrencyService.getMetadata();
      expect(meta.rate).toBe(84.50);
      expect(meta.source).toBe("TEST_MOCK");
      expect(meta.status).toBe("CACHED");
      expect(meta.failureCount).toBe(0);
    });

    it("supports explicit mock rate override for tests", async () => {
      CurrencyService.setMockRate(88.25);
      const rate = await CurrencyService.refreshRate();
      expect(rate).toBe(88.25);

      const meta = CurrencyService.getMetadata();
      expect(meta.rate).toBe(88.25);
      expect(meta.source).toBe("TEST_MOCK");
      expect(meta.status).toBe("LIVE");
    });
  });

  // ── 3. Multi-Provider Resolution & Fallback ──
  describe("Provider Abstraction & Fallback", () => {
    it("uses Primary Provider when it succeeds with a valid rate", async () => {
      const mockPrimary: IFXProvider = {
        name: "MockPrimary",
        sourceId: "LIVE_OPEN_ER",
        fetchRate: async () => 86.50,
      };

      CurrencyService.setMockProvider(mockPrimary);
      const rate = await CurrencyService.refreshRate(true);
      expect(rate).toBe(86.50);

      const meta = CurrencyService.getMetadata();
      expect(meta.rate).toBe(86.50);
      expect(meta.source).toBe("LIVE_OPEN_ER");
      expect(meta.status).toBe("LIVE");
      expect(meta.isLive).toBe(true);
      expect(meta.failureCount).toBe(0);
    });

    it("falls back to last-known-good rate when provider fails", async () => {
      // First prime with a good rate
      const mockGood: IFXProvider = {
        name: "MockGood",
        sourceId: "LIVE_OPEN_ER",
        fetchRate: async () => 87.00,
      };
      CurrencyService.setMockProvider(mockGood);
      await CurrencyService.refreshRate(true);

      // Now mock provider fails
      const mockFailing: IFXProvider = {
        name: "MockFailing",
        sourceId: "LIVE_OPEN_ER",
        fetchRate: async () => null,
      };
      CurrencyService.setMockProvider(mockFailing);

      const rate = await CurrencyService.refreshRate(true);
      expect(rate).toBe(87.00); // Retains last known good

      const meta = CurrencyService.getMetadata();
      expect(meta.rate).toBe(87.00);
      expect(meta.source).toBe("CACHED_LAST_KNOWN");
      expect(meta.status).toBe("CACHED");
      expect(meta.failureCount).toBe(1);
      expect(meta.nextRetryAt).toBeGreaterThan(Date.now());
    });

    it("falls back to safe default fallback (84.50) when all providers fail and no prior rate exists", async () => {
      const mockFailing: IFXProvider = {
        name: "MockFailing",
        sourceId: "LIVE_OPEN_ER",
        fetchRate: async () => {
          throw new Error("Network timeout");
        },
      };
      CurrencyService.setMockProvider(mockFailing);

      const rate = await CurrencyService.refreshRate(true);
      expect(rate).toBe(84.50);

      const meta = CurrencyService.getMetadata();
      expect(meta.rate).toBe(84.50);
      expect(meta.source).toBe("SAFE_FALLBACK");
      expect(meta.status).toBe("FALLBACK");
      expect(meta.failureCount).toBe(1);
    });

    it("rejects provider returning NaN and uses fallback", async () => {
      const mockNaN: IFXProvider = {
        name: "MockNaN",
        sourceId: "LIVE_OPEN_ER",
        fetchRate: async () => NaN,
      };
      CurrencyService.setMockProvider(mockNaN);

      const rate = await CurrencyService.refreshRate(true);
      expect(rate).toBe(84.50);
      expect(CurrencyService.getMetadata().status).toBe("FALLBACK");
    });

    it("rejects provider returning Infinity and uses fallback", async () => {
      const mockInf: IFXProvider = {
        name: "MockInf",
        sourceId: "LIVE_OPEN_ER",
        fetchRate: async () => Infinity,
      };
      CurrencyService.setMockProvider(mockInf);

      const rate = await CurrencyService.refreshRate(true);
      expect(rate).toBe(84.50);
      expect(CurrencyService.getMetadata().status).toBe("FALLBACK");
    });

    it("rejects provider returning negative rate or zero and uses fallback", async () => {
      const mockNeg: IFXProvider = {
        name: "MockNeg",
        sourceId: "LIVE_OPEN_ER",
        fetchRate: async () => -84.50,
      };
      CurrencyService.setMockProvider(mockNeg);

      const rate = await CurrencyService.refreshRate(true);
      expect(rate).toBe(84.50);
      expect(CurrencyService.getMetadata().status).toBe("FALLBACK");
    });
  });

  // ── 4. Retry & Backoff Governance ──
  describe("Retry & Backoff Governance", () => {
    it("schedules exponential backoff retry window on consecutive failures", async () => {
      const mockFailing: IFXProvider = {
        name: "MockFailing",
        sourceId: "LIVE_OPEN_ER",
        fetchRate: async () => null,
      };
      CurrencyService.setMockProvider(mockFailing);

      const before = Date.now();
      await CurrencyService.refreshRate(true); // Attempt 1
      const meta1 = CurrencyService.getMetadata();
      expect(meta1.failureCount).toBe(1);
      expect(meta1.nextRetryAt).toBeGreaterThanOrEqual(before + CurrencyService.BASE_RETRY_INTERVAL_MS);

      await CurrencyService.refreshRate(true); // Attempt 2
      const meta2 = CurrencyService.getMetadata();
      expect(meta2.failureCount).toBe(2);
      expect(meta2.nextRetryAt).toBeGreaterThan(meta1.nextRetryAt);
    });

    it("does not re-poll during active backoff window unless forced", async () => {
      let callCount = 0;
      const mockProvider: IFXProvider = {
        name: "MockCount",
        sourceId: "LIVE_OPEN_ER",
        fetchRate: async () => {
          callCount++;
          return null;
        },
      };
      CurrencyService.setMockProvider(mockProvider);

      await CurrencyService.refreshRate(true); // Initial failure
      expect(callCount).toBe(1);

      // Normal refresh within backoff window should NOT call fetchRate again
      await CurrencyService.refreshRate(false);
      expect(callCount).toBe(1);
    });
  });

  // ── 5. Conversion Calculation & Formatting Helpers ──
  describe("Conversion & Formatting Helpers", () => {
    it("converts USDT to INR accurately", () => {
      CurrencyService.setMockRate(85.00);
      expect(CurrencyService.convertToInr(100)).toBe(8500);
      expect(CurrencyService.convertToInr(0)).toBe(0);
      expect(CurrencyService.convertToInr(NaN)).toBe(0);
    });

    it("converts INR to USDT accurately", () => {
      CurrencyService.setMockRate(85.00);
      expect(CurrencyService.convertToUsdt(8500)).toBeCloseTo(100, 4);
      expect(CurrencyService.convertToUsdt(0)).toBe(0);
      expect(CurrencyService.convertToUsdt(NaN)).toBe(0);
    });

    it("formats dual currency display string", () => {
      CurrencyService.setMockRate(85.00);
      const dual = CurrencyService.formatDual(100);
      expect(dual).toBe("100.00 USDT (₹8,500)");

      const zeroDual = CurrencyService.formatDual(0);
      expect(zeroDual).toBe("0.00 USDT (₹0)");
    });
  });

  // ── 6. Health Diagnostics & Observability ──
  describe("Health Diagnostics", () => {
    it("returns structured health status for /health/full and monitoring", () => {
      CurrencyService.setMockRate(85.50);
      const health = CurrencyService.getHealth();

      expect(health.status).toBe("ok");
      expect(health.rate).toBe(85.50);
      expect(health.rateStatus).toBe("LIVE");
      expect(health.source).toBe("TEST_MOCK");
      expect(typeof health.cacheAgeSeconds).toBe("number");
      expect(health.failureCount).toBe(0);
    });
  });
});
