/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Bybit Exchange Adapter
 *  Bybit V5 Unified API
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

const BYBIT_BASE = "https://api.bybit.com";

export class BybitAdapter implements ExchangeAdapter {
  name = "bybit";
  isConnected = false;
  private lastLatencyMs = 0;
  private wsCallbacks: Map<string, Function> = new Map();

  private intervalMap: Record<string, string> = {
    "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
    "1h": "60", "2h": "120", "4h": "240", "6h": "360", "12h": "720",
    "1d": "D", "1w": "W", "1M": "M",
  };

  async getKlines(symbol: string, interval: string, limit: number = 200): Promise<OHLCV[]> {
    const start = Date.now();
    const bybitInterval = this.intervalMap[interval] || "5";
    
    try {
      const res = await fetch(
        `${BYBIT_BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${bybitInterval}&limit=${limit}`
      );
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      if (!data.result?.list) return [];

      // Bybit returns in reverse chronological order
      return data.result.list.reverse().map((k: string[]) => ({
        openTime: parseInt(k[0]),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: parseInt(k[0]) + this.intervalToMs(interval),
        quoteVolume: parseFloat(k[6] || "0"),
        trades: 0,
      }));
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async getOrderBook(symbol: string, depth: number = 20): Promise<OrderBookSnapshot> {
    const start = Date.now();
    try {
      const res = await fetch(
        `${BYBIT_BASE}/v5/market/orderbook?category=linear&symbol=${symbol}&limit=${Math.min(depth, 200)}`
      );
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      return {
        symbol,
        exchange: this.name,
        timestamp: parseInt(data.result?.ts || Date.now().toString()),
        bids: (data.result?.b || []).map((b: string[]) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })),
        asks: (data.result?.a || []).map((a: string[]) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) })),
        lastUpdateId: data.result?.u || 0,
      };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async getTicker(symbol: string): Promise<TickerData> {
    const start = Date.now();
    try {
      const res = await fetch(
        `${BYBIT_BASE}/v5/market/tickers?category=linear&symbol=${symbol}`
      );
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      const ticker = data.result?.list?.[0] || {};

      return {
        symbol,
        price: parseFloat(ticker.lastPrice || "0"),
        volume24h: parseFloat(ticker.volume24h || "0"),
        change24h: parseFloat(ticker.price24hPcnt || "0") * 100,
        high24h: parseFloat(ticker.highPrice24h || "0"),
        low24h: parseFloat(ticker.lowPrice24h || "0"),
        timestamp: Date.now(),
      };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async getTickerPrice(symbol: string): Promise<number> {
    const ticker = await this.getTicker(symbol);
    return ticker.price;
  }

  async getFundingRate(symbol: string): Promise<FundingRateData> {
    const start = Date.now();
    try {
      const res = await fetch(
        `${BYBIT_BASE}/v5/market/tickers?category=linear&symbol=${symbol}`
      );
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      const ticker = data.result?.list?.[0] || {};

      return {
        symbol,
        fundingRate: parseFloat(ticker.fundingRate || "0"),
        fundingTime: Date.now(),
        markPrice: parseFloat(ticker.markPrice || "0"),
        indexPrice: parseFloat(ticker.indexPrice || "0"),
        nextFundingTime: parseInt(ticker.nextFundingTime || (Date.now() + 28800000).toString()),
      };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async getOpenInterest(symbol: string): Promise<OpenInterestData> {
    const start = Date.now();
    try {
      const res = await fetch(
        `${BYBIT_BASE}/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=5min&limit=1`
      );
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      const item = data.result?.list?.[0] || {};
      const oi = parseFloat(item.openInterest || "0");
      
      // Get mark price for value
      let markPrice = 0;
      try {
        const ticker = await this.getTicker(symbol);
        markPrice = ticker.price;
      } catch {}

      return {
        symbol,
        openInterest: oi,
        openInterestValue: oi * markPrice,
        timestamp: parseInt(item.timestamp || Date.now().toString()),
      };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async getLiquidations(symbol: string, limit: number = 100): Promise<LiquidationEvent[]> {
    // Bybit doesn't have a direct public liquidation endpoint in V5
    // Use recent trades with isLiq flag via websocket in production
    return [];
  }

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    // Requires signed API — placeholder for now
    console.log(`[BybitAdapter] Order placement requires API keys: ${order.symbol} ${order.side}`);
    return {
      orderId: `bybit_sim_${Date.now()}`,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      quantity: order.quantity,
      price: 0,
      status: "REJECTED",
      filledQuantity: 0,
      avgFillPrice: 0,
      timestamp: Date.now(),
      exchange: this.name,
    };
  }

  async cancelOrder(symbol: string, orderId: string): Promise<boolean> {
    console.log(`[BybitAdapter] Cancel order ${orderId} for ${symbol}`);
    return false;
  }

  async getOpenOrders(symbol: string): Promise<OrderResult[]> {
    return [];
  }

  async getAccountBalance(): Promise<AccountBalance> {
    return {
      totalBalance: 0,
      availableBalance: 0,
      unrealizedPnl: 0,
      assets: {},
    };
  }

  subscribeToTrades(symbol: string, callback: (trade: TradeEvent) => void): void {
    this.wsCallbacks.set(`trades:${symbol}`, callback);
    console.log(`[BybitAdapter] Subscribed to trades: ${symbol}`);
  }

  subscribeToOrderBook(symbol: string, callback: (snapshot: OrderBookSnapshot) => void): void {
    this.wsCallbacks.set(`orderbook:${symbol}`, callback);
    console.log(`[BybitAdapter] Subscribed to order book: ${symbol}`);
  }

  unsubscribeAll(): void {
    this.wsCallbacks.clear();
  }

  async isHealthy(): Promise<boolean> {
    try {
      const start = Date.now();
      const res = await fetch(`${BYBIT_BASE}/v5/market/time`);
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = res.ok;
      return res.ok;
    } catch {
      this.isConnected = false;
      return false;
    }
  }

  getLatencyMs(): number {
    return this.lastLatencyMs;
  }

  private intervalToMs(interval: string): number {
    const map: Record<string, number> = {
      "1m": 60000, "3m": 180000, "5m": 300000, "15m": 900000,
      "30m": 1800000, "1h": 3600000, "4h": 14400000,
      "1d": 86400000, "1w": 604800000,
    };
    return map[interval] || 300000;
  }
}
