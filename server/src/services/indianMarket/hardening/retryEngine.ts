/**
 * ===================================================================
 *  AQEA — Retry Engine & Action Classification (Hardening)
 * ===================================================================
 *  Enforces deterministic retry policies:
 *   - SAFE_TO_RETRY: Read-only queries, quotes, idempotently-keyed requests.
 *   - NOT_SAFE_TO_RETRY: Raw market orders, credential validations.
 *   - REQUIRES_RECONCILIATION: Dropped order connections, timeouts.
 *  Prevents retry storms with exponential backoff and randomized jitter.
 */

import { IndianAuditLogger } from "../auditLogger.js";

export type RetryClassification = "SAFE_TO_RETRY" | "NOT_SAFE_TO_RETRY" | "REQUIRES_RECONCILIATION";

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  jitterRatio: number;
}

export const DEFAULT_RETRY_POLICIES: Record<RetryClassification, RetryPolicy> = {
  SAFE_TO_RETRY: {
    maxAttempts: 4,
    initialDelayMs: 250,
    maxDelayMs: 4000,
    backoffFactor: 2.0,
    jitterRatio: 0.25,
  },
  NOT_SAFE_TO_RETRY: {
    maxAttempts: 1, // Non-idempotent: NEVER retry without reconciliation
    initialDelayMs: 0,
    maxDelayMs: 0,
    backoffFactor: 1.0,
    jitterRatio: 0,
  },
  REQUIRES_RECONCILIATION: {
    maxAttempts: 2, // Only after explicit order status query
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffFactor: 2.0,
    jitterRatio: 0.2,
  },
};

export class RetryEngine {
  /**
   * Classifies an operation into a deterministic retry category.
   */
  public static classifyOperation(action: string, isIdempotentKeyed = false): RetryClassification {
    const act = action.toUpperCase();

    // 1. Safe to retry: read-only queries, snapshots, position status checks, or idempotently guarded calls
    if (
      act.includes("GET_") ||
      act.includes("FETCH_") ||
      act.includes("SNAPSHOT") ||
      act.includes("QUERY_") ||
      act.includes("POSITIONS") ||
      act.includes("STATUS") ||
      act.includes("FUNDS")
    ) {
      return "SAFE_TO_RETRY";
    }

    if (isIdempotentKeyed) {
      return "SAFE_TO_RETRY";
    }

    // 2. Requires reconciliation: unconfirmed order placement, network timeout on order submission
    if (
      act.includes("ORDER") ||
      act.includes("SUBMIT_EXIT") ||
      act.includes("SQUARE_OFF") ||
      act.includes("TRADE")
    ) {
      return "REQUIRES_RECONCILIATION";
    }

    // 3. Not safe to retry: raw non-idempotent writes, auth/password checks
    return "NOT_SAFE_TO_RETRY";
  }

  /**
   * Classifies an error and operation into a deterministic retry category.
   */
  public static classifyError(error: Error | any, action: string, isIdempotentKeyed = false): RetryClassification {
    return this.classifyOperation(action, isIdempotentKeyed);
  }

  /**
   * Calculates exponential backoff delay in ms for a given attempt number.
   */
  public static calculateBackoff(attempt: number, baseMs = 500, maxMs = 30000): number {
    return Math.min(maxMs, baseMs * Math.pow(2, attempt - 1));
  }

  /**
   * Computes jittered exponential backoff delay.
   */
  public static calculateDelay(policy: RetryPolicy, attempt: number): number {
    const rawDelay = Math.min(
      policy.maxDelayMs,
      policy.initialDelayMs * Math.pow(policy.backoffFactor, attempt - 1)
    );
    const jitter = rawDelay * policy.jitterRatio * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(rawDelay + jitter));
  }

  /**
   * Executes an operation with classified retry policies.
   */
  public static async executeWithRetry<T>(
    action: string,
    operation: (attempt: number) => Promise<T>,
    isIdempotentKeyed = false,
    customPolicy?: Partial<RetryPolicy>
  ): Promise<T> {
    const classification = this.classifyOperation(action, isIdempotentKeyed);
    const policy: RetryPolicy = {
      ...DEFAULT_RETRY_POLICIES[classification],
      ...customPolicy,
    };

    let lastError: any;

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      try {
        return await operation(attempt);
      } catch (err: any) {
        lastError = err;

        if (classification === "NOT_SAFE_TO_RETRY") {
          IndianAuditLogger.log({
            eventType: "RETRY_BLOCKED",
            details: { action, attempt, error: err.message },
            reason: "Non-idempotent action cannot be retried without state corruption risk",
          });
          throw err;
        }

        if (classification === "REQUIRES_RECONCILIATION") {
          IndianAuditLogger.log({
            eventType: "RECONCILIATION_REQUIRED_ON_FAILURE",
            details: { action, attempt, error: err.message },
            reason: "Action failure requires broker reconciliation before retrying",
          });
          throw err;
        }

        if (attempt >= policy.maxAttempts) {
          throw err;
        }

        const delay = this.calculateDelay(policy, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}
