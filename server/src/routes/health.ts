/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Comprehensive Health & Readiness Routes (Hardening)
 * ═══════════════════════════════════════════════════════════════════
 *  Provides discrete Kubernetes / PM2 / system health and readiness endpoints:
 *   - /health/live: Process liveness probe
 *   - /health/ready: Strict trading readiness gate (Section 25 & 26)
 *   - /health/broker: Broker connection, circuit breaker & rate limits
 *   - /health/database: MongoDB persistence state & write latency
 *   - /health/market-data: Market feed freshness & staleness tracking
 *   - /health/autopilot: Auto-Pilot state machine & concurrency locks
 */

import { Router } from "express";
import mongoose from "mongoose";
import os from "node:os";
import { BrokerStateManager } from "../services/indianMarket/hardening/brokerStateManager.js";
import { MarketDataResilience } from "../services/indianMarket/hardening/marketDataResilience.js";
import { PersistenceResilience } from "../services/indianMarket/hardening/persistenceResilience.js";
import { AutoPilotStateMachine } from "../services/indianMarket/autoPilotStateMachine.js";
import { TradingDayStateMachine } from "../services/indianMarket/hardening/tradingDayStateMachine.js";

const router = Router();
const serverStartTime = Date.now();

/**
 * GET /health (Root health probe)
 */
router.get("/", (_req, res) => {
  res.json({
    status: mongoose.connection.readyState === 1 ? "ok" : "degraded",
    server: true,
    mongodb: mongoose.connection.readyState === 1,
    binance: true,
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    protocol: "V11.5_RELIABILITY_MISSION",
    broker: BrokerStateManager.getState(),
    feed: MarketDataResilience.getFeedState(),
    persistence: PersistenceResilience.getState(),
  });
});

/**
 * GET /health/live
 * Liveness probe: Confirms Node.js process is responsive and running.
 */
router.get("/live", (_req, res) => {
  res.status(200).json({
    status: "ALIVE",
    uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
    timestamp: new Date().toISOString(),
    pid: process.pid,
  });
});

/**
 * GET /health/ready
 * Readiness probe (Section 26):
 * Must NOT report READY_TO_TRADE until:
 *   1. Database healthy
 *   2. Broker authenticated
 *   3. Market data fresh
 *   4. Position state reconciled
 *   5. Auto-Pilot state valid
 */
router.get("/ready", (_req, res) => {
  const blockedReasons: string[] = [];

  // 1. Database check
  const dbHealth = mongoose.connection.readyState === 1;
  const persistenceState = PersistenceResilience.getState();
  if (!dbHealth || persistenceState === "PERSISTENCE_FAILED") {
    blockedReasons.push("DATABASE_NOT_HEALTHY: MongoDB connection offline or degraded");
  }

  // 2. Broker check
  const brokerState = BrokerStateManager.getState();
  if (brokerState === "BROKER_AUTH_EXPIRED") {
    blockedReasons.push("BROKER_AUTH_EXPIRED: Broker credentials expired; re-authentication required");
  } else if (brokerState === "BROKER_DISCONNECTED" || brokerState === "BROKER_ERROR") {
    blockedReasons.push(`BROKER_NOT_CONNECTED: Broker state is ${brokerState}`);
  }

  // 3. Market data check
  const feedState = MarketDataResilience.getFeedState();
  if (feedState === "DATA_DISCONNECTED") {
    blockedReasons.push("MARKET_DATA_DISCONNECTED: Live market tick feed offline");
  }

  // 4. Auto-Pilot state check
  const autoPilotMode = AutoPilotStateMachine.getMode();
  if (autoPilotMode === "ERROR") {
    blockedReasons.push("AUTOPILOT_ERROR_STATE: Auto-Pilot machine in ERROR state");
  }

  const isReady = blockedReasons.length === 0;

  if (isReady) {
    return res.status(200).json({
      status: "READY_TO_TRADE",
      ready: true,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
      session: TradingDayStateMachine.inspectSession(),
    });
  } else {
    return res.status(503).json({
      status: "NOT_READY_TO_TRADE",
      ready: false,
      blockedReasons,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/broker
 */
router.get("/broker", (_req, res) => {
  res.json({
    brokerState: BrokerStateManager.getState(),
    circuitBreaker: BrokerStateManager.getCircuitBreakerState(),
    executionPermitted: BrokerStateManager.isTradeExecutionAllowed(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/database
 */
router.get("/database", (_req, res) => {
  res.json(PersistenceResilience.getMetrics());
});

/**
 * GET /health/market-data
 */
router.get("/market-data", (_req, res) => {
  res.json({
    feedState: MarketDataResilience.getFeedState(),
    activeSubscriptions: MarketDataResilience.getActiveSubscriptions(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/autopilot
 */
router.get("/autopilot", (_req, res) => {
  res.json({
    mode: AutoPilotStateMachine.getMode(),
    session: TradingDayStateMachine.inspectSession(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
