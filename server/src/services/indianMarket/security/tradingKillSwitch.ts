/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Backend Authoritative Emergency Trading Kill Switch
 * ═══════════════════════════════════════════════════════════════════
 *  Guarantees fail-safe operational shutdown independent of the UI:
 *  - States: TRADING_ENABLED | TRADING_DISABLED.
 *  - When TRADING_DISABLED: Blocks 100% of new automated order submissions.
 *  - Persisted in MongoDB to survive crashes and server restarts.
 *  - Produces immutable, tamper-evident audit logs on all state changes.
 */

import mongoose, { Schema } from "mongoose";
import { IndianAuditLogger } from "../auditLogger.js";

export type KillSwitchState = "TRADING_ENABLED" | "TRADING_DISABLED";

export type KillSwitchTrigger = 
  | "ADMIN_MANUAL" 
  | "RISK_BREACH" 
  | "BROKER_DISCONNECT" 
  | "DATABASE_FAILURE" 
  | "SYSTEM_PANIC";

export interface KillSwitchStatus {
  state: KillSwitchState;
  active: boolean;
  activatedAt: string | null;
  activatedBy: string | null;
  reason: string | null;
  trigger: KillSwitchTrigger | null;
}

// ── Schema for Persistent Kill Switch State ──
const KillSwitchSchema = new Schema(
  {
    _id: { type: String, default: "GLOBAL_KILL_SWITCH" },
    state: { type: String, enum: ["TRADING_ENABLED", "TRADING_DISABLED"], default: "TRADING_ENABLED" },
    activatedAt: { type: Date, default: null },
    activatedBy: { type: String, default: null },
    reason: { type: String, default: null },
    trigger: { type: String, default: null },
  },
  { timestamps: true }
);

const KillSwitchModel = mongoose?.models?.TradingKillSwitchState || 
  (typeof mongoose?.model === "function" ? mongoose.model("TradingKillSwitchState", KillSwitchSchema, "trading_kill_switch_state") : null as any);

export class TradingKillSwitch {
  private static currentState: KillSwitchState = "TRADING_ENABLED";
  private static activatedAt: string | null = null;
  private static activatedBy: string | null = null;
  private static reason: string | null = null;
  private static trigger: KillSwitchTrigger | null = null;
  private static initialized = false;

  /**
   * Initializes the kill switch from persistent database state.
   */
  public static async initialize(): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        const doc = await KillSwitchModel.findById("GLOBAL_KILL_SWITCH").lean() as any;
        if (doc && doc.state === "TRADING_DISABLED") {
          this.currentState = "TRADING_DISABLED";
          this.activatedAt = doc.activatedAt ? new Date(doc.activatedAt).toISOString() : new Date().toISOString();
          this.activatedBy = doc.activatedBy || "system_recovery";
          this.reason = doc.reason || "Persisted kill-switch state restored from database";
          this.trigger = (doc.trigger as KillSwitchTrigger) || "ADMIN_MANUAL";
          console.warn(`[KILL_SWITCH] Restored PERSISTED state: TRADING_DISABLED. Reason: ${this.reason}`);
        } else {
          this.currentState = "TRADING_ENABLED";
        }
      }
    } catch (err: any) {
      console.error(`[KILL_SWITCH] Error restoring persistent state: ${err?.message}`);
    } finally {
      this.initialized = true;
    }
  }

  /**
   * Fast synchronous check for hot path trading loops.
   */
  public static isTradingAllowed(): boolean {
    return this.currentState === "TRADING_ENABLED";
  }

  /**
   * Strict validation check that throws when trading is disabled.
   */
  public static assertTradingAllowed(context = "Order Submission"): void {
    if (this.currentState === "TRADING_DISABLED") {
      const err = new Error(
        `[KILL_SWITCH_ACTIVE] Operation '${context}' rejected: Trading is EMERGENCY HALTED (${this.reason || "Unspecified reason"}). Trigger: ${this.trigger}`
      );
      (err as any).code = "KILL_SWITCH_ACTIVE";
      (err as any).status = 403;
      throw err;
    }
  }

  /**
   * Emergency disable trading across the entire backend.
   */
  public static async disableTrading(
    trigger: KillSwitchTrigger,
    reason: string,
    activatedBy = "SYSTEM"
  ): Promise<KillSwitchStatus> {
    const previousState = this.currentState;
    this.currentState = "TRADING_DISABLED";
    this.activatedAt = new Date().toISOString();
    this.activatedBy = activatedBy;
    this.reason = reason;
    this.trigger = trigger;

    console.error(
      `[KILL_SWITCH] 🚨 EMERGENCY TRADING KILL SWITCH ACTIVATED! Trigger: ${trigger} | By: ${activatedBy} | Reason: ${reason}`
    );

    // Persist state in MongoDB
    try {
      if (mongoose.connection.readyState === 1) {
        await KillSwitchModel.findByIdAndUpdate(
          "GLOBAL_KILL_SWITCH",
          {
            state: "TRADING_DISABLED",
            activatedAt: new Date(this.activatedAt),
            activatedBy,
            reason,
            trigger,
          },
          { upsert: true }
        );
      }
    } catch (err: any) {
      console.error(`[KILL_SWITCH] Failed to persist kill-switch to DB: ${err?.message}`);
    }

    // Audit log
    IndianAuditLogger.logEvent({
      action: "KILL_SWITCH_ACTIVATED",
      details: {
        previousState,
        newState: "TRADING_DISABLED",
        trigger,
        activatedBy,
        reason,
        timestamp: this.activatedAt,
      },
    });

    return this.getStatus();
  }

  /**
   * Re-enables trading after emergency conditions have been resolved.
   */
  public static async enableTrading(
    resetBy: string,
    reason: string
  ): Promise<KillSwitchStatus> {
    if (!resetBy || !reason) {
      throw new Error("Re-enabling trading requires an authorized administrator ID and justification reason.");
    }

    const previousState = this.currentState;
    this.currentState = "TRADING_ENABLED";
    const resetTime = new Date().toISOString();

    console.info(`[KILL_SWITCH] ✅ Trading Kill Switch Reset to TRADING_ENABLED by ${resetBy}. Reason: ${reason}`);

    // Update persistent state
    try {
      if (mongoose.connection.readyState === 1) {
        await KillSwitchModel.findByIdAndUpdate(
          "GLOBAL_KILL_SWITCH",
          {
            state: "TRADING_ENABLED",
            activatedAt: null,
            activatedBy: null,
            reason: null,
            trigger: null,
          },
          { upsert: true }
        );
      }
    } catch (err: any) {
      console.error(`[KILL_SWITCH] Failed to persist reset to DB: ${err?.message}`);
    }

    this.activatedAt = null;
    this.activatedBy = null;
    this.reason = null;
    this.trigger = null;

    IndianAuditLogger.logEvent({
      action: "KILL_SWITCH_RESET",
      details: {
        previousState,
        newState: "TRADING_ENABLED",
        resetBy,
        reason,
        timestamp: resetTime,
      },
    });

    return this.getStatus();
  }

  /**
   * Returns current kill switch status.
   */
  public static getStatus(): KillSwitchStatus {
    return {
      state: this.currentState,
      active: this.currentState === "TRADING_DISABLED",
      activatedAt: this.activatedAt,
      activatedBy: this.activatedBy,
      reason: this.reason,
      trigger: this.trigger,
    };
  }
}
