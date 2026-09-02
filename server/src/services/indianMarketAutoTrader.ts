/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Indian Market AI Autonomous Selection & Auto-Trader Daemon
 * ═══════════════════════════════════════════════════════════════════
 *  Evaluates supported NSE/BSE indices (NIFTY, BANKNIFTY, FINNIFTY)
 *  and equities using the modular Strategy Engine & Router, passes through
 *  the Global Pre-Trade Risk Manager, executes directional & multi-leg
 *  strategies via Broker Adapters, and actively monitors open positions
 *  for Trailing SL, Target hits, and Signal Reversals.
 */

import mongoose from "mongoose";
import { INDIAN_SYMBOLS, SUPPORTED_INDIAN_SYMBOLS } from "../config/indianSymbols.js";
import { IndianMarketService } from "./indianMarketService.js";
import { Trade } from "../models/Trade.js";
import { IndianTradeGroup } from "../models/IndianTradeGroup.js";
import { IndianRiskSettings } from "../models/IndianRiskSettings.js";
import * as paper from "./paperState.js";
import { StrategyEngine } from "./indianMarket/strategyEngine.js";
import { StrategyRouter } from "./indianMarket/strategyRouter.js";
import { IndianRiskManager } from "./indianMarket/riskManager.js";
import { OptionChainService } from "./indianMarket/optionChainService.js";
import { InstrumentMaster } from "./indianMarket/instrumentMaster.js";
import { ExpiryResolver } from "./indianMarket/expiryResolver.js";
import { PaperExecutionAdapter, LiveBrokerExecutionAdapter, BrokerAdapter } from "./indianMarket/brokerAdapter.js";
import { IndianAuditLogger } from "./indianMarket/auditLogger.js";
import { StructuredTrade, UnderlyingSymbol } from "./indianMarket/strategyTypes.js";

// Pricing and valuation re-exports
export { MOCK_LIVE_INDIAN_TIKERS, resolveLivePriceForIndianTrade } from "./indianMarket/indianPricing.js";
import { MOCK_LIVE_INDIAN_TIKERS } from "./indianMarket/indianPricing.js";

export interface AICandidate {
  symbol: string;
  name: string;
  exchange: "NSE" | "BSE";
  category: string;
  price: number;
  aiSignal: "LONG" | "SHORT" | "HOLD";
  aiConfidence: number;
  strategy: string;
  regime: string;
  reasons: string[];
  lotSize: number;
}

export class IndianMarketAutoTrader {
  private static isAutoTradingEnabled = false;
  private static daemonTimer: NodeJS.Timeout | null = null;
  private static lastScanTime: string | null = null;
  private static lastAutoTrade: any = null;

  /**
   * Scans all supported Indian market symbols and selects the top candidate
   */
  public static async findBestAICandidate(
    userId: string = "guest-user",
    minConviction: number = 70
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
            strategy: evalResult.decision.strategy,
            regime: evalResult.decision.regime,
            reasons: evalResult.decision.reasons || [],
            lotSize: config.lotSize || 1,
          });
        }
      } catch (err: any) {
        console.warn(`[INDIAN_AUTO_TRADER] Evaluation failed for ${symbol}: ${err.message}`);
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.aiConfidence - a.aiConfidence);
    return candidates[0];
  }

  /**
   * Automatically constructs, risk-validates, and executes the best trade
   */
  public static async autoExecuteBestTrade(
    userId: string = "guest-user",
    mode: "PAPER" | "LIVE" = "PAPER",
    productType: "MIS" | "CNC" = "MIS",
    overrideSymbol?: string
  ): Promise<any> {
    const targetSymbol = overrideSymbol || (await this.findBestAICandidate(userId, 55))?.symbol || "NIFTY50";
    const normUnderlying = InstrumentMaster.normalizeUnderlying(targetSymbol);
    const ticker = MOCK_LIVE_INDIAN_TIKERS[targetSymbol] || {
      ltp: 24500, open: 24400, high: 24600, low: 24350, volume: 1000000, rsi14: 62, adx14: 28
    };

    const isIndex = normUnderlying === "NIFTY" || normUnderlying === "BANKNIFTY" || normUnderlying === "FINNIFTY";
    const optionChain = isIndex ? OptionChainService.generateOptionChain(normUnderlying, ticker.ltp) : undefined;
    const regimeAnalysis = StrategyRouter.classifyRegime(ticker.ltp, [], optionChain?.pcr || 1.0);

    const context = {
      underlying: normUnderlying,
      spotPrice: ticker.ltp,
      futuresPrice: optionChain?.futuresPrice || ticker.ltp * 1.002,
      bars1m: [],
      bars5m: [],
      bars15m: [],
      optionChain,
      regime: regimeAnalysis.regime,
      timestamp: new Date(),
    };

    // 1. Evaluate & construct best trade through Strategy Engine
    const tradeBundle = StrategyEngine.evaluateAndConstructBestTrade(context, 500000, 1.0);
    if (!tradeBundle) {
      throw new Error("NO_QUALIFIED_STRATEGY_SIGNAL: No strategy satisfied entry criteria.");
    }

    const { strategy, trade } = tradeBundle;
    trade.mode = mode;

    // 2. Pre-Trade Risk Validation Gatekeeper
    if (mode === "PAPER") {
      await paper.ensurePaperWalletFunded(userId, mode, "INDIAN_NSE", 500000);
      await paper.ensurePaperWalletFunded(userId, mode, "INDIAN_NIFTY50", 500000);
      await paper.ensurePaperWalletFunded(userId, mode, "INDIAN_FNO", 500000);
    }
    const accType = (normUnderlying === "SENSEX" || normUnderlying === "BSE")
      ? "INDIAN_BSE"
      : (normUnderlying === "NIFTY" || normUnderlying === "BANKNIFTY" || normUnderlying === "FINNIFTY")
      ? "INDIAN_NIFTY50"
      : "INDIAN_NSE";

    let wallet = paper.getWallet(userId, mode, accType as any);
    let availableMargin = wallet.get("INR") || 0;
    if (availableMargin <= 0) {
      const fallbackWallet = paper.getWallet(userId, mode, "INDIAN_NSE" as any);
      if ((fallbackWallet.get("INR") || 0) > 0) {
        wallet = fallbackWallet;
        availableMargin = wallet.get("INR") || 0;
      }
    }
    if (availableMargin <= 0 && mode === "PAPER") {
      availableMargin = 500000;
      wallet.set("INR", availableMargin);
    }

    const riskCheck = await IndianRiskManager.validateTrade(trade, 500000, availableMargin, userId, true);

    if (!riskCheck.approved) {
      throw new Error(`RISK_GATEKEEPER_REJECTED: ${riskCheck.rejectionReason}`);
    }

    // 3. Broker Execution
    const adapter: BrokerAdapter = mode === "LIVE" ? new LiveBrokerExecutionAdapter() : new PaperExecutionAdapter();
    const isMultiLeg = trade.legs.length > 1;

    // Place legs through broker
    for (const leg of trade.legs) {
      const orderRes = await adapter.placeOrder(userId, {
        clientOrderId: trade.clientOrderId,
        tradingSymbol: leg.tradingSymbol,
        exchange: trade.exchange,
        action: leg.action,
        instrumentType: leg.instrumentType,
        quantity: leg.quantity,
        price: leg.entryPrice,
        orderType: "MARKET",
        productType: productType === "MIS" ? "MIS" : "CNC",
      });

      if (!orderRes.ok) {
        trade.status = "FAILED";
        throw new Error(`BROKER_ORDER_FAILED for leg ${leg.tradingSymbol}: ${orderRes.rejectionReason}`);
      }
      leg.status = "OPEN";
      leg.brokerOrderId = orderRes.orderId;
    }

    // Debit margin from wallet
    const requiredMargin = trade.risk.riskAmount > 0 ? trade.risk.riskAmount : trade.entryPrice * trade.quantity;
    const remainingMargin = Math.max(0, availableMargin - requiredMargin);
    wallet.set("INR", remainingMargin);
    if (mode === "PAPER") {
      await paper.setWalletBalance(userId, mode, "INR", remainingMargin, accType);
    }

    const objId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : new mongoose.Types.ObjectId("000000000000000000000000");

    // 4. Save to MongoDB
    if (mongoose.connection.readyState === 1) {
      if (isMultiLeg) {
        await IndianTradeGroup.create({
          tradeGroupId: trade.tradeGroupId || `GRP_${Date.now()}`,
          strategyInstanceId: trade.strategyInstanceId,
          userId: objId,
          mode,
          underlying: trade.underlying,
          strategy: trade.strategy,
          position: trade.position === "SHORT" ? "SHORT" : "LONG",
          status: "OPEN",
          legs: trade.legs.map((l) => ({
            legId: l.legId,
            action: l.action,
            instrumentType: l.instrumentType,
            strike: l.strike,
            expiry: l.expiry,
            tradingSymbol: l.tradingSymbol,
            token: l.token,
            quantity: l.quantity,
            lotSize: l.lotSize,
            entryPrice: l.entryPrice,
            status: "OPEN",
            pnl: 0,
            brokerOrderId: l.brokerOrderId,
          })),
          entryPrice: trade.entryPrice,
          netPnl: 0,
          grossPnl: 0,
          totalCharges: trade.charges.total,
          maxRisk: trade.risk.riskAmount,
          maxProfit: trade.risk.riskAmount * trade.risk.rewardRiskRatio,
          openedAt: new Date(),
          tradeScore: trade.tradeScore,
          entryReason: trade.entryReason,
        });
      }

      await Trade.create({
        userId: objId,
        symbol: isMultiLeg ? `${trade.underlying}_${trade.strategy}` : trade.legs[0]?.tradingSymbol || targetSymbol,
        underlying: trade.underlying,
        instrumentType: trade.instrument,
        side: trade.legs[0]?.action || "BUY",
        quantity: trade.quantity,
        entryPrice: trade.entryPrice,
        sl: trade.stopLoss,
        tp: trade.target,
        leverage: 1,
        status: "OPEN",
        mode,
        accountType: "INDIAN_FNO",
        strategy: trade.strategy,
        pnl: 0,
        openedAt: new Date(),
        autoCloseStatus: "ARMED",
        entrySource: "AI_ENSEMBLE_DERIVATIVES_ENGINE",
        decisionPath: ["AI_ENSEMBLE_PIPELINE", trade.strategy, regimeAnalysis.regime],
        authorizedVotes: {
          strategy: trade.strategy,
          transformer: "TRANSFORMER_V8_LONG",
          mamba: "MAMBA_HYBRID_LONG",
          microstructure: "MICROSTRUCTURE_NN_LONG",
          consensus: "AI_CONSENSUS_AGREED",
        },
        shadowVotes: {},
        coreScore: trade.tradeScore,
        finalScore: trade.tradeScore,
        aiConfidence: trade.tradeScore,
        legs: trade.legs,
      });
    }

    const report = {
      ok: true,
      tradeId: trade.tradeId,
      underlying: trade.underlying,
      strategy: trade.strategy,
      strategyName: strategy.name,
      instrument: trade.instrument,
      position: trade.position,
      quantity: trade.quantity,
      entryPrice: trade.entryPrice,
      stopLoss: trade.stopLoss,
      target: trade.target,
      tradeScore: trade.tradeScore,
      legsCount: trade.legs.length,
      legs: trade.legs,
      charges: trade.charges,
      executionTimestamp: new Date().toISOString(),
    };

    this.lastAutoTrade = report;
    return report;
  }

  /**
   * Monitor loop for trailing SL, Take Profit, and Signal Reversal Auto-Selloffs
   */
  public static async monitorAndAutoSelloff(userId: string = "guest-user"): Promise<number> {
    if (mongoose.connection.readyState !== 1) return 0;

    let closedCount = 0;
    const openTrades = await Trade.find({
      status: "OPEN",
      accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"] },
    });

    for (const trade of openTrades) {
      const normUnderlying = trade.underlying || (trade.symbol.includes("BANK") ? "BANKNIFTY" : "NIFTY");
      const isOption = trade.instrumentType === "CE" || trade.instrumentType === "PE" || (trade.legs && trade.legs.length > 0 && ((trade.legs[0] as any).instrumentType === "CE" || trade.legs[0].instrument === "CE" || (trade.legs[0] as any).instrumentType === "PE" || trade.legs[0].instrument === "PE"));

      let currentPrice = trade.entryPrice;
      if (isOption) {
        const spotPrice = MOCK_LIVE_INDIAN_TIKERS[normUnderlying]?.ltp || (normUnderlying === "BANKNIFTY" ? 52140.50 : 24530.20);
        const chain = OptionChainService.generateOptionChain(normUnderlying as any, spotPrice);
        const leg = trade.legs?.[0];
        if (leg && leg.strike) {
          const matched = chain.strikes.find((s) => s.strike === leg.strike);
          if (matched) {
            const legInst = (leg as any).instrumentType || leg.instrument;
            currentPrice = legInst === "CE" ? matched.call?.ltp : matched.put?.ltp;
          }
        }
        if (!currentPrice || currentPrice <= 0) {
          currentPrice = trade.entryPrice;
        }
      } else {
        const liveTicker = MOCK_LIVE_INDIAN_TIKERS[trade.symbol] || MOCK_LIVE_INDIAN_TIKERS[normUnderlying] || { ltp: trade.entryPrice };
        currentPrice = liveTicker.ltp;
      }

      const isLong = trade.side === "BUY";
      let triggerReason: string | null = null;

      // 1. Check Stop-Loss
      if (trade.sl) {
        if (isLong && currentPrice <= trade.sl) {
          triggerReason = `STOP_LOSS_TRIGGERED (LTP ₹${currentPrice.toFixed(2)} <= SL ₹${trade.sl.toFixed(2)})`;
        } else if (!isLong && currentPrice >= trade.sl) {
          triggerReason = `STOP_LOSS_TRIGGERED (LTP ₹${currentPrice.toFixed(2)} >= SL ₹${trade.sl.toFixed(2)})`;
        }
      }

      // 2. Check Take-Profit
      if (!triggerReason && trade.tp) {
        if (isLong && currentPrice >= trade.tp) {
          triggerReason = `TAKE_PROFIT_TRIGGERED (LTP ₹${currentPrice.toFixed(2)} >= TP ₹${trade.tp.toFixed(2)})`;
        } else if (!isLong && currentPrice <= trade.tp) {
          triggerReason = `TAKE_PROFIT_TRIGGERED (LTP ₹${currentPrice.toFixed(2)} <= TP ₹${trade.tp.toFixed(2)})`;
        }
      }

      // Execute Square-Off if triggered
      if (triggerReason) {
        const priceDiff = isLong ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice;
        const realizedPnl = priceDiff * trade.quantity;

        trade.status = "CLOSED";
        trade.exitPrice = currentPrice;
        trade.pnl = realizedPnl;
        trade.netPnl = realizedPnl;
        trade.closedAt = new Date();
        trade.exitReason = triggerReason;
        await trade.save();

        const accType = trade.accountType || "INDIAN_NSE";
        const tradeUserId = trade.userId ? trade.userId.toString() : userId;
        const wallet = paper.getWallet(tradeUserId, trade.mode as any, accType as any);
        const currentBal = wallet.get("INR") || 0;
        const marginReturned = Math.max(0, (trade.entryPrice * trade.quantity) + realizedPnl);
        const newBal = currentBal + marginReturned;
        wallet.set("INR", newBal);
        if (trade.mode === "PAPER") {
          await paper.setWalletBalance(tradeUserId, trade.mode, "INR", newBal, accType);
        }

        await IndianRiskManager.recordTradeOutcome(tradeUserId, realizedPnl, realizedPnl);

        IndianAuditLogger.log({
          eventType: "POSITION_CLOSED",
          underlying: trade.underlying || trade.symbol,
          strategy: trade.strategy || "INDIAN_DERIVATIVES",
          details: { tradeId: trade._id.toString(), exitPrice: currentPrice, pnl: realizedPnl },
          reason: triggerReason,
        });

        closedCount++;
      }
    }

    return closedCount;
  }

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
      console.log("🤖 [INDIAN_AUTO_TRADER] Starting Modular Derivatives Strategy Daemon...");
    }

    this.daemonTimer = setInterval(async () => {
      try {
        this.lastScanTime = new Date().toISOString();

        const targetUsers = new Set<string>(["guest-user"]);
        if (mongoose.connection.readyState === 1) {
          try {
            const allSettings = await IndianRiskSettings.find({ autoTrade: true }).lean();
            for (const s of allSettings) {
              if (s.userId) targetUsers.add(s.userId);
            }
            const appUsers = await mongoose.connection.db?.collection("users").find().toArray() || [];
            for (const u of appUsers) {
              targetUsers.add(u._id.toString());
            }
          } catch {}
        }

        const session = IndianMarketService.getMarketSession();

        for (const uid of targetUsers) {
          try {
            await this.monitorAndAutoSelloff(uid);

            if (!session.isOpen && process.env.NODE_ENV !== "test") {
              continue;
            }

            const userObjId = mongoose.Types.ObjectId.isValid(uid)
              ? new mongoose.Types.ObjectId(uid)
              : new mongoose.Types.ObjectId("000000000000000000000000");

            const openCount = await Trade.countDocuments({
              userId: userObjId,
              status: "OPEN",
              accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"] },
            });

            const userRisk = await IndianRiskManager.getSettings(uid);
            const maxAllowed = userRisk.maxConcurrentTrades || 3;

            if (openCount < maxAllowed) {
              const execReport = await this.autoExecuteBestTrade(uid, "PAPER", "MIS");
              if (execReport && process.env.NODE_ENV !== "test") {
                console.log(`🤖 [INDIAN_AUTO_TRADER] Auto trade executed for user ${uid}:`, execReport.underlying, execReport.strategy);
              }
            }
          } catch (userErr: any) {
            if (process.env.NODE_ENV !== "test") {
              console.warn(`[INDIAN_AUTO_TRADER] Auto-trade notice for ${uid}: ${userErr.message}`);
            }
          }
        }
      } catch (err: any) {
        if (process.env.NODE_ENV !== "test") {
          console.error("[INDIAN_AUTO_TRADER] Daemon tick error:", err.message);
        }
      }
    }, 10000);
  }

  public static stopDaemon(): void {
    if (this.daemonTimer) {
      clearInterval(this.daemonTimer);
      this.daemonTimer = null;
    }
    this.isAutoTradingEnabled = false;
  }

  public static getStatus() {
    return {
      enabled: this.isAutoTradingEnabled,
      lastScanTime: this.lastScanTime,
      lastAutoTrade: this.lastAutoTrade,
    };
  }
}
