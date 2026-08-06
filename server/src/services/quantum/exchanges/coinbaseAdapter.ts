/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Coinbase Advanced Trade Adapter
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  ExchangeAdapter, OHLCV, OrderBookSnapshot, TickerData,
  FundingRateData, OpenInterestData, LiquidationEvent,
  OrderRequest, OrderResult, AccountBalance, TradeEvent,
} from "../types";

const CB_BASE = "https://api.coinbase.com";

export class CoinbaseAdapter implements ExchangeAdapter {
  name = "coinbase";
  isConnected = false;
  private lastLatencyMs = 0;
  private wsCallbacks: Map<string, Function> = new Map();

  /** Coinbase uses dash format: BTC-USD */
  private toCBSymbol(symbol: string): string {
    const base = symbol.replace("USDT", "").replace("USD", "");
    return `${base}-USD`;
  }

  private granularityMap: Record<string, string> = {
    "1m": "ONE_MINUTE", "5m": "FIVE_MINUTE", "15m": "FIFTEEN_MINUTE",
    "30m": "THIRTY_MINUTE", "1h": "ONE_HOUR", "2h": "TWO_HOUR",
    "6h": "SIX_HOUR", "1d": "ONE_DAY",
  };

  async getKlines(symbol: string, interval: string, limit: number = 200): Promise<OHLCV[]> {
    const start = Date.now();
    const productId = this.toCBSymbol(symbol);
    const granularity = this.granularityMap[interval] || "FIVE_MINUTE";
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - (this.intervalToSec(interval) * limit);

    try {
      const res = await fetch(
        `${CB_BASE}/api/v3/brokerage/market/products/${productId}/candles?start=${startTime}&end=${endTime}&granularity=${granularity}`
      );
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      if (!data.candles) return [];

      return data.candles.reverse().map((k: any) => ({
        openTime: parseInt(k.start) * 1000,
        open: parseFloat(k.open),
        high: parseFloat(k.high),
        low: parseFloat(k.low),
        close: parseFloat(k.close),
        volume: parseFloat(k.volume),
        closeTime: (parseInt(k.start) + this.intervalToSec(interval)) * 1000,
        quoteVolume: parseFloat(k.volume) * parseFloat(k.close),
        trades: 0,
      }));
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async getOrderBook(symbol: string, depth: number = 20): Promise<OrderBookSnapshot> {
    const start = Date.now();
    const productId = this.toCBSymbol(symbol);

    try {
      const res = await fetch(
        `${CB_BASE}/api/v3/brokerage/market/products/${productId}/book?limit=${depth}`
      );
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      const pricebook = data.pricebook || {};

      return {
        symbol, exchange: this.name, timestamp: Date.now(),
        bids: (pricebook.bids || []).map((b: any) => ({
          price: parseFloat(b.price), quantity: parseFloat(b.size),
        })),
        asks: (pricebook.asks || []).map((a: any) => ({
          price: parseFloat(a.price), quantity: parseFloat(a.size),
        })),
        lastUpdateId: 0,
      };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async getTicker(symbol: string): Promise<TickerData> {
    const start = Date.now();
    const productId = this.toCBSymbol(symbol);

    try {
      const res = await fetch(
        `${CB_BASE}/api/v3/brokerage/market/products/${productId}`
      );
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      const price = parseFloat(data.price || "0");

      return {
        symbol, price,
        volume24h: parseFloat(data.volume_24h || "0"),
        change24h: parseFloat(data.price_percentage_change_24h || "0"),
        high24h: parseFloat(data.high_24h || "0"),
        low24h: parseFloat(data.low_24h || "0"),
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

  // Coinbase spot — no futures/funding
  async getFundingRate(_symbol: string): Promise<FundingRateData> {
    return {
      symbol: _symbol, fundingRate: 0, fundingTime: Date.now(),
      markPrice: 0, indexPrice: 0, nextFundingTime: 0,
    };
  }

  async getOpenInterest(_symbol: string): Promise<OpenInterestData> {
    return { symbol: _symbol, openInterest: 0, openInterestValue: 0, timestamp: Date.now() };
  }

  async getLiquidations(_s: string, _l?: number): Promise<LiquidationEvent[]> { return []; }

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    console.log(`[CoinbaseAdapter] Order requires API keys: ${order.symbol} ${order.side}`);
    return {
      orderId: `cb_sim_${Date.now()}`, symbol: order.symbol, side: order.side,
      type: order.type, quantity: order.quantity, price: 0,
      status: "REJECTED", filledQuantity: 0, avgFillPrice: 0,
      timestamp: Date.now(), exchange: this.name,
    };
  }

  async cancelOrder(_s: string, _o: string): Promise<boolean> { return false; }
  async getOpenOrders(_s: string): Promise<OrderResult[]> { return []; }
  async getAccountBalance(): Promise<AccountBalance> {
    return { totalBalance: 0, availableBalance: 0, unrealizedPnl: 0, assets: {} };
  }

  subscribeToTrades(symbol: string, callback: (t: TradeEvent) => void): void {
    this.wsCallbacks.set(`trades:${symbol}`, callback);
  }
  subscribeToOrderBook(symbol: string, callback: (s: OrderBookSnapshot) => void): void {
    this.wsCallbacks.set(`ob:${symbol}`, callback);
  }
  unsubscribeAll(): void { this.wsCallbacks.clear(); }

  async isHealthy(): Promise<boolean> {
    try {
      const start = Date.now();
      const res = await fetch(`${CB_BASE}/api/v3/brokerage/market/products`);
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = res.ok;
      return res.ok;
    } catch { this.isConnected = false; return false; }
  }

  getLatencyMs(): number { return this.lastLatencyMs; }

  private intervalToSec(interval: string): number {
    const map: Record<string, number> = {
      "1m": 60, "5m": 300, "15m": 900, "30m": 1800,
      "1h": 3600, "2h": 7200, "6h": 21600, "1d": 86400, "1w": 604800,
    };
    return map[interval] || 300;
  }
}
