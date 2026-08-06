/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Exchange Manager
 *  Unified multi-exchange adapter with smart routing
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  ExchangeAdapter,
  OHLCV,
  OrderBookSnapshot,
  TickerData,
  FundingRateData,
  OpenInterestData,
  LiquidationEvent,
  OrderRequest,
  OrderResult,
  AccountBalance,
  TradeEvent,
} from "../types";

export class ExchangeManager {
  private static instance: ExchangeManager | null = null;
  private adapters: Map<string, ExchangeAdapter> = new Map();
  private primaryExchange: string = "binance";
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Get singleton instance
   */
  static getInstance(): ExchangeManager {
    if (!ExchangeManager.instance) {
      ExchangeManager.instance = new ExchangeManager();
    }
    return ExchangeManager.instance;
  }

  /**
   * Register an exchange adapter
   */
  registerAdapter(adapter: ExchangeAdapter): void {
    this.adapters.set(adapter.name, adapter);
    console.log(`[ExchangeManager] Registered adapter: ${adapter.name}`);
  }

  /**
   * Set the primary exchange for trading
   */
  setPrimaryExchange(name: string): void {
    if (!this.adapters.has(name)) {
      throw new Error(`Exchange adapter '${name}' not registered`);
    }
    this.primaryExchange = name;
    console.log(`[ExchangeManager] Primary exchange set to: ${name}`);
  }

  /**
   * Get a specific adapter by name
   */
  getAdapter(name: string): ExchangeAdapter {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(`Exchange adapter '${name}' not found`);
    }
    return adapter;
  }

  /**
   * Get the primary adapter
   */
  getPrimary(): ExchangeAdapter {
    return this.getAdapter(this.primaryExchange);
  }

  /**
   * Get all registered adapter names
   */
  getRegisteredExchanges(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get klines from primary or specified exchange
   */
  async getKlines(symbol: string, interval: string, limit?: number, exchange?: string): Promise<OHLCV[]> {
    const adapter = exchange ? this.getAdapter(exchange) : this.getPrimary();
    return adapter.getKlines(symbol, interval, limit);
  }

  /**
   * Get order book with optional cross-exchange aggregation
   */
  async getOrderBook(symbol: string, depth?: number, exchange?: string): Promise<OrderBookSnapshot> {
    const adapter = exchange ? this.getAdapter(exchange) : this.getPrimary();
    return adapter.getOrderBook(symbol, depth);
  }

  /**
   * Get aggregated order book from all exchanges
   */
  async getAggregatedOrderBook(symbol: string, depth: number = 20): Promise<OrderBookSnapshot[]> {
    const snapshots: OrderBookSnapshot[] = [];
    const promises = Array.from(this.adapters.entries()).map(async ([name, adapter]) => {
      try {
        const snapshot = await adapter.getOrderBook(symbol, depth);
        snapshots.push(snapshot);
      } catch (err: any) {
        console.warn(`[ExchangeManager] Failed to fetch order book from ${name}: ${err.message}`);
      }
    });
    await Promise.all(promises);
    return snapshots;
  }

  /**
   * Get ticker from primary exchange
   */
  async getTicker(symbol: string, exchange?: string): Promise<TickerData> {
    const adapter = exchange ? this.getAdapter(exchange) : this.getPrimary();
    return adapter.getTicker(symbol);
  }

  /**
   * Get the best price across all exchanges
   */
  async getBestPrice(symbol: string): Promise<{ price: number; exchange: string }> {
    let bestPrice = 0;
    let bestExchange = this.primaryExchange;

    const promises = Array.from(this.adapters.entries()).map(async ([name, adapter]) => {
      try {
        const price = await adapter.getTickerPrice(symbol);
        return { name, price };
      } catch {
        return null;
      }
    });

    const results = await Promise.all(promises);
    for (const result of results) {
      if (result && result.price > 0) {
        if (bestPrice === 0 || result.price < bestPrice) {
          bestPrice = result.price;
          bestExchange = result.name;
        }
      }
    }

    return { price: bestPrice, exchange: bestExchange };
  }

  /**
   * Get funding rate from futures-supporting exchange
   */
  async getFundingRate(symbol: string, exchange?: string): Promise<FundingRateData> {
    const adapter = exchange ? this.getAdapter(exchange) : this.getPrimary();
    return adapter.getFundingRate(symbol);
  }

  /**
   * Get cross-exchange funding rates for arbitrage detection
   */
  async getCrossExchangeFundingRates(symbol: string): Promise<Map<string, FundingRateData>> {
    const rates = new Map<string, FundingRateData>();
    const promises = Array.from(this.adapters.entries()).map(async ([name, adapter]) => {
      try {
        const rate = await adapter.getFundingRate(symbol);
        rates.set(name, rate);
      } catch {
        // Exchange may not support futures
      }
    });
    await Promise.all(promises);
    return rates;
  }

  /**
   * Get open interest from primary exchange
   */
  async getOpenInterest(symbol: string, exchange?: string): Promise<OpenInterestData> {
    const adapter = exchange ? this.getAdapter(exchange) : this.getPrimary();
    return adapter.getOpenInterest(symbol);
  }

  /**
   * Get aggregated liquidation data across exchanges
   */
  async getAggregatedLiquidations(symbol: string, limit: number = 100): Promise<LiquidationEvent[]> {
    const allLiqs: LiquidationEvent[] = [];
    const promises = Array.from(this.adapters.entries()).map(async ([name, adapter]) => {
      try {
        const liqs = await adapter.getLiquidations(symbol, limit);
        allLiqs.push(...liqs);
      } catch {
        // Exchange may not expose liquidation data
      }
    });
    await Promise.all(promises);
    return allLiqs.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Smart order routing: find exchange with best liquidity for the order
   */
  async smartRoute(order: OrderRequest): Promise<{ exchange: string; estimatedSlippageBps: number }> {
    let bestExchange = this.primaryExchange;
    let bestSlippage = Infinity;

    const promises = Array.from(this.adapters.entries()).map(async ([name, adapter]) => {
      try {
        const book = await adapter.getOrderBook(order.symbol, 50);
        const slippage = this.estimateSlippage(book, order);
        return { name, slippage };
      } catch {
        return null;
      }
    });

    const results = await Promise.all(promises);
    for (const result of results) {
      if (result && result.slippage < bestSlippage) {
        bestSlippage = result.slippage;
        bestExchange = result.name;
      }
    }

    return { exchange: bestExchange, estimatedSlippageBps: bestSlippage };
  }

  /**
   * Place order on specified or primary exchange
   */
  async placeOrder(order: OrderRequest, exchange?: string): Promise<OrderResult> {
    const adapter = exchange ? this.getAdapter(exchange) : this.getPrimary();
    return adapter.placeOrder(order);
  }

  /**
   * Get account balance from specific exchange
   */
  async getAccountBalance(exchange?: string): Promise<AccountBalance> {
    const adapter = exchange ? this.getAdapter(exchange) : this.getPrimary();
    return adapter.getAccountBalance();
  }

  /**
   * Get aggregated balance across all exchanges
   */
  async getAggregatedBalance(): Promise<{ total: number; byExchange: Map<string, AccountBalance> }> {
    const byExchange = new Map<string, AccountBalance>();
    let total = 0;

    const promises = Array.from(this.adapters.entries()).map(async ([name, adapter]) => {
      try {
        const balance = await adapter.getAccountBalance();
        byExchange.set(name, balance);
        total += balance.totalBalance;
      } catch {
        // Skip unreachable exchanges
      }
    });

    await Promise.all(promises);
    return { total, byExchange };
  }

  /**
   * Subscribe to trade stream on specified exchange
   */
  subscribeTrades(symbol: string, callback: (trade: TradeEvent) => void, exchange?: string): void {
    const adapter = exchange ? this.getAdapter(exchange) : this.getPrimary();
    adapter.subscribeToTrades(symbol, callback);
  }

  /**
   * Subscribe to order book updates on specified exchange
   */
  subscribeOrderBook(symbol: string, callback: (snapshot: OrderBookSnapshot) => void, exchange?: string): void {
    const adapter = exchange ? this.getAdapter(exchange) : this.getPrimary();
    adapter.subscribeToOrderBook(symbol, callback);
  }

  /**
   * Start health check loop
   */
  startHealthChecks(intervalMs: number = 30_000): void {
    if (this.healthCheckInterval) return;
    
    this.healthCheckInterval = setInterval(async () => {
      for (const [name, adapter] of this.adapters) {
        try {
          const healthy = await adapter.isHealthy();
          if (!healthy) {
            console.warn(`[ExchangeManager] ⚠️ ${name} is unhealthy (latency: ${adapter.getLatencyMs()}ms)`);
          }
        } catch (err: any) {
          console.error(`[ExchangeManager] ❌ ${name} health check failed: ${err.message}`);
        }
      }
    }, intervalMs);
    
    console.log(`[ExchangeManager] Health checks started (${intervalMs}ms interval)`);
  }

  /**
   * Stop all connections and health checks
   */
  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    for (const adapter of this.adapters.values()) {
      adapter.unsubscribeAll();
    }
    console.log("[ExchangeManager] Shutdown complete");
  }

  /**
   * Estimate slippage for an order given an order book snapshot
   */
  private estimateSlippage(book: OrderBookSnapshot, order: OrderRequest): number {
    const levels = order.side === "BUY" ? book.asks : book.bids;
    if (levels.length === 0) return 10000; // Max slippage if no book

    const midPrice = (book.bids[0]?.price + book.asks[0]?.price) / 2;
    if (midPrice <= 0) return 10000;

    let remainingQty = order.quantity;
    let totalCost = 0;

    for (const level of levels) {
      const fillQty = Math.min(remainingQty, level.quantity);
      totalCost += fillQty * level.price;
      remainingQty -= fillQty;
      if (remainingQty <= 0) break;
    }

    if (remainingQty > 0) return 10000; // Not enough liquidity

    const avgPrice = totalCost / order.quantity;
    const slippageBps = Math.abs((avgPrice - midPrice) / midPrice) * 10000;
    return slippageBps;
  }

  /**
   * Get health status of all exchanges
   */
  async getHealthStatus(): Promise<Map<string, { healthy: boolean; latencyMs: number }>> {
    const status = new Map<string, { healthy: boolean; latencyMs: number }>();
    
    const promises = Array.from(this.adapters.entries()).map(async ([name, adapter]) => {
      try {
        const healthy = await adapter.isHealthy();
        status.set(name, { healthy, latencyMs: adapter.getLatencyMs() });
      } catch {
        status.set(name, { healthy: false, latencyMs: -1 });
      }
    });

    await Promise.all(promises);
    return status;
  }
}

// Singleton instance
export const exchangeManager = new ExchangeManager();
