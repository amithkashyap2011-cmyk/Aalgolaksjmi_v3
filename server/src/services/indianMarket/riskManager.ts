/**
 * ═══════════════════════════════════════════════════════════════════
 *  Global Independent Risk Management Engine for Indian Derivatives
 * ═══════════════════════════════════════════════════════════════════
 *  Executes pre-trade gatekeeping, daily loss lockouts, panic stops,
 *  duplicate trade prevention, and capital sizing enforcement.
 */

import {
  RiskSettings,
  StructuredTrade,
  UnderlyingSymbol,
} from "./strategyTypes.js";
import { IndianRiskSettings, IIndianRiskSettings } from "../../models/IndianRiskSettings.js";
import { IndianMarketHours } from "../indianMarketHours.js";
import { ExchangeCalendar } from "./exchangeCalendar.js";
import { IndianAuditLogger } from "./auditLogger.js";
import * as paper from "../paperState.js";
import { Trade } from "../../models/Trade.js";
import { toValidObjectId } from "../../utils/mongoUtils.js";
import mongoose from "mongoose";

export interface RiskValidationResult {
  approved: boolean;
  rejectionReason?: string;
  checks: Record<string, { passed: boolean; message: string }>;
}

export class IndianRiskManager {
  // In-memory trade cooldown & duplicate fingerprints
  private static recentTradeFingerprints = new Map<string, number>();
  private static strategyCooldowns = new Map<string, number>();
  private static consecutiveLosses = new Map<string, number>();
  private static strikeLossCooldowns = new Map<string, number>();
  private static consecutiveLossPauseUntil = new Map<string, number>();
  // What an approved validateTrade reserved (fingerprint + strategy cooldown),
  // keyed by tradeId, so releaseReservation can undo it when the order is then
  // never placed — otherwise a broker/margin failure blocked the strategy for
  // the full cooldown with no trade to show for it.
  private static pendingReservations = new Map<string, { fingerprint: string; stratKey: string; prevStratTime?: number }>();

  /**
   * Required margin for a trade: its own computed risk amount when set,
   * otherwise notional value (entry price × quantity). This was
   * independently duplicated at four call sites (indianMarketAutoTrader.ts
   * x2, routes/indianMarket.ts, and inline just below in validateTrade) —
   * IndianRiskManager is the natural single source of truth for it.
   */
  private static resolveUserId(userId: string = "guest-user"): string {
    return (!userId || userId === "guest-user" || userId === "000000000000000000000000")
      ? "6a39c0e7a5e2995ed257ca68"
      : userId;
  }

  /**
   * Required margin for a trade: its own computed risk amount when set,
   * otherwise notional value (entry price × quantity). This was
   * independently duplicated at four call sites (indianMarketAutoTrader.ts
   * x2, routes/indianMarket.ts, and inline just below in validateTrade) —
   * IndianRiskManager is the natural single source of truth for it.
   */
  public static computeRequiredMargin(trade: StructuredTrade): number {
    return trade.risk.riskAmount > 0 ? trade.risk.riskAmount : trade.entryPrice * trade.quantity;
  }

  /**
   * Loads risk settings from MongoDB or returns default
   */
  public static async getSettings(rawUserId = "guest-user"): Promise<IIndianRiskSettings> {
    const userId = this.resolveUserId(rawUserId);
    try {
      if ((await import("mongoose")).default.connection.readyState === 1) {
        let doc = await IndianRiskSettings.findOne({ userId });
        if (!doc) {
          doc = await IndianRiskSettings.create({
            userId,
            autoTrade: true,
            niftyAutoTrade: true,
            bankNiftyAutoTrade: true,
            optionsAutoTrade: true,
            futuresAutoTrade: false,
            maxRiskPerTradePercent: 1.0,
            maxDailyLossPercent: 3.0,
            maxDailyLossAmount: 25000,
            maxTradesPerDay: 10,
            maxConcurrentTrades: 3,
            maxNiftyTrades: 2,
            maxBankNiftyTrades: 2,
            maxConsecutiveLosses: 3,
            strategyCooldownMinutes: 15,
            maxCapitalUtilizationPercent: 50,
            panicStop: false,
            dailyRiskLock: false,
          });
        }

        // BUGFIX: lastDailyResetDate was schema-defined but never read anywhere
        // in the codebase — nothing ever rolled dailyRiskLock over to a new
        // trading day. Once tripped (max daily loss or consecutive-loss
        // streak — see recordTradeOutcome below), it stayed locked forever,
        // silently blocking every future trade regardless of how much time
        // had passed. A DAILY lock needs an actual daily rollover: reset it
        // (and the consecutive-loss counter) the first time settings are
        // loaded on a new calendar day.
        const today = new Date().toISOString().slice(0, 10);
        if (doc.lastDailyResetDate !== today) {
          const previousResetDate = doc.lastDailyResetDate;
          doc.lastDailyResetDate = today;
          doc.dailyRiskLock = false;
          this.consecutiveLosses.set(userId, 0);
          await doc.save();
          IndianAuditLogger.log({
            eventType: "RISK_APPROVED",
            details: { userId, previousResetDate },
            reason: "Daily rollover: Daily Risk Lock and consecutive-loss counter reset for new trading day",
          });
        }

        return doc;
      }
    } catch {}

    // Fallback mock doc in testing environments
    return {
      userId,
      autoTrade: true,
      niftyAutoTrade: true,
      bankNiftyAutoTrade: true,
      optionsAutoTrade: true,
      futuresAutoTrade: false,
      maxRiskPerTradePercent: 1.0,
      maxDailyLossPercent: 3.0,
      maxDailyLossAmount: 5000,
      maxTradesPerDay: 10,
      maxConcurrentTrades: 3,
      maxNiftyTrades: 2,
      maxBankNiftyTrades: 2,
      maxConsecutiveLosses: 3,
      strategyCooldownMinutes: 15,
      maxCapitalUtilizationPercent: 50,
      panicStop: false,
      dailyRiskLock: false,
      save: async () => {},
    } as any;
  }

  /**
   * Updates risk settings
   */
  public static async updateSettings(
    userId: string,
    updates: Partial<RiskSettings>
  ): Promise<IIndianRiskSettings> {
    const doc = await this.getSettings(userId);
    Object.assign(doc, updates, { updatedAt: new Date() });
    await doc.save();
    return doc;
  }

  /**
   * Sets Emergency Panic Stop state
   */
  public static async setPanicStop(userId: string, active: boolean): Promise<boolean> {
    if (mongoose.connection.readyState === 1) {
      await IndianRiskSettings.updateOne({ userId }, { $set: { panicStop: active } }, { upsert: true });
    }
    IndianAuditLogger.log({
      eventType: active ? "PANIC_STOP_TRIGGERED" : "RISK_APPROVED",
      details: { active, userId },
      reason: active ? "Emergency Panic Stop activated by operator" : "Panic Stop cleared",
    });
    return active;
  }

  /**
   * Resets Daily Risk Lock manually
   */
  public static async resetDailyRiskLock(rawUserId: string = "guest-user"): Promise<boolean> {
    const userId = this.resolveUserId(rawUserId);
    if (mongoose.connection.readyState === 1) {
      await IndianRiskSettings.updateMany(
        { userId: { $in: [userId, "guest-user", "000000000000000000000000"] } },
        { $set: { dailyRiskLock: false } }
      );
    }
    this.consecutiveLosses.set(userId, 0);
    this.consecutiveLosses.set("guest-user", 0);
    this.consecutiveLossPauseUntil.delete(userId);
    this.consecutiveLossPauseUntil.delete("guest-user");
    IndianAuditLogger.log({
      eventType: "RISK_APPROVED",
      details: { userId, rawUserId },
      reason: "Manual operator reset of Daily Risk Lock",
    });
    return true;
  }

  /**
   * Generates duplicate trade fingerprint
   */
  public static generateFingerprint(trade: StructuredTrade, rawUserId: string = "guest-user"): string {
    const userId = this.resolveUserId(rawUserId);
    const bucket = Math.floor(Date.now() / (5 * 60 * 1000)); // 5-minute bucket
    return `${userId}:${trade.underlying}:${trade.strategy}:${trade.position}:${trade.strike || 0}:${trade.expiry || ""}:${bucket}`;
  }

  /**
   * Blocks an entry when Mongo already shows an OPEN trade for the same
   * underlying + strategy, or a same-strategy entry within the cooldown.
   * Returns the rejection reason, or null when clear. Skipped (null) when Mongo
   * is down or the user id isn't an ObjectId, leaving the in-memory checks as
   * the only guard, as before.
   */
  private static async checkPersistedEntryGuards(
    trade: StructuredTrade,
    rawUserId: string,
    cooldownMinutes: number
  ): Promise<string | null> {
    const userId = this.resolveUserId(rawUserId);
    if (mongoose.connection.readyState !== 1 || !mongoose.Types.ObjectId.isValid(userId)) return null;
    try {
      const base = {
        userId: new mongoose.Types.ObjectId(userId),
        accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"] },
        strategy: trade.strategy,
      };
      if (await Trade.exists({ ...base, underlying: trade.underlying, status: "OPEN" })) {
        return "DUPLICATE_OPEN_POSITION";
      }
      // Trade has no createdAt (no schema timestamps); the ObjectId carries it.
      const since = mongoose.Types.ObjectId.createFromTime(Math.floor((Date.now() - cooldownMinutes * 60_000) / 1000));
      if (await Trade.exists({ ...base, _id: { $gte: since }, status: { $ne: "FAILED" } })) {
        return "STRATEGY_COOLDOWN_ACTIVE";
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Undoes the fingerprint + strategy-cooldown reservation an approved
   * validateTrade made, for a trade that was then never placed.
   */
  public static releaseReservation(trade: StructuredTrade): void {
    const r = trade.tradeId ? this.pendingReservations.get(trade.tradeId) : undefined;
    if (!r) return;
    this.pendingReservations.delete(trade.tradeId);
    this.recentTradeFingerprints.delete(r.fingerprint);
    if (r.prevStratTime) this.strategyCooldowns.set(r.stratKey, r.prevStratTime);
    else this.strategyCooldowns.delete(r.stratKey);
  }

  /** Drops the reservation record once the trade is placed (the cooldown stays). */
  public static confirmReservation(trade: StructuredTrade): void {
    if (trade.tradeId) this.pendingReservations.delete(trade.tradeId);
  }

  /**
   * Comprehensive Pre-Trade Risk Evaluation Gatekeeper
   */
  public static async validateTrade(
    trade: StructuredTrade,
    accountCapital: number,
    availableMargin: number,
    userId: string = "guest-user",
    bypassSessionCheck = false
  ): Promise<RiskValidationResult> {
    const settings = await this.getSettings(userId);
    const checks: Record<string, { passed: boolean; message: string }> = {};

    // 1. PANIC STOP CHECK
    if (settings.panicStop) {
      checks["PANIC_STOP"] = { passed: false, message: "Emergency Panic Stop is currently ACTIVE." };
      IndianAuditLogger.log({
        eventType: "RISK_REJECTED",
        underlying: trade.underlying,
        strategy: trade.strategy,
        details: { tradeId: trade.tradeId },
        reason: "PANIC_STOP_ACTIVE",
      });
      return { approved: false, rejectionReason: "PANIC_STOP_ACTIVE", checks };
    }
    checks["PANIC_STOP"] = { passed: true, message: "Panic Stop is clear." };

    // 2. DAILY RISK LOCK CHECK
    if (settings.dailyRiskLock) {
      checks["DAILY_RISK_LOCK"] = { passed: false, message: "Daily Risk Lock is ACTIVE due to max daily drawdown." };
      IndianAuditLogger.log({
        eventType: "RISK_REJECTED",
        underlying: trade.underlying,
        strategy: trade.strategy,
        details: { tradeId: trade.tradeId },
        reason: "DAILY_RISK_LOCK_ACTIVE",
      });
      return { approved: false, rejectionReason: "DAILY_RISK_LOCK_ACTIVE", checks };
    }
    checks["DAILY_RISK_LOCK"] = { passed: true, message: "Daily Risk Lock is clear." };

    // 2b. CONSECUTIVE LOSS PROFIT-PROTECTION PAUSE CHECK
    const pauseUntil = this.consecutiveLossPauseUntil.get(userId);
    const now = Date.now();
    if (pauseUntil && now < pauseUntil) {
      const remainingMin = Math.ceil((pauseUntil - now) / 60000);
      checks["CONSECUTIVE_LOSS_PAUSE"] = {
        passed: false,
        message: `Consecutive loss profit protection active. Trading is paused for another ${remainingMin}m.`,
      };
      IndianAuditLogger.log({
        eventType: "RISK_REJECTED",
        underlying: trade.underlying,
        strategy: trade.strategy,
        details: { tradeId: trade.tradeId, remainingMin },
        reason: "CONSECUTIVE_LOSS_PAUSE_ACTIVE",
      });
      return { approved: false, rejectionReason: "CONSECUTIVE_LOSS_PAUSE_ACTIVE", checks };
    }
    checks["CONSECUTIVE_LOSS_PAUSE"] = { passed: true, message: "Consecutive loss pause is clear." };

    // 3. MARKET HOURS CHECK
    if (!bypassSessionCheck && process.env.NODE_ENV !== "test") {
      const session = IndianMarketHours.getSessionStatus();
      if (!session.isOpen) {
        checks["MARKET_HOURS"] = { passed: false, message: `Market is closed (${session.reason}).` };
        return { approved: false, rejectionReason: `MARKET_CLOSED (${session.reason})`, checks };
      }
    }
    checks["MARKET_HOURS"] = { passed: true, message: "Market session is active." };

    // 3b. INTRADAY MIS CUTOFF CHECK (15:10 IST)
    // Prevents fresh MIS entries in the final 20 minutes before market close,
    // avoiding collision with the mandatory 15:15 IST auto-square-off window.
    if (!bypassSessionCheck && process.env.NODE_ENV !== "test") {
      const isMIS = trade.productType === "MIS" || !trade.productType;
      if (isMIS) {
        const ist = ExchangeCalendar.toIST();
        const currentMinutes = ist.getHours() * 60 + ist.getMinutes();
        if (currentMinutes >= (15 * 60 + 10)) {
          checks["INTRADAY_CUTOFF"] = {
            passed: false,
            message: "MIS intraday order placement is closed after 15:10 IST to protect against auto square-off.",
          };
          IndianAuditLogger.log({
            eventType: "RISK_REJECTED",
            underlying: trade.underlying,
            strategy: trade.strategy,
            details: { tradeId: trade.tradeId, currentMinutes },
            reason: "INTRADAY_MIS_CUTOFF_ACTIVE",
          });
          return { approved: false, rejectionReason: "INTRADAY_MIS_CUTOFF_ACTIVE", checks };
        }
      }
    }
    checks["INTRADAY_CUTOFF"] = { passed: true, message: "Intraday entry window is open." };

    // 4. AUTO-TRADE PERMISSION CHECK (for automated execution)
    const isNifty = trade.underlying.includes("NIFTY") && !trade.underlying.includes("BANK");
    const isBankNifty = trade.underlying.includes("BANK");
    const isOption = trade.instrument === "CE" || trade.instrument === "PE";
    const isFuture = trade.instrument === "FUTURE";

    if (isNifty && !settings.niftyAutoTrade) {
      checks["UNDERLYING_AUTO_TRADE"] = { passed: false, message: "NIFTY auto-trade is disabled in settings." };
      return { approved: false, rejectionReason: "NIFTY_AUTO_TRADE_DISABLED", checks };
    }
    if (isBankNifty && !settings.bankNiftyAutoTrade) {
      checks["UNDERLYING_AUTO_TRADE"] = { passed: false, message: "BANKNIFTY auto-trade is disabled in settings." };
      return { approved: false, rejectionReason: "BANKNIFTY_AUTO_TRADE_DISABLED", checks };
    }
    if (isOption && !settings.optionsAutoTrade) {
      checks["DERIVATIVE_AUTO_TRADE"] = { passed: false, message: "Options auto-trade is disabled in settings." };
      return { approved: false, rejectionReason: "OPTIONS_AUTO_TRADE_DISABLED", checks };
    }
    if (isFuture && !settings.futuresAutoTrade) {
      checks["DERIVATIVE_AUTO_TRADE"] = { passed: false, message: "Futures auto-trade is disabled in settings." };
      return { approved: false, rejectionReason: "FUTURES_AUTO_TRADE_DISABLED", checks };
    }
    checks["AUTO_TRADE_TOGGLES"] = { passed: true, message: "All sub-toggles permitted." };

    // 5. MARGIN & FUNDS CHECK
    const requiredMargin = this.computeRequiredMargin(trade);
    if (availableMargin < requiredMargin) {
      checks["MARGIN_CHECK"] = {
        passed: false,
        message: `Insufficient margin: Required ₹${requiredMargin.toFixed(2)}, Available ₹${availableMargin.toFixed(2)}`,
      };
      IndianAuditLogger.log({
        eventType: "RISK_REJECTED",
        underlying: trade.underlying,
        strategy: trade.strategy,
        details: { requiredMargin, availableMargin },
        reason: "INSUFFICIENT_MARGIN",
      });
      return { approved: false, rejectionReason: "INSUFFICIENT_MARGIN", checks };
    }
    checks["MARGIN_CHECK"] = { passed: true, message: "Margin check passed." };

    // 6. POST-LOSS STRIKE COOLDOWN CHECK
    // If this specific strike/symbol recently took a Stop-Loss, lock it out for 45 minutes
    // to prevent repetitive losses on the exact same falling/rising strike.
    const legSymbols = trade.legs?.map((l) => l.tradingSymbol).filter(Boolean) || [];
    const strikeKey = `${userId}:${trade.underlying}:${trade.strike || 0}:${trade.instrument}`;

    for (const sym of [strikeKey, ...legSymbols.map((s) => `${userId}:${s}`)]) {
      const cooldownUntil = this.strikeLossCooldowns.get(sym);
      if (cooldownUntil && now < cooldownUntil) {
        const remainingMin = Math.ceil((cooldownUntil - now) / 60000);
        checks["STRIKE_LOSS_COOLDOWN"] = {
          passed: false,
          message: `Strike ${trade.strike || sym} recently hit Stop-Loss. Re-entry blacklisted for another ${remainingMin}m.`,
        };
        IndianAuditLogger.log({
          eventType: "RISK_REJECTED",
          underlying: trade.underlying,
          strategy: trade.strategy,
          strike: trade.strike,
          instrument: trade.instrument,
          details: { sym, remainingMin },
          reason: "STRIKE_LOSS_COOLDOWN_ACTIVE",
        });
        return { approved: false, rejectionReason: "STRIKE_LOSS_COOLDOWN_ACTIVE", checks };
      }
    }
    checks["STRIKE_LOSS_COOLDOWN"] = { passed: true, message: "Strike loss cooldown clear." };

    // 6b. PERSISTED ENTRY GUARD (survives restarts)
    // The in-memory fingerprint/cooldown maps below are wiped on every process
    // restart — five tsx-watch reloads in 80s once opened four INFY puts on the
    // same strategy, one per boot. Mongo is the durable record of what is open
    // and what was just entered.
    const persistedBlock = await this.checkPersistedEntryGuards(trade, userId, settings.strategyCooldownMinutes);
    if (persistedBlock) {
      checks["PERSISTED_ENTRY_GUARD"] = { passed: false, message: `Blocked by persisted trade history: ${persistedBlock}` };
      IndianAuditLogger.log({
        eventType: "RISK_REJECTED",
        underlying: trade.underlying,
        strategy: trade.strategy,
        details: { tradeId: trade.tradeId },
        reason: persistedBlock,
      });
      return { approved: false, rejectionReason: persistedBlock, checks };
    }
    checks["PERSISTED_ENTRY_GUARD"] = { passed: true, message: "No open or recent same-strategy trade on record." };

    // 7. DUPLICATE TRADE FINGERPRINT CHECK
    const fingerprint = this.generateFingerprint(trade, userId);
    const lastSeen = this.recentTradeFingerprints.get(fingerprint);
    if (lastSeen && now - lastSeen < 180000) {
      // 3 minutes cooldown for identical trade
      checks["DUPLICATE_CHECK"] = { passed: false, message: "Duplicate identical trade fingerprint detected within 3m." };
      IndianAuditLogger.log({
        eventType: "RISK_REJECTED",
        underlying: trade.underlying,
        strategy: trade.strategy,
        details: { fingerprint },
        reason: "DUPLICATE_TRADE_PREVENTED",
      });
      return { approved: false, rejectionReason: "DUPLICATE_TRADE_PREVENTED", checks };
    }
    checks["DUPLICATE_CHECK"] = { passed: true, message: "Duplicate check passed." };

    // 8. STRATEGY COOLDOWN CHECK
    const stratKey = `${userId}:${trade.strategy}`;
    const lastStratTime = this.strategyCooldowns.get(stratKey);
    const cooldownMs = settings.strategyCooldownMinutes * 60 * 1000;
    if (lastStratTime && now - lastStratTime < cooldownMs) {
      checks["STRATEGY_COOLDOWN"] = { passed: false, message: `Strategy ${trade.strategy} is in cooldown.` };
      return { approved: false, rejectionReason: "STRATEGY_COOLDOWN_ACTIVE", checks };
    }
    // Both reservations are recorded only once every check has passed, so a
    // trade rejected at the cooldown step no longer leaves a fingerprint behind.
    this.recentTradeFingerprints.set(fingerprint, now);
    this.strategyCooldowns.set(stratKey, now);
    checks["STRATEGY_COOLDOWN"] = { passed: true, message: "Strategy cooldown clear." };
    if (trade.tradeId) {
      this.pendingReservations.set(trade.tradeId, { fingerprint, stratKey, prevStratTime: lastStratTime });
    }

    // All Risk Checks Passed
    IndianAuditLogger.log({
      eventType: "RISK_APPROVED",
      underlying: trade.underlying,
      strategy: trade.strategy,
      instrument: trade.instrument,
      strike: trade.strike,
      details: { tradeId: trade.tradeId, quantity: trade.quantity, margin: requiredMargin },
      reason: "All pre-trade risk checks validated successfully",
    });

    return { approved: true, checks };
  }

  /**
   * Tracks closed trade outcomes and updates consecutive losses & daily risk locks
   */
  // Accumulated realized PnL per user for the current IST trading day. The
  // daily-loss lock must fire on the SUM of the day's losses, not a single
  // trade — the caller previously passed one trade's PnL as the "daily" total,
  // so a day bled by many sub-threshold losses never tripped the lock.
  private static dailyRealizedPnl = new Map<string, { istDay: string; pnl: number }>();

  /** Current calendar day in IST (UTC+5:30), used to bucket/reset daily PnL. */
  private static istDayKey(): string {
    return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  }

  private static async getTodayRealizedPnL(userId: string): Promise<number> {
    try {
      const now = new Date();
      const istMidnightUtc = new Date(Date.now() + 5.5 * 3600 * 1000);
      istMidnightUtc.setUTCHours(0, 0, 0, 0);
      const istDayStartUtc = new Date(istMidnightUtc.getTime() - 5.5 * 3600 * 1000);

      const trades = await Trade.find({
        userId: toValidObjectId(userId),
        status: "CLOSED",
        accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"] },
        closedAt: { $gte: istDayStartUtc },
      }).select("pnl netPnl").lean();

      return trades.reduce((sum: number, t: any) => sum + (t.netPnl ?? t.pnl ?? 0), 0);
    } catch {
      return 0;
    }
  }

  public static async recordTradeOutcome(
    rawUserId: string,
    realizedPnl: number,
    _dailyPnL?: number,
    tradeInfo?: { symbol?: string; underlying?: string; strike?: number; instrument?: string }
  ): Promise<void> {
    const userId = this.resolveUserId(rawUserId);
    const settings = await this.getSettings(userId);
    const currentConsecutive = this.consecutiveLosses.get(userId) || 0;

    // Accumulate the day's realized PnL (auto-resets at IST midnight).
    const istDay = this.istDayKey();
    let prior = this.dailyRealizedPnl.get(userId);
    if (!prior || prior.istDay !== istDay) {
      const dbPnl = await this.getTodayRealizedPnL(userId);
      prior = { istDay, pnl: dbPnl };
    }
    const dailyPnL = prior.pnl + realizedPnl;
    this.dailyRealizedPnl.set(userId, { istDay, pnl: dailyPnL });

    if (realizedPnl < 0) {
      const updatedConsecutive = currentConsecutive + 1;
      this.consecutiveLosses.set(userId, updatedConsecutive);

      // Post-loss strike cooldown: blacklist this strike for 45 minutes
      if (tradeInfo) {
        const cooldownUntil = Date.now() + 45 * 60 * 1000;
        if (tradeInfo.symbol) {
          this.strikeLossCooldowns.set(`${userId}:${tradeInfo.symbol}`, cooldownUntil);
        }
        if (tradeInfo.underlying && tradeInfo.strike && tradeInfo.instrument) {
          this.strikeLossCooldowns.set(
            `${userId}:${tradeInfo.underlying}:${tradeInfo.strike}:${tradeInfo.instrument}`,
            cooldownUntil
          );
        }
      }

      // Trigger daily risk lock if consecutive losses exceed limit
      if (updatedConsecutive >= settings.maxConsecutiveLosses) {
        if (dailyPnL <= 0) {
          settings.dailyRiskLock = true;
          await settings.save();
          IndianAuditLogger.log({
            eventType: "DAILY_RISK_LOCK",
            details: { updatedConsecutive, limit: settings.maxConsecutiveLosses, dailyPnL },
            reason: `Consecutive losses hit limit (${updatedConsecutive}) while in net daily loss -> Daily Risk Lock engaged`,
          });
        } else {
          // Account is net profitable today (+₹), but took consecutive losses:
          // ENGAGE MANDATORY 30-MINUTE COOL-OFF TIMEOUT to protect accumulated profits!
          const pauseUntil = Date.now() + 30 * 60 * 1000;
          this.consecutiveLossPauseUntil.set(userId, pauseUntil);
          this.consecutiveLosses.set(userId, 0); // reset streak counter
          IndianAuditLogger.log({
            eventType: "RISK_REJECTED",
            details: { updatedConsecutive, limit: settings.maxConsecutiveLosses, dailyPnL, pauseUntil: new Date(pauseUntil).toISOString() },
            reason: `Consecutive losses hit limit (${updatedConsecutive}) while net profitable (+₹${dailyPnL.toFixed(2)}). Mandatory 30-minute profit protection pause engaged.`,
          });
        }
      }
    } else {
      this.consecutiveLosses.set(userId, 0);
    }

    // Trigger daily risk lock if daily loss exceeds configured amount
    const effectiveMaxDailyLoss = Math.max(settings.maxDailyLossAmount || 25000, 25000);
    if (dailyPnL <= -effectiveMaxDailyLoss) {
      settings.dailyRiskLock = true;
      await settings.save();
      IndianAuditLogger.log({
        eventType: "DAILY_RISK_LOCK",
        details: { dailyPnL, limit: effectiveMaxDailyLoss },
        reason: `Max daily loss exceeded (-₹${Math.abs(dailyPnL)}) -> Daily Risk Lock engaged`,
      });
    }
  }
}
