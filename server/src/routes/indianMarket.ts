/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Indian Derivatives & Stock Market (NSE/BSE) API Routes
 * ═══════════════════════════════════════════════════════════════════
 */

import express from "express";
import mongoose from "mongoose";
import { Trade } from "../models/Trade.js";
import { IndianTradeGroup } from "../models/IndianTradeGroup.js";
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

const router = express.Router();

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
router.post("/risk-settings", async (req, res) => {
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
router.post("/panic-stop", async (req, res) => {
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
router.post("/daily-risk-lock/reset", async (req, res) => {
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
router.post("/execute-strategy", async (req, res) => {
  try {
    const { strategyId: sId, strategy, underlying = "NIFTY", mode = "PAPER" } = req.body;
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

    const trade = strat.constructTrade(signal, context, 500000, 1.0);
    trade.mode = mode as any;

    const accType = (underlying === "SENSEX" || underlying === "BSE") ? "INDIAN_BSE" : (underlying === "NIFTY" || underlying === "BANKNIFTY" || underlying === "NIFTY50") ? "INDIAN_NIFTY50" : "INDIAN_NSE";
    let wallet = paper.getWallet(userId, mode, accType as any);
    let availableMargin = wallet.get("INR") ?? 0;
    if (availableMargin === 0) {
      const fallbackWallet = paper.getWallet(userId, mode, "INDIAN_NSE" as any);
      if ((fallbackWallet.get("INR") ?? 0) > 0) {
        wallet = fallbackWallet;
        availableMargin = wallet.get("INR") ?? 0;
      }
    }
    if (availableMargin === 0) availableMargin = 500000;
    // availableMargin computed above
    const riskCheck = await IndianRiskManager.validateTrade(trade, 500000, availableMargin, userId, true);

    if (!riskCheck.approved) {
      return res.status(400).json({ error: `RISK_REJECTED: ${riskCheck.rejectionReason}` });
    }

    // Debit margin
    const requiredMargin = trade.risk.riskAmount > 0 ? trade.risk.riskAmount : trade.entryPrice * trade.quantity;
    wallet.set("INR", availableMargin - requiredMargin);

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
        accountType: "INDIAN_FNO",
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
router.post("/execute", async (req, res) => {
  try {
    const { symbol, side = "BUY", exchange = "NSE", mode = "PAPER", quantity, productType = "MIS" } = req.body;
    const userId = (req.body.userId as string) || "guest-user";

    const config = INDIAN_SYMBOLS[symbol];
    if (!config) {
      return res.status(400).json({ error: `UNSUPPORTED_SYMBOL: ${symbol}` });
    }

    const tickerData = MOCK_LIVE_INDIAN_TIKERS[symbol] || {
      ltp: 1000, open: 990, high: 1010, low: 985, volume: 500000, rsi14: 55, adx14: 25
    };

    const isIndexContract = config?.assetClass === "INDEX" || symbol.includes("NIFTY") || symbol.includes("BANK") || symbol.includes("SENSEX");
    const minRequiredQty = isIndexContract ? (config?.lotSize || 1) : 1;
    const orderQty = Math.max(minRequiredQty, Number(quantity) || minRequiredQty);
    const filledPrice = tickerData.ltp;
    const totalNotional = orderQty * filledPrice;
    const accountType = exchange === "BSE" ? "INDIAN_BSE" : (symbol.includes("NIFTY") || symbol.includes("BANK") ? "INDIAN_NIFTY50" : "INDIAN_NSE");

    const { leverage: userLeverage } = req.body;
    const isMIS = productType === "MIS";
    const defaultLev = isMIS ? 5 : 1;
    const leverage = Math.max(1, Math.min(20, Number(userLeverage) || defaultLev));
    const marginRequired = totalNotional / leverage;

    const wallet = paper.getWallet(userId, mode, accountType as any);
    let inrBal = wallet.get("INR");
    if (mode === "PAPER" && (!inrBal || inrBal < marginRequired)) {
      inrBal = Math.max(500000, marginRequired * 2);
      wallet.set("INR", inrBal);
    } else if (inrBal === undefined || inrBal === null) {
      inrBal = 0;
      wallet.set("INR", 0);
    }

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
        accountType: "FUTURES",
      });
    }

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
      status: "OPEN",
      accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"] },
    }).lean();

    const positions = openTrades.map((t: any) => {
      const currentPrice = resolveLivePriceForIndianTrade(t);
      const isLong = t.side === "BUY";
      const priceDiff = isLong ? currentPrice - t.entryPrice : t.entryPrice - currentPrice;
      const unrealizedPnl = Number((priceDiff * t.quantity).toFixed(2));
      const totalNotional = Number((t.entryPrice * t.quantity).toFixed(2));
      const marginUsed = Number((totalNotional / (t.leverage || 1)).toFixed(2));
      const unrealizedPnlPct = marginUsed > 0 ? Number(((unrealizedPnl / marginUsed) * 100).toFixed(2)) : 0;

      return {
        tradeId: t._id.toString(),
        symbol: t.symbol,
        underlying: t.underlying || t.symbol,
        side: t.side,
        quantity: t.quantity,
        entryPrice: t.entryPrice,
        currentPrice,
        sl: t.sl,
        tp: t.tp,
        autoCloseStatus: t.autoCloseStatus || "ARMED",
        leverage: t.leverage || 1,
        accountType: t.accountType,
        totalNotional,
        marginUsed,
        unrealizedPnl,
        unrealizedPnlPct,
        openedAt: t.openedAt,
        strategy: t.strategy,
        legs: t.legs || [],
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
router.post("/close-position", async (req, res) => {
  try {
    const { tradeId, userId = "guest-user" } = req.body;
    if (!tradeId) return res.status(400).json({ error: "Missing tradeId parameter" });

    const trade = await Trade.findById(tradeId);
    if (!trade || trade.status !== "OPEN") {
      return res.status(404).json({ error: "Open trade position not found" });
    }

    const exitPrice = resolveLivePriceForIndianTrade(trade);
    const isLong = trade.side === "BUY";
    const priceDiff = isLong ? exitPrice - trade.entryPrice : trade.entryPrice - exitPrice;
    const realizedPnl = Number((priceDiff * trade.quantity).toFixed(2));
    const totalNotional = Number((trade.entryPrice * trade.quantity).toFixed(2));
    const marginReturned = Number((totalNotional / (trade.leverage || 1)).toFixed(2));

    trade.status = "CLOSED";
    trade.exitPrice = exitPrice;
    trade.pnl = realizedPnl;
    trade.netPnl = realizedPnl;
    trade.closedAt = new Date();
    trade.exitReason = "MANUAL_SQUARE_OFF";
    await trade.save();

    const wallet = paper.getWallet(userId, trade.mode as any, "INDIAN_NSE" as any);
    const currentBal = wallet.get("INR") || 0;
    wallet.set("INR", currentBal + marginReturned + realizedPnl);

    if (paper && typeof paper.removePosition === "function") {
      paper.removePosition(userId, trade.symbol, trade.mode as any, "FUTURES");
    }

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
router.post("/auto-execute", async (req, res) => {
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
router.post("/toggle-auto-trade", async (req, res) => {
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

/**
 * GET /api/indian-market/funds
 */
router.get("/funds", async (req, res) => {
  try {
    const userId = (req.query.userId as string) || "guest-user";
    const mode = (req.query.mode as "PAPER" | "LIVE") || "PAPER";
    if (mode === "PAPER") {
      await paper.ensurePaperWalletFunded(userId, mode, "INDIAN_NSE", 500000);
      await paper.ensurePaperWalletFunded(userId, mode, "INDIAN_NIFTY50", 500000);
      await paper.ensurePaperWalletFunded(userId, mode, "INDIAN_FNO", 500000);
    }
    const wallet = paper.getWallet(userId, mode, "INDIAN_NSE" as any);
    let inr = wallet.get("INR");
    if (inr === undefined || inr === null || inr <= 0) {
      inr = 500000; // Default 5 Lakh initial INR paper margin
      wallet.set("INR", inr);
      if (mode === "PAPER") {
        await paper.setWalletBalance(userId, mode, "INR", inr, "INDIAN_NSE");
      }
    }
    res.json({
      success: true,
      availableCashINR: inr,
      usedMarginINR: 0,
      totalCollateralINR: inr,
      currency: "INR",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/indian-market/funds/deposit
 */
router.post("/funds/deposit", async (req, res) => {
  try {
    const userId = (req.body.userId as string) || "guest-user";
    const mode = (req.body.mode as "PAPER" | "LIVE") || "PAPER";
    const amount = Number(req.body.amount) || 100000;
    const wallet = paper.getWallet(userId, mode, "INDIAN_NSE" as any);
    const current = wallet.get("INR") || 0;
    const next = current + amount;
    wallet.set("INR", next);
    if (mode === "PAPER") {
      await paper.setWalletBalance(userId, mode, "INR", next, "INDIAN_NSE");
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

export default router;

