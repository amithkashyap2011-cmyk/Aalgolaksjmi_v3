/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Database Data Integrity & Financial Ledger Scanner
 * ═══════════════════════════════════════════════════════════════════
 *  Scans MongoDB collections for financial anomalies, corruption,
 *  duplicate trades, orphan orders, invalid states, and negative balances.
 *  Produces comprehensive diagnostic reports without silent mutations.
 */

import mongoose from "mongoose";
import { Trade } from "../../../models/Trade.js";
import { WalletTransaction } from "../../../models/WalletTransaction.js";
import { INDIAN_SYMBOLS } from "../../../config/indianSymbols.js";

export interface IntegrityFinding {
  severity: "CRITICAL" | "WARNING" | "INFO";
  collection: string;
  recordId?: string;
  category: 
    | "DUPLICATE_TRADE"
    | "INVALID_QUANTITY"
    | "INVALID_PRICE"
    | "INVALID_STATE"
    | "IMPOSSIBLE_PNL"
    | "MISSING_TIMESTAMP"
    | "ORPHAN_RECORD"
    | "NEGATIVE_BALANCE"
    | "INCONSISTENT_LIFECYCLE";
  description: string;
  details: Record<string, any>;
}

export interface DataIntegrityScanReport {
  timestamp: string;
  scannedCollections: {
    tradesCount: number;
    transactionsCount: number;
  };
  summary: {
    totalFindings: number;
    criticalCount: number;
    warningCount: number;
    infoCount: number;
    status: "PASS" | "WARNING" | "FAIL";
  };
  findings: IntegrityFinding[];
  repairPlan: string[];
}

export class DataIntegrityScanner {
  /**
   * Executes a complete read-only scan of the database.
   */
  public static async runScan(): Promise<DataIntegrityScanReport> {
    const findings: IntegrityFinding[] = [];
    let tradesCount = 0;
    let transactionsCount = 0;

    if (mongoose.connection.readyState !== 1) {
      return {
        timestamp: new Date().toISOString(),
        scannedCollections: { tradesCount: 0, transactionsCount: 0 },
        summary: {
          totalFindings: 1,
          criticalCount: 1,
          warningCount: 0,
          infoCount: 0,
          status: "FAIL",
        },
        findings: [
          {
            severity: "CRITICAL",
            collection: "system",
            category: "ORPHAN_RECORD",
            description: "Database is not connected; scan cannot execute.",
            details: { readyState: mongoose.connection.readyState },
          },
        ],
        repairPlan: ["Ensure MongoDB service is active and accessible."],
      };
    }

    // ── 1. SCAN TRADES COLLECTION ──
    try {
      const trades = await Trade.find({}).lean();
      tradesCount = trades.length;

      const seenFingerprints = new Map<string, string>();

      for (const trade of trades) {
        const id = trade._id.toString();

        // Check for duplicate trades (same user, symbol, exact open time, quantity, side)
        const fingerprint = `${trade.userId}:${trade.symbol}:${trade.side}:${trade.quantity}:${trade.openedAt?.getTime?.() || ""}`;
        if (seenFingerprints.has(fingerprint)) {
          findings.push({
            severity: "CRITICAL",
            collection: "trades",
            recordId: id,
            category: "DUPLICATE_TRADE",
            description: `Potential duplicate trade detected matching record ${seenFingerprints.get(fingerprint)}`,
            details: { symbol: trade.symbol, quantity: trade.quantity, side: trade.side },
          });
        } else {
          seenFingerprints.set(fingerprint, id);
        }

        // Validate Quantity
        if (trade.quantity === undefined || trade.quantity === null || !Number.isFinite(trade.quantity) || trade.quantity <= 0) {
          findings.push({
            severity: "CRITICAL",
            collection: "trades",
            recordId: id,
            category: "INVALID_QUANTITY",
            description: `Trade has non-positive or non-finite quantity: ${trade.quantity}`,
            details: { quantity: trade.quantity },
          });
        } else {
          const config = INDIAN_SYMBOLS[trade.symbol];
          if (config && config.lotSize > 1) {
            if (trade.quantity % config.lotSize !== 0) {
              findings.push({
                severity: "WARNING",
                collection: "trades",
                recordId: id,
                category: "INVALID_QUANTITY",
                description: `Quantity ${trade.quantity} is not a multiple of lot size ${config.lotSize} for ${trade.symbol}`,
                details: { lotSize: config.lotSize, quantity: trade.quantity },
              });
            }
          }
        }

        // Validate Price
        if (trade.entryPrice === undefined || trade.entryPrice === null || !Number.isFinite(trade.entryPrice) || trade.entryPrice <= 0) {
          findings.push({
            severity: "CRITICAL",
            collection: "trades",
            recordId: id,
            category: "INVALID_PRICE",
            description: `Trade has non-positive entry price: ${trade.entryPrice}`,
            details: { entryPrice: trade.entryPrice },
          });
        }

        // Validate Lifecycle & State
        const validStatuses = [
          "PENDING", "OPEN", "PARTIALLY_FILLED", "CLOSED", 
          "CANCELLED", "PENDING_CLOSE", "CLOSE_FAILED", 
          "MANUAL_INTERVENTION_REQUIRED", "TARGET_TRIGGERED", 
          "STOP_TRIGGERED", "EXIT_PENDING", "EXIT_PARTIALLY_FILLED"
        ];
        if (!validStatuses.includes(trade.status)) {
          findings.push({
            severity: "CRITICAL",
            collection: "trades",
            recordId: id,
            category: "INVALID_STATE",
            description: `Unknown or corrupted trade status: '${trade.status}'`,
            details: { status: trade.status },
          });
        }

        // Inconsistent Lifecycle: CLOSED without closedAt or exitPrice
        if (trade.status === "CLOSED") {
          if (!trade.closedAt) {
            findings.push({
              severity: "WARNING",
              collection: "trades",
              recordId: id,
              category: "INCONSISTENT_LIFECYCLE",
              description: "Trade marked CLOSED but closedAt timestamp is missing",
              details: { status: trade.status },
            });
          }
          if (trade.exitPrice === null || trade.exitPrice === undefined || trade.exitPrice <= 0) {
            findings.push({
              severity: "WARNING",
              collection: "trades",
              recordId: id,
              category: "INCONSISTENT_LIFECYCLE",
              description: `Trade marked CLOSED but exitPrice is missing or <= 0: ${trade.exitPrice}`,
              details: { exitPrice: trade.exitPrice },
            });
          }
        }

        // Impossible P&L check
        if (trade.netPnl !== undefined && trade.netPnl !== null) {
          if (!Number.isFinite(trade.netPnl)) {
            findings.push({
              severity: "CRITICAL",
              collection: "trades",
              recordId: id,
              category: "IMPOSSIBLE_PNL",
              description: `Trade netPnl is non-finite (NaN or Infinity): ${trade.netPnl}`,
              details: { netPnl: trade.netPnl },
            });
          }
        }

        // Missing Timestamps
        if (!trade.openedAt) {
          findings.push({
            severity: "WARNING",
            collection: "trades",
            recordId: id,
            category: "MISSING_TIMESTAMP",
            description: "Trade openedAt timestamp is missing",
            details: {},
          });
        }
      }
    } catch (err: any) {
      findings.push({
        severity: "CRITICAL",
        collection: "trades",
        category: "ORPHAN_RECORD",
        description: `Failed to scan trades collection: ${err?.message}`,
        details: { error: err?.message },
      });
    }

    // ── 2. SCAN WALLET TRANSACTIONS ──
    try {
      const txns = await WalletTransaction.find({}).lean();
      transactionsCount = txns.length;

      for (const txn of txns) {
        const id = txn._id.toString();

        if (txn.amount === undefined || txn.amount === null || !Number.isFinite(txn.amount) || txn.amount <= 0) {
          findings.push({
            severity: "CRITICAL",
            collection: "wallet_transactions",
            recordId: id,
            category: "NEGATIVE_BALANCE",
            description: `Wallet transaction amount is non-positive or non-finite: ${txn.amount}`,
            details: { amount: txn.amount, type: txn.type },
          });
        }

        if (!txn.userId) {
          findings.push({
            severity: "CRITICAL",
            collection: "wallet_transactions",
            recordId: id,
            category: "ORPHAN_RECORD",
            description: "Wallet transaction is missing required userId reference",
            details: { txnId: id },
          });
        }
      }
    } catch (err: any) {
      findings.push({
        severity: "CRITICAL",
        collection: "wallet_transactions",
        category: "ORPHAN_RECORD",
        description: `Failed to scan wallet_transactions: ${err?.message}`,
        details: { error: err?.message },
      });
    }

    // Calculate Summary
    const criticalCount = findings.filter(f => f.severity === "CRITICAL").length;
    const warningCount = findings.filter(f => f.severity === "WARNING").length;
    const infoCount = findings.filter(f => f.severity === "INFO").length;

    const status: "PASS" | "WARNING" | "FAIL" = 
      criticalCount > 0 ? "FAIL" : (warningCount > 0 ? "WARNING" : "PASS");

    // Repair plan (non-destructive)
    const repairPlan: string[] = [];
    if (criticalCount > 0) {
      repairPlan.push("Review flagged critical trade records and create compensating ledger entries.");
      repairPlan.push("Ensure all trade insertions pass through OrderValidator gatekeeper.");
    }
    if (warningCount > 0) {
      repairPlan.push("Backfill missing closedAt timestamps using associated audit log events.");
      repairPlan.push("Validate historical lot sizes against current exchange master.");
    }
    if (findings.length === 0) {
      repairPlan.push("Zero anomalies detected. No database repair required.");
    }

    return {
      timestamp: new Date().toISOString(),
      scannedCollections: {
        tradesCount,
        transactionsCount,
      },
      summary: {
        totalFindings: findings.length,
        criticalCount,
        warningCount,
        infoCount,
        status,
      },
      findings,
      repairPlan,
    };
  }
}
