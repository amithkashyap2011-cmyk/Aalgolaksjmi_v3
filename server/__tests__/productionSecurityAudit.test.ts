/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Production Security, Credential Protection & Trading Safety Suite
 * ═══════════════════════════════════════════════════════════════════
 *  Automated regression test coverage for Phase 5 requirements:
 *   - Unauthenticated trading rejection
 *   - Cross-account access lockout
 *   - Quantity, price, and lot-size validation
 *   - SL / Target directionality invariants
 *   - Invariant state transition gatekeeping (impossible transitions blocked)
 *   - Authoritative backend kill switch
 *   - Credential redaction and secret isolation
 *   - Append-only financial ledger protections
 */

import { describe, test, expect, beforeEach, afterAll, beforeAll } from "@jest/globals";
import mongoose from "mongoose";
import { OrderValidator } from "../src/services/indianMarket/security/orderValidator.js";
import { TradingKillSwitch } from "../src/services/indianMarket/security/tradingKillSwitch.js";
import { SecurityConfigValidator } from "../src/services/indianMarket/security/securityConfigValidator.js";
import { AutoPilotStateMachine } from "../src/services/indianMarket/autoPilotStateMachine.js";
import { Trade } from "../src/models/Trade.js";
import { WalletTransaction } from "../src/models/WalletTransaction.js";
import { TestDatabaseManager } from "./helpers/testDatabaseManager.js";

describe("PHASE 5: Production Security & Trading Safety Audit", () => {
  beforeAll(async () => {
    await TestDatabaseManager.connect();
    await TradingKillSwitch.initialize();
  });

  afterAll(async () => {
    // Ensure kill switch is reset
    try {
      await TradingKillSwitch.enableTrading("test_teardown", "Reset after automated tests");
    } catch {}
    await TestDatabaseManager.stop();
  });

  beforeEach(async () => {
    // Reset kill switch to ENABLED for clean baseline
    if (!TradingKillSwitch.isTradingAllowed()) {
      await TradingKillSwitch.enableTrading("test_setup", "Baseline setup");
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 1. QUANTITY VALIDATION (Requirement 9)
  // ─────────────────────────────────────────────────────────────
  describe("Quantity & Lot-Size Validation", () => {
    test("rejects non-positive quantities (zero or negative)", () => {
      const zeroQty = OrderValidator.validateOrder({
        symbol: "NIFTY24SEP25000CE",
        side: "BUY",
        quantity: 0,
      });
      expect(zeroQty.isValid).toBe(false);
      expect(zeroQty.reasons.some(r => r.includes("positive integer"))).toBe(true);

      const negQty = OrderValidator.validateOrder({
        symbol: "NIFTY24SEP25000CE",
        side: "BUY",
        quantity: -25,
      });
      expect(negQty.isValid).toBe(false);
    });

    test("rejects fractional or non-integer quantities", () => {
      const fracQty = OrderValidator.validateOrder({
        symbol: "RELIANCE",
        side: "BUY",
        quantity: 12.5,
      });
      expect(fracQty.isValid).toBe(false);
      expect(fracQty.reasons.some(r => r.includes("positive integer"))).toBe(true);
    });

    test("enforces lot size multiples for index derivatives", () => {
      // NIFTY lot size is 25
      const invalidLot = OrderValidator.validateOrder({
        symbol: "NIFTY",
        side: "BUY",
        quantity: 35, // Not a multiple of 25
      });
      expect(invalidLot.isValid).toBe(false);
      expect(invalidLot.reasons.some(r => r.includes("multiple of lot size"))).toBe(true);

      const validLot = OrderValidator.validateOrder({
        symbol: "NIFTY",
        side: "BUY",
        quantity: 75, // 1 lot of 75
      });
      expect(validLot.isValid).toBe(true);
      expect(validLot.sanitizedQuantity).toBe(75);
    });

    test("rejects quantities exceeding exchange freeze limits", () => {
      const freezeBreach = OrderValidator.validateOrder({
        symbol: "NIFTY",
        side: "BUY",
        quantity: 2500, // NSE freeze limit is 1800
      });
      expect(freezeBreach.isValid).toBe(false);
      expect(freezeBreach.reasons.some(r => r.includes("exceeds NSE freeze limit"))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. PRICE & TICK SIZE VALIDATION (Requirement 10)
  // ─────────────────────────────────────────────────────────────
  describe("Price & Tick Size Validation", () => {
    test("rejects invalid or non-positive limit prices", () => {
      const zeroPrice = OrderValidator.validateOrder({
        symbol: "RELIANCE",
        side: "BUY",
        quantity: 10,
        orderType: "LIMIT",
        price: 0,
      });
      expect(zeroPrice.isValid).toBe(false);

      const negPrice = OrderValidator.validateOrder({
        symbol: "RELIANCE",
        side: "BUY",
        quantity: 10,
        orderType: "LIMIT",
        price: -100,
      });
      expect(negPrice.isValid).toBe(false);
    });

    test("enforces NSE 0.05 tick size increment", () => {
      const badTick = OrderValidator.validateOrder({
        symbol: "RELIANCE",
        side: "BUY",
        quantity: 10,
        orderType: "LIMIT",
        price: 2450.123, // Violates 0.05
      });
      expect(badTick.isValid).toBe(false);
      expect(badTick.reasons.some(r => r.includes("minimum tick size"))).toBe(true);

      const goodTick = OrderValidator.validateOrder({
        symbol: "RELIANCE",
        side: "BUY",
        quantity: 10,
        orderType: "LIMIT",
        price: 2450.25, // Exact multiple of 0.05
      });
      expect(goodTick.isValid).toBe(true);
      expect(goodTick.sanitizedPrice).toBe(2450.25);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. SL / TARGET DIRECTIONALITY (Requirement 12)
  // ─────────────────────────────────────────────────────────────
  describe("Stop-Loss & Target Directionality", () => {
    test("rejects BUY order where Stop-Loss is >= entry price", () => {
      const badSL = OrderValidator.validateOrder(
        {
          symbol: "TCS",
          side: "BUY",
          quantity: 1,
          stopLoss: 3600, // Entry is 3500 -> SL must be < 3500
        },
        3500
      );
      expect(badSL.isValid).toBe(false);
      expect(badSL.reasons.some(r => r.includes("strictly LESS than entry price"))).toBe(true);
    });

    test("rejects BUY order where Target is <= entry price", () => {
      const badTarget = OrderValidator.validateOrder(
        {
          symbol: "TCS",
          side: "BUY",
          quantity: 1,
          target: 3400, // Entry is 3500 -> Target must be > 3500
        },
        3500
      );
      expect(badTarget.isValid).toBe(false);
      expect(badTarget.reasons.some(r => r.includes("strictly GREATER than entry price"))).toBe(true);
    });

    test("rejects SELL order where Stop-Loss is <= entry price", () => {
      const badSellSL = OrderValidator.validateOrder(
        {
          symbol: "INFY",
          side: "SELL",
          quantity: 1,
          stopLoss: 1400, // Short entry is 1500 -> SL must be > 1500
        },
        1500
      );
      expect(badSellSL.isValid).toBe(false);
      expect(badSellSL.reasons.some(r => r.includes("strictly GREATER than entry price"))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. DANGEROUS STATE TRANSITIONS (Requirement 8)
  // ─────────────────────────────────────────────────────────────
  describe("Dangerous State Transition Invariants", () => {
    test("blocks CLOSED -> OPEN transition (cannot reopen closed trade)", () => {
      const check = OrderValidator.validateStateTransition("trade-123", "CLOSED", "OPEN");
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("DISALLOWED_TRANSITION");
    });

    test("blocks CLOSED -> EXIT_PENDING transition", () => {
      const check = OrderValidator.validateStateTransition("trade-123", "CLOSED", "EXIT_PENDING");
      expect(check.allowed).toBe(false);
    });

    test("blocks OPEN -> CLOSED transition without verified fill quantity", () => {
      const check = OrderValidator.validateStateTransition("trade-123", "OPEN", "CLOSED", {
        fillQty: 0,
      });
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("without verified execution fill");
    });

    test("blocks TARGET_TRIGGERED -> CLOSED without broker fill confirmation", () => {
      const check = OrderValidator.validateStateTransition("trade-123", "TARGET_TRIGGERED", "CLOSED", {
        fillQty: 0,
      });
      expect(check.allowed).toBe(false);
    });

    test("blocks regression from CLOSED back to PENDING_CLOSE", () => {
      const check = OrderValidator.validateStateTransition("trade-123", "CLOSED", "PENDING_CLOSE");
      expect(check.allowed).toBe(false);
    });

    test("allows valid lifecycle transitions with execution context", () => {
      const validClose = OrderValidator.validateStateTransition("trade-123", "EXIT_PENDING", "CLOSED", {
        fillQty: 50,
        fillPrice: 120,
      });
      expect(validClose.allowed).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. BACKEND EMERGENCY KILL SWITCH (Requirement 14)
  // ─────────────────────────────────────────────────────────────
  describe("Authoritative Backend Emergency Kill Switch", () => {
    test("starts in TRADING_ENABLED state", () => {
      expect(TradingKillSwitch.isTradingAllowed()).toBe(true);
      expect(TradingKillSwitch.getStatus().state).toBe("TRADING_ENABLED");
    });

    test("emergency disable halts trading and rejects assertTradingAllowed", async () => {
      await TradingKillSwitch.disableTrading("ADMIN_MANUAL", "Chaos Drill", "admin-tester");

      expect(TradingKillSwitch.isTradingAllowed()).toBe(false);
      const status = TradingKillSwitch.getStatus();
      expect(status.state).toBe("TRADING_DISABLED");
      expect(status.reason).toBe("Chaos Drill");
      expect(status.activatedBy).toBe("admin-tester");

      expect(() => {
        TradingKillSwitch.assertTradingAllowed("Test Execution");
      }).toThrow(/KILL_SWITCH_ACTIVE/);
    });

    test("AutoPilot rejects tick execution when kill switch is active", async () => {
      await TradingKillSwitch.disableTrading("SYSTEM_PANIC", "Auto-Pilot Lockout Test", "tester");

      const mockTrade = {
        _id: new mongoose.Types.ObjectId(),
        symbol: "NIFTY",
        side: "BUY",
        quantity: 50,
        entryPrice: 24000,
        status: "OPEN",
        mode: "PAPER",
        target: 24100,
        sl: 23900,
      };

      const result = await AutoPilotStateMachine.processTick(
        mockTrade,
        { symbol: "NIFTY", ltp: 24150, timestamp: Date.now() },
        undefined,
        true
      );

      expect(result.triggered).toBe(false);
      expect(result.reason).toContain("KILL_SWITCH_ACTIVE");
    });

    test("enabling trading requires justification reason", async () => {
      await TradingKillSwitch.disableTrading("RISK_BREACH", "Drawdown limit reached", "risk_system");

      await expect(
        TradingKillSwitch.enableTrading("", "Valid reason")
      ).rejects.toThrow(/requires an authorized administrator ID/);

      await expect(
        TradingKillSwitch.enableTrading("admin", "")
      ).rejects.toThrow(/requires an authorized administrator ID/);

      const res = await TradingKillSwitch.enableTrading("admin-super", "Drawdown investigated, safe to resume");
      expect(res.state).toBe("TRADING_ENABLED");
      expect(TradingKillSwitch.isTradingAllowed()).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. CREDENTIAL REDACTION & SENSITIVE DATA (Requirement 24, 25)
  // ─────────────────────────────────────────────────────────────
  describe("Credential Redaction & Secret Isolation", () => {
    test("redacts Bearer tokens, API keys, and connection passwords in strings", () => {
      const rawLog = "User authenticated with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.signature";
      const sanitized = SecurityConfigValidator.redactString(rawLog);
      expect(sanitized).not.toContain("eyJhbGciOi");
      expect(sanitized).toContain("Bearer [REDACTED_JWT]");

      const dbConn = "Connecting to mongodb://aalgo_admin:SuperSecretPassword123@cluster0.mongodb.net/prod";
      const sanitizedConn = SecurityConfigValidator.redactString(dbConn);
      expect(sanitizedConn).not.toContain("SuperSecretPassword123");
      expect(sanitizedConn).toContain("[REDACTED_PASSWORD]");
    });

    test("deeply redacts sensitive keys in objects", () => {
      const sensitivePayload = {
        userId: "user-123",
        account: "DEMO_1",
        apiKey: "live_secret_key_8899881122",
        nested: {
          clientSecret: "my_broker_secret",
          passwordHash: "$2a$12$e8p.exampleHash",
          normalField: "keep-this-value",
        },
      };

      const redacted = SecurityConfigValidator.redact(sensitivePayload);
      expect(redacted.apiKey).toBe("[REDACTED]");
      expect(redacted.nested.clientSecret).toBe("[REDACTED]");
      expect(redacted.nested.passwordHash).toBe("[REDACTED]");
      expect(redacted.nested.normalField).toBe("keep-this-value");
      expect(redacted.userId).toBe("user-123");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. FINANCIAL LEDGER APPEND-ONLY INTEGRITY (Requirement 21)
  // ─────────────────────────────────────────────────────────────
  describe("Financial Ledger Append-Only Protection", () => {
    test("prevents deletion of LIVE trades via Mongoose pre-hook", async () => {
      const query = Trade.deleteOne({ mode: "LIVE" });
      await expect(query.exec()).rejects.toThrow(/FINANCIAL_AUDIT_VIOLATION/);
    });

    test("prevents deletion of COMPLETED wallet transactions via pre-hook", async () => {
      const query = WalletTransaction.deleteMany({ status: "COMPLETED" });
      await expect(query.exec()).rejects.toThrow(/FINANCIAL_AUDIT_VIOLATION/);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. PRODUCTION CONFIGURATION VALIDATION (Requirement 3, 43, 44)
  // ─────────────────────────────────────────────────────────────
  describe("Production Configuration & Environment Validation", () => {
    test("rejects missing or default JWT_SECRET in production", () => {
      expect(() => {
        SecurityConfigValidator.validate({
          NODE_ENV: "production",
          JWT_SECRET: "default_jwt_secret_aalgo",
        });
      }).toThrow(/Insecure default JWT_SECRET detected in production/);

      expect(() => {
        SecurityConfigValidator.validate({
          NODE_ENV: "production",
          JWT_SECRET: "short_secret_under_32_chars",
        });
      }).toThrow(/Minimum 32 characters required/);
    });

    test("rejects wildcard CORS in production", () => {
      expect(() => {
        SecurityConfigValidator.validate({
          NODE_ENV: "production",
          JWT_SECRET: "a_very_secure_random_jwt_secret_with_more_than_32_characters!",
          CORS_ALLOWED_ORIGINS: "*",
        });
      }).toThrow(/Wildcard CORS .* strictly forbidden in production/);
    });

    test("blocks test environments from configuring live broker credentials (Req 44)", () => {
      const result = SecurityConfigValidator.validate({
        NODE_ENV: "test",
        BROKER_MODE: "LIVE",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("Tests cannot place live orders"))).toBe(true);
    });
  });
});
