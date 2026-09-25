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

import { priceTradeFromRealQuotes, isOptionTrade, realOptionValue } from "./indianMarket/realQuoteGuard.js";
import mongoose from "mongoose";
import { safeCreateAlert } from "./alertService.js";
import { INDIAN_SYMBOLS, SUPPORTED_INDIAN_SYMBOLS } from "../config/indianSymbols.js";
import { IndianMarketService } from "./indianMarketService.js";
import { Trade } from "../models/Trade.js";
import { TradingKillSwitch } from "./indianMarket/security/tradingKillSwitch.js";
import { IndianTradeGroup } from "../models/IndianTradeGroup.js";
import { IndianRiskSettings } from "../models/IndianRiskSettings.js";
import * as paper from "./paperState.js";
import { StrategyEngine } from "./indianMarket/strategyEngine.js";
import { StrategyRouter } from "./indianMarket/strategyRouter.js";
import { IndianRiskManager } from "./indianMarket/riskManager.js";
import { OptionChainService } from "./indianMarket/optionChainService.js";
import { InstrumentMaster } from "./indianMarket/instrumentMaster.js";
import { ExpiryResolver } from "./indianMarket/expiryResolver.js";
import { ExchangeCalendar } from "./indianMarket/exchangeCalendar.js";
import { PaperExecutionAdapter, LiveBrokerExecutionAdapter, BrokerAdapter } from "./indianMarket/brokerAdapter.js";
import { IndianAuditLogger } from "./indianMarket/auditLogger.js";
import { StructuredTrade, UnderlyingSymbol } from "./indianMarket/strategyTypes.js";
import { PortfolioIntelligenceEngine } from "./agentic/portfolio/PortfolioIntelligenceEngine.js";

// Pricing and valuation re-exports
export { MOCK_LIVE_INDIAN_TIKERS, resolveLivePriceForIndianTrade } from "./indianMarket/indianPricing.js";
import { MOCK_LIVE_INDIAN_TIKERS, resolveLivePriceForIndianTrade, hasFreshRealIndicators } from "./indianMarket/indianPricing.js";

import { AutoPilotStateMachine } from "./indianMarket/autoPilotStateMachine.js";
export { AutoPilotStateMachine };
import { MarketIsolationGuard } from "./market/MarketIsolationGuard.js";

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
  private static isAutoTradingEnabled = true;
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
    const eligibleSymbols = SUPPORTED_INDIAN_SYMBOLS.filter(
      (symbol) => MarketIsolationGuard.resolveDomainFromSymbol(symbol) === "INDIA" && INDIAN_SYMBOLS[symbol]
    );

    // Bounded parallel evaluation, mirroring autoTradeEngine.ts's
    // MAX_CONCURRENT_SYMBOLS pattern for crypto — these were previously
    // evaluated one at a time in a for-loop, serializing N round trips to
    // the quant/strategy engine. Unbounded Promise.all is deliberately
    // avoided here: an earlier incident this session showed that fanning
    // every symbol out at once overwhelms the shared quant-engine thread
    // pool, so evaluation stays chunked instead.
    const MAX_CONCURRENT_INDIAN_SYMBOLS = 4;
    for (let i = 0; i < eligibleSymbols.length; i += MAX_CONCURRENT_INDIAN_SYMBOLS) {
      const chunk = eligibleSymbols.slice(i, i + MAX_CONCURRENT_INDIAN_SYMBOLS);
      const results = await Promise.allSettled(
        chunk.map(async (symbol) => {
          const config = INDIAN_SYMBOLS[symbol];
          const ticker = MOCK_LIVE_INDIAN_TIKERS[symbol] || {
            ltp: 1000, open: 990, high: 1010, low: 985, volume: 500000, rsi14: 55, adx14: 25
          };

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
            return {
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
            } as AICandidate;
          }
          return null;
        })
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === "fulfilled" && result.value) {
          candidates.push(result.value);
        } else if (result.status === "rejected") {
          console.warn(`[INDIAN_AUTO_TRADER] Evaluation failed for ${chunk[j]}: ${result.reason?.message || result.reason}`);
        }
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
    rawUserId: string = "guest-user",
    mode: "PAPER" | "LIVE" = "PAPER",
    productType: "MIS" | "CNC" = "MIS",
    overrideSymbol?: string
  ): Promise<any> {
    const userId = (!rawUserId || rawUserId === "guest-user" || rawUserId === "000000000000000000000000")
      ? "6a39c0e7a5e2995ed257ca68"
      : rawUserId;

    // Was checked in the manual /execute route but not here — meaning an
    // emergency kill switch stopped a human clicking "buy" but not this
    // same function running unattended every 60s for every user with
    // autoTrade enabled, which is the higher-volume, more autonomous path.
    if (!TradingKillSwitch.isTradingAllowed()) {
      throw new Error("KILL_SWITCH_ACTIVE: Trading execution is halted by emergency kill switch.");
    }

    const targetSymbol = overrideSymbol || (await this.findBestAICandidate(userId, 55))?.symbol || "NIFTY50";
    const normUnderlying = InstrumentMaster.normalizeUnderlying(targetSymbol);
    const ticker = MOCK_LIVE_INDIAN_TIKERS[targetSymbol] || {
      ltp: 24500, open: 24400, high: 24600, low: 24350, volume: 1000000, rsi14: 62, adx14: 28
    };

    const isIndex = normUnderlying === "NIFTY" || normUnderlying === "BANKNIFTY" || normUnderlying === "FINNIFTY";
    const optionChain = isIndex ? OptionChainService.generateOptionChain(normUnderlying, ticker.ltp) : undefined;
    // Real ADX (Angel One candles) and direction vs today's open. This passed an
    // empty bar list, so ADX defaulted to 22 and every trade was "RANGING" —
    // letting reversal strategies trade straight into trends.
    // Strategies decide on RSI/ADX: refuse to trade on simulated ones.
    if (!hasFreshRealIndicators(targetSymbol)) {
      throw new Error(`REAL_INDICATORS_REQUIRED: no fresh exchange-candle RSI/ADX for ${targetSymbol}`);
    }
    const regimeAnalysis = StrategyRouter.classifyRegime(ticker.ltp, [], optionChain?.pcr || 1.0, { adx14: ticker.adx14, open: ticker.open });

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
      indicators: {
        rsi14: ticker.rsi14,
        adx14: ticker.adx14,
        open: ticker.open,
        high: ticker.high,
        low: ticker.low,
      },
    };

    // 0. Sync the authoritative capital ledger from real data BEFORE any capital
    // read. AuthoritativeCapitalManager is a global ledger that nothing in the
    // live request path used to seed — it booted at netEquity=0 and stayed
    // there forever, so every sizing check below saw zero capital regardless
    // of the user's actual paper balance and rejected every trade with "0
    // lots". PortfolioIntelligenceEngine.syncAndGetCapital() aggregates real
    // wallet cash + open-position margin/P&L across all Indian account types,
    // resets PortfolioDrawdownEngine's peak-equity baseline alongside it, AND
    // does both under PortfolioIntelligenceEngine's own lock — a raw
    // unlocked syncFromAuthoritativeLedger() call here could interleave with
    // another user's concurrent evaluation (or a dashboard snapshot poll) and
    // read back a mix of both users' capital state.
    const currentCapital = await PortfolioIntelligenceEngine.syncAndGetCapital(userId, mode);

    const accType = (normUnderlying === "SENSEX" || normUnderlying === "BSE")
      ? "INDIAN_BSE"
      : (normUnderlying === "NIFTY" || normUnderlying === "BANKNIFTY" || normUnderlying === "FINNIFTY")
        ? "INDIAN_NIFTY50"
        : "INDIAN_NSE";

    // walletAccType tracks whichever account type `wallet` actually ends up
    // pointing at — the debit below must persist against this (not the
    // original `accType`) or the in-memory debit and the persisted/DB debit
    // land on two different wallets, and the later Trade record must also
    // use this or the close/square-off credit-back targets a wallet that
    // was never actually debited.
    let { wallet, accountType: walletAccType, availableMargin } = paper.getIndianWalletWithFallback(userId, mode, accType);

    // 1. Evaluate & construct best trade through Strategy Engine
    const tradeBundle = StrategyEngine.evaluateAndConstructBestTrade(context, currentCapital, 1.0);
    if (!tradeBundle) {
      throw new Error("NO_QUALIFIED_STRATEGY_SIGNAL: No strategy satisfied entry criteria.");
    }

    const { strategy, trade } = tradeBundle;
    trade.mode = mode;

    // Price integrity: open option trades only on fresh real Angel One quotes
    // (repriced from them, with volatility-scaled stops). Model-priced entries
    // produced phantom 1-2 minute wins/losses — see realQuoteGuard.ts.
    const priced = priceTradeFromRealQuotes(trade, normUnderlying, ticker.ltp);
    if (!priced.ok) {
      throw new Error(`REAL_QUOTE_REQUIRED: ${priced.reason}`);
    }

    // 2. Pre-Trade Risk Validation Gatekeeper

    // 2a. Pre-Trade Portfolio Intelligence Check
    const portfolioCheck = await PortfolioIntelligenceEngine.evaluateTradeProposal(
      {
        strategyId: trade.strategy,
        strategyName: trade.strategy,
        symbol: trade.underlying,
        underlying: normUnderlying,
        side: trade.position === "LONG" ? "BUY" : "SELL",
        assetClass: isIndex ? (trade.instrument === "CE" || trade.instrument === "PE" ? "OPTIONS" : "FUTURES") : "EQUITY",
        instrumentType: trade.instrument as any,
        quantity: trade.quantity,
        entryPrice: trade.entryPrice,
        stopLossPrice: trade.stopLoss,
        marginRequired: IndianRiskManager.computeRequiredMargin(trade),
      },
      {
        strategyId: trade.strategy,
        symbol: trade.underlying,
        underlying: normUnderlying,
        entryPrice: trade.entryPrice,
        stopLossPrice: trade.stopLoss,
        lotSize: trade.quantity,
        model: "FIXED_RISK",
      },
      undefined,
      { userId, mode }
    );

    if (!portfolioCheck.approved) {
      throw new Error(`PORTFOLIO_INTELLIGENCE_REJECTED: ${portfolioCheck.rejectionReason}`);
    }

    // 2b. Pre-Trade Risk Manager Check
    const riskCheck = await IndianRiskManager.validateTrade(trade, currentCapital, availableMargin, userId, true);

    if (!riskCheck.approved) {
      throw new Error(`RISK_GATEKEEPER_REJECTED: ${riskCheck.rejectionReason}`);
    }

    // 3. Broker Execution
    const adapter: BrokerAdapter = mode === "LIVE" ? new LiveBrokerExecutionAdapter() : new PaperExecutionAdapter();
    const isMultiLeg = trade.legs.length > 1;

    // Place legs through broker. If no leg was placed, release the cooldown
    // reservation validateTrade made — the strategy shouldn't sit out 15m for
    // a trade that never happened. Once any leg is live, keep it.
    let placedLegs = 0;
    try {
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
        placedLegs++;
      }
    } catch (placeErr) {
      if (placedLegs === 0) IndianRiskManager.releaseReservation(trade);
      else IndianRiskManager.confirmReservation(trade);
      throw placeErr;
    }
    IndianRiskManager.confirmReservation(trade);

    // Debit margin from wallet.
    // BUGFIX: `availableMargin` was captured well before this point (before
    // StrategyEngine construction, evaluateTradeProposal, IndianRiskManager
    // validation, and per-leg broker order placement — all awaited in
    // between), so computing the debit from it directly raced any other
    // concurrent debit/credit to the same wallet key: two trades could both
    // read the same starting balance and the second write would clobber the
    // first, a real double-spend. Re-reading the balance and writing it
    // atomically under withWalletLock (the same primitive
    // debitWalletAndCreateTrade/creditWalletAndCloseTrade already use for
    // this exact hazard on the crypto side) closes that window.
    const requiredMargin = IndianRiskManager.computeRequiredMargin(trade);
    if (mode === "PAPER") {
      await paper.withWalletLock(userId, mode, walletAccType, async () => {
        const freshWallet = paper.getWallet(userId, mode, walletAccType as any);
        const freshRemaining = Math.max(0, (freshWallet.get("INR") || 0) - requiredMargin);
        freshWallet.set("INR", freshRemaining);
        await paper.setWalletBalance(userId, mode, "INR", freshRemaining, walletAccType as any);
      });
    } else {
      wallet.set("INR", Math.max(0, availableMargin - requiredMargin));
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
        // Multi-leg: side follows the position (net debit = BUY, net credit =
        // SELL). It used the first leg's action, so an iron condor (first leg
        // BUY PE, but a SHORT/credit position) was monitored as long — SL and
        // target worked in reverse.
        side: isMultiLeg ? (trade.position === "SHORT" ? "SELL" : "BUY") : (trade.legs[0]?.action || "BUY"),
        quantity: trade.quantity,
        entryPrice: trade.entryPrice,
        sl: trade.stopLoss,
        tp: trade.target,
        leverage: 1,
        status: "OPEN",
        mode,
        accountType: walletAccType,
        strategy: trade.strategy,
        pnl: 0,
        openedAt: new Date(),
        // Persist the exact margin debited at open so the exit releases the
        // SAME amount (proportional to fill) instead of full notional — the
        // asymmetry here was minting INR on every close.
        meta: { marginDebitedINR: requiredMargin, entryPriceSource: priced.source },
        autoCloseStatus: "ARMED",
        entrySource: "AI_ENSEMBLE_DERIVATIVES_ENGINE",
        decisionPath: ["AI_ENSEMBLE_PIPELINE", trade.strategy, regimeAnalysis.regime],
        authorizedVotes: {
          strategy: trade.strategy,
          // Real facts about this entry only. It recorded hardcoded
          // "TRANSFORMER_V8_LONG / MAMBA_HYBRID_LONG / MICROSTRUCTURE_NN_LONG /
          // AI_CONSENSUS_AGREED" on every trade — models that never voted.
          regime: regimeAnalysis.regime,
          priceSource: priced.source,
        },
        shadowVotes: {},
        coreScore: trade.tradeScore,
        finalScore: trade.tradeScore,
        aiConfidence: trade.tradeScore,
        legs: trade.legs,
      });

      const alertSymbol = isMultiLeg ? `${trade.underlying}_${trade.strategy}` : trade.legs[0]?.tradingSymbol || targetSymbol;
      const alertSide = trade.legs[0]?.action || "BUY";
      await safeCreateAlert({
        userId,
        severity: "GREEN",
        symbol: alertSymbol,
        title: "ORDER SUCCESS",
        message: `AI auto-trader placed ${alertSide} order for ${alertSymbol} — Score=${trade.tradeScore}%, Entry=₹${trade.entryPrice}`,
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
   * Monitor loop for trailing SL, Take Profit, and Signal Reversal Auto-Selloffs.
   * Scans every open Indian trade globally, so it is called once per daemon
   * tick rather than per user.
   */
  public static async monitorAndAutoSelloff(): Promise<number> {
    if (mongoose.connection.readyState !== 1) return 0;

    let closedCount = 0;
    const openTrades = await Trade.find({
      status: { $in: ["OPEN", "TARGET_TRIGGERED", "STOP_TRIGGERED", "EXIT_PENDING", "EXIT_PARTIALLY_FILLED"] },
      accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"] },
    });

    for (const trade of openTrades) {
      // Option trades: act only on fresh real quotes. A model price here
      // triggered stops/targets on phantom moves; skip this tick instead.
      let currentPrice: number;
      if (isOptionTrade(trade)) {
        const real = realOptionValue(trade, InstrumentMaster.normalizeUnderlying(trade.underlying || trade.symbol));
        if (real === undefined) continue;
        currentPrice = real;
      } else {
        currentPrice = resolveLivePriceForIndianTrade(trade);
      }
      const tick = {
        symbol: trade.symbol,
        ltp: currentPrice,
        timestamp: Date.now(),
      };

      const result = await AutoPilotStateMachine.processTick(trade, tick);
      if (result.triggered && (result.newState === "CLOSED" || result.newState === "EXIT_PARTIALLY_FILLED")) {
        closedCount++;
      }
    }

    return closedCount;
  }

  public static setAutoTradingEnabled(enabled: boolean): boolean {
    this.isAutoTradingEnabled = enabled;
    AutoPilotStateMachine.setMode(enabled ? "AUTO" : "PAUSED");
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

        const targetUsers = new Set<string>(["6a39c0e7a5e2995ed257ca68"]);
        if (mongoose.connection.readyState === 1) {
          try {
            const allSettings = await IndianRiskSettings.find({ autoTrade: true }).lean();
            for (const s of allSettings) {
              if (s.userId) {
                const uid = (s.userId === "guest-user" || s.userId === "000000000000000000000000")
                  ? "6a39c0e7a5e2995ed257ca68"
                  : s.userId;
                targetUsers.add(uid);
              }
            }
            // Only accounts that still exist. This used to ADD every user in
            // the users collection (so the autoTrade flag never restricted
            // anything) and never dropped settings whose user was gone: a
            // deleted demo account (settings userId stored as a string) kept
            // being scanned every 10s — ~1,000 sizing/indicator rejections a
            // day in the error log (2026-09-25).
            const appUsers = await mongoose.connection.db?.collection("users").find({}, { projection: { _id: 1 } }).toArray() || [];
            const existing = new Set(appUsers.map((u) => u._id.toString()));
            if (existing.size > 0) {
              for (const uid of [...targetUsers]) if (!existing.has(uid)) targetUsers.delete(uid);
            }
          } catch { }
        }

        const session = IndianMarketService.getMarketSession();

        // Trailing-SL / TP / reversal monitoring scans ALL open Indian trades
        // globally, so it only needs to run once per tick — not once per user
        // (that repeated the same full-collection scan and processTick sweep
        // for every user in the table every 10s).
        await this.monitorAndAutoSelloff();

        for (const uid of targetUsers) {
          try {
            if (!session.isOpen && process.env.NODE_ENV !== "test") {
              continue;
            }

            // Indian MIS Cutoff: No fresh intraday MIS orders placed after 15:10 IST
            const ist = ExchangeCalendar.toIST();
            const currentMinutes = ist.getHours() * 60 + ist.getMinutes();
            if (currentMinutes >= (15 * 60 + 10) && process.env.NODE_ENV !== "test") {
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
