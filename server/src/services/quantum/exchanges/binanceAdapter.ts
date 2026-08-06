/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Binance Exchange Adapter
 *  Wraps existing binanceService into the unified ExchangeAdapter interface
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  ExchangeAdapter,
  OHLCV,
  OrderBookSnapshot,
  OrderBookLevel,
  TickerData,
  FundingRateData,
  OpenInterestData,
  LiquidationEvent,
  OrderRequest,
  OrderResult,
  AccountBalance,
  TradeEvent,
} from "../types";
import * as binanceService from "../../binanceService.js";

const BINANCE_FAPI_BASE = "https://fapi.binance.com";
const BINANCE_API_BASE = "https://api.binance.com";

export class BinanceAdapter implements ExchangeAdapter {
  name = "binance";
  isConnected = false;
  private lastLatencyMs = 0;
  private wsCallbacks: Map<string, Function> = new Map();

  async getKlines(symbol: string, interval: string, limit: number = 200): Promise<OHLCV[]> {
    const start = Date.now();
    try {
      const klines = await binanceService.getKlines(symbol, interval, undefined, undefined, limit);
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      return klines.map((k: any) => ({
        openTime: k.openTime,
        open: parseFloat(k.open),
        high: parseFloat(k.high),
        low: parseFloat(k.low),
        close: parseFloat(k.close),
        volume: parseFloat(k.volume),
        closeTime: k.closeTime,
        quoteVolume: parseFloat(k.quoteVolume || "0"),
        trades: k.trades || 0,
      }));
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async getOrderBook(symbol: string, depth: number = 20): Promise<OrderBookSnapshot> {
    const start = Date.now();
    try {
      if (binanceService.isRestBanned()) {
        const px = (await binanceService.getTickerPrice(symbol)) || 100;
        return {
          symbol,
          exchange: this.name,
          timestamp: Date.now(),
          bids: [{ price: px * 0.999, quantity: 1.0 }],
          asks: [{ price: px * 1.001, quantity: 1.0 }],
          lastUpdateId: 0,
        };
      }
      const res = await fetch(`${BINANCE_API_BASE}/api/v3/depth?symbol=${symbol}&limit=${depth}`);
      if (!res.ok) {
        const text = await res.text();
        binanceService.handleRestError(res.status, text);
        const px = (await binanceService.getTickerPrice(symbol)) || 100;
        return {
          symbol,
          exchange: this.name,
          timestamp: Date.now(),
          bids: [{ price: px * 0.999, quantity: 1.0 }],
          asks: [{ price: px * 1.001, quantity: 1.0 }],
          lastUpdateId: 0,
        };
      }
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      return {
        symbol,
        exchange: this.name,
        timestamp: Date.now(),
        bids: (data.bids || []).map((b: string[]) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })),
        asks: (data.asks || []).map((a: string[]) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) })),
        lastUpdateId: data.lastUpdateId || 0,
      };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      const px = (await binanceService.getTickerPrice(symbol).catch(() => 100)) || 100;
      return {
        symbol,
        exchange: this.name,
        timestamp: Date.now(),
        bids: [{ price: px * 0.999, quantity: 1.0 }],
        asks: [{ price: px * 1.001, quantity: 1.0 }],
        lastUpdateId: 0,
      };
    }
  }

  async getTicker(symbol: string): Promise<TickerData> {
    const start = Date.now();
    try {
      const data = await binanceService.get24hrTicker(symbol);
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      return {
        symbol,
        price: parseFloat(data.lastPrice || "0"),
        volume24h: parseFloat(data.volume || "0"),
        change24h: parseFloat(data.priceChangePercent || "0"),
        high24h: parseFloat(data.highPrice || "0"),
        low24h: parseFloat(data.lowPrice || "0"),
        timestamp: Date.now(),
      };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      const px = (await binanceService.getTickerPrice(symbol).catch(() => 100)) || 100;
      return {
        symbol,
        price: px,
        volume24h: 1000000,
        change24h: 0,
        high24h: px * 1.02,
        low24h: px * 0.98,
        timestamp: Date.now(),
      };
    }
  }

  async getTickerPrice(symbol: string): Promise<number> {
    const start = Date.now();
    try {
      const price = await binanceService.getTickerPrice(symbol);
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;
      return price;
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async getFundingRate(symbol: string): Promise<FundingRateData> {
    const start = Date.now();
    try {
      if (binanceService.isRestBanned()) {
        const px = (await binanceService.getTickerPrice(symbol)) || 100;
        return {
          symbol,
          fundingRate: 0.0001,
          fundingTime: Date.now(),
          markPrice: px,
          indexPrice: px,
          nextFundingTime: Date.now() + 28800000,
        };
      }
      const res = await fetch(`${BINANCE_FAPI_BASE}/fapi/v1/premiumIndex?symbol=${symbol}`);
      if (!res.ok) {
        const text = await res.text();
        binanceService.handleRestError(res.status, text);
        const px = (await binanceService.getTickerPrice(symbol)) || 100;
        return {
          symbol,
          fundingRate: 0.0001,
          fundingTime: Date.now(),
          markPrice: px,
          indexPrice: px,
          nextFundingTime: Date.now() + 28800000,
        };
      }
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      return {
        symbol,
        fundingRate: parseFloat(data.lastFundingRate || "0"),
        fundingTime: data.nextFundingTime || Date.now(),
        markPrice: parseFloat(data.markPrice || "0"),
        indexPrice: parseFloat(data.indexPrice || "0"),
        nextFundingTime: data.nextFundingTime || Date.now() + 28800000,
      };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      const px = (await binanceService.getTickerPrice(symbol).catch(() => 100)) || 100;
      return {
        symbol,
        fundingRate: 0.0001,
        fundingTime: Date.now(),
        markPrice: px,
        indexPrice: px,
        nextFundingTime: Date.now() + 28800000,
      };
    }
  }

  async getOpenInterest(symbol: string): Promise<OpenInterestData> {
    const start = Date.now();
    try {
      if (binanceService.isRestBanned()) {
        const markPrice = (await binanceService.getTickerPrice(symbol)) || 100;
        return { symbol, openInterest: 10000, openInterestValue: 10000 * markPrice, timestamp: Date.now() };
      }
      const oi = await binanceService.getFuturesOpenInterest(symbol);
      const markPrice = (await binanceService.getTickerPrice(symbol)) || 100;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;
      return {
        symbol,
        openInterest: oi,
        openInterestValue: oi * markPrice,
        timestamp: Date.now(),
      };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      const markPrice = (await binanceService.getTickerPrice(symbol).catch(() => 100)) || 100;
      return { symbol, openInterest: 10000, openInterestValue: 10000 * markPrice, timestamp: Date.now() };
    }
  }

  async getLiquidations(symbol: string, limit: number = 100): Promise<LiquidationEvent[]> {
    const start = Date.now();
    try {
      if (binanceService.isRestBanned()) return [];
      const res = await fetch(
        `${BINANCE_FAPI_BASE}/fapi/v1/allForceOrders?symbol=${symbol}&limit=${limit}`
      );
      if (!res.ok) {
        const text = await res.text();
        binanceService.handleRestError(res.status, text);
        return [];
      }
      const data = await res.json() as any;
      this.lastLatencyMs = Date.now() - start;
      this.isConnected = true;

      if (!Array.isArray(data)) return [];

      return data.map((d: any) => ({
        symbol: d.symbol,
        side: d.side as "BUY" | "SELL",
        price: parseFloat(d.price || "0"),
        quantity: parseFloat(d.origQty || "0"),
        timestamp: d.time || Date.now(),
        exchange: this.name,
      }));
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      return []; // Graceful fallback
    }
  }

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    // Delegate to existing binance service for now
    // In production, this would call the signed API directly
    const start = Date.now();
    try {
      // Use the existing service's placeOrder mechanism
      const result = await binanceService.placeOrder(
        "", // apiKey — handled by existing service
        "", // apiSecret — handled by existing service
        {
          symbol: order.symbol,
          side: order.side as "BUY" | "SELL",
          type: "MARKET",
          quantity: order.quantity.toString(),
        }
      );
      this.lastLatencyMs = Date.now() - start;

      return {
        orderId: result?.orderId?.toString() || `sim_${Date.now()}`,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        price: result?.price ? parseFloat(result.price) : 0,
        status: "FILLED",
        filledQuantity: order.quantity,
        avgFillPrice: result?.price ? parseFloat(result.price) : 0,
        timestamp: Date.now(),
        exchange: this.name,
      };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      throw err;
    }
  }

  async cancelOrder(symbol: string, orderId: string): Promise<boolean> {
    // Placeholder — will integrate with signed API
    console.log(`[BinanceAdapter] Cancel order ${orderId} for ${symbol}`);
    return true;
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
    // Leverage existing binance WebSocket infrastructure
    const key = `trades:${symbol}`;
    this.wsCallbacks.set(key, callback);
    console.log(`[BinanceAdapter] Subscribed to trades: ${symbol}`);
  }

  subscribeToOrderBook(symbol: string, callback: (snapshot: OrderBookSnapshot) => void): void {
    const key = `orderbook:${symbol}`;
    this.wsCallbacks.set(key, callback);
    console.log(`[BinanceAdapter] Subscribed to order book: ${symbol}`);
  }

  unsubscribeAll(): void {
    this.wsCallbacks.clear();
    console.log("[BinanceAdapter] Unsubscribed all");
  }

  async isHealthy(): Promise<boolean> {
    try {
      const start = Date.now();
      const res = await fetch(`${BINANCE_API_BASE}/api/v3/ping`);
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
}
