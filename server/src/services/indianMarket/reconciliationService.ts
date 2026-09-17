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

import { AutoPilotStateMachine } from "./autoPilotStateMachine.js";

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

    // Recover any in-flight pending exits from crashes/restarts
    await AutoPilotStateMachine.recoverPendingExits();

    const adapter: BrokerAdapter =
      mode === "LIVE" ? new LiveBrokerExecutionAdapter() : new PaperExecutionAdapter();

    const discrepancies: ReconciliationDiscrepancy[] = [];

    try {
      // 1. Fetch authoritative broker positions
      const brokerPositions = await adapter.getPositions(userId);

      // 2. Fetch local active OPEN/PARTIALLY_FILLED trades from MongoDB
      const localTrades = await Trade.find({
        status: { $in: ["OPEN", "TARGET_TRIGGERED", "STOP_TRIGGERED", "EXIT_PARTIALLY_FILLED"] },
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
        } else if (matchingBrokerPos && matchingBrokerPos.quantity !== trade.quantity) {
          // Quantity mismatch detected (e.g. partial fill external or manual partial exit)
          discrepancies.push({
            type: "QUANTITY_MISMATCH",
            symbol: trade.symbol,
            localState: { quantity: trade.quantity },
            brokerState: { quantity: matchingBrokerPos.quantity },
            remedyApplied: `Synced local quantity from ${trade.quantity} to ${matchingBrokerPos.quantity}`,
          });

          await Trade.updateOne(
            { _id: trade._id },
            {
              $set: {
                quantity: matchingBrokerPos.quantity,
                "meta.reconciledAt": new Date().toISOString(),
              },
            }
          );
        }
      }

      // Check broker positions missing in local state
      if (mode === "LIVE") {
        for (const bp of brokerPositions) {
          const match = localTrades.find((t) => t.symbol === bp.tradingSymbol);
          if (!match && bp.quantity > 0) {
            discrepancies.push({
              type: "MISSING_IN_LOCAL",
              symbol: bp.tradingSymbol,
              localState: null,
              brokerState: bp,
              remedyApplied: "Logged emergency discrepancy (Broker open position absent locally)",
            });
          }
        }
      }

      this.lastReconcileTime = new Date().toISOString();
      this.lastDiscrepancies = discrepancies;

      if (discrepancies.length > 0) {
        IndianAuditLogger.log({
          eventType: "POSITION_RECONCILED",
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

  /**
   * Pure position reconciliation comparator
   */
  public static async reconcilePositions(
    localPositions: Array<{ symbol: string; quantity: number; averagePrice?: number }>,
    brokerPositions: Array<{ symbol: string; quantity: number; averagePrice?: number }>
  ): Promise<{ matched: boolean; discrepancies: Array<{ type: string; symbol: string; localQty: number; brokerQty: number }> }> {
    const discrepancies: Array<{ type: string; symbol: string; localQty: number; brokerQty: number }> = [];

    for (const lp of localPositions) {
      const bp = brokerPositions.find((b) => b.symbol === lp.symbol);
      if (!bp) {
        discrepancies.push({ type: "MISSING_IN_BROKER", symbol: lp.symbol, localQty: lp.quantity, brokerQty: 0 });
      } else if (bp.quantity !== lp.quantity) {
        discrepancies.push({ type: "QUANTITY_MISMATCH", symbol: lp.symbol, localQty: lp.quantity, brokerQty: bp.quantity });
      }
    }

    for (const bp of brokerPositions) {
      const lp = localPositions.find((l) => l.symbol === bp.symbol);
      if (!lp && bp.quantity > 0) {
        discrepancies.push({ type: "MISSING_IN_LOCAL", symbol: bp.symbol, localQty: 0, brokerQty: bp.quantity });
      }
    }

    return { matched: discrepancies.length === 0, discrepancies };
  }

  /**
   * Pure order reconciliation comparator
   */
  public static async reconcileOrders(
    localOrders: Array<{ orderId: string; status: string; quantity: number }>,
    brokerOrders: Array<{ orderId: string; status: string; quantity: number }>
  ): Promise<{ matched: boolean; discrepancies: Array<{ type: string; orderId: string; localStatus: string; brokerStatus: string }> }> {
    const discrepancies: Array<{ type: string; orderId: string; localStatus: string; brokerStatus: string }> = [];

    for (const lo of localOrders) {
      const bo = brokerOrders.find((b) => b.orderId === lo.orderId);
      if (!bo) {
        discrepancies.push({ type: "MISSING_IN_BROKER", orderId: lo.orderId, localStatus: lo.status, brokerStatus: "NONE" });
      } else if (bo.status !== lo.status) {
        discrepancies.push({ type: "STATUS_MISMATCH", orderId: lo.orderId, localStatus: lo.status, brokerStatus: bo.status });
      }
    }

    return { matched: discrepancies.length === 0, discrepancies };
  }

  /**
   * Pure account balance reconciliation comparator
   */
  public static async reconcileAccount(
    localAccount: { availableCash: number; usedMargin: number },
    brokerAccount: { availableCash: number; usedMargin: number }
  ): Promise<{ matched: boolean; discrepancies: Array<{ type: string; field: string; localValue: number; brokerValue: number; diff: number }> }> {
    const discrepancies: Array<{ type: string; field: string; localValue: number; brokerValue: number; diff: number }> = [];

    const cashDiff = Math.abs(localAccount.availableCash - brokerAccount.availableCash);
    if (cashDiff > 0.01) {
      discrepancies.push({ type: "CASH_MISMATCH", field: "availableCash", localValue: localAccount.availableCash, brokerValue: brokerAccount.availableCash, diff: cashDiff });
    }

    const marginDiff = Math.abs(localAccount.usedMargin - brokerAccount.usedMargin);
    if (marginDiff > 0.01) {
      discrepancies.push({ type: "MARGIN_MISMATCH", field: "usedMargin", localValue: localAccount.usedMargin, brokerValue: brokerAccount.usedMargin, diff: marginDiff });
    }

    return { matched: discrepancies.length === 0, discrepancies };
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
