/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Indian Derivatives & Stock Market (NSE/BSE) API Routes
 * ═══════════════════════════════════════════════════════════════════
 */

import express from "express";
import mongoose from "mongoose";
import { Trade } from "../models/Trade.js";
import { safeCreateAlert } from "../services/alertService.js";
import { IndianTradeGroup } from "../models/IndianTradeGroup.js";
import { WalletTransaction } from "../models/WalletTransaction.js";
import { IndianMarketAutoTrader, MOCK_LIVE_INDIAN_TIKERS, resolveLivePriceForIndianTrade } from "../services/indianMarketAutoTrader.js";
import { IndianMarketService } from "../services/indianMarketService.js";
import { INDIAN_SYMBOLS, SUPPORTED_INDIAN_SYMBOLS } from "../config/indianSymbols.js";
import { StrategyEngine } from "../services/indianMarket/strategyEngine.js";
import { StrategyRouter } from "../services/indianMarket/strategyRouter.js";
import { OptionChainService } from "../services/indianMarket/optionChainService.js";
import { IndianRiskManager } from "../services/indianMarket/riskManager.js";
import { IndianAuditLogger } from "../services/indianMarket/auditLogger.js";
import { IndianReconciliationService } from "../services/indianMarket/reconciliationService.js";
import { StrategyId, UnderlyingSymbol } from "../services/indianMarket/strategyTypes.js";
import * as paper from "../services/paperState.js";
import { CurrencyService } from "../services/currencyService.js";
import {
  AuthoritativeLedger,
  AuthoritativePosition,
  AccountLedgerSummary,
  AccountReconciliationReport,
  AutoPilotMode,
  roundTo2,
} from "../services/indianMarket/authoritativeLedger.js";
import { AutoPilotStateMachine } from "../services/indianMarket/autoPilotStateMachine.js";
import { TradingKillSwitch } from "../services/indianMarket/security/tradingKillSwitch.js";
import { OrderValidator } from "../services/indianMarket/security/orderValidator.js";
import { DataIntegrityScanner } from "../services/indianMarket/security/dataIntegrityScanner.js";
import { optionalAuth, type AuthRequest } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";

const router = express.Router();
router.use(optionalAuth);

/**
 * GET /api/indian-market/scan
 */
router.get("/scan", async (req, res) => {
  try {
    const userId = (req.query.userId as string) || "guest-user";
    const session = IndianMarketService.getMarketSession();

    const now = Date.now();
    SUPPORTED_INDIAN_SYMBOLS.forEach((sym, idx) => {
      const item = MOCK_LIVE_INDIAN_TIKERS[sym];
      if (item) {
        const wave = Math.sin(now / 15000 + idx * 1.3);
        const deltaPct = wave * 0.0012;
        const newLtp = Number((item.ltp * (1 + deltaPct)).toFixed(2));
        item.ltp = newLtp;
        if (newLtp > item.high) item.high = newLtp;
        if (newLtp < item.low) item.low = newLtp;
        item.rsi14 = Number(Math.max(35, Math.min(75, 52 + Math.sin(now / 20000 + idx) * 18)).toFixed(1));
        item.adx14 = Number(Math.max(15, Math.min(50, 28 + Math.cos(now / 25000 + idx) * 12)).toFixed(1));
      }
    });

    const results = await Promise.all(
      SUPPORTED_INDIAN_SYMBOLS.map(async (symbol) => {
        const config = INDIAN_SYMBOLS[symbol];
        const data = MOCK_LIVE_INDIAN_TIKERS[symbol] || {
          ltp: 1000, open: 990, high: 1010, low: 985, volume: 500000, rsi14: 52, adx14: 25
        };

        const evalResult = await IndianMarketService.evaluateIndianSymbol(symbol, userId, {
          ltp: data.ltp,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.ltp,
          volume: data.volume,
          rsi14: data.rsi14,
          adx14: data.adx14,
        });

        const change = data.ltp - data.open;
        const changePct = (change / data.open) * 100;

        return {
          symbol,
          name: config?.name || symbol,
          exchange: config?.exchange || "NSE",
          category: config?.category || "NIFTY50",
          price: data.ltp,
          change: Number(change.toFixed(2)),
          changePct: Number(changePct.toFixed(2)),
          aiSignal: evalResult.decision.decision,
          aiConfidence: evalResult.decision.confidence,
          strategy: evalResult.decision.strategy,
          regime: evalResult.decision.regime,
          lotSize: config?.lotSize || 1,
          volume: `${(data.volume / 1000000).toFixed(1)}M`,
          reasons: evalResult.decision.reasons,
          optionChainSummary: evalResult.optionChainSummary,
        };
      })
    );

    res.json({
      success: true,
      session,
      scanTime: new Date().toISOString(),
      stocks: results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/indian-market/option-chain
 */
router.get(["/option-chain", "/options-chain"], (req, res) => {
  try {
    const underlying = (req.query.underlying as UnderlyingSymbol) || "NIFTY";
    const spot = req.query.spot ? Number(req.query.spot) : undefined;
    const chain = IndianMarketService.getOptionChain(underlying, spot);
    res.json({ success: true, chain });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/indian-market/strategies
 */
router.get("/strategies", (req, res) => {
  try {
    const strategies = StrategyEngine.getAllStrategies().map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      description: s.description,
      defaultTimeframe: s.defaultTimeframe,
      allowedRegimes: s.allowedRegimes,
      enabled: s.enabled,
      minimumConfidence: s.minimumConfidence,
    }));
    res.json({ success: true, strategies });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/indian-market/strategy/toggle
 */
router.post("/strategy/toggle", (req, res) => {
  try {
    const { strategyId, enabled } = req.body;
    const ok = StrategyEngine.setStrategyEnabled(strategyId as StrategyId, Boolean(enabled));
    res.json({ success: ok, strategyId, enabled });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/indian-market/strategy-router
 */
router.get("/strategy-router", (req, res) => {
  try {
    const underlying = (req.query.underlying as string) || "NIFTY";
    const ticker = MOCK_LIVE_INDIAN_TIKERS[underlying] || MOCK_LIVE_INDIAN_TIKERS["NIFTY50"] || { ltp: 24530.20 };
    const analysis = StrategyRouter.classifyRegime(ticker.ltp, []);
    res.json({ success: true, underlying, analysis });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/indian-market/risk-settings
 */
router.get(["/risk-settings", "/risk-status"], async (req, res) => {
  try {
    const userId = (req.query.userId as string) || "guest-user";
    const settings = await IndianRiskManager.getSettings(userId);
    if (IndianMarketAutoTrader.isEnabled()) {
      settings.autoTrade = true;
    }
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/indian-market/risk-settings
 */
router.post("/risk-settings", requirePermission("CHANGE_RISK_LIMIT"), async (req, res) => {
  try {
    const userId = (req.body.userId as string) || "guest-user";
    if (req.body.autoTrade !== undefined) {
      IndianMarketAutoTrader.setAutoTradingEnabled(Boolean(req.body.autoTrade));
    }
    const settings = await IndianRiskManager.updateSettings(userId, req.body);
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/indian-market/panic-stop
 */
router.post("/panic-stop", requirePermission("EMERGENCY_STOP"), async (req, res) => {
  try {
    const userId = (req.body.userId as string) || "guest-user";
    const { active } = req.body;
    const isPanic = await IndianRiskManager.setPanicStop(userId, Boolean(active));
    res.json({ success: true, panicStop: isPanic });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/indian-market/daily-risk-lock/reset
 */
router.post("/daily-risk-lock/reset", requirePermission("CHANGE_RISK_LIMIT"), async (req, res) => {
  try {
    const userId = (req.body.userId as string) || "guest-user";
    await IndianRiskManager.resetDailyRiskLock(userId);
    res.json({ success: true, message: "Daily Risk Lock reset successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/indian-market/audit-logs
 */
router.get("/audit-logs", (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const logs = IndianAuditLogger.getRecentEvents(limit);
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/indian-market/trade-groups (Multi-Leg Spreads)
 */
router.get("/trade-groups", async (req, res) => {
  try {
    const groups = await IndianTradeGroup.find().sort({ openedAt: -1 }).limit(50).lean();
    res.json({ success: true, groups });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/indian-market/execute-strategy
 */
router.post("/execute-strategy", requirePermission("CREATE_ORDER"), async (req, res) => {
  try {
    // 🛡️ Kill switch — this route previously never checked it (unlike
    // /execute), so an emergency stop still let multi-leg strategy orders
    // through.
    if (!TradingKillSwitch.isTradingAllowed()) {
      return res.status(403).json({
        error: "KILL_SWITCH_ACTIVE",
        message: "Trading execution is halted by emergency kill switch.",
        status: TradingKillSwitch.getStatus(),
      });
    }

    const { strategyId: sId, strategy, underlying = "NIFTY", mode = "PAPER" } = req.body;

    // 🛡️ No real broker integration on this route either — same reasoning
    // as /execute above.
    if (mode === "LIVE") {
      return res.status(501).json({
        error: "LIVE_EXECUTION_NOT_IMPLEMENTED",
        message: "This endpoint has no real broker integration and cannot place a LIVE order. Use PAPER mode.",
      });
    }
    const strategyId = sId || strategy;
    const userId = (req.body.userId as string) || "guest-user";
    const strat = StrategyEngine.getStrategy(strategyId as StrategyId);

    if (!strat) {
      return res.status(400).json({ error: `STRATEGY_NOT_FOUND: ${strategyId}` });
    }

    const ticker = MOCK_LIVE_INDIAN_TIKERS[underlying] || MOCK_LIVE_INDIAN_TIKERS["NIFTY50"] || { ltp: 24500 };
    const optionChain = OptionChainService.generateOptionChain(underlying, ticker.ltp);
    const regime = StrategyRouter.classifyRegime(ticker.ltp, [], optionChain.pcr).regime;

    const context = {
      underlying,
      spotPrice: ticker.ltp,
      futuresPrice: optionChain.futuresPrice,
      bars1m: [],
      bars5m: [],
      bars15m: [],
      optionChain,
      regime,
      timestamp: new Date(),
    };

    const signal = strat.generateSignal(context) || {
      signalId: `MANUAL_SIG_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying,
      direction: "BULLISH",
      confidence: 85,
      tradeScore: 85,
      strategy: strat.id,
      timeframe: "15m",
      entryReason: ["Manual Operator Execution"],
      indicators: {},
      regime,
    };

    const accType = (underlying === "SENSEX" || underlying === "BSE") ? "INDIAN_BSE" : (underlying === "NIFTY" || underlying === "BANKNIFTY" || underlying === "NIFTY50") ? "INDIAN_NIFTY50" : "INDIAN_NSE";
    // walletAccType tracks which account type `wallet` actually ends up
    // pointing at — the persisted Trade record below must use this (not a
    // hardcoded accountType) or closing this trade credits margin back to a
    // wallet that was never debited.
    let { wallet, accountType: walletAccType, availableMargin } = paper.getIndianWalletWithFallback(userId, mode, accType);

    const trade = strat.constructTrade(signal, context, availableMargin, 1.0);
    trade.mode = mode as any;

    const riskCheck = await IndianRiskManager.validateTrade(trade, availableMargin, availableMargin, userId, true);

    if (!riskCheck.approved) {
      return res.status(400).json({ error: `RISK_REJECTED: ${riskCheck.rejectionReason}` });
    }

    // Debit margin.
    // BUGFIX: this was an unlocked read-modify-write computed from
    // `availableMargin` read before the `validateTrade` DB round trip above
    // — a concurrent request for the same user/wallet (another manual
    // execute, or the auto-trade daemon) could read the same starting
    // balance and one write would clobber the other. Serialized via
    // withWalletLock and re-reading the balance at write time, matching the
    // identical fix in indianMarketAutoTrader.ts.
    const requiredMargin = IndianRiskManager.computeRequiredMargin(trade);
    await paper.withWalletLock(userId, mode, walletAccType, async () => {
      const freshWallet = paper.getWallet(userId, mode, walletAccType as any);
      freshWallet.set("INR", (freshWallet.get("INR") || 0) - requiredMargin);
    });

    const objId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : new mongoose.Types.ObjectId("000000000000000000000000");

    if (mongoose.connection.readyState === 1) {
      if (trade.legs.length > 1) {
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
        symbol: trade.legs.length > 1 ? `${trade.underlying}_${trade.strategy}` : trade.legs[0]?.tradingSymbol || underlying,
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
        accountType: walletAccType,
        strategy: trade.strategy,
        pnl: 0,
        openedAt: new Date(),
        autoCloseStatus: "ARMED",
        entrySource: "STRATEGY_BUILDER",
        decisionPath: [trade.strategy, regime],
        authorizedVotes: { strategy: trade.strategy },
        shadowVotes: {},
        coreScore: trade.tradeScore,
        finalScore: trade.tradeScore,
        aiConfidence: trade.tradeScore,
        legs: trade.legs,
      });
    }

    res.json({
      ok: true,
      tradeId: trade.tradeId,
      underlying: trade.underlying,
      strategy: trade.strategy,
      strategyName: strat.name,
      legs: trade.legs,
      entryPrice: trade.entryPrice,
      stopLoss: trade.stopLoss,
      target: trade.target,
      charges: trade.charges,
      executionTimestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/indian-market/analytics
 */
router.get("/analytics", async (req, res) => {
  try {
    const closedTrades = await Trade.find({
      status: "CLOSED",
      accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"] },
    }).sort({ closedAt: -1 }).lean();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = Date.now() - 7 * 86400000;
    const startOfMonth = Date.now() - 30 * 86400000;

    const calcMetrics = (trades: any[]) => {
      const count = trades.length;
      const wins = trades.filter((t: any) => (t.pnl || 0) > 0);
      const losses = trades.filter((t: any) => (t.pnl || 0) < 0);
      const winRate = count > 0 ? Number(((wins.length / count) * 100).toFixed(1)) : 0;
      const totalWin = wins.reduce((acc, t: any) => acc + (t.pnl || 0), 0);
      const totalLoss = Math.abs(losses.reduce((acc, t: any) => acc + (t.pnl || 0), 0));
      const net = Number((totalWin - totalLoss).toFixed(2));
      const profitFactor = totalLoss > 0 ? Number((totalWin / totalLoss).toFixed(2)) : (totalWin > 0 ? 3.5 : 1.0);
      const estCharges = count * 45; // ~₹45 brokerage & STT per trade
      return {
        count,
        wins: wins.length,
        losses: losses.length,
        winRate,
        grossProfit: totalWin,
        grossLoss: totalLoss,
        netPnL: net,
        charges: estCharges,
        profitFactor,
      };
    };

    const todayTrades = closedTrades.filter((t: any) => t.closedAt && new Date(t.closedAt).getTime() >= startOfToday);
    const weekTrades = closedTrades.filter((t: any) => t.closedAt && new Date(t.closedAt).getTime() >= startOfWeek);
    const monthTrades = closedTrades.filter((t: any) => t.closedAt && new Date(t.closedAt).getTime() >= startOfMonth);

    const dailyMetrics = calcMetrics(todayTrades);
    const weeklyMetrics = calcMetrics(weekTrades);
    const monthlyMetrics = calcMetrics(monthTrades);
    const allMetrics = calcMetrics(closedTrades);

    // Timeline aggregations for charts (last 7 days)
    const timeline = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      const dayTrades = closedTrades.filter((t: any) => {
        const time = t.closedAt ? new Date(t.closedAt).getTime() : 0;
        return time >= dayStart && time < dayEnd;
      });
      const dayPnL = dayTrades.reduce((acc, t: any) => acc + (t.pnl || 0), 0);
      timeline.push({
        date: dateStr,
        pnl: Number(dayPnL.toFixed(2)),
        trades: dayTrades.length,
      });
    }

    res.json({
      success: true,
      analytics: {
        totalTrades: allMetrics.count,
        winsCount: allMetrics.wins,
        lossesCount: allMetrics.losses,
        winRate: allMetrics.winRate,
        profitFactor: allMetrics.profitFactor,
        netPnL: allMetrics.netPnL,
        maxDrawdown: "-3.8%",
        daily: {
          netPnL: dailyMetrics.netPnL,
          tradesCount: dailyMetrics.count,
          winRate: dailyMetrics.winRate,
          grossProfit: dailyMetrics.grossProfit,
          grossLoss: dailyMetrics.grossLoss,
          charges: dailyMetrics.charges,
        },
        weekly: {
          netPnL: weeklyMetrics.netPnL,
          tradesCount: weeklyMetrics.count,
          winRate: weeklyMetrics.winRate,
          grossProfit: weeklyMetrics.grossProfit,
          grossLoss: weeklyMetrics.grossLoss,
          charges: weeklyMetrics.charges,
        },
        monthly: {
          netPnL: monthlyMetrics.netPnL,
          tradesCount: monthlyMetrics.count,
          winRate: monthlyMetrics.winRate,
          grossProfit: monthlyMetrics.grossProfit,
          grossLoss: monthlyMetrics.grossLoss,
          charges: monthlyMetrics.charges,
        },
        timeline,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * POST /api/indian-market/execute
 */
router.post("/execute", requirePermission("CREATE_ORDER"), async (req: AuthRequest, res) => {
  try {
    // 🛡️ Guard 1: Authoritative Backend Kill Switch (Requirement 14)
    if (!TradingKillSwitch.isTradingAllowed()) {
      return res.status(403).json({
        error: "KILL_SWITCH_ACTIVE",
        message: "Trading execution is halted by emergency kill switch.",
        status: TradingKillSwitch.getStatus(),
      });
    }

    const { symbol, side = "BUY", exchange = "NSE", mode = "PAPER", quantity, productType = "MIS" } = req.body;

    // 🛡️ Guard 1b: no real Indian broker execution exists on this route.
    // Everything below this point is in-memory paper-wallet simulation —
    // there is no call to a broker adapter anywhere in this handler. A
    // request with mode:"LIVE" would previously get a Trade document
    // stamped mode:"LIVE" for a trade that never touched a real broker,
    // which is exactly the kind of fabricated "it really executed" record
    // financial-truth invariants must never allow. Reject it outright
    // rather than silently simulating it under a false label.
    if (mode === "LIVE") {
      return res.status(501).json({
        error: "LIVE_EXECUTION_NOT_IMPLEMENTED",
        message: "This endpoint has no real broker integration and cannot place a LIVE order. Use PAPER mode.",
      });
    }

    // 🛡️ Guard 2: Cross-Account Access Lockout (Requirement 5)
    const authUserId = req.userId;
    const reqUserId = (req.body.userId as string) || (req.query.userId as string);
    if (authUserId && reqUserId && authUserId !== reqUserId) {
      return res.status(403).json({
        error: "CROSS_ACCOUNT_FORBIDDEN",
        message: "Access denied: Cannot place trades on behalf of another user account.",
      });
    }
    const userId = authUserId || reqUserId || "guest-user";

    // 🛡️ Guard 2b: Panic stop. /execute-strategy and the autonomous
    // auto-trader both run every order through IndianRiskManager.validateTrade
    // (which checks this among other things); this route — arguably the
    // most directly user-facing one — didn't check it at all. Full parity
    // with validateTrade's other checks (daily-loss limits etc.) needs a
    // StructuredTrade shape this route doesn't build, so that's flagged as
    // a separate follow-up rather than force-fit here; panic stop is the
    // single highest-severity check and is cheap to apply directly.
    const riskSettings = await IndianRiskManager.getSettings(userId);
    if (riskSettings.panicStop) {
      return res.status(403).json({
        error: "PANIC_STOP_ACTIVE",
        message: "Emergency Panic Stop is currently ACTIVE. New orders are blocked.",
      });
    }

    const config = INDIAN_SYMBOLS[symbol];
    if (!config) {
      return res.status(400).json({ error: `UNSUPPORTED_SYMBOL: ${symbol}` });
    }

    const tickerData = MOCK_LIVE_INDIAN_TIKERS[symbol] || {
      ltp: 1000, open: 990, high: 1010, low: 985, volume: 500000, rsi14: 55, adx14: 25
    };

    const filledPrice = tickerData.ltp;

    // 🛡️ Guard 3: Server-Side Quantity, Price, Instrument Validation (Requirements 9, 10, 11)
    const normalizedSide = (side === "LONG" || side === "BUY") ? "BUY" : "SELL";
    const validation = OrderValidator.validateOrder({
      symbol,
      side: normalizedSide,
      quantity,
      price: req.body.price,
      stopLoss: req.body.sl,
      target: req.body.tp,
      productType,
      exchange,
    }, filledPrice);

    if (!validation.isValid) {
      return res.status(400).json({
        error: "ORDER_VALIDATION_FAILED",
        reasons: validation.reasons,
      });
    }

    const orderQty = validation.sanitizedQuantity;
    const totalNotional = orderQty * filledPrice;
    const accountType = exchange === "BSE" ? "INDIAN_BSE" : (symbol.includes("NIFTY") || symbol.includes("BANK") ? "INDIAN_NIFTY50" : "INDIAN_NSE");

    const { leverage: userLeverage } = req.body;
    const isMIS = productType === "MIS";
    const defaultLev = isMIS ? 5 : 1;
    const leverage = Math.max(1, Math.min(20, Number(userLeverage) || defaultLev));
    const marginRequired = totalNotional / leverage;

    const wallet = paper.getWallet(userId, mode, accountType as any);
    const inrBal = wallet.get("INR") ?? 0;

    if (inrBal < marginRequired) {
      return res.status(400).json({
        error: `INSUFFICIENT_INR_BALANCE: Wallet has ₹${inrBal.toLocaleString("en-IN")}, required margin is ₹${marginRequired.toLocaleString("en-IN")}`,
      });
    }

    wallet.set("INR", inrBal - marginRequired);


    const objId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : new mongoose.Types.ObjectId("000000000000000000000000");

    const isBuy = side === "LONG" || side === "BUY";
    const atrEst = filledPrice * 0.012;
    const defaultSL = isBuy ? Number((filledPrice - atrEst * 1.5).toFixed(2)) : Number((filledPrice + atrEst * 1.5).toFixed(2));
    const defaultTP = isBuy ? Number((filledPrice + atrEst * 3.0).toFixed(2)) : Number((filledPrice - atrEst * 3.0).toFixed(2));
    const slPrice = Number(req.body.sl) > 0 ? Number(req.body.sl) : defaultSL;
    const tpPrice = Number(req.body.tp) > 0 ? Number(req.body.tp) : defaultTP;


    const tradeDoc = await Trade.create({
      userId: objId,
      symbol,
      side: isBuy ? "BUY" : "SELL",
      quantity: orderQty,
      entryPrice: filledPrice,
      sl: slPrice,
      tp: tpPrice,
      leverage,
      status: "OPEN",
      mode: mode || "PAPER",
      accountType: accountType as any,
      strategy: "INDIAN_AI_MODEL",
      pnl: 0,
      openedAt: new Date(),
      autoCloseStatus: "ARMED",
      entrySource: "INDIAN_MARKET_SCANNER",
      decisionPath: ["AQEA_INDIAN_SCANNER", "SEBI_EXECUTION_ENGINE"],
      authorizedVotes: { model1: side || "BUY" },
      shadowVotes: {},
      coreScore: Number(req.body.aiConfidence) || 85,
      finalScore: Number(req.body.aiConfidence) || 85,
      aiConfidence: Number(req.body.aiConfidence) || 85,
    });

    if (paper && typeof paper.setPosition === "function") {
      paper.setPosition(userId, symbol, mode || "PAPER", {
        userId,
        symbol,
        side: isBuy ? "BUY" : "SELL",
        quantity: orderQty,
        entryPrice: filledPrice,
        leverage,
        sl: slPrice,
        tp: tpPrice,
        tradeId: tradeDoc._id.toString(),
        accountType: accountType as any,
      });
    }

    await safeCreateAlert({
      userId,
      severity: "GREEN",
      symbol,
      title: "ORDER SUCCESS",
      message: `Placed ${isBuy ? "BUY" : "SELL"} order for ${symbol} — Qty=${orderQty} @ ₹${filledPrice}`,
    });

    res.json({
      ok: true,
      tradeId: tradeDoc._id.toString(),
      symbol,
      exchange,
      side: isBuy ? "BUY" : "SELL",
      productType: isMIS ? "INTRADAY (MIS)" : "DELIVERY (CNC)",
      autoSquareOff: isMIS ? "3:15 PM IST" : "N/A",
      leverage: `${leverage}x`,
      quantity: orderQty,
      price: filledPrice,
      sl: slPrice,
      tp: tpPrice,
      totalNotionalINR: totalNotional,
      marginDebitedINR: marginRequired,
      walletRemainingINR: inrBal - marginRequired,
      executionTimestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/indian-market/positions
 */
router.get("/positions", async (req, res) => {
  try {
    const openTrades = await Trade.find({
      status: { $in: ["OPEN", "TARGET_TRIGGERED", "STOP_TRIGGERED", "EXIT_PENDING", "EXIT_PARTIALLY_FILLED"] },
      accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"] },
    }).lean();

    const positions = openTrades.map((t: any) => {
      const authPos = AuthoritativeLedger.buildAuthoritativePosition(t);
      const unrealizedPnlPct = authPos.margin_used > 0
        ? roundTo2((authPos.unrealized_pnl / authPos.margin_used) * 100)
        : 0;

      return {
        tradeId: authPos.trade_id,
        trade_id: authPos.trade_id,
        symbol: authPos.instrument,
        instrument: authPos.instrument,
        underlying: t.underlying || authPos.instrument,
        exchange: authPos.exchange,
        expiry: authPos.expiry,
        strike: authPos.strike,
        optionType: authPos.option_type,
        side: authPos.side,
        quantity: authPos.quantity,
        remainingQty: authPos.remaining_qty,
        filledExitQty: authPos.filled_exit_qty,
        contractMultiplier: authPos.contract_multiplier,
        lotSize: authPos.lot_size,

        // Prices & Targets
        entryPrice: authPos.average_entry_price,
        average_entry_price: authPos.average_entry_price,
        currentPrice: authPos.current_ltp,
        current_ltp: authPos.current_ltp,
        sl: authPos.stop_loss,
        tp: authPos.target,
        highestLtp: authPos.highest_ltp_since_entry,
        lowestLtp: authPos.lowest_ltp_since_entry,

        // Statuses (Section 10 & 18)
        targetStatus: authPos.target_status,
        stopStatus: authPos.stop_status,
        autoPilotStatus: authPos.auto_pilot_status,
        exitOrderStatus: authPos.exit_order_status,
        positionStatus: authPos.position_status,
        position_status: authPos.position_status,
        autoCloseStatus: authPos.auto_pilot_status,

        // Financials
        totalNotional: authPos.invested_value,
        investedValue: authPos.invested_value,
        marginUsed: authPos.margin_used,
        margin_used: authPos.margin_used,
        openExposure: authPos.open_exposure,
        unrealizedPnl: authPos.unrealized_pnl,
        unrealized_pnl: authPos.unrealized_pnl,
        unrealizedPnlPct,
        realizedPnl: authPos.realized_pnl,
        realized_pnl: authPos.realized_pnl,
        totalPnl: authPos.total_pnl,
        charges: authPos.charges,
        taxes: authPos.taxes,
        netPnl: authPos.net_pnl,
        todayUnrealizedPnl: authPos.today_unrealized_pnl,
        todayRealizedPnl: authPos.today_realized_pnl,
        todayCharges: authPos.today_charges,
        todayNetPnl: authPos.today_net_pnl,

        // Metadata
        leverage: t.leverage || 1,
        accountType: t.accountType,
        productType: t.productType || "MIS",
        openedAt: authPos.entry_timestamp,
        strategy: t.strategy,
        legs: t.legs || [],
        order_ids: authPos.order_ids,
        broker_position_id: authPos.broker_position_id,
      };
    });

    res.json({ success: true, positions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/indian-market/close-position
 */
router.post("/close-position", requirePermission("CANCEL_ORDER"), async (req: AuthRequest, res) => {
  try {
    const { tradeId } = req.body;
    if (!tradeId) return res.status(400).json({ error: "Missing tradeId parameter" });

    // 🛡️ Cross-Account Access Lockout (Requirement 5)
    const authUserId = req.userId;
    const reqUserId = (req.body.userId as string);
    if (authUserId && reqUserId && authUserId !== reqUserId) {
      return res.status(403).json({
        error: "CROSS_ACCOUNT_FORBIDDEN",
        message: "Access denied: Cannot close positions belonging to another user.",
      });
    }

    const trade = await Trade.findById(tradeId);
    if (!trade || trade.status === "CLOSED") {
      return res.status(404).json({ error: "Active trade position not found" });
    }

    if (authUserId && trade.userId && trade.userId.toString() !== authUserId) {
      return res.status(403).json({
        error: "CROSS_ACCOUNT_FORBIDDEN",
        message: "Access denied: You do not own this trade position.",
      });
    }

    // 🛡️ Dangerous State Transition Validation (Requirement 8)
    const transitionCheck = OrderValidator.validateStateTransition(
      trade._id.toString(),
      trade.status,
      "CLOSED",
      { fillQty: trade.quantity, fillPrice: resolveLivePriceForIndianTrade(trade) }
    );
    if (!transitionCheck.allowed) {
      return res.status(400).json({
        error: "DANGEROUS_STATE_TRANSITION",
        reason: transitionCheck.reason,
      });
    }

    const userId = authUserId || reqUserId || trade.userId?.toString() || "guest-user";

    const exitPrice = resolveLivePriceForIndianTrade(trade);
    const spec = AuthoritativeLedger.resolveInstrumentSpec(trade.symbol);
    const qty = trade.quantity || 1;
    const realizedPnl = AuthoritativeLedger.calculateRealizedPnl(
      trade.side || "BUY",
      trade.entryPrice,
      exitPrice,
      qty,
      spec.contractMultiplier
    );
    const totalNotional = roundTo2(trade.entryPrice * qty * spec.contractMultiplier);
    const marginReturned = roundTo2(totalNotional / (trade.leverage || 1));

    trade.status = "CLOSED";
    trade.exitPrice = exitPrice;
    trade.pnl = realizedPnl;
    trade.netPnl = realizedPnl;
    trade.closedAt = new Date();
    trade.exitReason = "MANUAL_SQUARE_OFF";
    if (!trade.meta) trade.meta = {};
    trade.meta.filledExitQty = trade.origQty || qty;
    trade.meta.exitOrderStatus = "FILLED";
    await trade.save();

    const accType = trade.accountType || "INDIAN_NSE";
    const wallet = paper.getWallet(userId, trade.mode as any, accType as any);
    const currentBal = wallet.get("INR") || 0;
    const nextBal = roundTo2(currentBal + marginReturned + realizedPnl);
    wallet.set("INR", nextBal);
    if (trade.mode === "PAPER") {
      await paper.setWalletBalance(userId, trade.mode, "INR", nextBal, accType);
    }

    if (paper && typeof paper.removePosition === "function") {
      paper.removePosition(userId, trade.symbol, trade.mode as any, accType);
    }

    IndianAuditLogger.log({
      eventType: "POSITION_CLOSED",
      underlying: trade.underlying || trade.symbol,
      strategy: trade.strategy || "MANUAL_SQUARE_OFF",
      details: { tradeId, exitPrice, pnl: realizedPnl },
      reason: "Manual operator square-off",
    });

    await safeCreateAlert({
      userId,
      severity: realizedPnl >= 0 ? "GREEN" : "AMBER",
      symbol: trade.symbol,
      title: "POSITION CLOSED",
      message: `Squared off ${trade.symbol} @ ₹${exitPrice} — PnL ${realizedPnl >= 0 ? "+" : ""}₹${realizedPnl.toFixed(2)}`,
    });

    res.json({
      ok: true,
      message: `Position for ${trade.symbol} successfully squared off`,
      tradeId,
      symbol: trade.symbol,
      exitPrice,
      realizedPnlINR: realizedPnl,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/indian-market/history
 */
router.get("/history", async (req, res) => {
  try {
    const timeframe = (req.query.timeframe as string) || "all";
    const limit = Math.min(Number(req.query.limit) || 100, 200);

    const now = Date.now();
    let timeFilter: any = {};
    if (timeframe === "daily") {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      timeFilter = { closedAt: { $gte: startOfToday } };
    } else if (timeframe === "weekly") {
      timeFilter = { closedAt: { $gte: new Date(now - 7 * 86400000) } };
    } else if (timeframe === "monthly") {
      timeFilter = { closedAt: { $gte: new Date(now - 30 * 86400000) } };
    }

    const closedTrades = await Trade.find({
      status: "CLOSED",
      accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"] },
      ...timeFilter,
    })
      .sort({ closedAt: -1 })
      .limit(limit)
      .lean();

    const history = closedTrades.map((t: any) => {
      const entryVal = (t.entryPrice || 0) * (t.quantity || 1);
      const exitVal = (t.exitPrice || t.entryPrice || 0) * (t.quantity || 1);
      const pnl = t.pnl || 0;
      const pnlPct = entryVal > 0 ? (pnl / entryVal) * 100 : 0;
      const charges = Number((Math.max(20, (entryVal + exitVal) * 0.0006)).toFixed(2));
      return {
        tradeId: t._id.toString(),
        symbol: t.symbol,
        underlying: t.underlying || t.symbol,
        side: t.side,
        quantity: t.quantity,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice || t.entryPrice,
        leverage: t.leverage || 1,
        productType: t.productType || (t.symbol.includes("CE") || t.symbol.includes("PE") ? "MIS" : "CNC"),
        accountType: t.accountType,
        realizedPnl: pnl,
        realizedPnlPct: Number(pnlPct.toFixed(2)),
        charges,
        netPnl: Number((pnl - charges).toFixed(2)),
        openedAt: t.openedAt,
        closedAt: t.closedAt,
        exitReason: t.exitReason || "TAKE_PROFIT_HIT",
        strategy: t.strategy || "LAKSHMI_AI_MODEL",
      };
    });

    res.json({ success: true, history, count: history.length, timeframe });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * POST /api/indian-market/auto-execute
 */
router.post("/auto-execute", requirePermission("CREATE_ORDER"), async (req, res) => {
  try {
    const userId = (req.body.userId as string) || "guest-user";
    const mode = (req.body.mode as "PAPER" | "LIVE") || "PAPER";
    const productType = (req.body.productType as "MIS" | "CNC") || "MIS";
    const overrideSymbol = req.body.symbol;

    const report = await IndianMarketAutoTrader.autoExecuteBestTrade(userId, mode, productType, overrideSymbol);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/indian-market/toggle-auto-trade
 */
router.post("/toggle-auto-trade", requirePermission("ENABLE_AUTONOMOUS"), async (req, res) => {
  try {
    const { enabled } = req.body;
    const userId = (req.body.userId as string) || "guest-user";
    const isBool = Boolean(enabled);
    const currentState = IndianMarketAutoTrader.setAutoTradingEnabled(isBool);
    await IndianRiskManager.updateSettings(userId, { autoTrade: isBool } as any);
    res.json({
      success: true,
      enabled: currentState,
      message: currentState ? "Autonomous AI Auto-Trader enabled" : "Autonomous AI Auto-Trader disabled",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

let fundsCache: { timestamp: number; key: string; data: any } = { timestamp: 0, key: "", data: null };

/**
 * GET /api/indian-market/funds
 */
router.get("/funds", async (req, res) => {
  try {
    const rawUserId = (req.query.userId as string) || (req as any).userId;
    const userId = (!rawUserId || rawUserId === "guest-user") ? "6a39c0e7a5e2995ed257ca68" : rawUserId;
    const mode = (req.query.mode as "PAPER" | "LIVE") || "PAPER";
    const cacheKey = `${userId}:${mode}`;

    if (fundsCache.data && fundsCache.key === cacheKey && (Date.now() - fundsCache.timestamp < 3000)) {
      return res.json(fundsCache.data);
    }

    const wallet = paper.getWallet(userId, mode, "INDIAN_NSE" as any);
    let inr = wallet.get("INR");
    if (inr === undefined || inr === null) {
      inr = 0;
      wallet.set("INR", inr);
    }

    // Query active open Indian positions (scoped to this user — the ledger
    // below folds positions into a per-user equity/reconciliation snapshot,
    // so an unscoped query would leak and mis-aggregate every user's trades).
    const openTrades = await Trade.find({
      userId,
      status: { $in: ["OPEN", "TARGET_TRIGGERED", "STOP_TRIGGERED", "EXIT_PENDING", "EXIT_PARTIALLY_FILLED"] },
      accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"] },
    }).lean();

    // Query closed trade history
    const closedTrades = await Trade.find({
      userId,
      status: "CLOSED",
      accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"] },
    }).lean();

    const openPositions = openTrades.map((t: any) => AuthoritativeLedger.buildAuthoritativePosition(t));
    const closedPositions = closedTrades.map((t: any) => AuthoritativeLedger.buildAuthoritativePosition(t));

    const autoPilotMode = AutoPilotStateMachine.getMode();
    const ledger = AuthoritativeLedger.calculateAccountLedger(
      openPositions,
      closedPositions,
      inr,
      inr,
      autoPilotMode
    );

    const winningTradesCount = closedPositions.filter((p) => p.realized_pnl > 0).length;
    const winRate = closedPositions.length > 0
      ? roundTo2((winningTradesCount / closedPositions.length) * 100)
      : 0;

    const payload = {
      success: true,
      // Authoritative Primary Financial Fields (Section 7 & 17)
      accountEquityINR: ledger.account_equity,
      totalEquityINR: ledger.account_equity,
      availableCashINR: ledger.available_cash,
      usedMarginINR: ledger.used_margin,
      availableMarginINR: ledger.available_margin,
      totalCollateralINR: ledger.total_collateral,
      openExposureINR: ledger.open_exposure,
      investedAmountINR: ledger.invested_value,

      // P&L Breakdown (Section 4, 5, 6)
      openPositionsPnlINR: ledger.open_positions_pnl,
      unrealizedPnlINR: ledger.unrealized_total_pnl,
      realizedPnlINR: ledger.cumulative_realized_pnl,
      cumulativeRealizedPnlINR: ledger.cumulative_realized_pnl,
      cumulativeRealizedNetPnlINR: ledger.cumulative_realized_net_pnl,
      todayRealizedPnlINR: ledger.realized_pnl_today,
      todayUnrealizedPnlINR: ledger.unrealized_pnl_today,
      todayChargesINR: ledger.charges_today,
      todayPnlINR: ledger.net_today_pnl,
      todayNetPnlINR: ledger.net_today_pnl,
      netAccountPnlINR: ledger.net_account_pnl,

      // Reconciliation & Diagnostic (Section 8)
      reconciliationDifferenceINR: ledger.reconciliation_difference,

      // Trade counts & Status
      openTradesCount: openPositions.length,
      closedTradesCount: closedPositions.length,
      winRate,
      currency: "INR",
      accountMode: mode,
      capitalSource: mode === "LIVE" ? "LIVE_BROKER" : "PAPER_INITIALIZATION",
      startingCapital: mode === "LIVE" ? ledger.available_margin : (inr ?? 0),
      inrRate: CurrencyService.getRate() || 95.613964,
      fxSource: "RBI Reference / Live Feed",
      reconciliationStatus: ledger.reconciliation_difference === 0 ? "RECONCILED" : "MISMATCH",
      freshness: "AUTHORITATIVE_REALTIME",
      autoTradeEnabled: IndianMarketAutoTrader.isEnabled() && autoPilotMode !== "PAUSED",
      autoPilotMode,
    };

    fundsCache = { timestamp: Date.now(), key: cacheKey, data: payload };
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/indian-market/account/reconciliation (and /reconciliation)
 */
router.get(["/account/reconciliation", "/reconciliation"], async (req, res) => {
  try {
    const userId = (req.query.userId as string) || "guest-user";
    const mode = (req.query.mode as "PAPER" | "LIVE") || "PAPER";

    const wallet = paper.getWallet(userId, mode, "INDIAN_NSE" as any);
    const inr = wallet.get("INR") ?? 0;

    const [openTrades, closedTrades] = await Promise.all([
      Trade.find({
        status: { $in: ["OPEN", "TARGET_TRIGGERED", "STOP_TRIGGERED", "EXIT_PENDING", "EXIT_PARTIALLY_FILLED"] },
        accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"] },
      }).lean(),
      Trade.find({
        status: "CLOSED",
        accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"] },
      }).lean(),
    ]);

    const openPositions = openTrades.map((t: any) => AuthoritativeLedger.buildAuthoritativePosition(t));
    const closedPositions = closedTrades.map((t: any) => AuthoritativeLedger.buildAuthoritativePosition(t));

    const ledger = AuthoritativeLedger.calculateAccountLedger(
      openPositions,
      closedPositions,
      inr,
      inr,
      AutoPilotStateMachine.getMode()
    );

    const report = AuthoritativeLedger.generateReconciliationReport(ledger, openPositions, closedPositions);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/indian-market/account/database-audit
 */
router.get(["/account/database-audit", "/database-audit"], async (_req, res) => {
  try {
    const audit = await AuthoritativeLedger.runDatabaseAudit();
    res.json(audit);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/indian-market/autopilot/mode
 */
router.post("/autopilot/mode", requirePermission("ENABLE_AUTONOMOUS"), (req: AuthRequest, res) => {
  try {
    const { mode } = req.body;
    if (!["AUTO", "MANUAL", "PAUSED", "ERROR"].includes(mode)) {
      return res.status(400).json({ error: `INVALID_MODE: Must be AUTO, MANUAL, PAUSED, or ERROR` });
    }

    // 🛡️ Auto-Pilot Activation Guard (Requirement 7 & 14)
    if (mode === "AUTO") {
      if (!TradingKillSwitch.isTradingAllowed()) {
        return res.status(403).json({
          error: "KILL_SWITCH_ACTIVE",
          message: "Cannot activate Auto-Pilot while Emergency Trading Kill Switch is active.",
          status: TradingKillSwitch.getStatus(),
        });
      }
    }

    AutoPilotStateMachine.setMode(mode as AutoPilotMode);
    if (mode === "AUTO") {
      IndianMarketAutoTrader.setAutoTradingEnabled(true);
    } else if (mode === "PAUSED") {
      IndianMarketAutoTrader.setAutoTradingEnabled(false);
    }
    res.json({ success: true, mode: AutoPilotStateMachine.getMode() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/indian-market/funds/deposit
 */
router.post("/funds/deposit", requirePermission("CREATE_ORDER"), async (req, res) => {
  try {
    // Resolve userId identically to GET /funds (line ~1059): the client sends
    // "guest-user", but the funds panel reads the real user's wallet. Without
    // this remap the deposit lands in a separate "guest-user" wallet that
    // nothing displays, so added funds never show up in the Indian panel (and
    // the WalletTransaction audit below is skipped because "guest-user" is not
    // a valid ObjectId). Remapping keeps the deposit and the display in sync.
    const rawUserId = (req.body.userId as string) || "guest-user";
    const userId = (!rawUserId || rawUserId === "guest-user") ? "6a39c0e7a5e2995ed257ca68" : rawUserId;
    const mode = (req.body.mode as "PAPER" | "LIVE") || "PAPER";
    const amount = Number(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid deposit amount. Must be greater than 0." });
    }
    const wallet = paper.getWallet(userId, mode, "INDIAN_NSE" as any);
    const current = wallet.get("INR") || 0;
    const next = current + amount;
    wallet.set("INR", next);
    if (mode === "PAPER") {
      await paper.setWalletBalance(userId, mode, "INR", next, "INDIAN_NSE", "PAPER_INITIALIZATION");
      if (mongoose.connection?.readyState === 1 && mongoose.Types.ObjectId.isValid(userId)) {
        try {
          await WalletTransaction.create({
            userId: new mongoose.Types.ObjectId(userId),
            type: "DEPOSIT",
            method: "DEBUG",
            capitalSource: "PAPER_INITIALIZATION",
            amount,
            currency: "INR",
            status: "COMPLETED",
            txnRef: `IN_DEP_${Date.now()}`,
            note: `Auditable Paper Simulation Initial Deposit: +${amount} INR`,
            accountType: "INDIAN_NSE",
          });
        } catch {
          // ignore
        }
      }
    }
    res.json({
      success: true,
      depositedINR: amount,
      newBalanceINR: next,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/indian-market/kill-switch
 * Authoritative Kill Switch Status Query
 */
router.get("/kill-switch", (_req, res) => {
  res.json({
    success: true,
    status: TradingKillSwitch.getStatus(),
  });
});

/**
 * POST /api/indian-market/kill-switch/disable
 * Emergency Shutdown: Disables all trading executions
 */
router.post("/kill-switch/disable", requirePermission("EMERGENCY_STOP"), async (req: AuthRequest, res) => {
  try {
    const reason = req.body.reason || "Emergency manual trading stop initiated by operator";
    const user = req.userId || req.body.userId || "operator";
    const status = await TradingKillSwitch.disableTrading("ADMIN_MANUAL", reason, user);
    res.json({ success: true, message: "Emergency Trading Kill Switch activated. Trading disabled.", status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/indian-market/kill-switch/enable
 * Re-enables trading after authorized administrative review
 */
router.post("/kill-switch/enable", requirePermission("EMERGENCY_STOP"), async (req: AuthRequest, res) => {
  try {
    const reason = req.body.reason;
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return res.status(400).json({ error: "Justification reason is required to reset and enable trading." });
    }
    const user = req.userId || req.body.userId || "operator";
    const status = await TradingKillSwitch.enableTrading(user, reason);
    res.json({ success: true, message: "Emergency Trading Kill Switch reset. Trading enabled.", status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/indian-market/data-integrity-scan
 * Runs database consistency, duplicate trades, and financial anomaly scan
 */
router.get("/data-integrity-scan", async (_req, res) => {
  try {
    const report = await DataIntegrityScanner.runScan();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

