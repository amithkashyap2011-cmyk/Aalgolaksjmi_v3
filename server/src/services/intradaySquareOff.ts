/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Indian Market Intraday (MIS) Auto Square-Off Daemon
 * ═══════════════════════════════════════════════════════════════════
 *  Monitors IST clock every 30 seconds. At 3:15 PM IST (Mon–Fri),
 *  automatically closes all open Intraday (MIS) positions on NSE & BSE.
 */

import mongoose from "mongoose";
import * as paper from "./paperState.js";
import { log } from "../utils/logger.js";
import { Trade } from "../models/Trade.js";
import { INDIAN_ACCOUNT_TYPES, OPEN_INDIAN_TRADE_STATUSES } from "../config/indianSymbols.js";
import { AuthoritativeLedger, roundTo2 } from "./indianMarket/authoritativeLedger.js";
import { IndianRiskManager } from "./indianMarket/riskManager.js";
import { resolveLivePriceForIndianTrade } from "./indianMarket/indianPricing.js";

export class IntradaySquareOffService {
  private static timer: NodeJS.Timeout | null = null;
  private static isRunning = false;

  /**
   * Starts the 3:15 PM IST Auto Square-off monitor
   */
  public static startDaemon() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[INTRADAY_SQUARE_OFF] Starting 3:15 PM IST Auto Square-off Monitor Daemon...");

    this.timer = setInterval(() => {
      this.checkAndSquareOff();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stops the daemon
   */
  public static stopDaemon() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  /**
   * Checks current IST time and triggers square-off at 15:15 IST (3:15 PM)
   */
  public static checkAndSquareOff() {
    const now = new Date();
    // Convert to IST (UTC +5:30)
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    const day = istTime.getUTCDay();
    const hours = istTime.getUTCHours();
    const minutes = istTime.getUTCMinutes();

    // Only run Mon-Fri (1-5) between 15:15 and 15:29 IST
    const isTradingDay = day >= 1 && day <= 5;
    const isSquareOffTime = hours === 15 && minutes >= 15 && minutes < 30;

    if (isTradingDay && isSquareOffTime) {
      this.executeGlobalSquareOff().catch((err) => {
        console.error("[INTRADAY_SQUARE_OFF] executeGlobalSquareOff failed:", err);
      });
    }
  }

  /**
   * Executes auto square-off on all open MIS positions, for every user.
   *
   * BUGFIX: this used to hardcode "guest-user" as the only account scanned
   * — paper.getOpenPositions("guest-user", "PAPER") is strictly scoped to
   * that one userId, so any real authenticated user's open MIS position
   * silently carried right past the mandatory 15:15 IST square-off deadline
   * every trading day. paper.getAllOpenPositions() scans the whole in-memory
   * book across every user, which is what a daemon enforcing an
   * exchange-wide deadline actually needs.
   */
  public static async executeGlobalSquareOff(): Promise<number> {
    console.log("[INTRADAY_SQUARE_OFF] ⏰ 3:15 PM IST REACHED — Executing Mandatory MIS Auto Square-off!");
    if (mongoose.connection.readyState !== 1) {
      console.warn("[INTRADAY_SQUARE_OFF] MongoDB not connected — skipping square-off.");
      return 0;
    }
    let count = 0;

    // Scan the DB, not just the in-memory book: the auto-trader writes an open
    // Trade doc WITHOUT registering an in-memory position, so a memory-only
    // scan silently let every auto-traded MIS position carry overnight. CNC /
    // delivery / NRML carry-forward products are intraday-exempt; a missing
    // productType is treated as MIS (the auto-trader books MIS).
    const openTrades = await Trade.find({
      status: { $in: [...OPEN_INDIAN_TRADE_STATUSES] },
      accountType: { $in: [...INDIAN_ACCOUNT_TYPES] },
      productType: { $nin: ["CNC", "DELIVERY", "NRML"] },
    });

    for (const trade of openTrades) {
      const userIdStr = trade.userId ? trade.userId.toString() : "guest-user";
      const accType = trade.accountType || "INDIAN_NSE";
      const qty = Number(trade.quantity) || 0;
      if (qty <= 0) continue;

      // Atomically claim the trade so a concurrent monitor/manual exit can't
      // also close-and-credit it (double release).
      const claimed = await Trade.findOneAndUpdate(
        { _id: trade._id, status: { $in: [...OPEN_INDIAN_TRADE_STATUSES] } },
        { $set: { status: "CLOSED", closedAt: new Date(), exitReason: "INTRADAY_SQUARE_OFF" } },
        { new: true },
      );
      if (!claimed) continue; // lost the race — someone else closed it

      const exitPrice = resolveLivePriceForIndianTrade(trade);
      const spec = AuthoritativeLedger.resolveInstrumentSpec(trade.symbol);
      const realizedPnl = AuthoritativeLedger.calculateRealizedPnl(
        trade.side || "BUY",
        trade.entryPrice,
        exitPrice,
        qty,
        spec.contractMultiplier,
      );

      // Release exactly the margin locked at open (same computeRequiredMargin
      // used for the debit), NOT full notional.
      const marginReleased = roundTo2(IndianRiskManager.computeRequiredMargin({
        risk: { riskAmount: Number((trade as any).meta?.marginDebitedINR) || 0 },
        entryPrice: trade.entryPrice,
        quantity: qty,
      } as any));

      await paper.withWalletLock(userIdStr, "PAPER", accType, async () => {
        const wallet = paper.getWallet(userIdStr, "PAPER", accType as any);
        const currentInr = wallet.get("INR") ?? 0;
        const newBalance = roundTo2(currentInr + Math.max(0, marginReleased + realizedPnl));
        wallet.set("INR", newBalance);
        await paper.setWalletBalance(userIdStr, "PAPER", "INR", newBalance, accType);
      });

      // Persist exit fields with a targeted update — do NOT trade.save(), which
      // would rewrite the stale in-memory status and undo the atomic CLOSED claim.
      await Trade.updateOne(
        { _id: trade._id },
        { $set: { exitPrice, pnl: realizedPnl, netPnl: realizedPnl } },
      );

      await IndianRiskManager.recordTradeOutcome(userIdStr, realizedPnl);
      paper.removePosition(userIdStr, trade.symbol, trade.mode as any, accType);

      log(`[INTRADAY_AUTO_CLOSE] Squared off ${userIdStr}:${trade.symbol} qty=${qty} exit=₹${exitPrice} pnl=₹${realizedPnl}`);
      count++;
    }

    if (count > 0) {
      console.log(`[INTRADAY_SQUARE_OFF] ✅ Successfully auto-squared off ${count} intraday positions.`);
    }

    return count;
  }
}
