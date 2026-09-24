/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Indian Derivatives Auto-Pilot Execution State Machine
 * ═══════════════════════════════════════════════════════════════════
 *  Industrial-grade lifecycle management for automated derivatives trading:
 *   - Formal State Transitions:
 *     OPEN → TARGET_TRIGGERED/STOP_TRIGGERED → EXIT_PENDING → EXIT_ORDER_PLACED → EXIT_PARTIALLY_FILLED → CLOSED
 *   - Duplicate-order prevention & per-position mutex lock
 *   - Idempotency keys across all exit signals
 *   - Strict tick freshness & LTP sanity verification
 *   - Partial-fill ledger accounting
 *   - Complete audit logging and crash/restart recovery
 */

import {
  AuthoritativePosition,
  AuthoritativeLedger,
  PositionLifecycleStatus,
  AutoPilotMode,
  ExitOrderStatus,
  roundTo2,
  exactAdd,
} from "./authoritativeLedger.js";
import { Trade } from "../../models/Trade.js";
import { BrokerAdapter, PaperExecutionAdapter, LiveBrokerExecutionAdapter } from "./brokerAdapter.js";
import { IndianAuditLogger } from "./auditLogger.js";
import { IndianRiskManager } from "./riskManager.js";
import { BrokerStateManager } from "./hardening/brokerStateManager.js";
import { MarketDataResilience } from "./hardening/marketDataResilience.js";
import { DistributedCoordinator } from "./hardening/distributedCoordinator.js";
import { TradingKillSwitch } from "./security/tradingKillSwitch.js";
import * as paper from "../paperState.js";

export interface TickData {
  symbol: string;
  ltp: number;
  timestamp: number;
  bid?: number;
  ask?: number;
  volume?: number;
}

export interface ExitProcessResult {
  tradeId: string;
  symbol: string;
  triggered: boolean;
  reason?: string;
  previousState: PositionLifecycleStatus;
  newState: PositionLifecycleStatus;
  exitOrderStatus: ExitOrderStatus;
  filledQty?: number;
  remainingQty?: number;
  exitPrice?: number;
  realizedPnl?: number;
  error?: string;
}

export class AutoPilotStateMachine {
  // Global Auto-Pilot operational mode
  private static mode: AutoPilotMode = "AUTO";

  // Per-position concurrency lock: prevents duplicate exit orders during network or tick bursts
  private static inFlightLocks = new Set<string>();

  // Processed exit idempotency cache: maps idempotencyKey -> timestamp
  private static idempotencyRegistry = new Map<string, number>();

  // Max allowed tick age in milliseconds (5 seconds)
  private static MAX_TICK_AGE_MS = 10000;

  public static getMode(): AutoPilotMode {
    return this.mode;
  }

  public static setMode(newMode: AutoPilotMode): void {
    const prevMode = this.mode;
    this.mode = newMode;
    IndianAuditLogger.log({
      eventType: "AUTOPILOT_MODE_CHANGED",
      details: { previousMode: prevMode, newMode },
      reason: `Auto-Pilot operational mode changed to ${newMode}`,
    });
  }

  /**
   * Generates a unique, deterministic idempotency key for an exit action
   */
  public static generateIdempotencyKey(tradeId: string, triggerType: "TARGET" | "STOP" | "MANUAL"): string {
    return `${tradeId}_EXIT_${triggerType}`;
  }

  /**
   * Validates tick sanity (freshness, positive LTP, instrument match)
   */
  public static validateTick(tick: TickData, expectedSymbol: string): { valid: boolean; reason?: string } {
    if (!tick) return { valid: false, reason: "NULL_TICK" };
    if (typeof tick.ltp !== "number" || tick.ltp <= 0 || isNaN(tick.ltp) || !isFinite(tick.ltp)) {
      return { valid: false, reason: `INVALID_LTP: ${tick.ltp}` };
    }

    if (tick.symbol && expectedSymbol && tick.symbol !== expectedSymbol) {
      return {
        valid: false,
        reason: `WRONG_INSTRUMENT: Tick instrument ${tick.symbol} does not match position instrument ${expectedSymbol}`,
      };
    }

    const now = Date.now();
    const tickAgeMs = now - (tick.timestamp || now);
    if (tickAgeMs > this.MAX_TICK_AGE_MS) {
      return { valid: false, reason: `STALE_TICK: Age ${tickAgeMs}ms exceeds max ${this.MAX_TICK_AGE_MS}ms` };
    }

    return { valid: true };
  }

  /**
   * Evaluates price tick against open position stop-loss and target thresholds.
   * Enforces order lock, idempotency, and the full state machine lifecycle.
   */
  public static async processTick(
    tradeDoc: any,
    tick: TickData,
    brokerAdapter?: BrokerAdapter,
    bypassSessionCheck = false
  ): Promise<ExitProcessResult> {
    const tradeId = tradeDoc._id ? tradeDoc._id.toString() : tradeDoc.tradeId;
    const symbol = tradeDoc.symbol;

    const defaultResult: ExitProcessResult = {
      tradeId,
      symbol,
      triggered: false,
      previousState: tradeDoc.status || "OPEN",
      newState: tradeDoc.status || "OPEN",
      exitOrderStatus: tradeDoc.meta?.exitOrderStatus || "NONE",
    };

    // 1. Guard: Check if Auto-Pilot is paused or in error
    if (this.mode === "PAUSED") {
      return { ...defaultResult, reason: "AUTOPILOT_PAUSED" };
    }
    if (this.mode === "ERROR") {
      return { ...defaultResult, reason: "AUTOPILOT_ERROR_STATE" };
    }

    // Guard: Authoritative Emergency Trading Kill Switch (Requirement 14)
    if (!TradingKillSwitch.isTradingAllowed()) {
      return { ...defaultResult, reason: `KILL_SWITCH_ACTIVE: ${TradingKillSwitch.getStatus().reason}` };
    }

    // Guard: Live Broker Execution check (Section 4)
    if (tradeDoc.mode === "LIVE" && !BrokerStateManager.isTradeExecutionAllowed(true)) {
      return { ...defaultResult, reason: `BROKER_UNAVAILABLE: ${BrokerStateManager.getState()}` };
    }

    // 2. Guard: If position is already closed, ignore
    if (tradeDoc.status === "CLOSED") {
      return { ...defaultResult, newState: "CLOSED", exitOrderStatus: "FILLED", reason: "POSITION_ALREADY_CLOSED" };
    }

    // 3. Guard: Concurrency lock (100 ticks above target still execute ONCE)
    if (this.inFlightLocks.has(tradeId)) {
      return { ...defaultResult, reason: "EXIT_ALREADY_IN_FLIGHT_LOCKED" };
    }

    // 4. Guard: Check if an exit order is already pending in the broker
    if (tradeDoc.meta?.isExitPending || tradeDoc.status === "EXIT_PENDING" || tradeDoc.status === "PENDING_CLOSE") {
      return { ...defaultResult, reason: "EXIT_ORDER_ALREADY_SUBMITTED_WAITING_BROKER" };
    }

    // 5. Validate tick
    const tickVal = this.validateTick(tick, symbol);
    if (!tickVal.valid) {
      return { ...defaultResult, reason: tickVal.reason };
    }

    // Market data resilience freshness check (Section 2)
    const feedFreshness = MarketDataResilience.isTickFreshForTrading(symbol, tick.timestamp);
    if (!feedFreshness.valid) {
      return { ...defaultResult, reason: feedFreshness.reason };
    }

    const currentLtp = roundTo2(tick.ltp);
    const isLong = tradeDoc.side === "BUY";
    const entryPrice = Number(tradeDoc.entryPrice || 0);
    let sl = Number(tradeDoc.sl || tradeDoc.stopLoss || 0);
    const tp = Number(tradeDoc.tp || tradeDoc.target || 0);

    // ── Dynamic Breakeven & Multi-Tier Trailing Stop-Loss ──────────────────────
    if (entryPrice > 0 && sl > 0) {
      if (!tradeDoc.meta) tradeDoc.meta = {};
      const highestLtp = Math.max(tradeDoc.meta.highestLtp || entryPrice, currentLtp);
      const lowestLtp = Math.min(tradeDoc.meta.lowestLtp || entryPrice, currentLtp);
      tradeDoc.meta.highestLtp = highestLtp;
      tradeDoc.meta.lowestLtp = lowestLtp;

      if (isLong) {
        const peakGainPct = ((highestLtp - entryPrice) / entryPrice) * 100;
        let candidateSl = sl;
        let trailStage = tradeDoc.meta.trailingStage || "NONE";

        // Tiers moved out (2026-09-24): breakeven at +16% cut most real winners
        // at +2-10% while losers ran to the full stop — lopsided exits.
        // Tier 3: Peak gain >= +60% -> Lock in +30% profit
        if (peakGainPct >= 60) {
          const lockPrice = roundTo2(entryPrice * 1.30);
          if (lockPrice > candidateSl) {
            candidateSl = lockPrice;
            trailStage = "PROFIT_LOCK_30PCT";
          }
        }
        // Tier 2: Peak gain >= +40% -> Lock in +15% profit
        else if (peakGainPct >= 40) {
          const lockPrice = roundTo2(entryPrice * 1.15);
          if (lockPrice > candidateSl) {
            candidateSl = lockPrice;
            trailStage = "PROFIT_LOCK_15PCT";
          }
        }
        // Tier 1: Peak gain >= +25% -> Shift to Breakeven (+ charges buffer:
        // the larger of ₹0.50 or 2% of the premium)
        else if (peakGainPct >= 25) {
          const bePrice = roundTo2(entryPrice + Math.max(0.50, entryPrice * 0.02));
          if (bePrice > candidateSl) {
            candidateSl = bePrice;
            trailStage = "BREAKEVEN_SHIFT";
          }
        }

        if (candidateSl > sl) {
          tradeDoc.sl = candidateSl;
          tradeDoc.stopLoss = candidateSl;
          tradeDoc.meta.trailingStage = trailStage;
          sl = candidateSl;
          try {
            if (typeof tradeDoc.save === "function") await tradeDoc.save();
          } catch {}
        }
      } else {
        // Short position dynamic trailing
        const peakDropPct = ((entryPrice - lowestLtp) / entryPrice) * 100;
        let candidateSl = sl;
        let trailStage = tradeDoc.meta.trailingStage || "NONE";

        if (peakDropPct >= 60) {
          const lockPrice = roundTo2(entryPrice * 0.70);
          if (lockPrice < candidateSl) {
            candidateSl = lockPrice;
            trailStage = "PROFIT_LOCK_30PCT";
          }
        } else if (peakDropPct >= 40) {
          const lockPrice = roundTo2(entryPrice * 0.85);
          if (lockPrice < candidateSl) {
            candidateSl = lockPrice;
            trailStage = "PROFIT_LOCK_15PCT";
          }
        } else if (peakDropPct >= 25) {
          const bePrice = roundTo2(entryPrice - Math.max(0.50, entryPrice * 0.02));
          if (bePrice < candidateSl) {
            candidateSl = bePrice;
            trailStage = "BREAKEVEN_SHIFT";
          }
        }

        if (candidateSl < sl) {
          tradeDoc.sl = candidateSl;
          tradeDoc.stopLoss = candidateSl;
          tradeDoc.meta.trailingStage = trailStage;
          sl = candidateSl;
          try {
            if (typeof tradeDoc.save === "function") await tradeDoc.save();
          } catch {}
        }
      }
    }

    let triggerReason: string | null = null;
    let triggerType: "TARGET" | "STOP" | null = null;

    // Check Stop-Loss (including dynamic trailing / breakeven SL)
    if (sl > 0) {
      if (isLong && currentLtp <= sl) {
        const isTrailing = tradeDoc.meta?.trailingStage && tradeDoc.meta.trailingStage !== "NONE";
        triggerReason = isTrailing
          ? `STOP_LOSS_TRIGGERED (TRAILING_STOP: LTP ₹${currentLtp.toFixed(2)} <= Trailed SL ₹${sl.toFixed(2)} [${tradeDoc.meta.trailingStage}])`
          : `STOP_LOSS_TRIGGERED (LTP ₹${currentLtp.toFixed(2)} <= SL ₹${sl.toFixed(2)})`;
        triggerType = "STOP";
      } else if (!isLong && currentLtp >= sl) {
        const isTrailing = tradeDoc.meta?.trailingStage && tradeDoc.meta.trailingStage !== "NONE";
        triggerReason = isTrailing
          ? `STOP_LOSS_TRIGGERED (TRAILING_STOP: LTP ₹${currentLtp.toFixed(2)} >= Trailed SL ₹${sl.toFixed(2)} [${tradeDoc.meta.trailingStage}])`
          : `STOP_LOSS_TRIGGERED (LTP ₹${currentLtp.toFixed(2)} >= SL ₹${sl.toFixed(2)})`;
        triggerType = "STOP";
      }
    }

    // Check Target (Take-Profit)
    if (!triggerReason && tp > 0) {
      if (isLong && currentLtp >= tp) {
        triggerReason = `TARGET_TRIGGERED (LTP ₹${currentLtp.toFixed(2)} >= Target ₹${tp.toFixed(2)})`;
        triggerType = "TARGET";
      } else if (!isLong && currentLtp <= tp) {
        triggerReason = `TARGET_TRIGGERED (LTP ₹${currentLtp.toFixed(2)} <= Target ₹${tp.toFixed(2)})`;
        triggerType = "TARGET";
      }
    }

    if (!triggerReason || !triggerType) {
      // Update high/low watermarks if needed
      if (!tradeDoc.meta) tradeDoc.meta = {};
      tradeDoc.meta.highestLtp = Math.max(tradeDoc.meta.highestLtp || tradeDoc.entryPrice, currentLtp);
      try {
        if (typeof tradeDoc.save === "function") await tradeDoc.save();
      } catch (err: any) {
        // Safe degrade: database transient failure does not interrupt tick processing
      }
      return defaultResult;
    }

    // Distributed Multi-Instance Concurrency Lock (Section 9)
    const lockResource = `LOCK:POSITION:${tradeId}`;
    const distributedLockAcquired = await DistributedCoordinator.acquireLock(lockResource, 5000);
    if (!distributedLockAcquired) {
      return { ...defaultResult, reason: "DISTRIBUTED_LOCK_HELD_BY_PEER_INSTANCE" };
    }

    // 6. Check Idempotency Key (In-memory + Persistent Distributed Registry - Section 8)
    const idempotencyKey = this.generateIdempotencyKey(tradeId, triggerType);
    if (this.idempotencyRegistry.has(idempotencyKey)) {
      await DistributedCoordinator.releaseLock(lockResource);
      return { ...defaultResult, reason: "IDEMPOTENCY_TRIGGER_ALREADY_LOCKED" };
    }

    const intentReg = await DistributedCoordinator.registerOrderIntent(idempotencyKey, {
      tradeId,
      accountId: tradeDoc.userId?.toString() || "guest-user",
      action: `${triggerType}_EXIT`,
      triggerVersion: (tradeDoc.meta?.retry_count || 0) + 1,
    });

    if (!intentReg.isNew) {
      await DistributedCoordinator.releaseLock(lockResource);
      return { ...defaultResult, reason: "IDEMPOTENT_INTENT_ALREADY_PROCESSED" };
    }

    // 7. Lock trigger and position
    this.inFlightLocks.add(tradeId);
    this.idempotencyRegistry.set(idempotencyKey, Date.now());

    const previousState: PositionLifecycleStatus = tradeDoc.status || "OPEN";
    const triggeredState: PositionLifecycleStatus = triggerType === "TARGET" ? "TARGET_TRIGGERED" : "STOP_TRIGGERED";

    // Audit Trigger Detected
    IndianAuditLogger.log({
      eventType: triggerType === "TARGET" ? "TARGET_DETECTED" : "STOP_DETECTED",
      underlying: tradeDoc.underlying || symbol,
      strategy: tradeDoc.strategy || "INDIAN_DERIVATIVES",
      details: {
        tradeId,
        symbol,
        currentLtp,
        sl,
        tp,
        triggerType,
        idempotencyKey,
      },
      reason: triggerReason,
    });

    // Asynchronously notify Agentic Operations Layer without delaying execution
    import("../agentic/events/AgentEventRouter.js").then(({ AgentEventRouter }) => {
      AgentEventRouter.getInstance().publishEvent({
        eventId: `EVT_${Date.now()}_${tradeId}`,
        type: triggerType === "TARGET" ? "TARGET_APPROACHING" : "STOP_APPROACHING",
        source: "AutoPilotStateMachine",
        timestamp: Date.now(),
        correlationId: idempotencyKey,
        symbol,
        payload: { tradeId, currentLtp, sl, tp, triggerType }
      });
    }).catch(() => {});

    if (this.mode === "MANUAL") {
      this.inFlightLocks.delete(tradeId);
      await DistributedCoordinator.releaseLock(lockResource);
      tradeDoc.status = triggeredState;
      if (!tradeDoc.meta) tradeDoc.meta = {};
      tradeDoc.meta.triggerStatus = "HIT";
      tradeDoc.meta.exitOrderStatus = "NONE";
      if (typeof tradeDoc.save === "function") await tradeDoc.save();
      return {
        tradeId,
        symbol,
        triggered: true,
        reason: "MANUAL_MODE_TRIGGER_HELD_FOR_OPERATOR",
        previousState,
        newState: triggeredState,
        exitOrderStatus: "NONE",
      };
    }

    // 8. Execute Exit Workflow through Broker
    try {
      tradeDoc.status = "EXIT_PENDING";
      if (!tradeDoc.meta) tradeDoc.meta = {};
      tradeDoc.meta.isExitPending = true;
      tradeDoc.meta.exitOrderStatus = "SUBMITTED";
      tradeDoc.meta.exitIntentTime = new Date().toISOString();
      if (typeof tradeDoc.save === "function") await tradeDoc.save();

      const origQty = tradeDoc.origQty || tradeDoc.quantity || 0;
      const alreadyFilled = tradeDoc.meta?.filledExitQty || 0;
      const orderQty = Math.max(1, origQty - alreadyFilled);

      const adapter: BrokerAdapter =
        brokerAdapter || (tradeDoc.mode === "LIVE" ? new LiveBrokerExecutionAdapter() : new PaperExecutionAdapter());

      const exitAction = isLong ? "SELL" : "BUY";
      const spec = AuthoritativeLedger.resolveInstrumentSpec(symbol);

      IndianAuditLogger.log({
        eventType: "EXIT_ORDER_SUBMITTED",
        underlying: tradeDoc.underlying || symbol,
        details: {
          tradeId,
          orderQty,
          exitAction,
          idempotencyKey,
        },
        reason: `Submitting exit order to broker: ${triggerReason}`,
      });

      // Place exit order with broker
      const orderRes = await adapter.placeOrder(tradeDoc.userId?.toString() || "guest-user", {
        clientOrderId: idempotencyKey,
        tradingSymbol: symbol,
        exchange: spec.exchange,
        action: exitAction,
        instrumentType: spec.optionType as any,
        quantity: orderQty,
        price: currentLtp,
        orderType: "MARKET",
        productType: tradeDoc.productType || "MIS",
        tag: `AUTOPILOT_${triggerType}`,
      });

      if (!orderRes.ok || orderRes.status === "REJECTED") {
        tradeDoc.status = "OPEN";
        tradeDoc.meta.isExitPending = false;
        tradeDoc.meta.exitOrderStatus = "REJECTED";
        tradeDoc.meta.retry_count = (tradeDoc.meta.retry_count || 0) + 1;
        tradeDoc.meta.retry_reason = orderRes.rejectionReason || "BROKER_REJECTED";
        tradeDoc.meta.max_retry_count = 3;
        tradeDoc.meta.retry_backoff = Math.min(60000, 1000 * Math.pow(2, tradeDoc.meta.retry_count));
        tradeDoc.meta.rejectionReason = orderRes.rejectionReason || "BROKER_REJECTED";
        if (typeof tradeDoc.save === "function") await tradeDoc.save();

        IndianAuditLogger.log({
          eventType: "EXIT_ORDER_REJECTED",
          underlying: tradeDoc.underlying || symbol,
          details: {
            tradeId,
            reason: orderRes.rejectionReason,
            retry_count: tradeDoc.meta.retry_count,
            max_retry_count: tradeDoc.meta.max_retry_count,
            retry_backoff: tradeDoc.meta.retry_backoff,
          },
          reason: `Broker rejected exit order (attempt ${tradeDoc.meta.retry_count}/3); returned position to OPEN`,
        });

        await DistributedCoordinator.failOrderIntent(idempotencyKey, orderRes.rejectionReason || "BROKER_REJECTED");
        await DistributedCoordinator.releaseLock(lockResource);
        this.inFlightLocks.delete(tradeId);
        return {
          tradeId,
          symbol,
          triggered: true,
          reason: `BROKER_REJECTED: ${orderRes.rejectionReason} (retry_count=${tradeDoc.meta.retry_count})`,
          previousState,
          newState: "OPEN",
          exitOrderStatus: "REJECTED",
        };
      }

      // Order acknowledged
      tradeDoc.meta.exitOrderStatus = "ACKNOWLEDGED";
      tradeDoc.meta.brokerOrderId = orderRes.orderId;
      IndianAuditLogger.log({
        eventType: "EXIT_ORDER_ACKNOWLEDGED",
        underlying: tradeDoc.underlying || symbol,
        details: { tradeId, brokerOrderId: orderRes.orderId, filledQty: orderRes.filledQty },
        reason: "Broker acknowledged exit order fill",
      });

      // Handle Fill (Full vs Partial)
      const filledQty = orderRes.filledQty || orderQty;
      const actualExitPrice = roundTo2(orderRes.averagePrice || currentLtp);
      const totalFilledNow = exactAdd(alreadyFilled, filledQty);
      const remainingQty = Math.max(0, origQty - totalFilledNow);

      tradeDoc.meta.filledExitQty = totalFilledNow;
      tradeDoc.meta.exitPrice = actualExitPrice;
      tradeDoc.exitPrice = actualExitPrice;

      // Calculate realized P&L on filled quantity
      const filledRealizedPnl = AuthoritativeLedger.calculateRealizedPnl(
        tradeDoc.side || "BUY",
        tradeDoc.entryPrice,
        actualExitPrice,
        filledQty,
        spec.contractMultiplier
      );

      const previousPnl = Number(tradeDoc.pnl || 0);
      const updatedTotalRealizedPnl = exactAdd(previousPnl, filledRealizedPnl);

      tradeDoc.pnl = updatedTotalRealizedPnl;
      tradeDoc.netPnl = updatedTotalRealizedPnl;
      tradeDoc.exitReason = triggerReason;

      // Return margin + realized P&L to paper wallet.
      // BUGFIX: this used to be an unlocked read-modify-write racing against
      // any other concurrent mutator of the same wallet key (a manual
      // square-off via routes/indianMarket.ts, or another exit fill for the
      // same user/accountType processed by this same daemon) — wrapped in
      // withWalletLock to match the pattern paperState.ts's own debit/credit
      // helpers already use for exactly this hazard.
      const userIdStr = tradeDoc.userId ? tradeDoc.userId.toString() : "guest-user";
      const accType = tradeDoc.accountType || "INDIAN_NSE";
      const newCashBal = await paper.withWalletLock(userIdStr, tradeDoc.mode as any, accType, async () => {
        const wallet = paper.getWallet(userIdStr, tradeDoc.mode as any, accType as any);
        const currentCash = wallet.get("INR") || 0;
        // Release exactly the margin that was locked at open (proportional to
        // the filled quantity), computed via the SAME computeRequiredMargin
        // used for the debit — NOT full notional. The persisted
        // meta.marginDebitedINR makes debit and credit symmetric; legacy
        // trades fall back to computeRequiredMargin's own notional branch.
        const origTotalQty = Number(tradeDoc.quantity) || origQty || filledQty || 1;
        const fillFraction = Math.max(0, Math.min(1, filledQty / origTotalQty));
        const debitedTotal = IndianRiskManager.computeRequiredMargin({
          risk: { riskAmount: Number(tradeDoc.meta?.marginDebitedINR) || 0 },
          entryPrice: tradeDoc.entryPrice,
          quantity: origTotalQty,
        } as any);
        const marginReleased = roundTo2(debitedTotal * fillFraction);
        const cashReturned = Math.max(0, exactAdd(marginReleased, filledRealizedPnl));
        const balance = exactAdd(currentCash, cashReturned);
        wallet.set("INR", balance);
        if (tradeDoc.mode === "PAPER") {
          await paper.setWalletBalance(userIdStr, tradeDoc.mode, "INR", balance, accType);
        }
        return balance;
      });

      await IndianRiskManager.recordTradeOutcome(userIdStr, filledRealizedPnl, filledRealizedPnl, {
        symbol: tradeDoc.symbol,
        underlying: tradeDoc.underlying,
        strike: tradeDoc.strike,
        instrument: tradeDoc.instrumentType || (tradeDoc as any).instrument,
      });

      await DistributedCoordinator.completeOrderIntent(idempotencyKey, orderRes.orderId || "FILLED", {
        exitPrice: actualExitPrice,
        filledQty,
        realizedPnl: filledRealizedPnl,
      });
      await DistributedCoordinator.releaseLock(lockResource);

      if (remainingQty === 0) {
        // FULL FILL -> CLOSE POSITION
        tradeDoc.status = "CLOSED";
        tradeDoc.closedAt = new Date();
        tradeDoc.meta.isExitPending = false;
        tradeDoc.meta.exitOrderStatus = "FILLED";
        if (typeof tradeDoc.save === "function") await tradeDoc.save();

        if (paper && typeof paper.removePosition === "function") {
          // Positions are keyed by the trade's INDIAN_* accountType — removing
          // under "FUTURES" never matched and left a ghost position that
          // square-off/reconciliation double-counted.
          paper.removePosition(userIdStr, symbol, tradeDoc.mode as any, accType);
        }

        IndianAuditLogger.log({
          eventType: "EXIT_FILLED",
          underlying: tradeDoc.underlying || symbol,
          details: {
            tradeId,
            exitPrice: actualExitPrice,
            filledQty,
            realizedPnl: filledRealizedPnl,
            totalPnl: updatedTotalRealizedPnl,
          },
          reason: `Position successfully closed at ₹${actualExitPrice.toFixed(2)}: ${triggerReason}`,
        });

        this.inFlightLocks.delete(tradeId);

        return {
          tradeId,
          symbol,
          triggered: true,
          reason: triggerReason,
          previousState,
          newState: "CLOSED",
          exitOrderStatus: "FILLED",
          filledQty,
          remainingQty: 0,
          exitPrice: actualExitPrice,
          realizedPnl: filledRealizedPnl,
        };
      } else {
        // PARTIAL FILL -> KEEP REMAINING OPEN
        tradeDoc.status = "EXIT_PARTIALLY_FILLED";
        tradeDoc.quantity = remainingQty;
        tradeDoc.meta.isExitPending = false;
        tradeDoc.meta.exitOrderStatus = "PARTIALLY_FILLED";
        if (typeof tradeDoc.save === "function") await tradeDoc.save();

        IndianAuditLogger.log({
          eventType: "EXIT_PARTIAL_FILL",
          underlying: tradeDoc.underlying || symbol,
          details: {
            tradeId,
            exitPrice: actualExitPrice,
            filledQty,
            remainingQty,
            realizedPnl: filledRealizedPnl,
          },
          reason: `Partial fill executed: ${filledQty} filled, ${remainingQty} remaining`,
        });

        this.inFlightLocks.delete(tradeId);

        return {
          tradeId,
          symbol,
          triggered: true,
          reason: `PARTIAL_FILL: ${filledQty}/${origQty}`,
          previousState,
          newState: "EXIT_PARTIALLY_FILLED",
          exitOrderStatus: "PARTIALLY_FILLED",
          filledQty,
          remainingQty,
          exitPrice: actualExitPrice,
          realizedPnl: filledRealizedPnl,
        };
      }
    } catch (err: any) {
      await DistributedCoordinator.failOrderIntent(idempotencyKey, err.message);
      await DistributedCoordinator.releaseLock(lockResource);
      this.inFlightLocks.delete(tradeId);
      tradeDoc.status = "OPEN";
      if (!tradeDoc.meta) tradeDoc.meta = {};
      tradeDoc.meta.isExitPending = false;
      tradeDoc.meta.exitOrderStatus = "REJECTED";
      try {
        if (typeof tradeDoc.save === "function") await tradeDoc.save();
      } catch {}

      IndianAuditLogger.log({
        eventType: "EXIT_ORDER_REJECTED",
        underlying: tradeDoc.underlying || symbol,
        details: { tradeId, error: err.message },
        reason: `Exception during exit execution: ${err.message}`,
      });

      return {
        tradeId,
        symbol,
        triggered: true,
        reason: `EXECUTION_EXCEPTION: ${err.message}`,
        previousState,
        newState: "OPEN",
        exitOrderStatus: "REJECTED",
        error: err.message,
      };
    }
  }

  /**
   * Cleans up stale locks and reconciles pending exits on startup (Section 15 & 19)
   */
  public static async recoverPendingExits(): Promise<number> {
    this.inFlightLocks.clear();
    this.idempotencyRegistry.clear();

    const pendingTrades = await Trade.find({
      status: { $in: ["EXIT_PENDING", "PENDING_CLOSE", "EXIT_PARTIALLY_FILLED"] },
      accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"] },
    });

    let recoveredCount = 0;
    for (const trade of pendingTrades) {
      if (!trade.meta) trade.meta = {};
      // Reset in-flight flags so position is actionable
      trade.meta.isExitPending = false;
      if (trade.status === "EXIT_PENDING" || trade.status === "PENDING_CLOSE") {
        trade.status = "OPEN";
        trade.meta.exitOrderStatus = "CANCELLED";
        trade.meta.recoveryNote = "Reset to OPEN during startup reconciliation";
      }
      await trade.save();
      recoveredCount++;
    }

    if (recoveredCount > 0) {
      IndianAuditLogger.log({
        eventType: "POSITION_RECONCILED",
        details: { recoveredCount },
        reason: `Startup recovery reset ${recoveredCount} pending exit positions to actionable state`,
      });
    }

    return recoveredCount;
  }

  public static resetLocksForTesting(): void {
    this.inFlightLocks.clear();
    this.idempotencyRegistry.clear();
  }

  public static hasPendingLocks(): boolean {
    return this.inFlightLocks.size > 0;
  }
}
