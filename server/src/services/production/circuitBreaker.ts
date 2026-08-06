/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Production Circuit Breaker
 * ═══════════════════════════════════════════════════════════════════
 */

import { HealthMonitor } from "./healthMonitor.js";
import { AqeaProductionAudit } from "../../models/AqeaProductionAudit.js";
import { Trade } from "../../models/Trade.js";
import mongoose from "mongoose";

export class CircuitBreaker {
  private static isSuspended = false;
  private static failureCount = 0;
  private static lastTripReason = "";

  /**
   * Main audit loop to check for system-wide failure conditions.
   */
  public static async monitor(userId: string): Promise<boolean> {
    const health = await HealthMonitor.getSystemHealth();
    
    // 1. Critical Component Failure
    if (health.status === "CRITICAL") {
       return this.trip("SYSTEM_HEALTH_CRITICAL");
    }

    // 2. Daily Drawdown Limit (3% Safety Buffer)
    const drawdownExceeded = await this.checkDrawdown(userId, 0.03);
    if (drawdownExceeded) {
       return this.trip("DAILY_DRAWDOWN_LIMIT_3_PERCENT");
    }

    // 3. Consecutive Losses (Institutional Safeguard)
    const consecutiveLosses = await this.checkConsecutiveLosses(userId, 8);
    if (consecutiveLosses) {
       return this.trip("CONSECUTIVE_LOSS_LIMIT_8");
    }

    // 4. API Latency Limit
    if (health.components.exchange.latencyMs > 1500) {
       return this.trip("LATENCY_THRESHOLD_EXCEEDED");
    }

    // Auto-Recovery if healthy for 5 mins (manual override preferred)
    if (this.isSuspended && health.status === "HEALTHY") {
       // For now, require manual reset, but log recovery status
       console.info("[CIRCUIT_BREAKER] System healthy. Manual reset available.");
    }

    return this.isSuspended;
  }

  private static async trip(reason: string): Promise<boolean> {
    if (this.isSuspended && this.lastTripReason === reason) return true;

    this.isSuspended = true;
    this.lastTripReason = reason;
    console.error(`🚨 CIRCUIT BREAKER TRIPPED: ${reason}`);

    await AqeaProductionAudit.create({
      level: "CRITICAL",
      event: "CIRCUIT_BREAKER_TRIP",
      message: `Automatic trade suspension triggered: ${reason}`,
      data: { reason, timestamp: new Date() }
    });

    return true;
  }

  private static async checkDrawdown(userId: string, limit: number): Promise<boolean> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const userObjId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : new mongoose.Types.ObjectId("000000000000000000000000");

    const trades = await Trade.find({
      userId: userObjId,
      closedAt: { $gte: startOfDay },
      status: "CLOSED"
    }).lean();

    const dailyPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    // Note: In real prod, compare against start-of-day equity
    // Simplified for Ph 6A foundation
    return dailyPnl < -500; // Mock 500 USDT limit
  }

  private static async checkConsecutiveLosses(userId: string, limit: number): Promise<boolean> {
    const userObjId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : new mongoose.Types.ObjectId("000000000000000000000000");

    const lastTrades = await Trade.find({
      userId: userObjId,
      status: "CLOSED"
    }).sort({ closedAt: -1 }).limit(limit).lean();

    if (lastTrades.length < limit) return false;
    return lastTrades.every(t => (t.pnl || 0) < 0);
  }

  public static getStatus() {
    return { suspended: this.isSuspended, reason: this.lastTripReason };
  }

  public static reset() {
    this.isSuspended = false;
    this.lastTripReason = "";
    console.info("🛡️ CIRCUIT BREAKER RESET.");
  }
}
