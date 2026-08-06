/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — OKX Exchange Adapter
 *  OKX V5 API
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

const OKX_BASE = "https://www.okx.com";

export class OKXAdapter implements ExchangeAdapter {
  name = "okx";
  isConnected = false;
  private lastLatencyMs = 0;
  private wsCallbacks: Map<string, Function> = new Map();

  /** OKX uses different interval notation */
  private intervalMap: Record<string, string> = {
    "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1H", "2h": "2H", "4h": "4H", "6h": "6H", "12h": "12H",
    "1d": "1D", "1w": "1W", "1M": "1M",
  };

  /** OKX symbols use dash format: BTC-USDT-SWAP for perps */
  private toOKXSymbol(symbol: string): string {
    // BTCUSDT → BTC-USDT-SWAP
    const base = symbol.replace("USDT", "");
    return `${base}-USDT-SWAP`;
  }

  private toOKXSpotSymbol(symbol: string): string {
    const base = symbol.replace("USDT", "");
    return `${base}-USDT`;
  }

  async getKlines(symbol: string, interval: string, limit: number = 200): Promise<OHLCV[]> {
    const start = Date.now();
    const okxInterval = this.intervalMap[interval] || "5m";
    const instId = this.toOKXSymbol(symbol);

    try {
      const res = await fetch(
        `${OKX_BASE}/api/v5/market/candles?instId=${instId}&bar=${okxInterval}&limit=${Math.min(limit, 300)}`
      );
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      if (!data.data) return [];

      // OKX returns newest first
      return data.data.reverse().map((k: string[]) => ({
        openTime: parseInt(k[0]),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: parseInt(k[0]) + this.intervalToMs(interval),
        quoteVolume: parseFloat(k[7] || "0"),
        trades: 0,
      }));
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async getOrderBook(symbol: string, depth: number = 20): Promise<OrderBookSnapshot> {
    const start = Date.now();
    const instId = this.toOKXSymbol(symbol);

    try {
      const res = await fetch(
        `${OKX_BASE}/api/v5/market/books?instId=${instId}&sz=${Math.min(depth, 400)}`
      );
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      const book = data.data?.[0] || {};

      return {
        symbol,
        exchange: this.name,
        timestamp: parseInt(book.ts || Date.now().toString()),
        bids: (book.bids || []).map((b: string[]) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })),
        asks: (book.asks || []).map((a: string[]) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) })),
        lastUpdateId: 0,
      };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async getTicker(symbol: string): Promise<TickerData> {
    const start = Date.now();
    const instId = this.toOKXSymbol(symbol);

    try {
      const res = await fetch(
        `${OKX_BASE}/api/v5/market/ticker?instId=${instId}`
      );
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      const ticker = data.data?.[0] || {};
      const last = parseFloat(ticker.last || "0");
      const open24h = parseFloat(ticker.open24h || "0");

      return {
        symbol,
        price: last,
        volume24h: parseFloat(ticker.vol24h || "0"),
        change24h: open24h > 0 ? ((last - open24h) / open24h) * 100 : 0,
        high24h: parseFloat(ticker.high24h || "0"),
        low24h: parseFloat(ticker.low24h || "0"),
        timestamp: parseInt(ticker.ts || Date.now().toString()),
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
    const instId = this.toOKXSymbol(symbol);

    try {
      const res = await fetch(
        `${OKX_BASE}/api/v5/public/funding-rate?instId=${instId}`
      );
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      const fr = data.data?.[0] || {};

      return {
        symbol,
        fundingRate: parseFloat(fr.fundingRate || "0"),
        fundingTime: parseInt(fr.fundingTime || Date.now().toString()),
        markPrice: 0, // OKX provides mark price via separate endpoint
        indexPrice: 0,
        nextFundingTime: parseInt(fr.nextFundingTime || (Date.now() + 28800000).toString()),
      };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async getOpenInterest(symbol: string): Promise<OpenInterestData> {
    const start = Date.now();
    const instId = this.toOKXSymbol(symbol);

    try {
      const res = await fetch(
        `${OKX_BASE}/api/v5/public/open-interest?instType=SWAP&instId=${instId}`
      );
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      const item = data.data?.[0] || {};
      const oi = parseFloat(item.oi || "0");
      let price = 0;
      try { price = await this.getTickerPrice(symbol); } catch {}

      return {
        symbol,
        openInterest: oi,
        openInterestValue: oi * price,
        timestamp: parseInt(item.ts || Date.now().toString()),
      };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async getLiquidations(symbol: string, limit: number = 100): Promise<LiquidationEvent[]> {
    // OKX provides liquidation data via WebSocket in production
    return [];
  }

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    console.log(`[OKXAdapter] Order placement requires API keys: ${order.symbol} ${order.side}`);
    return {
      orderId: `okx_sim_${Date.now()}`,
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
    return false;
  }

  async getOpenOrders(symbol: string): Promise<OrderResult[]> {
    return [];
  }

  async getAccountBalance(): Promise<AccountBalance> {
    return { totalBalance: 0, availableBalance: 0, unrealizedPnl: 0, assets: {} };
  }

  subscribeToTrades(symbol: string, callback: (trade: TradeEvent) => void): void {
    this.wsCallbacks.set(`trades:${symbol}`, callback);
  }

  subscribeToOrderBook(symbol: string, callback: (snapshot: OrderBookSnapshot) => void): void {
    this.wsCallbacks.set(`orderbook:${symbol}`, callback);
  }

  unsubscribeAll(): void { this.wsCallbacks.clear(); }

  async isHealthy(): Promise<boolean> {
    try {
      const start = Date.now();
      const res = await fetch(`${OKX_BASE}/api/v5/public/time`);
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = res.ok;
      return res.ok;
    } catch {
      this.isConnected = false;
      return false;
    }
  }

  getLatencyMs(): number { return this.lastLatencyMs; }

  private intervalToMs(interval: string): number {
    const map: Record<string, number> = {
      "1m": 60000, "5m": 300000, "15m": 900000, "1h": 3600000,
      "4h": 14400000, "1d": 86400000, "1w": 604800000,
    };
    return map[interval] || 300000;
  }
}
