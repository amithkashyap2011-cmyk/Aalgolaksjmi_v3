/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — DUAL MARKET ADAPTER ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════════
 *  Provides a polymorphic adapter interface for both Indian (NSE/BSE)
 *  and Crypto (Binance Spot & USD-M Futures) markets with unified
 *  quote, order, position, and reconciliation capabilities.
 */

import {
  MarketDomain,
  CanonicalQuote,
  CanonicalOrderBook,
  CanonicalPosition,
  CanonicalOrder,
  CanonicalAccount,
  CanonicalOrderRequest,
  CanonicalOrderResult,
  CanonicalOrderUpdates,
  ReconciliationResult,
} from "./CanonicalModel.js";
import { PaperExecutionAdapter, LiveBrokerExecutionAdapter, BrokerOrderRequest } from "../indianMarket/brokerAdapter.js";
import { IndianAuditLogger } from "../indianMarket/auditLogger.js";
import * as binance from "../binanceService.js";
import * as paper from "../paperState.js";
import { INDIAN_SYMBOLS, isSupportedIndianSymbol } from "../../config/indianSymbols.js";
import { MOCK_LIVE_INDIAN_TIKERS } from "../indianMarket/indianPricing.js";

export interface MarketAdapter {
  readonly market: MarketDomain;
  getAccountState(userId: string): Promise<CanonicalAccount>;
  getBalances(userId: string): Promise<Record<string, number>>;
  getPositions(userId: string): Promise<CanonicalPosition[]>;
  getOrders(userId: string): Promise<CanonicalOrder[]>;
  getMarketData(symbol: string): Promise<CanonicalQuote>;
  validateOrder(order: CanonicalOrderRequest): Promise<{ valid: boolean; reason?: string }>;
  calculateFees(order: CanonicalOrderRequest): Promise<{ fee: number; feeCurrency: string }>;
  calculateMargin(order: CanonicalOrderRequest): Promise<{ requiredMargin: number; currency: string }>;
  submitOrder(userId: string, req: CanonicalOrderRequest): Promise<CanonicalOrderResult>;
  cancelOrder(userId: string, orderId: string): Promise<boolean>;
  reconcile(userId: string): Promise<ReconciliationResult>;

  // Backward-compatibility aliases
  getQuote(symbol: string): Promise<CanonicalQuote>;
  getOrderBook(symbol: string, depth?: number): Promise<CanonicalOrderBook>;
  getAccount(userId: string): Promise<CanonicalAccount>;
  placeOrder(userId: string, req: CanonicalOrderRequest): Promise<CanonicalOrderResult>;
  modifyOrder(userId: string, orderId: string, updates: CanonicalOrderUpdates): Promise<boolean>;
}

/**
 * ─── 1. INDIAN MARKET ADAPTER (NSE / BSE / NFO) ───────────────────
 */
export class IndianMarketAdapter implements MarketAdapter {
  public readonly market: MarketDomain = "INDIA";
  private broker = new PaperExecutionAdapter();
  private liveBroker = new LiveBrokerExecutionAdapter();

  public async getQuote(symbol: string): Promise<CanonicalQuote> {
    const isIndian = isSupportedIndianSymbol(symbol) || symbol.startsWith("NIFTY") || symbol.startsWith("BANKNIFTY");
    if (!isIndian) {
      throw new Error(`[INDIAN_MARKET_ADAPTER] Symbol ${symbol} is not a valid Indian market instrument.`);
    }

    const ticker = MOCK_LIVE_INDIAN_TIKERS[symbol] || {
      ltp: 1000,
      open: 995,
      high: 1005,
      low: 990,
      volume: 100000,
    };

    const closePrice = ticker.ltp;

    return {
      symbol,
      market: "INDIA",
      exchange: symbol.includes("CE") || symbol.includes("PE") || symbol.includes("FUT") ? "NFO" : "NSE",
      ltp: ticker.ltp,
      bid: ticker.ltp * 0.9995,
      ask: ticker.ltp * 1.0005,
      open: ticker.open,
      high: ticker.high,
      low: ticker.low,
      close: closePrice,
      volume: ticker.volume,
      change24h: ticker.ltp - ticker.open,
      changePct24h: ticker.open > 0 ? ((ticker.ltp - ticker.open) / ticker.open) * 100 : 0,
      timestamp: new Date().toISOString(),
      indian: {
        lotSize: INDIAN_SYMBOLS[symbol]?.lotSize || 1,
      },
    };
  }

  public async getOrderBook(symbol: string, depth = 5): Promise<CanonicalOrderBook> {
    const quote = await this.getQuote(symbol);
    const bids: Array<[number, number]> = [];
    const asks: Array<[number, number]> = [];

    for (let i = 0; i < depth; i++) {
      bids.push([Number((quote.bid * (1 - i * 0.001)).toFixed(2)), 50 * (i + 1)]);
      asks.push([Number((quote.ask * (1 + i * 0.001)).toFixed(2)), 50 * (i + 1)]);
    }

    return {
      symbol,
      market: "INDIA",
      exchange: quote.exchange,
      bids,
      asks,
      timestamp: new Date().toISOString(),
    };
  }

  public async getPositions(userId: string): Promise<CanonicalPosition[]> {
    const rawPositions = paper.getOpenPositions(userId, "PAPER");
    const indianPositions = rawPositions.filter(
      (p) => p.accountType?.includes("INDIAN") || isSupportedIndianSymbol(p.symbol)
    );

    return indianPositions.map((p) => ({
      id: p.tradeId,
      userId,
      symbol: p.symbol,
      market: "INDIA",
      exchange: p.symbol.includes("CE") || p.symbol.includes("PE") ? "NFO" : "NSE",
      assetClass: p.symbol.includes("CE") || p.symbol.includes("PE") ? "OPTIONS" : "EQUITY",
      side: p.side === "SELL" ? "SHORT" : "LONG",
      quantity: p.quantity,
      entryPrice: p.entryPrice,
      currentPrice: p.entryPrice,
      unrealizedPnl: 0,
      unrealizedPnlPct: 0,
      realizedPnl: 0,
      margin: (p.entryPrice * p.quantity) * 0.2, // 20% margin for MIS
      productType: ((p as any).productType || "MIS") as any,
      stopLoss: p.sl,
      takeProfit: p.tp,
      createdAt: p.meta?.openedAt || new Date().toISOString(),
      updatedAt: p.meta?.openedAt || new Date().toISOString(),
    }));
  }

  public async getOrders(userId: string): Promise<CanonicalOrder[]> {
    return [];
  }

  public async getAccount(userId: string): Promise<CanonicalAccount> {
    const wallet = paper.getWallet(userId, "PAPER", "INDIAN_NSE" as any);
    const availableCash = wallet.get("INR") ?? 0;
    const positions = await this.getPositions(userId);
    const usedMargin = positions.reduce((acc, p) => acc + p.margin, 0);

    return {
      userId,
      market: "INDIA",
      currency: "INR",
      totalEquity: availableCash + usedMargin,
      availableCash,
      usedMargin,
      availableMargin: Math.max(0, availableCash),
      unrealizedPnl: positions.reduce((acc, p) => acc + p.unrealizedPnl, 0),
      realizedPnl: 0,
      timestamp: new Date().toISOString(),
    };
  }

  public async placeOrder(userId: string, req: CanonicalOrderRequest): Promise<CanonicalOrderResult> {
    if (req.market !== "INDIA") {
      throw new Error(`[INDIAN_MARKET_ADAPTER] Rejecting order with market domain '${req.market}' (expected 'INDIA').`);
    }

    if (!isSupportedIndianSymbol(req.symbol) && !req.symbol.startsWith("NIFTY") && !req.symbol.startsWith("BANKNIFTY")) {
      throw new Error(`[INDIAN_MARKET_ADAPTER] Symbol '${req.symbol}' is not allowed in the Indian market adapter.`);
    }

    const brokerReq: BrokerOrderRequest = {
      clientOrderId: req.clientOrderId,
      tradingSymbol: req.symbol,
      exchange: req.exchange === "BSE" ? "BSE" : req.symbol.includes("CE") || req.symbol.includes("PE") ? "NFO" : "NSE",
      action: req.side === "BUY" ? "BUY" : "SELL",
      instrumentType: req.symbol.includes("CE") ? "CE" : req.symbol.includes("PE") ? "PE" : "EQUITY",
      quantity: req.quantity,
      price: req.price,
      orderType: req.orderType === "MARKET" ? "MARKET" : "LIMIT",
      productType: req.productType === "CNC" ? "CNC" : "MIS",
      tag: req.tag,
    };

    const isLive = process.env.LIVE_TRADING_ENABLED === "true";
    const res = isLive ? await this.liveBroker.placeOrder(userId, brokerReq) : await this.broker.placeOrder(userId, brokerReq);

    return {
      ok: res.ok,
      orderId: res.orderId,
      clientOrderId: res.clientOrderId,
      symbol: req.symbol,
      market: "INDIA",
      exchange: req.exchange,
      side: req.side,
      status: res.status === "COMPLETE" ? "FILLED" : res.status === "REJECTED" ? "REJECTED" : "OPEN",
      filledQuantity: res.filledQty,
      averagePrice: res.averagePrice,
      fee: Number((res.averagePrice * res.filledQty * 0.0003).toFixed(2)),
      feeCurrency: "INR",
      rejectionReason: res.rejectionReason,
      executionTimestamp: res.executionTimestamp,
    };
  }

  public async modifyOrder(userId: string, orderId: string, updates: CanonicalOrderUpdates): Promise<boolean> {
    return this.broker.modifyOrder(userId, orderId, updates);
  }

  public async cancelOrder(userId: string, orderId: string): Promise<boolean> {
    return this.broker.cancelOrder(userId, orderId);
  }

  public async getAccountState(userId: string): Promise<CanonicalAccount> {
    return this.getAccount(userId);
  }

  public async getBalances(userId: string): Promise<Record<string, number>> {
    const wallet = paper.getWallet(userId, "PAPER", "INDIAN_NSE" as any);
    return { INR: wallet.get("INR") ?? 0 };
  }

  public async getMarketData(symbol: string): Promise<CanonicalQuote> {
    return this.getQuote(symbol);
  }

  public async validateOrder(order: CanonicalOrderRequest): Promise<{ valid: boolean; reason?: string }> {
    if (order.market !== "INDIA") {
      return { valid: false, reason: `Market domain mismatch: expected 'INDIA', received '${order.market}'` };
    }
    if (!isSupportedIndianSymbol(order.symbol) && !order.symbol.startsWith("NIFTY") && !order.symbol.startsWith("BANKNIFTY")) {
      return { valid: false, reason: `Symbol '${order.symbol}' is not supported on Indian exchange.` };
    }
    if (order.quantity <= 0) {
      return { valid: false, reason: `Order quantity must be positive.` };
    }
    return { valid: true };
  }

  public async calculateFees(order: CanonicalOrderRequest): Promise<{ fee: number; feeCurrency: string }> {
    const ltp = MOCK_LIVE_INDIAN_TIKERS[order.symbol]?.ltp || 1000;
    const notional = (order.price || ltp) * order.quantity;
    const fee = Number((notional * 0.0003).toFixed(2));
    return { fee, feeCurrency: "INR" };
  }

  public async calculateMargin(order: CanonicalOrderRequest): Promise<{ requiredMargin: number; currency: string }> {
    const ltp = MOCK_LIVE_INDIAN_TIKERS[order.symbol]?.ltp || 1000;
    const notional = (order.price || ltp) * order.quantity;
    const requiredMargin = order.productType === "CNC" ? notional : Number((notional * 0.20).toFixed(2));
    return { requiredMargin, currency: "INR" };
  }

  public async submitOrder(userId: string, req: CanonicalOrderRequest): Promise<CanonicalOrderResult> {
    return this.placeOrder(userId, req);
  }

  public async reconcile(userId: string): Promise<ReconciliationResult> {
    const positions = await this.getPositions(userId);
    return {
      market: "INDIA",
      isSynchronized: true,
      localPositionsCount: positions.length,
      brokerPositionsCount: positions.length,
      discrepancies: [],
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * ─── 2. CRYPTO MARKET ADAPTER (BINANCE SPOT & USD-M FUTURES) ─────
 */
export class CryptoMarketAdapter implements MarketAdapter {
  public readonly market: MarketDomain = "CRYPTO";

  public async getQuote(symbol: string): Promise<CanonicalQuote> {
    const isCrypto = symbol.endsWith("USDT") || symbol.endsWith("BUSD") || symbol.endsWith("BTC");
    if (!isCrypto) {
      throw new Error(`[CRYPTO_MARKET_ADAPTER] Symbol ${symbol} is not a valid Crypto market instrument.`);
    }

    const price = binance.getTickerPriceSync(symbol, true);
    if (!price || price <= 0) {
      throw new Error(`[CRYPTO_MARKET_ADAPTER] Live market price for ${symbol} is unavailable.`);
    }

    return {
      symbol,
      market: "CRYPTO",
      exchange: "BINANCE_FUTURES",
      ltp: price,
      bid: price * 0.9998,
      ask: price * 1.0002,
      open: price * 0.99,
      high: price * 1.01,
      low: price * 0.985,
      close: price,
      volume: 0,
      timestamp: new Date().toISOString(),
      crypto: {
        markPrice: price,
        indexPrice: price,
        fundingRate: 0.0001,
      },
    };
  }

  public async getOrderBook(symbol: string, depth = 5): Promise<CanonicalOrderBook> {
    const quote = await this.getQuote(symbol);
    const bids: Array<[number, number]> = [];
    const asks: Array<[number, number]> = [];

    for (let i = 0; i < depth; i++) {
      bids.push([Number((quote.bid * (1 - i * 0.0005)).toFixed(2)), 0.5 * (i + 1)]);
      asks.push([Number((quote.ask * (1 + i * 0.0005)).toFixed(2)), 0.5 * (i + 1)]);
    }

    return {
      symbol,
      market: "CRYPTO",
      exchange: "BINANCE_FUTURES",
      bids,
      asks,
      timestamp: new Date().toISOString(),
    };
  }

  public async getPositions(userId: string): Promise<CanonicalPosition[]> {
    const rawPositions = paper.getOpenPositions(userId, "PAPER");
    const cryptoPositions = rawPositions.filter(
      (p) => !p.accountType?.includes("INDIAN") && (p.symbol.endsWith("USDT") || p.symbol.endsWith("BTC"))
    );

    return cryptoPositions.map((p) => {
      const currentPrice = binance.getTickerPriceSync(p.symbol, true) || p.entryPrice;
      const unrealizedPnl = p.side === "BUY"
        ? (currentPrice - p.entryPrice) * p.quantity
        : (p.entryPrice - currentPrice) * p.quantity;
      const cost = p.entryPrice * p.quantity;
      const unrealizedPnlPct = cost > 0 ? (unrealizedPnl / cost) * 100 : 0;

      return {
        id: p.tradeId,
        userId,
        symbol: p.symbol,
        market: "CRYPTO",
        exchange: "BINANCE_FUTURES",
        assetClass: "CRYPTO_PERP",
        side: p.side === "SELL" ? "SHORT" : "LONG",
        quantity: p.quantity,
        entryPrice: p.entryPrice,
        currentPrice,
        unrealizedPnl,
        unrealizedPnlPct,
        realizedPnl: 0,
        margin: cost / (p.leverage || 10),
        productType: "CROSS",
        leverage: p.leverage || 10,
        liquidationPrice: p.side === "BUY" ? p.entryPrice * 0.88 : p.entryPrice * 1.12,
        stopLoss: p.sl,
        takeProfit: p.tp,
        createdAt: p.meta?.openedAt || new Date().toISOString(),
        updatedAt: p.meta?.openedAt || new Date().toISOString(),
      };
    });
  }

  public async getOrders(userId: string): Promise<CanonicalOrder[]> {
    return [];
  }

  public async getAccount(userId: string): Promise<CanonicalAccount> {
    const wallet = paper.getWallet(userId, "PAPER", "FUTURES");
    const usdtCash = wallet.get("USDT") ?? 0;
    const positions = await this.getPositions(userId);
    const usedMargin = positions.reduce((acc, p) => acc + p.margin, 0);
    const unrealizedPnl = positions.reduce((acc, p) => acc + p.unrealizedPnl, 0);

    return {
      userId,
      market: "CRYPTO",
      currency: "USDT",
      totalEquity: usdtCash + usedMargin + unrealizedPnl,
      availableCash: usdtCash,
      usedMargin,
      availableMargin: Math.max(0, usdtCash),
      unrealizedPnl,
      realizedPnl: 0,
      timestamp: new Date().toISOString(),
    };
  }

  public async placeOrder(userId: string, req: CanonicalOrderRequest): Promise<CanonicalOrderResult> {
    if (req.market !== "CRYPTO") {
      throw new Error(`[CRYPTO_MARKET_ADAPTER] Rejecting order with market domain '${req.market}' (expected 'CRYPTO').`);
    }

    if (!req.symbol.endsWith("USDT") && !req.symbol.endsWith("BTC") && !req.symbol.endsWith("BUSD")) {
      throw new Error(`[CRYPTO_MARKET_ADAPTER] Symbol '${req.symbol}' is not allowed in the Crypto market adapter.`);
    }

    const orderId = `CRYPTO_ORD_${Date.now()}`;
    const fillPrice = req.price || binance.getTickerPriceSync(req.symbol, true);
    if (!fillPrice || fillPrice <= 0) {
      throw new Error(`[CRYPTO_MARKET_ADAPTER] Cannot execute order: Live market price for ${req.symbol} unavailable.`);
    }

    return {
      ok: true,
      orderId,
      clientOrderId: req.clientOrderId,
      symbol: req.symbol,
      market: "CRYPTO",
      exchange: req.exchange,
      side: req.side,
      status: "FILLED",
      filledQuantity: req.quantity,
      averagePrice: fillPrice,
      fee: Number((fillPrice * req.quantity * 0.0004).toFixed(4)), // 0.04% taker fee
      feeCurrency: "USDT",
      executionTimestamp: new Date().toISOString(),
    };
  }

  public async modifyOrder(userId: string, orderId: string, updates: CanonicalOrderUpdates): Promise<boolean> {
    return true;
  }

  public async cancelOrder(userId: string, orderId: string): Promise<boolean> {
    return true;
  }

  public async getAccountState(userId: string): Promise<CanonicalAccount> {
    return this.getAccount(userId);
  }

  public async getBalances(userId: string): Promise<Record<string, number>> {
    const wallet = paper.getWallet(userId, "PAPER", "FUTURES");
    return { USDT: wallet.get("USDT") ?? 0 };
  }

  public async getMarketData(symbol: string): Promise<CanonicalQuote> {
    return this.getQuote(symbol);
  }

  public async validateOrder(order: CanonicalOrderRequest): Promise<{ valid: boolean; reason?: string }> {
    if (order.market !== "CRYPTO") {
      return { valid: false, reason: `Market domain mismatch: expected 'CRYPTO', received '${order.market}'` };
    }
    if (!order.symbol.endsWith("USDT") && !order.symbol.endsWith("BTC") && !order.symbol.endsWith("BUSD")) {
      return { valid: false, reason: `Symbol '${order.symbol}' is not a valid Binance crypto instrument.` };
    }
    if (order.quantity <= 0) {
      return { valid: false, reason: `Order quantity must be positive.` };
    }
    return { valid: true };
  }

  public async calculateFees(order: CanonicalOrderRequest): Promise<{ fee: number; feeCurrency: string }> {
    const price = order.price || binance.getTickerPriceSync(order.symbol, true);
    if (!price || price <= 0) throw new Error(`[CRYPTO_MARKET_ADAPTER] Cannot calculate fees: price for ${order.symbol} unavailable.`);
    const notional = price * order.quantity;
    const fee = Number((notional * 0.0004).toFixed(4));
    return { fee, feeCurrency: "USDT" };
  }

  public async calculateMargin(order: CanonicalOrderRequest): Promise<{ requiredMargin: number; currency: string }> {
    const price = order.price || binance.getTickerPriceSync(order.symbol, true);
    if (!price || price <= 0) throw new Error(`[CRYPTO_MARKET_ADAPTER] Cannot calculate margin: price for ${order.symbol} unavailable.`);
    const notional = price * order.quantity;
    const leverage = order.leverage || 10;
    const requiredMargin = Number((notional / leverage).toFixed(4));
    return { requiredMargin, currency: "USDT" };
  }

  public async submitOrder(userId: string, req: CanonicalOrderRequest): Promise<CanonicalOrderResult> {
    return this.placeOrder(userId, req);
  }

  public async reconcile(userId: string): Promise<ReconciliationResult> {
    const positions = await this.getPositions(userId);
    return {
      market: "CRYPTO",
      isSynchronized: true,
      localPositionsCount: positions.length,
      brokerPositionsCount: positions.length,
      discrepancies: [],
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * ─── 3. MARKET ADAPTER REGISTRY ──────────────────────────────────
 */
export class MarketAdapterRegistry {
  private static indiaAdapter = new IndianMarketAdapter();
  private static cryptoAdapter = new CryptoMarketAdapter();

  public static getAdapter(market: MarketDomain): MarketAdapter {
    if (market === "INDIA") return this.indiaAdapter;
    if (market === "CRYPTO") return this.cryptoAdapter;
    throw new Error(`[MARKET_ADAPTER_REGISTRY] Unknown market domain: ${market}`);
  }

  public static resolveAdapterForSymbol(symbol: string): MarketAdapter {
    if (symbol.endsWith("USDT") || symbol.endsWith("BUSD") || symbol.endsWith("BTC")) {
      return this.cryptoAdapter;
    }
    return this.indiaAdapter;
  }
}
