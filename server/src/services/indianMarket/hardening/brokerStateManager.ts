/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Broker Resilience & State Manager (Hardening Subsystem)
 * ═══════════════════════════════════════════════════════════════════
 *  Provides production-grade state tracking, 3-state circuit breakers,
 *  session auth expiry isolation, credential redaction, and priority
 *  rate-limit queueing across Indian brokerage interfaces.
 */

import { IndianAuditLogger } from "../auditLogger.js";

export type BrokerConnectionState =
  | "BROKER_CONNECTED"
  | "BROKER_DEGRADED"
  | "BROKER_DISCONNECTED"
  | "BROKER_AUTH_EXPIRED"
  | "BROKER_RATE_LIMITED"
  | "BROKER_ERROR";

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export type RequestPriority = "CRITICAL_EXIT" | "STOP_MODIFY" | "ORDER_CANCEL" | "MARKET_QUOTE" | "BACKGROUND_SYNC";

export interface QueuedBrokerRequest<T = any> {
  id: string;
  priority: RequestPriority;
  action: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  createdAt: number;
  retries: number;
}

export class BrokerStateManager {
  private static state: BrokerConnectionState = "BROKER_CONNECTED";
  private static circuitBreaker: CircuitBreakerState = "CLOSED";
  private static consecutiveFailures = 0;
  private static consecutiveSuccesses = 0;
  private static lastStateChange = Date.now();
  private static lastFailureTime = 0;
  private static breakerCooldownMs = 15000; // 15s cooldown when OPEN
  private static failureThreshold = 3;
  private static successThreshold = 2;

  // Rate Limiting (10 req/s Indian broker ceiling)
  private static tokens = 10;
  private static maxTokens = 10;
  private static refillRatePerSecond = 10;
  private static lastRefill = Date.now();
  private static queue: QueuedBrokerRequest[] = [];
  private static isProcessingQueue = false;

  // Listeners for state changes
  private static stateListeners: Array<(newState: BrokerConnectionState, prev: BrokerConnectionState) => void> = [];

  private static lastErrorMessage = "";

  public static getState(): BrokerConnectionState {
    this.evaluateCircuitBreaker();
    return this.state;
  }

  public static getCircuitBreakerState(): CircuitBreakerState {
    this.evaluateCircuitBreaker();
    return this.circuitBreaker;
  }

  public static getCircuitBreaker(): CircuitBreakerState {
    return this.getCircuitBreakerState();
  }

  public static getStatus(): {
    state: BrokerConnectionState;
    circuitBreaker: CircuitBreakerState;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    lastError: string;
    queueLength: number;
  } {
    return {
      state: this.state,
      circuitBreaker: this.circuitBreaker,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastError: this.lastErrorMessage,
      queueLength: this.queue.length,
    };
  }

  public static onStateChange(listener: (newState: BrokerConnectionState, prev: BrokerConnectionState) => void): () => void {
    this.stateListeners.push(listener);
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== listener);
    };
  }

  public static setState(newState: BrokerConnectionState, reason?: string): void {
    if (this.state === newState) return;
    const prev = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    IndianAuditLogger.log({
      eventType: "BROKER_STATE_CHANGED",
      details: { previousState: prev, newState, reason: reason || "State transition triggered" },
      reason: `Broker operational state changed from ${prev} to ${newState}: ${reason || ""}`,
    });

    for (const listener of this.stateListeners) {
      try {
        listener(newState, prev);
      } catch (err) {
        console.error("[BrokerStateManager] Error in state listener:", err);
      }
    }
  }

  /**
   * Evaluates circuit breaker state based on time and failure counts
   */
  private static evaluateCircuitBreaker(): void {
    const now = Date.now();
    if (this.circuitBreaker === "OPEN") {
      if (now - this.lastFailureTime > this.breakerCooldownMs) {
        this.circuitBreaker = "HALF_OPEN";
        if (this.state === "BROKER_DISCONNECTED" || this.state === "BROKER_ERROR") {
          this.setState("BROKER_DEGRADED", "Circuit breaker entered HALF_OPEN probe mode");
        }
      }
    }
  }

  /**
   * Reports a successful broker call to the circuit breaker
   */
  public static recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses++;

    if (this.circuitBreaker === "HALF_OPEN" && this.consecutiveSuccesses >= this.successThreshold) {
      this.circuitBreaker = "CLOSED";
      this.consecutiveSuccesses = 0;
      this.setState("BROKER_CONNECTED", "Circuit breaker closed after successful probes");
    } else if (this.state === "BROKER_DEGRADED" && this.consecutiveSuccesses >= this.successThreshold) {
      this.setState("BROKER_CONNECTED", "Broker health restored");
    }
  }

  /**
   * Reports a broker error and evaluates trip conditions and auth expiry
   */
  public static recordFailure(error: any): void {
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    const sanitizedError = this.sanitizeErrorMessage(error);
    this.lastErrorMessage = sanitizedError;

    // 1. Detect Auth Expiration
    if (this.isAuthExpirationError(error)) {
      this.circuitBreaker = "OPEN";
      this.setState("BROKER_AUTH_EXPIRED", `Session expired / invalid token: ${sanitizedError}`);
      return;
    }

    // 2. Detect Rate Limiting (HTTP 429)
    if (this.isRateLimitError(error)) {
      this.setState("BROKER_RATE_LIMITED", `Broker rate limit exceeded: ${sanitizedError}`);
      return;
    }

    // 3. General Failure Trip
    if (this.circuitBreaker === "HALF_OPEN") {
      this.circuitBreaker = "OPEN";
      this.setState("BROKER_DISCONNECTED", `Probe request failed during HALF_OPEN: ${sanitizedError}`);
    } else if (this.consecutiveFailures >= this.failureThreshold) {
      this.circuitBreaker = "OPEN";
      this.setState("BROKER_DISCONNECTED", `Consecutive failures (${this.consecutiveFailures}) tripped circuit breaker: ${sanitizedError}`);
    } else {
      this.setState("BROKER_DEGRADED", `Transient broker error (${this.consecutiveFailures}/${this.failureThreshold}): ${sanitizedError}`);
    }
  }

  /**
   * Determines if trade execution is permitted under current broker state
   */
  public static isTradeExecutionAllowed(isExit = false): boolean {
    this.evaluateCircuitBreaker();
    if (this.state === "BROKER_AUTH_EXPIRED" || this.state === "BROKER_ERROR") {
      return false;
    }
    if (this.state === "BROKER_DISCONNECTED" || this.circuitBreaker === "OPEN") {
      return false;
    }
    if (this.state === "BROKER_DEGRADED" || this.circuitBreaker === "HALF_OPEN") {
      // In degraded mode, only critical exits are allowed; new entries are blocked
      return isExit;
    }
    return this.state === "BROKER_CONNECTED";
  }

  /**
   * Redacts passwords, access tokens, and API secrets from errors and logs
   */
  public static sanitizeErrorMessage(error: any): string {
    const raw = typeof error === "string" ? error : error?.message || JSON.stringify(error) || "Unknown error";
    return raw
      .replace(/(access_token|api_key|apikey|token|password|secret|authorization)([\s:=]+)[^\s,;&]+/gi, "$1$2[REDACTED]")
      .replace(/(Bearer\s+)[A-Za-z0-9_\-\.]+/gi, "$1[REDACTED]");
  }

  private static isAuthExpirationError(error: any): boolean {
    const status = error?.status || error?.response?.status || error?.statusCode;
    if (status === 401 || status === 403) return true;
    const msg = (error?.message || "").toLowerCase();
    return (
      msg.includes("tokenexception") ||
      msg.includes("session expired") ||
      msg.includes("invalid token") ||
      msg.includes("unauthorized") ||
      msg.includes("forbidden") ||
      msg.includes("api key expired")
    );
  }

  private static isRateLimitError(error: any): boolean {
    const status = error?.status || error?.response?.status || error?.statusCode;
    if (status === 429) return true;
    const msg = (error?.message || "").toLowerCase();
    return msg.includes("too many requests") || msg.includes("rate limit") || msg.includes("throttled");
  }

  /**
   * Dispatches a broker request through the prioritized rate-limited queue
   */
  public static async enqueueRequest<T>(
    priority: RequestPriority,
    action: () => Promise<T>
  ): Promise<T> {
    return this.executeWithPriority(priority, action);
  }

  public static async executeWithPriority<T>(
    priority: RequestPriority,
    action: () => Promise<T>
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const item: QueuedBrokerRequest<T> = {
        id: `REQ_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        priority,
        action,
        resolve,
        reject,
        createdAt: Date.now(),
        retries: 0,
      };

      this.enqueue(item);
      queueMicrotask(() => this.processQueue());
    });
  }

  private static getPriorityWeight(p: RequestPriority): number {
    switch (p) {
      case "CRITICAL_EXIT":
        return 1;
      case "STOP_MODIFY":
        return 2;
      case "ORDER_CANCEL":
        return 3;
      case "MARKET_QUOTE":
        return 4;
      case "BACKGROUND_SYNC":
        return 5;
      default:
        return 10;
    }
  }

  private static enqueue(item: QueuedBrokerRequest): void {
    this.queue.push(item);
    // Sort ascending by priority weight (1 is highest)
    this.queue.sort((a, b) => this.getPriorityWeight(a.priority) - this.getPriorityWeight(b.priority));
  }

  private static refillTokens(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsedSeconds * this.refillRatePerSecond);
    this.lastRefill = now;
  }

  private static async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      while (this.queue.length > 0) {
        this.refillTokens();

        if (this.tokens < 1) {
          // Wait 100ms for tokens to refill
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }

        const item = this.queue.shift();
        if (!item) break;

        this.tokens -= 1;

        // Check breaker before executing
        if (this.circuitBreaker === "OPEN" && item.priority !== "CRITICAL_EXIT") {
          item.reject(new Error("CIRCUIT_BREAKER_OPEN: Broker requests temporarily suspended"));
          continue;
        }

        try {
          const result = await item.action();
          this.recordSuccess();
          item.resolve(result);
        } catch (err: any) {
          this.recordFailure(err);
          item.reject(err);
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Resets internal state for unit testing & recovery verification
   */
  public static reset(): void {
    this.resetStateForTesting();
  }

  public static resetStateForTesting(): void {
    this.state = "BROKER_CONNECTED";
    this.circuitBreaker = "CLOSED";
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.queue = [];
    this.tokens = this.maxTokens;
    this.lastStateChange = Date.now();
    this.lastFailureTime = 0;
  }
}
