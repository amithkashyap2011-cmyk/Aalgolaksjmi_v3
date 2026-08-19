/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Indian Market AI Autonomous Selection & Auto-Trader Daemon
 * ═══════════════════════════════════════════════════════════════════
 *  Automatically evaluates all supported NSE / BSE / NIFTY50 symbols
 *  using AQEA 10-AI Models, selects the highest conviction candidate,
 *  executes the trade without manual intervention, and monitors
 *  open positions for continuous AI Auto-Selloff (SL, TP, Signal Reversal).
 */

import mongoose from "mongoose";
import { INDIAN_SYMBOLS, SUPPORTED_INDIAN_SYMBOLS } from "../config/indianSymbols.js";
import { IndianMarketService } from "./indianMarketService.js";
import { Trade } from "../models/Trade.js";
import * as paper from "./paperState.js";

// Mock baseline tickers shared with Indian Market service
export const MOCK_LIVE_INDIAN_TIKERS: Record<string, { ltp: number; open: number; high: number; low: number; volume: number; rsi14: number; adx14: number }> = {
  "NIFTY50":   { ltp: 24530.20, open: 24371.80, high: 24590.00, low: 24350.10, volume: 1850000, rsi14: 61.2, adx14: 28.5 },
  "BANKNIFTY": { ltp: 52140.50, open: 51715.40, high: 52310.00, low: 51680.00, volume: 940000,  rsi14: 64.8, adx14: 31.2 },
  "SENSEX":    { ltp: 80410.80, open: 79950.50, high: 80600.00, low: 79900.00, volume: 2100000, rsi14: 59.4, adx14: 26.8 },
  "RELIANCE":  { ltp: 2985.40,  open: 2952.90,  high: 2998.00,  low: 2948.00,  volume: 4200000, rsi14: 66.5, adx14: 32.1 },
  "TCS":       { ltp: 4210.15,  open: 4222.55,  high: 4235.00,  low: 4195.00,  volume: 1100000, rsi14: 47.8, adx14: 18.4 },
  "HDFCBANK":  { ltp: 1645.80,  open: 1627.60,  high: 1652.00,  low: 1622.00,  volume: 8500000, rsi14: 63.4, adx14: 29.8 },
  "INFY":      { ltp: 1820.60,  open: 1805.80,  high: 1832.00,  low: 1802.00,  volume: 3100000, rsi14: 58.9, adx14: 24.6 },
  "ICICIBANK": { ltp: 1240.30,  open: 1228.80,  high: 1246.00,  low: 1225.00,  volume: 5400000, rsi14: 62.1, adx14: 27.9 },
  "TATASTEEL": { ltp: 168.45,   open: 170.30,   high: 171.20,   low: 167.80,   volume: 12800000,rsi14: 38.2, adx14: 22.4 },
  "SBIN":      { ltp: 845.60,   open: 838.20,   high: 852.00,   low: 836.00,   volume: 7200000, rsi14: 65.4, adx14: 30.2 },
  "AXISBANK":  { ltp: 1175.40,  open: 1162.00,  high: 1182.00,  low: 1158.00,  volume: 4500000, rsi14: 64.2, adx14: 28.6 },
  "KOTAKBANK": { ltp: 1780.20,  open: 1765.00,  high: 1792.00,  low: 1760.00,  volume: 3800000, rsi14: 61.8, adx14: 26.4 },
  "BHARTIARTL":{ ltp: 1485.30,  open: 1472.00,  high: 1495.00,  low: 1468.00,  volume: 4800000, rsi14: 67.8, adx14: 33.1 },
};

export interface AICandidate {
  symbol: string;
  name: string;
  exchange: "NSE" | "BSE";
  category: string;
  price: number;
  aiSignal: "LONG" | "SHORT" | "HOLD";
  aiConfidence: number;
  reasons: string[];
  lotSize: number;
}

export class IndianMarketAutoTrader {
  private static isAutoTradingEnabled = false;
  private static daemonTimer: NodeJS.Timeout | null = null;
  private static lastScanTime: string | null = null;
  private static lastAutoTrade: any = null;

  /**
   * Scans all supported Indian market symbols and selects the single BEST candidate
   * based on AI conviction score (must be LONG or SHORT with conviction >= minConviction).
   */
  public static async findBestAICandidate(
    userId: string = "guest-user",
    minConviction: number = 75
  ): Promise<AICandidate | null> {
    const candidates: AICandidate[] = [];

    for (const symbol of SUPPORTED_INDIAN_SYMBOLS) {
      const config = INDIAN_SYMBOLS[symbol];
      if (!config) continue;

      const ticker = MOCK_LIVE_INDIAN_TIKERS[symbol] || {
        ltp: 1000, open: 990, high: 1010, low: 985, volume: 500000, rsi14: 55, adx14: 25
      };

      try {
        const evalResult = await IndianMarketService.evaluateIndianSymbol(symbol, userId, {
          ltp: ticker.ltp,
          open: ticker.open,
          high: ticker.high,
          low: ticker.low,
          close: ticker.ltp,
          volume: ticker.volume,
          rsi14: ticker.rsi14,
          adx14: ticker.adx14,
        });

        const signal = evalResult.decision.decision;
        const confidence = evalResult.decision.confidence;

        if ((signal === "LONG" || signal === "SHORT") && confidence >= minConviction) {
          candidates.push({
            symbol,
            name: config.name,
            exchange: config.exchange,
            category: config.category,
            price: ticker.ltp,
            aiSignal: signal,
            aiConfidence: confidence,
            reasons: evalResult.decision.reasons || [],
            lotSize: config.lotSize || 1,
          });
        }
      } catch (err: any) {
        console.warn(`[INDIAN_AUTO_TRADER] Evaluation failed for ${symbol}: ${err.message}`);
      }
    }

    if (candidates.length === 0) return null;

    // Rank by AI conviction descending
    candidates.sort((a, b) => b.aiConfidence - a.aiConfidence);
    return candidates[0];
  }

  /**
   * Automatically executes the best AI trade without manual intervention
   */
  public static async autoExecuteBestTrade(
    userId: string = "guest-user",
    mode: "PAPER" | "LIVE" = "PAPER",
    productType: "MIS" | "CNC" = "MIS",
    overrideSymbol?: string
  ): Promise<any> {
    let candidate: AICandidate | null = null;

    if (overrideSymbol) {
      const config = INDIAN_SYMBOLS[overrideSymbol];
      const ticker = MOCK_LIVE_INDIAN_TIKERS[overrideSymbol] || { ltp: 1000, open: 990, high: 1010, low: 985, volume: 500000, rsi14: 65, adx14: 30 };
      const evalResult = await IndianMarketService.evaluateIndianSymbol(overrideSymbol, userId, {
        ltp: ticker.ltp, open: ticker.open, high: ticker.high, low: ticker.low, close: ticker.ltp, volume: ticker.volume
      });
      candidate = {
        symbol: overrideSymbol,
        name: config?.name || overrideSymbol,
        exchange: config?.exchange || "NSE",
        category: config?.category || "NIFTY50",
        price: ticker.ltp,
        aiSignal: evalResult.decision.decision === "SHORT" ? "SHORT" : "LONG",
        aiConfidence: evalResult.decision.confidence,
        reasons: evalResult.decision.reasons || [],
        lotSize: config?.lotSize || 1,
      };
    } else {
      candidate = await this.findBestAICandidate(userId, 75);
    }

    if (!candidate) {
      throw new Error("NO_QUALIFIED_AI_CANDIDATE: AI models found no Indian market stock/index exceeding 75% conviction threshold.");
    }

    const symbol = candidate.symbol;
    const config = INDIAN_SYMBOLS[symbol];
    const isIndex = config?.assetClass === "INDEX" || symbol.includes("NIFTY") || symbol.includes("BANK") || symbol.includes("SENSEX");
    const orderQty = isIndex ? (config?.lotSize || 15) : (config?.lotSize || 1);
    const filledPrice = candidate.price;
    const isBuy = candidate.aiSignal === "LONG";
    const side = isBuy ? "BUY" : "SELL";
    const isMIS = productType === "MIS";
    const leverage = isMIS ? 5 : 1;
    const totalNotional = orderQty * filledPrice;
    const marginRequired = totalNotional / leverage;
    const accountType = config?.exchange === "BSE" ? "INDIAN_BSE" : (isIndex ? "INDIAN_NIFTY50" : "INDIAN_NSE");

    const objId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : new mongoose.Types.ObjectId("000000000000000000000000");

    // Check if position already open for this symbol to avoid duplicate over-exposure
    const existingPosition = await Trade.findOne({
      userId: objId,
      symbol,
      status: "OPEN",
      accountType,
    });
    if (existingPosition) {
      return {
        alreadyOpen: true,
        message: `AI Position for ${symbol} is already active. Skipping duplicate auto-entry.`,
        tradeId: existingPosition._id.toString(),
        symbol,
        aiConfidence: candidate.aiConfidence,
        aiSignal: candidate.aiSignal,
      };
    }

    // Wallet management
    const wallet = paper.getWallet(userId, mode, accountType as any);
    let inrBal = wallet.get("INR");
    if (inrBal === undefined || inrBal === null || (mode === "PAPER" && inrBal < marginRequired)) {
      inrBal = wallet.get("INR") || 0;
      wallet.set("INR", inrBal);
    }

    if (inrBal < marginRequired) {
      throw new Error(`INSUFFICIENT_INR_BALANCE: Required ₹${marginRequired.toLocaleString("en-IN")}, available ₹${inrBal.toLocaleString("en-IN")}`);
    }

    wallet.set("INR", inrBal - marginRequired);

    const atrEst = filledPrice * 0.012;
    const slPrice = isBuy ? Number((filledPrice - atrEst * 1.5).toFixed(2)) : Number((filledPrice + atrEst * 1.5).toFixed(2));
    const tpPrice = isBuy ? Number((filledPrice + atrEst * 3.0).toFixed(2)) : Number((filledPrice - atrEst * 3.0).toFixed(2));

    const tradeDoc = await Trade.create({
      userId: objId,
      symbol,
      side,
      quantity: orderQty,
      entryPrice: filledPrice,
      sl: slPrice,
      tp: tpPrice,
      leverage,
      status: "OPEN",
      mode,
      accountType,
      strategy: "INDIAN_AI_AUTOTRADER",
      pnl: 0,
      openedAt: new Date(),
      autoCloseStatus: "ARMED",
      entrySource: "AI_AUTONOMOUS_SELECTION",
      decisionPath: ["AQEA_10_MODEL_ENSEMBLE", "AUTONOMOUS_ORDER_EXECUTION"],
      authorizedVotes: { model1: candidate.aiSignal },
      shadowVotes: { model1: candidate.aiSignal },
      coreScore: candidate.aiConfidence,
      finalScore: candidate.aiConfidence,
      aiConfidence: candidate.aiConfidence,
    });

    if (paper && typeof paper.setPosition === "function") {
      paper.setPosition(userId, symbol, mode, {
        userId,
        symbol,
        side,
        quantity: orderQty,
        entryPrice: filledPrice,
        leverage,
        sl: slPrice,
        tp: tpPrice,
        tradeId: tradeDoc._id.toString(),
        accountType: "FUTURES",
      });
    }

    const executionReport = {
      ok: true,
      tradeId: tradeDoc._id.toString(),
      symbol,
      name: candidate.name,
      exchange: candidate.exchange,
      side,
      productType: isMIS ? "INTRADAY (MIS)" : "DELIVERY (CNC)",
      quantity: orderQty,
      price: filledPrice,
      sl: slPrice,
      tp: tpPrice,
      leverage: `${leverage}x`,
      totalNotionalINR: totalNotional,
      marginDebitedINR: marginRequired,
      aiConviction: candidate.aiConfidence,
      aiSignal: candidate.aiSignal,
      aiReasons: candidate.reasons,
      autoSelloffStatus: "ARMED (AI SL/TP & Signal Reversal)",
      executionTimestamp: new Date().toISOString(),
    };

    this.lastAutoTrade = executionReport;
    return executionReport;
  }

  /**
   * Monitor loop for continuous auto selloff (AI SL, AI TP, and AI Signal Reversals)
   */
  public static async monitorAndAutoSelloff(userId: string = "guest-user"): Promise<number> {
    if (mongoose.connection.readyState !== 1) return 0;

    let closedCount = 0;
    const openTrades = await Trade.find({
      status: "OPEN",
      $or: [
        { accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50"] } },
        { strategy: { $in: ["INDIAN_AI_MODEL", "AQEA_INDIAN_AI_MODEL", "INDIAN_AI_AUTOTRADER"] } },
        { symbol: { $in: SUPPORTED_INDIAN_SYMBOLS } }
      ]
    });

    for (const trade of openTrades) {
      const liveTicker = MOCK_LIVE_INDIAN_TIKERS[trade.symbol];
      if (!liveTicker || !liveTicker.ltp) continue;

      const ltp = liveTicker.ltp;
      const isLong = trade.side === "BUY";
      let triggerReason: string | null = null;

      // 1. Check AI Stop-Loss
      if (trade.sl) {
        if (isLong && ltp <= trade.sl) {
          triggerReason = `AI_STOP_LOSS_TRIGGERED (Price ₹${ltp} <= SL ₹${trade.sl})`;
        } else if (!isLong && ltp >= trade.sl) {
          triggerReason = `AI_STOP_LOSS_TRIGGERED (Price ₹${ltp} >= SL ₹${trade.sl})`;
        }
      }

      // 2. Check AI Take-Profit
      if (!triggerReason && trade.tp) {
        if (isLong && ltp >= trade.tp) {
          triggerReason = `AI_TAKE_PROFIT_TRIGGERED (Price ₹${ltp} >= TP ₹${trade.tp})`;
        } else if (!isLong && ltp <= trade.tp) {
          triggerReason = `AI_TAKE_PROFIT_TRIGGERED (Price ₹${ltp} <= TP ₹${trade.tp})`;
        }
      }

      // 3. Check AI Signal Reversal Auto-Selloff
      if (!triggerReason) {
        try {
          const evalResult = await IndianMarketService.evaluateIndianSymbol(trade.symbol, userId, {
            ltp, open: liveTicker.open, high: liveTicker.high, low: liveTicker.low, close: ltp, volume: liveTicker.volume,
            rsi14: liveTicker.rsi14, adx14: liveTicker.adx14
          });
          const currentSignal = evalResult.decision.decision;
          const currentConfidence = evalResult.decision.confidence;

          // If position is LONG and current signal is SHORT with conviction >= 75%, trigger AI Reversal Auto Selloff
          if (isLong && currentSignal === "SHORT" && currentConfidence >= 75) {
            triggerReason = `AI_SIGNAL_REVERSAL_AUTO_SELLOFF (Signal flipped LONG -> SHORT ${currentConfidence}% conviction)`;
          } else if (!isLong && currentSignal === "LONG" && currentConfidence >= 75) {
            triggerReason = `AI_SIGNAL_REVERSAL_AUTO_SELLOFF (Signal flipped SHORT -> LONG ${currentConfidence}% conviction)`;
          }
        } catch (err) {
          // Ignore evaluation error during selloff check
        }
      }

      // Execute Auto Selloff
      if (triggerReason) {
        console.log(`🤖 [INDIAN_AUTO_SELLOFF] ${triggerReason} for ${trade.symbol}! Squaring off position...`);
        const priceDiff = isLong ? (ltp - trade.entryPrice) : (trade.entryPrice - ltp);
        const realizedPnl = priceDiff * trade.quantity;
        const totalNotional = trade.entryPrice * trade.quantity;
        const marginReturned = totalNotional / (trade.leverage || 1);

        trade.status = "CLOSED";
        trade.exitPrice = ltp;
        trade.pnl = realizedPnl;
        trade.netPnl = realizedPnl;
        trade.closedAt = new Date();
        trade.autoCloseStatus = "TRIGGERED";
        trade.exitReason = triggerReason;
        await trade.save();

        const userIdStr = trade.userId ? trade.userId.toString() : userId;
        const accountType = trade.symbol.includes("NIFTY") || trade.symbol.includes("BANK") ? "INDIAN_NIFTY50" : "INDIAN_NSE";
        const wallet = paper.getWallet(userIdStr, trade.mode as any, accountType as any);
        const currentBal = wallet.get("INR") || 0;
        wallet.set("INR", currentBal + marginReturned + realizedPnl);

        if (paper && typeof paper.removePosition === "function") {
          paper.removePosition(userIdStr, trade.symbol, trade.mode as any, "FUTURES");
        }

        closedCount++;
      }
    }

    return closedCount;
  }

  /**
   * Toggle background daemon
   */
  public static setAutoTradingEnabled(enabled: boolean): boolean {
    this.isAutoTradingEnabled = enabled;
    if (enabled) {
      this.startDaemon();
    } else {
      this.stopDaemon();
    }
    return this.isAutoTradingEnabled;
  }

  public static isEnabled(): boolean {
    return this.isAutoTradingEnabled;
  }

  public static startDaemon(): void {
    if (this.daemonTimer) return;
    this.isAutoTradingEnabled = true;
    if (process.env.NODE_ENV !== "test") {
      console.log("🤖 [INDIAN_AUTO_TRADER] Starting Autonomous AI Execution & Auto-Selloff Daemon...");
    }

    // Run daemon every 10 seconds
    this.daemonTimer = setInterval(async () => {
      try {
        this.lastScanTime = new Date().toISOString();
        
        // 🛡️ Market Hours Guard: Only open new trades during active trading hours (09:15 AM - 03:30 PM IST)
        const session = IndianMarketService.getMarketSession();
        
        // 1. Run auto selloff monitor for existing positions
        await this.monitorAndAutoSelloff("guest-user");

        if (!session.isOpen && process.env.NODE_ENV !== "test") {
          // Market is closed (AFTER_MARKET_HOURS, WEEKEND, HOLIDAY) — skip new trade execution
          return;
        }

        // 2. Automatically select and execute best trade opportunity if slots available
        const openCount = await Trade.countDocuments({
          status: "OPEN",
          accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50"] }
        });

        // Max 3 active Indian market paper positions at a time
        if (openCount < 3) {
          await this.autoExecuteBestTrade("guest-user", "PAPER", "MIS");
        }
      } catch (err: any) {
        // Log daemon tick status gracefully
      }
    }, 10000);
  }

  public static stopDaemon(): void {
    const wasRunning = Boolean(this.daemonTimer || this.isAutoTradingEnabled);
    if (this.daemonTimer) {
      clearInterval(this.daemonTimer);
      this.daemonTimer = null;
    }
    this.isAutoTradingEnabled = false;
    if (wasRunning && process.env.NODE_ENV !== "test") {
      console.log("🛑 [INDIAN_AUTO_TRADER] Daemon stopped.");
    }
  }

  public static getStatus() {
    return {
      enabled: this.isAutoTradingEnabled,
      lastScanTime: this.lastScanTime,
      lastAutoTrade: this.lastAutoTrade,
    };
  }
}
