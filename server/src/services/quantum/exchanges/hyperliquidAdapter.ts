/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Hyperliquid DEX Adapter
 *  On-chain order book DEX
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  ExchangeAdapter, OHLCV, OrderBookSnapshot, TickerData,
  FundingRateData, OpenInterestData, LiquidationEvent,
  OrderRequest, OrderResult, AccountBalance, TradeEvent,
} from "../types";

const HL_BASE = "https://api.hyperliquid.xyz";

export class HyperliquidAdapter implements ExchangeAdapter {
  name = "hyperliquid";
  isConnected = false;
  private lastLatencyMs = 0;
  private wsCallbacks: Map<string, Function> = new Map();

  /** Hyperliquid uses simple asset names: BTC, ETH, SOL */
  private toHLSymbol(symbol: string): string {
    return symbol.replace("USDT", "").replace("USD", "");
  }

  async getKlines(symbol: string, interval: string, limit: number = 200): Promise<OHLCV[]> {
    const start = Date.now();
    const hlSymbol = this.toHLSymbol(symbol);
    const intervalMs = this.intervalToMs(interval);
    const endTime = Date.now();
    const startTime = endTime - (intervalMs * limit);

    try {
      const res = await fetch(`${HL_BASE}/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "candleSnapshot",
          req: { coin: hlSymbol, interval, startTime, endTime },
        }),
      });
      const data = await res.json() as any[];
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      if (!Array.isArray(data)) return [];

      return data.map((k: any) => ({
        openTime: k.t,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        closeTime: k.t + intervalMs,
        quoteVolume: parseFloat(k.v) * parseFloat(k.c),
        trades: k.n || 0,
      }));
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async getOrderBook(symbol: string, depth: number = 20): Promise<OrderBookSnapshot> {
    const start = Date.now();
    const hlSymbol = this.toHLSymbol(symbol);

    try {
      const res = await fetch(`${HL_BASE}/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "l2Book", coin: hlSymbol }),
      });
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      const levels = data.levels || [[], []];

      return {
        symbol,
        exchange: this.name,
        timestamp: Date.now(),
        bids: (levels[0] || []).slice(0, depth).map((b: any) => ({
          price: parseFloat(b.px), quantity: parseFloat(b.sz),
        })),
        asks: (levels[1] || []).slice(0, depth).map((a: any) => ({
          price: parseFloat(a.px), quantity: parseFloat(a.sz),
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
    const hlSymbol = this.toHLSymbol(symbol);

    try {
      const res = await fetch(`${HL_BASE}/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "allMids" }),
      });
      const mids = await res.json() as Record<string, string>;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      const price = parseFloat(mids[hlSymbol] || "0");

      return {
        symbol,
        price,
        volume24h: 0,
        change24h: 0,
        high24h: 0,
        low24h: 0,
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
    const hlSymbol = this.toHLSymbol(symbol);

    try {
      const res = await fetch(`${HL_BASE}/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      });
      const data = await res.json() as any[];
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      // data[0] = meta (universe), data[1] = assetCtxs
      const meta = data[0]?.universe || [];
      const ctxs = data[1] || [];
      const idx = meta.findIndex((m: any) => m.name === hlSymbol);

      if (idx >= 0 && ctxs[idx]) {
        const ctx = ctxs[idx];
        return {
          symbol,
          fundingRate: parseFloat(ctx.funding || "0"),
          fundingTime: Date.now(),
          markPrice: parseFloat(ctx.markPx || "0"),
          indexPrice: parseFloat(ctx.oraclePx || "0"),
          nextFundingTime: Date.now() + 3600000, // Hyperliquid funds hourly
        };
      }

      return {
        symbol, fundingRate: 0, fundingTime: Date.now(),
        markPrice: 0, indexPrice: 0, nextFundingTime: Date.now() + 3600000,
      };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async getOpenInterest(symbol: string): Promise<OpenInterestData> {
    const start = Date.now();
    const hlSymbol = this.toHLSymbol(symbol);

    try {
      const res = await fetch(`${HL_BASE}/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      });
      const data = await res.json() as any[];
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      const meta = data[0]?.universe || [];
      const ctxs = data[1] || [];
      const idx = meta.findIndex((m: any) => m.name === hlSymbol);

      if (idx >= 0 && ctxs[idx]) {
        const oi = parseFloat(ctxs[idx].openInterest || "0");
        const markPx = parseFloat(ctxs[idx].markPx || "0");
        return {
          symbol, openInterest: oi, openInterestValue: oi * markPx,
          timestamp: Date.now(),
        };
      }

      return { symbol, openInterest: 0, openInterestValue: 0, timestamp: Date.now() };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async getLiquidations(_symbol: string, _limit?: number): Promise<LiquidationEvent[]> { return []; }

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    // Hyperliquid requires wallet signing — placeholder
    console.log(`[HyperliquidAdapter] Order requires wallet signing: ${order.symbol} ${order.side}`);
    return {
      orderId: `hl_sim_${Date.now()}`, symbol: order.symbol, side: order.side,
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
      const res = await fetch(`${HL_BASE}/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "allMids" }),
      });
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = res.ok;
      return res.ok;
    } catch { this.isConnected = false; return false; }
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
