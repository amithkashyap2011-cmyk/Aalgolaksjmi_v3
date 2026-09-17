/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Production Architecture Hardening & Chaos Test Suite
 * ═══════════════════════════════════════════════════════════════════
 *  Exhaustive verification of high reliability, fast recovery,
 *  zero state corruption, and safe trading under system failures.
 */

import { jest } from "@jest/globals";
import { BrokerStateManager } from "../src/services/indianMarket/hardening/brokerStateManager.js";
import { MarketDataResilience } from "../src/services/indianMarket/hardening/marketDataResilience.js";
import { PersistenceResilience } from "../src/services/indianMarket/hardening/persistenceResilience.js";
import { DistributedCoordinator } from "../src/services/indianMarket/hardening/distributedCoordinator.js";
import { TradingDayStateMachine } from "../src/services/indianMarket/hardening/tradingDayStateMachine.js";
import {
  ReconciliationOrchestrator,
  DeadLetterQueue,
} from "../src/services/indianMarket/hardening/reconciliationOrchestrator.js";
import { RetryEngine } from "../src/services/indianMarket/hardening/retryEngine.js";
import { AutoPilotStateMachine, TickData } from "../src/services/indianMarket/autoPilotStateMachine.js";
import { AuthoritativeLedger } from "../src/services/indianMarket/authoritativeLedger.js";
import { BrokerAdapter } from "../src/services/indianMarket/brokerAdapter.js";

describe("PHASE 4 — Production Architecture Hardening & Chaos Verification", () => {
  beforeEach(() => {
    // Reset state managers before each test
    BrokerStateManager.reset();
    MarketDataResilience.reset();
    PersistenceResilience.setPersistenceState("PERSISTENCE_HEALTHY");
    DeadLetterQueue.clear();
    AutoPilotStateMachine.setMode("AUTO");
  });

  // ─── 1. MARKET DATA DISCONNECT & STALENESS (Req 2 & 22) ───────────
  describe("1. Market-Data Disconnect & Freshness Enforcement", () => {
    test("Market data disconnect immediately marks feed as DATA_DISCONNECTED", () => {
      MarketDataResilience.recordTick("NIFTY26SEP24500CE", 120.5, Date.now());
      expect(MarketDataResilience.getFeedState()).toBe("DATA_FRESH");

      MarketDataResilience.onDisconnect("WebSocket connection abruptly terminated by gateway");
      expect(MarketDataResilience.getFeedState()).toBe("DATA_DISCONNECTED");

      const check = MarketDataResilience.isTickFreshForTrading("NIFTY26SEP24500CE", Date.now());
      expect(check.valid).toBe(false);
      expect(check.reason).toContain("FEED_DISCONNECTED");
    });

    test("Stale ticks (> 5000ms old) are strictly rejected for trading decisions", () => {
      MarketDataResilience.recordTick("NIFTY26SEP24500CE", 125.0, Date.now() - 10000); // 10s old
      const check = MarketDataResilience.isTickFreshForTrading("NIFTY26SEP24500CE", Date.now() - 10000);
      expect(check.valid).toBe(false);
      expect(check.reason).toContain("TICK_STALE");
    });

    test("Fresh valid tick restores feed to DATA_FRESH and is accepted", () => {
      MarketDataResilience.onDisconnect("Network partition");
      expect(MarketDataResilience.getFeedState()).toBe("DATA_DISCONNECTED");

      const freshTimestamp = Date.now();
      MarketDataResilience.recordTick("NIFTY26SEP24500CE", 130.0, freshTimestamp);

      expect(MarketDataResilience.getFeedState()).toBe("DATA_FRESH");
      const check = MarketDataResilience.isTickFreshForTrading("NIFTY26SEP24500CE", freshTimestamp);
      expect(check.valid).toBe(true);
    });

    test("UI latest-value coalescing backpressure holds only latest snapshot", () => {
      MarketDataResilience.recordTick("NIFTY26SEP24500CE", 100.0, Date.now() - 50);
      MarketDataResilience.recordTick("NIFTY26SEP24500CE", 101.5, Date.now() - 30);
      MarketDataResilience.recordTick("NIFTY26SEP24500CE", 103.0, Date.now());

      const uiSnapshot = MarketDataResilience.getCoalescedUIValues();
      expect(uiSnapshot["NIFTY26SEP24500CE"].ltp).toBe(103.0);
    });
  });

  // ─── 2. BROKER API STATE MACHINE, AUTH EXPIRY & PRIORITY (Req 4, 5, 20, 21) ──
  describe("2. Broker API Resilience, Circuit Breakers & Auth Expiration", () => {
    test("Consecutive failures trip circuit breaker to OPEN and state to BROKER_DISCONNECTED", () => {
      expect(BrokerStateManager.getState()).toBe("BROKER_CONNECTED");
      expect(BrokerStateManager.getCircuitBreaker()).toBe("CLOSED");

      // Record 4 transient failures (threshold is 4)
      for (let i = 0; i < 4; i++) {
        BrokerStateManager.recordFailure(new Error("Connection timeout to broker endpoint"));
      }

      expect(BrokerStateManager.getState()).toBe("BROKER_DISCONNECTED");
      expect(BrokerStateManager.getCircuitBreaker()).toBe("OPEN");
      // Execution must be blocked
      expect(BrokerStateManager.isTradeExecutionAllowed(true)).toBe(false);
    });

    test("Session authentication expiration immediately trips to BROKER_AUTH_EXPIRED and ceases retries", () => {
      const authErr = new Error("TokenException: User session expired or invalid API key [SECRET_KEY_ABC123]");
      BrokerStateManager.recordFailure(authErr);

      expect(BrokerStateManager.getState()).toBe("BROKER_AUTH_EXPIRED");
      expect(BrokerStateManager.getCircuitBreaker()).toBe("OPEN");
      expect(BrokerStateManager.isTradeExecutionAllowed(true)).toBe(false);
    });

    test("Credentials and secret tokens are redacted from sanitized error messages", () => {
      const sensitiveErr = new Error("Unauthorized request with token: my_secret_jwt_token_999 and apiKey: secret_api_key_123");
      BrokerStateManager.recordFailure(sensitiveErr);

      const status = BrokerStateManager.getStatus();
      expect(status.lastError).not.toContain("my_secret_jwt_token_999");
      expect(status.lastError).not.toContain("secret_api_key_123");
      expect(status.lastError).toContain("[REDACTED]");
    });

    test("Priority queue dispatches CRITICAL_EXIT ahead of MARKET_QUOTE and BACKGROUND_SYNC", async () => {
      const executionOrder: string[] = [];

      const p1 = BrokerStateManager.enqueueRequest("BACKGROUND_SYNC", async () => {
        executionOrder.push("SYNC");
        return "SYNC";
      });

      const p2 = BrokerStateManager.enqueueRequest("MARKET_QUOTE", async () => {
        executionOrder.push("QUOTE");
        return "QUOTE";
      });

      const p3 = BrokerStateManager.enqueueRequest("CRITICAL_EXIT", async () => {
        executionOrder.push("CRITICAL_EXIT");
        return "CRITICAL_EXIT";
      });

      await Promise.all([p1, p2, p3]);

      // CRITICAL_EXIT must be executed before SYNC
      expect(executionOrder.indexOf("CRITICAL_EXIT")).toBeLessThan(executionOrder.indexOf("SYNC"));
    });
  });

  // ─── 3. DATABASE & PERSISTENCE RESILIENCE (Req 6 & 7) ──────────────
  describe("3. Database Resilience & Fail-Closed Financial Persistence", () => {
    test("Financial write throws PERSISTENCE_FAILED when database is down, never reporting false success", async () => {
      PersistenceResilience.setPersistenceState("PERSISTENCE_FAILED");

      await expect(
        PersistenceResilience.executeFinancialWrite(async () => {
          return { success: true };
        }, "POST_TRADE_LEDGER_UPDATE")
      ).rejects.toThrow("PERSISTENCE_FAILED");
    });

    test("Successful financial write returns result and records latency metric", async () => {
      PersistenceResilience.setPersistenceState("PERSISTENCE_HEALTHY");

      const result = await PersistenceResilience.executeFinancialWrite(async () => {
        return { balance: 500000 };
      }, "WALLET_UPDATE");

      expect(result.balance).toBe(500000);
      const metrics = PersistenceResilience.getMetrics();
      expect(metrics.state).toBe("PERSISTENCE_HEALTHY");
      expect(metrics.totalWrites).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── 4. ORDER IDEMPOTENCY & MULTI-INSTANCE MUTUAL EXCLUSION (Req 8, 9, 10) ─
  describe("4. Distributed Coordination, Concurrency Locks & Persistent Idempotency", () => {
    test("Generates deterministic idempotency key", () => {
      const key = DistributedCoordinator.generateIdempotencyKey("ACC_001", "TRADE_101", "TARGET_EXIT", 1);
      expect(key).toBe("ACC_001:TRADE_101:TARGET_EXIT:v1");
    });

    test("Multi-Instance Mutual Exclusion: Instance A acquires lock, Instance B is denied", async () => {
      const resource = "LOCK:POSITION:TRADE_101";

      // Instance A attempts lock
      const lockA = await DistributedCoordinator.acquireLock(resource, 5000, "INSTANCE_A");
      expect(lockA).toBe(true);

      // Instance B attempts same lock simultaneously
      const lockB = await DistributedCoordinator.acquireLock(resource, 5000, "INSTANCE_B");
      expect(lockB).toBe(false); // DENIED! Instance B cannot execute simultaneously

      // Instance A releases lock
      const released = await DistributedCoordinator.releaseLock(resource, "INSTANCE_A");
      expect(released).toBe(true);

      // Now Instance B can acquire
      const lockB2 = await DistributedCoordinator.acquireLock(resource, 5000, "INSTANCE_B");
      expect(lockB2).toBe(true);

      await DistributedCoordinator.releaseLock(resource, "INSTANCE_B");
    });

    test("Persistent Idempotency: duplicate intent registration is rejected", async () => {
      const idempotencyKey = "ACC_999:TRADE_555:TARGET_EXIT:v1";

      const firstAttempt = await DistributedCoordinator.registerOrderIntent(idempotencyKey, {
        tradeId: "TRADE_555",
        accountId: "ACC_999",
        action: "TARGET_EXIT",
      });
      expect(firstAttempt.isNew).toBe(true);

      const secondAttempt = await DistributedCoordinator.registerOrderIntent(idempotencyKey, {
        tradeId: "TRADE_555",
        accountId: "ACC_999",
        action: "TARGET_EXIT",
      });
      expect(secondAttempt.isNew).toBe(false); // Blocked duplicate intent!
    });
  });

  // ─── 5. AUTOPILOT HARDENING UNDER SYSTEM DEGRADATION ───────────────
  describe("5. Auto-Pilot Fail-Safe Behavior Under Failure Modes", () => {
    test("Auto-Pilot blocks execution when LIVE broker is DISCONNECTED", async () => {
      BrokerStateManager.recordFailure(new Error("Broker Gateway 502 Bad Gateway"));
      BrokerStateManager.recordFailure(new Error("Broker Gateway 502 Bad Gateway"));
      BrokerStateManager.recordFailure(new Error("Broker Gateway 502 Bad Gateway"));
      BrokerStateManager.recordFailure(new Error("Broker Gateway 502 Bad Gateway"));
      expect(BrokerStateManager.getState()).toBe("BROKER_DISCONNECTED");

      const mockLiveTrade = {
        _id: "TRADE_LIVE_001",
        symbol: "NIFTY26SEP24500CE",
        mode: "LIVE",
        side: "BUY",
        entryPrice: 100,
        tp: 150,
        sl: 80,
        quantity: 50,
        status: "OPEN",
      };

      const tick: TickData = {
        symbol: "NIFTY26SEP24500CE",
        ltp: 160, // Above target!
        timestamp: Date.now(),
      };

      const result = await AutoPilotStateMachine.processTick(mockLiveTrade, tick);
      expect(result.triggered).toBe(false);
      expect(result.reason).toContain("BROKER_UNAVAILABLE");
    });

    test("Auto-Pilot blocks execution when market data feed is stale", async () => {
      BrokerStateManager.reset();
      MarketDataResilience.onDisconnect("WebSocket feed dropped");

      const mockTrade = {
        _id: "TRADE_STALE_001",
        symbol: "NIFTY26SEP24500CE",
        mode: "PAPER",
        side: "BUY",
        entryPrice: 100,
        tp: 150,
        sl: 80,
        quantity: 50,
        status: "OPEN",
      };

      const tick: TickData = {
        symbol: "NIFTY26SEP24500CE",
        ltp: 160,
        timestamp: Date.now(),
      };

      const result = await AutoPilotStateMachine.processTick(mockTrade, tick);
      expect(result.triggered).toBe(false);
      expect(result.reason).toContain("FEED_DISCONNECTED");
    });
  });

  // ─── 6. TRADING-DAY STATE MACHINE & NSE CALENDAR (Req 11, 12, 13) ──
  describe("6. Trading-Day State Machine & Exchange Calendar", () => {
    test("Authoritative NSE holidays (e.g. Republic Day 2026-01-26) are recognized as non-trading days", () => {
      const repDay = new Date("2026-01-26T10:00:00.000Z"); // Republic Day
      const isTrading = TradingDayStateMachine.isTradingDay(repDay);
      expect(isTrading).toBe(false);

      const holiday = TradingDayStateMachine.getExchangeHoliday(repDay);
      expect(holiday).toBeDefined();
      expect(holiday?.description).toContain("Republic Day");
    });

    test("Weekends are recognized as non-trading days", () => {
      const sunday = new Date("2026-09-13T10:00:00.000Z"); // Sunday
      expect(TradingDayStateMachine.isTradingDay(sunday)).toBe(false);
    });

    test("Startup session recovery accurately maps current time to session phase", () => {
      // 09:14 IST -> PRE_MARKET (03:44 UTC)
      const t0914 = new Date("2026-09-11T03:44:00.000Z");
      expect(TradingDayStateMachine.determineSessionPhase(t0914)).toBe("PRE_MARKET");

      // 09:15 IST -> MARKET_OPEN (03:45 UTC)
      const t0915 = new Date("2026-09-11T03:45:00.000Z");
      expect(TradingDayStateMachine.determineSessionPhase(t0915)).toBe("MARKET_OPEN");

      // 10:00 IST -> MARKET_ACTIVE (04:30 UTC)
      const t1000 = new Date("2026-09-11T04:30:00.000Z");
      expect(TradingDayStateMachine.determineSessionPhase(t1000)).toBe("MARKET_ACTIVE");

      // 15:20 IST -> PRE_CLOSE (09:50 UTC)
      const t1520 = new Date("2026-09-11T09:50:00.000Z");
      expect(TradingDayStateMachine.determineSessionPhase(t1520)).toBe("PRE_CLOSE");

      // 15:31 IST -> MARKET_CLOSED (10:01 UTC)
      const t1531 = new Date("2026-09-11T10:01:00.000Z");
      expect(TradingDayStateMachine.determineSessionPhase(t1531)).toBe("MARKET_CLOSED");
    });
  });

  // ─── 7. RECONCILIATION, STALE POSITIONS & DEAD-LETTER QUEUE (Req 15-18, 24) ─
  describe("7. Reconciliation Orchestrator, Orphan Orders & Dead-Letter Queue", () => {
    test("Detects quantity and price mismatches between local ledger and broker positions", () => {
      const localPositions = [
        { symbol: "NIFTY26SEP24500CE", quantity: 100, averagePrice: 150.0 },
        { symbol: "BANKNIFTY26SEP52000CE", quantity: 30, averagePrice: 420.0 },
      ];

      const brokerPositions = [
        { symbol: "NIFTY26SEP24500CE", quantity: 75, averagePrice: 150.0 }, // Qty mismatch!
        { symbol: "BANKNIFTY26SEP52000CE", quantity: 30, averagePrice: 425.0 }, // Price mismatch!
      ];

      const discrepancies = ReconciliationOrchestrator.reconcilePositions(localPositions, brokerPositions);
      expect(discrepancies.length).toBe(2);

      const qtyDisc = discrepancies.find((d) => d.type === "QUANTITY_MISMATCH");
      expect(qtyDisc).toBeDefined();
      expect(qtyDisc?.localQty).toBe(100);
      expect(qtyDisc?.brokerQty).toBe(75);

      const priceDisc = discrepancies.find((d) => d.type === "PRICE_MISMATCH");
      expect(priceDisc).toBeDefined();
    });

    test("Detects orphan broker orders referencing non-existent local positions", () => {
      const openLocalPositions = ["NIFTY26SEP24500CE"];
      const brokerOrders = [
        { orderId: "ORD_001", symbol: "NIFTY26SEP24500CE", quantity: 50, status: "OPEN" },
        { orderId: "ORD_002", symbol: "ORPHAN_SYMBOL_CE", quantity: 25, status: "OPEN" }, // Orphan!
      ];

      const orphans = ReconciliationOrchestrator.detectOrphanOrders(brokerOrders, openLocalPositions);
      expect(orphans.length).toBe(1);
      expect(orphans[0].orderId).toBe("ORD_002");
    });

    test("Dead-Letter Queue captures failed events and preserves diagnostic context", () => {
      DeadLetterQueue.capture(
        "EXIT_ORDER",
        { tradeId: "TRADE_ERR_100", symbol: "NIFTY26SEP24500CE" },
        "Broker API timeout during panic close",
        "HIGH"
      );

      const items = DeadLetterQueue.getAll();
      expect(items.length).toBe(1);
      expect(items[0].eventType).toBe("EXIT_ORDER");
      expect(items[0].severity).toBe("HIGH");
      expect(items[0].error).toContain("timeout");

      const stats = DeadLetterQueue.getStats();
      expect(stats.total).toBe(1);
      expect(stats.pending).toBe(1);
    });
  });

  // ─── 8. RETRY ENGINE CLASSIFICATION (Req 19) ──────────────────────
  describe("8. Retry Engine Classification & Jittered Backoff", () => {
    test("Classifies idempotent read operations as SAFE_TO_RETRY", () => {
      const classification = RetryEngine.classifyError(new Error("Network socket reset"), "BROKER_GET_POSITIONS");
      expect(classification).toBe("SAFE_TO_RETRY");
    });

    test("Classifies market orders and financial writes as REQUIRES_RECONCILIATION", () => {
      const classification = RetryEngine.classifyError(new Error("ETIMEDOUT"), "PLACE_MARKET_ORDER");
      expect(classification).toBe("REQUIRES_RECONCILIATION");
    });

    test("Calculates exponential backoff with upper bound", () => {
      const backoff1 = RetryEngine.calculateBackoff(1);
      const backoff3 = RetryEngine.calculateBackoff(3);
      expect(backoff3).toBeGreaterThan(backoff1);
      expect(backoff3).toBeLessThanOrEqual(30000);
    });
  });
});
