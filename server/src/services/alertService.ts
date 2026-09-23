/*
 * ─── Shared alert-creation helper ───────────────────────
 *
 * Fire-and-forget Alert persistence used by every order-placing code
 * path — crypto (autoTradeEngine.ts) and Indian market (indianMarket.ts
 * routes, indianMarketAutoTrader.ts) alike. The client's global
 * ToastContainer polls GET /trading/alerts and surfaces the newest one
 * as a toast automatically, so any code path that creates an Alert here
 * gets a real-time-ish order notification for free — no separate
 * notification plumbing needed per market.
 *
 * Previously this existed only as a private, unexported function inside
 * autoTradeEngine.ts, so the Indian market order-execution paths never
 * created Alert records at all and users never saw a toast for Indian
 * BUY/SELL orders, only crypto ones.
 */
import mongoose from "mongoose";
import { Alert } from "../models/Alert.js";
import { toValidObjectId } from "../utils/mongoUtils.js";

export async function safeCreateAlert(data: {
  userId: any;
  severity: "GREEN" | "AMBER" | "RED";
  symbol: string;
  title: string;
  message: string;
}): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 1) return;
    const validUserId = toValidObjectId(data.userId);
    // Awaited: callers already await this, and a fire-and-forget create let
    // the HTTP response (and the toast poll) race ahead of the saved alert.
    await Alert.create({ ...data, userId: validUserId });
  } catch (err) {
    console.warn("[Alert] Failed to save alert:", err);
  }
}
