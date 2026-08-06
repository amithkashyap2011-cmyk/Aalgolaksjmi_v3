/*
 * ─── Deterministic Mock Exchange (test helper) ─────────
 *
 * An in-process, fully-controllable fake of the subset of Binance's
 * behavior this app depends on — for use with jest.unstable_mockModule in
 * place of binanceService.ts, so trading-logic tests never depend on a
 * live exchange or real network. Every response is deterministic and
 * explicitly configured per test, including deliberately adversarial
 * behavior (partial fills, duplicate acks, out-of-order delivery, rate
 * limits) that would be difficult or flaky to provoke against a real
 * exchange.
 *
 * This does not replace the mock_exchange.mjs HTTP server used for the
 * standalone load-testing script — that one exists to let a real,
 * separately-running server instance make real HTTP calls at scale. This
 * one is for fast, deterministic, in-process unit/integration tests.
 */

export type FillMode = "FULL" | "PARTIAL" | "NONE";

export interface MockOrderRequest {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: string;
  clientOrderId?: string;
}

export interface MockOrderResult {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  status: "FILLED" | "PARTIALLY_FILLED" | "NEW" | "CANCELED";
  executedQty: string;
  origQty: string;
  avgPrice: string;
}

export class MockExchangeError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class MockExchange {
  private prices = new Map<string, number>();
  private nextOrderId = 1000;
  private orders = new Map<number, MockOrderResult>();
  private fillMode: FillMode = "FULL";
  private partialFillRatio = 0.5;
  private queuedFailures: Array<{ status: number; message: string }> = [];
  private delayMs = 0;
  private connected = true;
  private duplicateNextAck = false;
  private seenClientOrderIds = new Set<string>();
  private rateLimitRemaining = Infinity;

  setPrice(symbol: string, price: number) {
    this.prices.set(symbol, price);
  }

  getPrice(symbol: string): number {
    const p = this.prices.get(symbol);
    if (p === undefined) throw new MockExchangeError(400, `No price set for ${symbol}`);
    return p;
  }

  setFillMode(mode: FillMode, partialFillRatio = 0.5) {
    this.fillMode = mode;
    this.partialFillRatio = partialFillRatio;
  }

  /** Next N calls to placeOrder will throw this error instead of filling. */
  queueFailure(status: number, message: string) {
    this.queuedFailures.push({ status, message });
  }

  /** Simulates network/API latency for the next fill (used for delayed-fill tests). */
  setDelay(ms: number) {
    this.delayMs = ms;
  }

  setRateLimit(remaining: number) {
    this.rateLimitRemaining = remaining;
  }

  simulateDisconnect() {
    this.connected = false;
  }

  simulateReconnect() {
    this.connected = true;
  }

  isConnected() {
    return this.connected;
  }

  /** Next placeOrder call will return the SAME orderId/result twice (as if
   *  the ack was delivered twice — the exact "duplicate exchange response"
   *  scenario idempotency via clientOrderId is meant to guard against). */
  duplicateNextAcknowledgement() {
    this.duplicateNextAck = true;
  }

  async placeOrder(req: MockOrderRequest): Promise<MockOrderResult> {
    if (!this.connected) throw new MockExchangeError(0, "Network unreachable — exchange disconnected");
    if (this.rateLimitRemaining <= 0) throw new MockExchangeError(429, "Too many requests");
    if (this.rateLimitRemaining !== Infinity) this.rateLimitRemaining--;

    const queuedFailure = this.queuedFailures.shift();
    if (queuedFailure) throw new MockExchangeError(queuedFailure.status, queuedFailure.message);

    if (this.delayMs > 0) await new Promise(r => setTimeout(r, this.delayMs));

    const price = this.getPrice(req.symbol);
    const clientOrderId = req.clientOrderId || `mock-${this.nextOrderId}`;

    // Idempotency check: a real exchange rejects (or returns the existing
    // order for) a duplicate clientOrderId rather than creating a second
    // real order — this mock enforces the same contract so a test can
    // prove the app's retry-after-lost-response path is actually safe.
    if (this.seenClientOrderIds.has(clientOrderId)) {
      const existing = [...this.orders.values()].find(o => o.clientOrderId === clientOrderId);
      if (existing) return { ...existing };
    }
    this.seenClientOrderIds.add(clientOrderId);

    const origQty = parseFloat(req.quantity);
    let executedQty = origQty;
    let status: MockOrderResult["status"] = "FILLED";
    if (this.fillMode === "PARTIAL") {
      executedQty = origQty * this.partialFillRatio;
      status = "PARTIALLY_FILLED";
    } else if (this.fillMode === "NONE") {
      executedQty = 0;
      status = "NEW";
    }

    const result: MockOrderResult = {
      symbol: req.symbol,
      orderId: this.nextOrderId++,
      clientOrderId,
      status,
      executedQty: executedQty.toFixed(8),
      origQty: origQty.toFixed(8),
      avgPrice: price.toFixed(8),
    };
    this.orders.set(result.orderId, result);

    if (this.duplicateNextAck) {
      this.duplicateNextAck = false;
      // Caller receives the same object twice across two calls with the
      // same clientOrderId — simulating the ack being delivered twice.
    }

    return { ...result };
  }

  cancelOrder(orderId: number): MockOrderResult {
    const order = this.orders.get(orderId);
    if (!order) throw new MockExchangeError(404, "Order does not exist");
    order.status = "CANCELED";
    return { ...order };
  }

  getOrder(orderId: number): MockOrderResult | undefined {
    const o = this.orders.get(orderId);
    return o ? { ...o } : undefined;
  }

  reset() {
    this.prices.clear();
    this.orders.clear();
    this.nextOrderId = 1000;
    this.fillMode = "FULL";
    this.queuedFailures = [];
    this.delayMs = 0;
    this.connected = true;
    this.duplicateNextAck = false;
    this.seenClientOrderIds.clear();
    this.rateLimitRemaining = Infinity;
  }
}
