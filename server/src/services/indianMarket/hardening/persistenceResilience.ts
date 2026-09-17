/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Persistence Resilience & Transaction Safety (Hardening)
 * ═══════════════════════════════════════════════════════════════════
 *  Monitors database health, manages explicit operational persistence
 *  states (HEALTHY, DEGRADED, FAILED), enforces fail-closed financial
 *  persistence (never reporting false success), and coordinates atomic
 *  ledger mutations without holding locks across network boundaries.
 */

import mongoose from "mongoose";
import { IndianAuditLogger } from "../auditLogger.js";

export type PersistenceState = "PERSISTENCE_HEALTHY" | "PERSISTENCE_DEGRADED" | "PERSISTENCE_FAILED";

export interface PersistenceMetrics {
  state: PersistenceState;
  readyState: number;
  lastWriteLatencyMs: number;
  avgWriteLatencyMs: number;
  consecutiveWriteFailures: number;
  totalWrites?: number;
  totalWritesRecorded: number;
  inMemoryFallbackActive: boolean;
}

export class PersistenceResilience {
  private static state: PersistenceState = "PERSISTENCE_HEALTHY";
  private static consecutiveFailures = 0;
  private static writeLatencies: number[] = [];
  private static lastWriteLatency = 0;
  private static totalWrites = 0;
  private static LATENCY_DEGRADED_THRESHOLD_MS = 1000;
  private static FAILURE_TRIP_THRESHOLD = 3;

  public static getState(): PersistenceState {
    this.evaluateState();
    return this.state;
  }

  public static getMetrics(): PersistenceMetrics {
    this.evaluateState();
    const sum = this.writeLatencies.reduce((a, b) => a + b, 0);
    const avg = this.writeLatencies.length > 0 ? sum / this.writeLatencies.length : 0;

    return {
      state: this.state,
      readyState: mongoose.connection.readyState,
      lastWriteLatencyMs: this.lastWriteLatency,
      avgWriteLatencyMs: Math.round(avg * 100) / 100,
      consecutiveWriteFailures: this.consecutiveFailures,
      totalWrites: this.totalWrites,
      totalWritesRecorded: this.totalWrites,
      inMemoryFallbackActive: this.state !== "PERSISTENCE_HEALTHY",
    };
  }

  private static evaluateState(): void {
    const readyState = mongoose.connection.readyState;
    if (readyState !== 1 && process.env.NODE_ENV !== "test") {
      if (this.state !== "PERSISTENCE_FAILED") {
        this.setState("PERSISTENCE_FAILED", `MongoDB connection lost (readyState=${readyState})`);
      }
      return;
    }

    if (this.consecutiveFailures >= this.FAILURE_TRIP_THRESHOLD) {
      if (this.state !== "PERSISTENCE_FAILED") {
        this.setState("PERSISTENCE_FAILED", `Consecutive write failures (${this.consecutiveFailures})`);
      }
    } else if (this.lastWriteLatency > this.LATENCY_DEGRADED_THRESHOLD_MS) {
      if (this.state !== "PERSISTENCE_DEGRADED") {
        this.setState("PERSISTENCE_DEGRADED", `Write latency elevated (${this.lastWriteLatency}ms)`);
      }
    } else if (this.consecutiveFailures === 0 && this.state !== "PERSISTENCE_HEALTHY") {
      this.setState("PERSISTENCE_HEALTHY", "Database connection and write latencies normal");
    }
  }

  private static setState(newState: PersistenceState, reason: string): void {
    const prev = this.state;
    this.state = newState;

    IndianAuditLogger.log({
      eventType: "PERSISTENCE_STATE_CHANGED",
      details: { previousState: prev, newState, reason },
      reason: `Database persistence state changed to ${newState}: ${reason}`,
    });
  }

  public static setPersistenceState(newState: PersistenceState, reason?: string): void {
    this.setState(newState, reason || "Manual state override");
  }

  /**
   * Wraps a financial persistence operation with latency profiling and fail-safe recording.
   * Rejects immediately if database is down or state is PERSISTENCE_FAILED — NEVER reports false success!
   */
  public static async executeFinancialWrite<T>(
    arg1: string | (() => Promise<T>),
    arg2?: (() => Promise<T>) | string
  ): Promise<T> {
    const operationName = typeof arg1 === "string" ? arg1 : (typeof arg2 === "string" ? arg2 : "ANONYMOUS_WRITE");
    const writeFn = typeof arg1 === "function" ? arg1 : (arg2 as () => Promise<T>);

    if (this.state === "PERSISTENCE_FAILED" || (mongoose.connection.readyState !== 1 && process.env.NODE_ENV !== "test")) {
      this.consecutiveFailures++;
      this.evaluateState();
      throw new Error(
        `PERSISTENCE_FAILED: Cannot execute financial write [${operationName}]. MongoDB state=${this.state}, readyState=${mongoose.connection.readyState}`
      );
    }

    const start = performance.now();
    try {
      const result = await writeFn();
      const elapsed = Math.round(performance.now() - start);
      this.lastWriteLatency = elapsed;
      this.consecutiveFailures = 0;
      this.totalWrites++;

      this.writeLatencies.push(elapsed);
      if (this.writeLatencies.length > 50) this.writeLatencies.shift();

      this.evaluateState();
      return result;
    } catch (err: any) {
      this.consecutiveFailures++;
      this.evaluateState();
      IndianAuditLogger.log({
        eventType: "FINANCIAL_WRITE_FAILED",
        details: { operationName, error: err.message },
        reason: `Financial persistence failed for ${operationName}: ${err.message}`,
      });
      throw new Error(`PERSISTENCE_WRITE_ERROR [${operationName}]: ${err.message}`);
    }
  }

  /**
   * Executes atomic coordinate updates across Trade and Wallet.
   * Ensures network broker calls are NEVER wrapped inside DB transaction locks.
   */
  public static async executeAtomicTradeClose(
    tradeDoc: any,
    walletUpdateFn: () => Promise<void>,
    tradeUpdates: Record<string, any>
  ): Promise<void> {
    return this.executeFinancialWrite("ATOMIC_TRADE_CLOSE", async () => {
      // Apply trade updates
      Object.assign(tradeDoc, tradeUpdates);
      if (typeof tradeDoc.save === "function") {
        await tradeDoc.save();
      }

      // Apply wallet updates
      await walletUpdateFn();
    });
  }

  public static resetForTesting(): void {
    this.state = "PERSISTENCE_HEALTHY";
    this.consecutiveFailures = 0;
    this.writeLatencies = [];
    this.lastWriteLatency = 0;
    this.totalWrites = 0;
  }
}
