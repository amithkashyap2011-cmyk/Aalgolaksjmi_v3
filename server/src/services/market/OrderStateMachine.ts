/*
 * ─── Authoritative Order State Machine & Execution Safety ─────
 *
 * Implements authoritative order lifecycle management for AALGOLAKSHMI V3:
 * - Deterministic states and legal transition validation
 * - Duplicate order defense & Idempotency key tracking
 * - Position-level exit ownership (Manual vs AI race prevention)
 * - Stop-Loss vs Target concurrent tick arbitration (STOP_FIRST policy)
 * - Multi-stage partial fill tracking and weighted average pricing
 * - Broker reconciliation diff engine & orphan order recovery
 */
import crypto from "node:crypto";

export type OrderState =
  | "NEW"
  | "VALIDATING"
  | "APPROVED"
  | "SUBMITTING"
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "EXIT_PENDING"
  | "CLOSED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED"
  | "UNKNOWN"
  | "RECONCILIATION_REQUIRED";

export interface LifecycleOrder {
  orderId: string;
  idempotencyKey: string;
  userId: string;
  symbol: string;
  market: "INDIAN" | "CRYPTO";
  mode: "PAPER" | "LIVE";
  side: "BUY" | "SELL";
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  price?: number;
  averageExecutionPrice?: number;
  state: OrderState;
  stateHistory: Array<{ from: OrderState; to: OrderState; timestamp: number; reason?: string }>;
  feesAccrued: number;
  realizedPnL: number;
  stopLoss?: number;
  target?: number;
  createdAt: number;
  updatedAt: number;
}

export type ReconciliationDiffType =
  | "MATCHED"
  | "BROKER_AHEAD"
  | "LOCAL_AHEAD"
  | "QUANTITY_MISMATCH"
  | "PRICE_MISMATCH"
  | "ORDER_MISMATCH"
  | "BALANCE_MISMATCH"
  | "UNKNOWN";

export interface ReconciliationDiff {
  diffType: ReconciliationDiffType;
  symbol: string;
  localQuantity: number;
  brokerQuantity: number;
  localPrice: number;
  brokerPrice: number;
  actionRequired: string;
  resolved: boolean;
}

export class OrderStateMachine {
  // Legal State Transitions Map
  private static readonly LEGAL_TRANSITIONS: Record<OrderState, ReadonlySet<OrderState>> = {
    NEW: new Set(["VALIDATING", "REJECTED", "FAILED"]),
    VALIDATING: new Set(["APPROVED", "REJECTED", "FAILED"]),
    APPROVED: new Set(["SUBMITTING", "CANCELLED", "FAILED"]),
    SUBMITTING: new Set(["OPEN", "PARTIALLY_FILLED", "FILLED", "REJECTED", "FAILED", "UNKNOWN"]),
    OPEN: new Set(["PARTIALLY_FILLED", "FILLED", "CANCELLED", "EXPIRED", "EXIT_PENDING", "UNKNOWN", "RECONCILIATION_REQUIRED"]),
    PARTIALLY_FILLED: new Set(["PARTIALLY_FILLED", "FILLED", "CANCELLED", "EXIT_PENDING", "UNKNOWN", "RECONCILIATION_REQUIRED"]),
    FILLED: new Set(["EXIT_PENDING", "CLOSED", "RECONCILIATION_REQUIRED"]),
    EXIT_PENDING: new Set(["CLOSED", "PARTIALLY_FILLED", "UNKNOWN", "RECONCILIATION_REQUIRED"]),
    CLOSED: new Set(["RECONCILIATION_REQUIRED"]), // Terminal state unless post-settlement audit mismatch
    REJECTED: new Set([]), // Terminal
    CANCELLED: new Set([]), // Terminal
    EXPIRED: new Set([]), // Terminal
    FAILED: new Set(["RECONCILIATION_REQUIRED"]),
    UNKNOWN: new Set(["OPEN", "PARTIALLY_FILLED", "FILLED", "FAILED", "CANCELLED", "RECONCILIATION_REQUIRED"]),
    RECONCILIATION_REQUIRED: new Set(["OPEN", "PARTIALLY_FILLED", "FILLED", "CLOSED", "CANCELLED"]),
  };

  // In-memory idempotency cache (keyed by hash)
  private static idempotencyRegistry = new Map<string, LifecycleOrder>();

  // In-memory position exit locks (prevents concurrent AI + Manual exit race)
  private static positionExitLocks = new Map<string, { caller: string; acquiredAt: number }>();

  /**
   * Generates a deterministic idempotency key for an order request.
   */
  public static generateIdempotencyKey(params: {
    userId: string;
    symbol: string;
    side: string;
    quantity: number;
    price?: number;
    mode: string;
    clientTimestampWindow?: number; // e.g. 5-second bucket
  }): string {
    const bucket = params.clientTimestampWindow
      ? Math.floor(params.clientTimestampWindow / 5000)
      : Math.floor(Date.now() / 5000);
    const raw = `${params.userId}:${params.symbol}:${params.side}:${params.quantity}:${params.price || "MKT"}:${params.mode}:${bucket}`;
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  /**
   * Creates a new managed order with strict duplicate protection.
   */
  public static createOrder(params: {
    userId: string;
    symbol: string;
    market: "INDIAN" | "CRYPTO";
    mode: "PAPER" | "LIVE";
    side: "BUY" | "SELL";
    quantity: number;
    price?: number;
    stopLoss?: number;
    target?: number;
    customIdempotencyKey?: string;
  }): LifecycleOrder {
    const idempotencyKey =
      params.customIdempotencyKey ||
      this.generateIdempotencyKey({
        userId: params.userId,
        symbol: params.symbol,
        side: params.side,
        quantity: params.quantity,
        price: params.price,
        mode: params.mode,
      });

    // Duplicate Order Defense: Return existing order if key matches
    const existing = this.idempotencyRegistry.get(idempotencyKey);
    if (existing) {
      console.warn(`[IDEMPOTENCY_INTERCEPT] Duplicate order blocked for key=${idempotencyKey}`);
      return existing;
    }

    if (params.quantity <= 0 || !Number.isFinite(params.quantity)) {
      throw new Error(`INVALID_ORDER_QUANTITY: ${params.quantity}`);
    }

    const order: LifecycleOrder = {
      orderId: `ORD_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      idempotencyKey,
      userId: params.userId,
      symbol: params.symbol.toUpperCase(),
      market: params.market,
      mode: params.mode,
      side: params.side,
      quantity: params.quantity,
      filledQuantity: 0,
      remainingQuantity: params.quantity,
      price: params.price,
      averageExecutionPrice: 0,
      state: "NEW",
      stateHistory: [{ from: "NEW", to: "NEW", timestamp: Date.now(), reason: "Created" }],
      feesAccrued: 0,
      realizedPnL: 0,
      stopLoss: params.stopLoss,
      target: params.target,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.idempotencyRegistry.set(idempotencyKey, order);
    return order;
  }

  /**
   * Validates and executes an authoritative state transition.
   */
  public static transitionState(
    order: LifecycleOrder,
    targetState: OrderState,
    reason?: string
  ): LifecycleOrder {
    const currentState = order.state;
    const allowed = this.LEGAL_TRANSITIONS[currentState];

    if (!allowed || !allowed.has(targetState)) {
      throw new Error(
        `ILLEGAL_ORDER_STATE_TRANSITION: Cannot transition order ${order.orderId} from '${currentState}' to '${targetState}'.`
      );
    }

    order.state = targetState;
    order.updatedAt = Date.now();
    order.stateHistory.push({
      from: currentState,
      to: targetState,
      timestamp: Date.now(),
      reason,
    });

    return order;
  }

  /**
   * Position-Level Exit Ownership Mutex:
   * Prevents duplicate orders when AI proposes EXIT and Human manually exits concurrently.
   * Returns true if caller acquired exclusive exit right, false if already taken.
   */
  public static acquireExitOwnership(positionId: string, callerId: string): boolean {
    const now = Date.now();
    const lock = this.positionExitLocks.get(positionId);

    if (lock) {
      // If lock was acquired within the last 30 seconds, reject concurrent exit attempt
      if (now - lock.acquiredAt < 30000) {
        console.warn(
          `[EXIT_RACE_DEFENSE] Position ${positionId} exit already locked by ${lock.caller}. Rejecting concurrent call from ${callerId}.`
        );
        return false;
      }
    }

    this.positionExitLocks.set(positionId, { caller: callerId, acquiredAt: now });
    return true;
  }

  public static releaseExitOwnership(positionId: string): void {
    this.positionExitLocks.delete(positionId);
  }

  /**
   * Stop-Loss vs Target Concurrent Tick Arbitrator:
   * Enforces the deterministic STOP_FIRST system safety invariant.
   */
  public static arbitrateExitTriggers(
    isTargetTriggered: boolean,
    isStopTriggered: boolean
  ): "STOP_LOSS" | "TARGET" | "NONE" {
    if (isStopTriggered && isTargetTriggered) {
      // Stop Loss always takes precedence under market volatility
      return "STOP_LOSS";
    }
    if (isStopTriggered) return "STOP_LOSS";
    if (isTargetTriggered) return "TARGET";
    return "NONE";
  }

  /**
   * Handles multi-stage partial fills with weighted average price calculation.
   */
  public static processPartialFill(
    order: LifecycleOrder,
    fillQty: number,
    fillPrice: number,
    fee: number
  ): LifecycleOrder {
    if (fillQty <= 0) {
      throw new Error("FILL_QUANTITY_MUST_BE_POSITIVE");
    }
    if (fillQty > order.remainingQuantity) {
      throw new Error(
        `OVERFILL_ERROR: Fill quantity ${fillQty} exceeds remaining ${order.remainingQuantity}`
      );
    }

    const previousFilled = order.filledQuantity;
    const previousAvgPrice = order.averageExecutionPrice || 0;

    const newFilled = previousFilled + fillQty;
    const newRemaining = order.quantity - newFilled;

    // Weighted average fill price
    const newAvgPrice =
      newFilled > 0
        ? (previousFilled * previousAvgPrice + fillQty * fillPrice) / newFilled
        : fillPrice;

    order.filledQuantity = newFilled;
    order.remainingQuantity = newRemaining;
    order.averageExecutionPrice = Number(newAvgPrice.toFixed(4));
    order.feesAccrued += fee;

    const targetState: OrderState = newRemaining === 0 ? "FILLED" : "PARTIALLY_FILLED";

    // Ensure order is in a state that permits fill transition
    if (order.state === "SUBMITTING") {
      this.transitionState(order, "OPEN", "Broker placed");
    }
    if (order.state === "OPEN" || order.state === "PARTIALLY_FILLED") {
      this.transitionState(
        order,
        targetState,
        `Filled ${fillQty} @ ${fillPrice} (Total: ${newFilled}/${order.quantity})`
      );
    }

    return order;
  }

  /**
   * Broker Reconciliation Diff Engine:
   * Evaluates differences between local state and broker state.
   */
  public static reconcileWithBroker(
    localOrders: LifecycleOrder[],
    brokerOrders: Array<{ brokerOrderId: string; symbol: string; quantity: number; filledQty: number; status: string }>
  ): ReconciliationDiff[] {
    const diffs: ReconciliationDiff[] = [];
    const brokerMap = new Map(brokerOrders.map((b) => [b.brokerOrderId, b]));

    for (const local of localOrders) {
      const brokerMatch = brokerMap.get(local.orderId);
      if (!brokerMatch) {
        // Local has order, Broker does not
        diffs.push({
          diffType: "LOCAL_AHEAD",
          symbol: local.symbol,
          localQuantity: local.quantity,
          brokerQuantity: 0,
          localPrice: local.price || 0,
          brokerPrice: 0,
          actionRequired: "QUERY_BROKER_AUDIT_LOG_OR_MARK_UNKNOWN",
          resolved: false,
        });
      } else {
        if (local.filledQuantity !== brokerMatch.filledQty) {
          diffs.push({
            diffType: "QUANTITY_MISMATCH",
            symbol: local.symbol,
            localQuantity: local.filledQuantity,
            brokerQuantity: brokerMatch.filledQty,
            localPrice: local.averageExecutionPrice || 0,
            brokerPrice: 0,
            actionRequired: "ALIGN_TO_BROKER_SETTLED_QUANTITY",
            resolved: false,
          });
        } else {
          diffs.push({
            diffType: "MATCHED",
            symbol: local.symbol,
            localQuantity: local.filledQuantity,
            brokerQuantity: brokerMatch.filledQty,
            localPrice: local.averageExecutionPrice || 0,
            brokerPrice: 0,
            actionRequired: "NONE",
            resolved: true,
          });
        }
        brokerMap.delete(local.orderId);
      }
    }

    // Any remaining broker orders not present locally
    for (const [, broker] of brokerMap) {
      diffs.push({
        diffType: "BROKER_AHEAD",
        symbol: broker.symbol,
        localQuantity: 0,
        brokerQuantity: broker.quantity,
        localPrice: 0,
        brokerPrice: 0,
        actionRequired: "IMPORT_ORPHAN_ORDER_SAFELY",
        resolved: false,
      });
    }

    return diffs;
  }

  /**
   * Clears in-memory test states.
   */
  public static resetStateForTesting(): void {
    this.idempotencyRegistry.clear();
    this.positionExitLocks.clear();
  }
}
