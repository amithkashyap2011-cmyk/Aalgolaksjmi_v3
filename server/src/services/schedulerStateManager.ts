/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.1A — Scheduler State Manager
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Persists auto-trade configurations to MongoDB to ensure recovery
 * after system crashes or restarts.
 */

import { Settings } from "../models/Settings.js";
import mongoose from "mongoose";
import { toValidObjectId } from "../utils/mongoUtils.js";

export interface SchedulerState {
  userId: string;
  autoEnabled: boolean;
  primarySymbol?: string;
  lastTick?: Date;
  accountType?: string;
}

export class SchedulerStateManager {
  /**
   * Hydrates the memory state of the AutoTradeEngine from Settings.
   * Settings model is the source of truth for user auto-trade flags.
   * A user with both autoTradeSpot and autoTradeFutures set yields TWO
   * entries here (one per account type) so both legs get re-enrolled
   * independently after a restart.
   */
  public static async getActiveConfigs(): Promise<SchedulerState[]> {
    if (mongoose.connection.readyState !== 1) {
      return [];
    }
    try {
      const allSettings = await Settings.find({
        $or: [
          { autoTradeSpot: true },
          { autoTradeFutures: true },
          { autoTrade: true, autoTradeSpot: { $exists: false }, autoTradeFutures: { $exists: false } },
        ],
      }).lean();

      const configs: SchedulerState[] = [];
      for (const s of allSettings) {
        if (!s.userId) continue;
        const userId = s.userId.toString();
        const isLegacyDoc = s.autoTradeSpot === undefined && s.autoTradeFutures === undefined;
        if (isLegacyDoc) {
          configs.push({ userId, autoEnabled: true, primarySymbol: s.primarySymbol, accountType: (s.accountType as string) || "FUTURES" });
          continue;
        }
        if (s.autoTradeSpot) {
          configs.push({ userId, autoEnabled: true, primarySymbol: s.primarySymbol, accountType: "SPOT" });
        }
        if (s.autoTradeFutures) {
          configs.push({ userId, autoEnabled: true, primarySymbol: s.primarySymbol, accountType: "FUTURES" });
        }
      }
      return configs;
    } catch (err) {
      console.error("[SchedulerStateManager] Failed to fetch active configs:", err);
      return [];
    }
  }

  /**
   * Records a tick checkpoint for a user.
   */
  public static async recordTick(userId: string): Promise<void> {
    if (mongoose.connection.readyState !== 1) return;
    try {
      await Settings.updateOne(
        { userId: toValidObjectId(userId) },
        { $set: { lastAutoTick: new Date() } }
      );
    } catch (err) {
      // Non-critical, just log
      console.warn(`[SchedulerStateManager] Failed to record tick for ${userId}:`, err);
    }
  }

  /**
   * Persists a change in auto-trade status for one account type. Only
   * flips that account type's own flag — SPOT and FUTURES are
   * independent, so disabling one must not touch the other.
   */
  public static async persistStatus(userId: string, enabled: boolean, accountType?: string): Promise<void> {
    if (mongoose.connection.readyState !== 1) return;
    try {
      const field = accountType === "SPOT" ? "autoTradeSpot" : "autoTradeFutures";
      await Settings.updateOne(
        { userId: toValidObjectId(userId) },
        { $set: { [field]: enabled, autoTrade: enabled, accountType: accountType || "FUTURES" } }
      );
    } catch (err) {
      console.error(`[SchedulerStateManager] Failed to persist status for ${userId}:`, err);
    }
  }
}
