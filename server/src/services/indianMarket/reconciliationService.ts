/**
 * ═══════════════════════════════════════════════════════════════════
 *  Indian Derivatives Broker Reconciliation Service
 * ═══════════════════════════════════════════════════════════════════
 *  Runs periodic synchronization between local Trade / Position state
 *  and authoritative broker positions/orders, detecting and auto-healing
 *  discrepancies.
 */

import { Trade } from "../../models/Trade.js";
import { BrokerAdapter, PaperExecutionAdapter, LiveBrokerExecutionAdapter } from "./brokerAdapter.js";
import { IndianAuditLogger } from "./auditLogger.js";
import mongoose from "mongoose";

export interface ReconciliationDiscrepancy {
  type: "MISSING_IN_BROKER" | "MISSING_IN_LOCAL" | "QUANTITY_MISMATCH" | "STATUS_MISMATCH";
  symbol: string;
  localState: any;
  brokerState: any;
  remedyApplied: string;
}

export class IndianReconciliationService {
  private static timer: NodeJS.Timeout | null = null;
  private static isRunning = false;
  private static lastReconcileTime: string | null = null;
  private static lastDiscrepancies: ReconciliationDiscrepancy[] = [];

  public static async runReconciliation(
    userId = "guest-user",
    mode: "PAPER" | "LIVE" = "PAPER"
  ): Promise<{ checked: number; discrepancies: ReconciliationDiscrepancy[] }> {
    if (mongoose.connection.readyState !== 1) {
      return { checked: 0, discrepancies: [] };
    }

    const adapter: BrokerAdapter =
      mode === "LIVE" ? new LiveBrokerExecutionAdapter() : new PaperExecutionAdapter();

    const discrepancies: ReconciliationDiscrepancy[] = [];

    try {
      // 1. Fetch authoritative broker positions
      const brokerPositions = await adapter.getPositions(userId);

      // 2. Fetch local active OPEN trades from MongoDB
      const localTrades = await Trade.find({
        status: "OPEN",
        accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"] },
      }).lean();

      // Check each local trade against broker positions
      for (const trade of localTrades) {
        const matchingBrokerPos = brokerPositions.find(
          (bp) => bp.tradingSymbol === trade.symbol
        );

        if (mode === "LIVE" && !matchingBrokerPos) {
          // Position exists in local DB as OPEN, but is absent on broker (closed externally or liquidated)
          discrepancies.push({
            type: "MISSING_IN_BROKER",
            symbol: trade.symbol,
            localState: { status: trade.status, quantity: trade.quantity },
            brokerState: null,
            remedyApplied: "Marked local trade as CLOSED (Reconciliation sync)",
          });

          await Trade.updateOne(
            { _id: trade._id },
            {
              $set: {
                status: "CLOSED",
                closedAt: new Date(),
                exitReason: "BROKER_RECONCILIATION_SYNC (Position absent on broker)",
              },
            }
          );
        }
      }

      this.lastReconcileTime = new Date().toISOString();
      this.lastDiscrepancies = discrepancies;

      if (discrepancies.length > 0) {
        IndianAuditLogger.log({
          eventType: "POSITION_CLOSED",
          details: { discrepanciesCount: discrepancies.length, discrepancies },
          reason: "Broker reconciliation corrected state discrepancies",
        });
      }

      return { checked: localTrades.length, discrepancies };
    } catch (err: any) {
      console.warn(`[INDIAN_RECONCILIATION] Reconciliation warning: ${err.message}`);
      return { checked: 0, discrepancies: [] };
    }
  }

  public static startDaemon(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    if (process.env.NODE_ENV !== "test") {
      console.log("[INDIAN_RECONCILIATION] Broker Reconciliation Daemon started (60s cycle)...");
    }

    this.timer = setInterval(async () => {
      await this.runReconciliation("guest-user", "PAPER");
    }, 60000);
  }

  public static stopDaemon(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  public static getStatus() {
    return {
      running: this.isRunning,
      lastReconcileTime: this.lastReconcileTime,
      lastDiscrepancies: this.lastDiscrepancies,
    };
  }
}
