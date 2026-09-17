/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Market Data Resilience & Staleness Guard (Hardening)
 * ═══════════════════════════════════════════════════════════════════
 *  Guarantees Auto-Pilot never makes trading or exit decisions using
 *  stale or disconnected market data feeds. Implements tick freshness
 *  tracking, exponential backoff reconnects, snapshot re-verification,
 *  and UI latest-value coalescing backpressure.
 */

import { IndianAuditLogger } from "../auditLogger.js";

export type MarketDataFeedState = "DATA_FRESH" | "DATA_STALE" | "DATA_DISCONNECTED";

export interface SymbolDataHealth {
  symbol: string;
  lastTickTimestamp: number;
  lastReceivedAt: number;
  lastLtp: number;
  isStale: boolean;
}

export class MarketDataResilience {
  private static feedState: MarketDataFeedState = "DATA_FRESH";
  private static MAX_STALE_AGE_MS = 5000; // 5s threshold
  private static symbolHealth = new Map<string, SymbolDataHealth>();
  private static disconnectTimestamp: number | null = null;
  private static reconnectAttempts = 0;
  private static activeSubscriptions = new Set<string>();

  // Coalescing buffer for UI backpressure
  private static uiCoalesceBuffer = new Map<string, { ltp: number; timestamp: number }>();
  private static uiFlushInterval: NodeJS.Timeout | null = null;
  private static uiBroadcastCallback: ((symbol: string, ltp: number, timestamp: number) => void) | null = null;

  public static getFeedState(): MarketDataFeedState {
    this.evaluateGlobalStaleness();
    return this.feedState;
  }

  public static setFeedState(newState: MarketDataFeedState, reason?: string): void {
    if (this.feedState === newState) return;
    const prev = this.feedState;
    this.feedState = newState;

    if (newState === "DATA_DISCONNECTED") {
      this.disconnectTimestamp = Date.now();
    } else if (newState === "DATA_FRESH") {
      this.disconnectTimestamp = null;
      this.reconnectAttempts = 0;
    }

    IndianAuditLogger.log({
      eventType: "MARKET_DATA_STATE_CHANGED",
      details: { previousState: prev, newState, reason: reason || "" },
      reason: `Market data feed state changed to ${newState}: ${reason || ""}`,
    });
  }

  public static onDisconnect(reason = "Connection lost"): void {
    this.setFeedState("DATA_DISCONNECTED", reason);
  }

  /**
   * Subscribes an instrument to active staleness monitoring
   */
  public static registerSubscription(symbol: string): void {
    this.activeSubscriptions.add(symbol);
  }

  public static unregisterSubscription(symbol: string): void {
    this.activeSubscriptions.delete(symbol);
    this.symbolHealth.delete(symbol);
    this.uiCoalesceBuffer.delete(symbol);
  }

  public static getActiveSubscriptions(): string[] {
    return Array.from(this.activeSubscriptions);
  }

  /**
   * Ingests a new tick and updates freshness tracking
   */
  public static recordTick(symbol: string, ltp: number, tickTimestamp: number): void {
    const now = Date.now();
    const age = now - (tickTimestamp || now);

    const isStale = age > this.MAX_STALE_AGE_MS;

    this.symbolHealth.set(symbol, {
      symbol,
      lastTickTimestamp: tickTimestamp,
      lastReceivedAt: now,
      lastLtp: ltp,
      isStale,
    });

    if (this.feedState === "DATA_DISCONNECTED" || this.feedState === "DATA_STALE") {
      if (!isStale) {
        this.setFeedState("DATA_FRESH", `Fresh tick received for ${symbol}`);
      }
    }

    // Coalesce for UI stream backpressure
    this.uiCoalesceBuffer.set(symbol, { ltp, timestamp: tickTimestamp });
  }

  /**
   * Validates whether a tick is fresh and trustworthy for execution decisions
   */
  public static isTickFreshForTrading(
    symbol: string,
    tickTimestamp?: number
  ): { valid: boolean; reason?: string } {
    if (this.feedState === "DATA_DISCONNECTED") {
      return {
        valid: false,
        reason: "FEED_DISCONNECTED: Market data WebSocket connection lost. Orders preserved, new decisions blocked.",
      };
    }

    const health = this.symbolHealth.get(symbol);
    const now = Date.now();

    // Check specific timestamp if supplied
    if (tickTimestamp !== undefined) {
      const age = now - tickTimestamp;
      if (age > this.MAX_STALE_AGE_MS) {
        return {
          valid: false,
          reason: `TICK_STALE: Tick timestamp is ${age}ms old (max allowed ${this.MAX_STALE_AGE_MS}ms)`,
        };
      }
    }

    // Check recorded health
    if (health) {
      const receivedAge = now - health.lastReceivedAt;
      if (receivedAge > this.MAX_STALE_AGE_MS) {
        health.isStale = true;
        return {
          valid: false,
          reason: `DATA_FEED_STALLED: Last tick received for ${symbol} was ${receivedAge}ms ago`,
        };
      }
    }

    return { valid: true };
  }

  public static getCoalescedUIValues(): Record<string, { ltp: number; timestamp: number }> {
    const result: Record<string, { ltp: number; timestamp: number }> = {};
    for (const [sym, data] of this.uiCoalesceBuffer.entries()) {
      result[sym] = data;
    }
    return result;
  }

  /**
   * Evaluates staleness across all subscribed symbols
   */
  public static evaluateGlobalStaleness(): void {
    if (this.activeSubscriptions.size === 0) return;
    const now = Date.now();

    let staleCount = 0;
    for (const sym of this.activeSubscriptions) {
      const health = this.symbolHealth.get(sym);
      if (!health || now - health.lastReceivedAt > this.MAX_STALE_AGE_MS) {
        staleCount++;
        if (health) health.isStale = true;
      }
    }

    if (staleCount === this.activeSubscriptions.size && this.activeSubscriptions.size > 0) {
      if (this.feedState === "DATA_FRESH") {
        this.setFeedState("DATA_STALE", "All active market data feeds have stalled");
      }
    }
  }

  /**
   * Calculates exponential backoff reconnect delay with jitter
   */
  public static getNextReconnectDelayMs(): number {
    this.reconnectAttempts++;
    const base = 500;
    const maxDelay = 15000;
    const delay = Math.min(maxDelay, base * Math.pow(2, this.reconnectAttempts - 1));
    const jitter = Math.floor(Math.random() * 200);
    return delay + jitter;
  }

  /**
   * Configures backpressure UI coalescing callback and begins flush timer
   */
  public static configureUiCoalescing(
    broadcastCb: (symbol: string, ltp: number, timestamp: number) => void,
    flushIntervalMs = 250
  ): void {
    this.uiBroadcastCallback = broadcastCb;
    if (this.uiFlushInterval) clearInterval(this.uiFlushInterval);

    this.uiFlushInterval = setInterval(() => {
      if (this.uiCoalesceBuffer.size === 0 || !this.uiBroadcastCallback) return;
      for (const [sym, data] of this.uiCoalesceBuffer.entries()) {
        this.uiBroadcastCallback(sym, data.ltp, data.timestamp);
      }
      this.uiCoalesceBuffer.clear();
    }, flushIntervalMs);
  }

  public static reset(): void {
    this.resetForTesting();
  }

  public static resetForTesting(): void {
    this.feedState = "DATA_FRESH";
    this.symbolHealth.clear();
    this.activeSubscriptions.clear();
    this.disconnectTimestamp = null;
    this.reconnectAttempts = 0;
    this.uiCoalesceBuffer.clear();
    if (this.uiFlushInterval) {
      clearInterval(this.uiFlushInterval);
      this.uiFlushInterval = null;
    }
  }
}
