/*
 * ─── Trading routes ────────────────────────────────────
 *
 * POST /trading/place-order   – PAPER or LIVE order
 * GET  /trading/open-positions
 * GET  /trading/history
 * GET  /trading/wallet
 */
import { Router } from "express";
import { authGuard, adminGuard, optionalAuth, type AuthRequest } from "../middleware/auth.js";
import { Settings } from "../models/Settings.js";
import { Trade } from "../models/Trade.js";
import { WalletSnapshot } from "../models/WalletSnapshot.js";
import { WalletTransaction } from "../models/WalletTransaction.js";
import { ApiKeys } from "../models/ApiKeys.js";
import { Alert } from "../models/Alert.js";
import { User } from "../models/User.js";
import { decrypt } from "../lib/crypto.js";
import { AIDecision } from "../models/AIDecision.js";
import { AqeaAudit } from "../models/AqeaAudit.js";
import { AqeaPerformance } from "../models/AqeaPerformance.js";
import { AqeaTradeAnalytics } from "../models/AqeaTradeAnalytics.js";
import * as binance from "../services/binanceService.js";
import * as paper from "../services/paperState.js";
import { enrichOpenTrades, TAKER_FEE } from "../services/pnlService.js";
import { toValidObjectId } from "../utils/mongoUtils.js";
import * as autoTradeEngine from "../services/autoTradeEngine.js";
import * as ensemble from "../services/ensembleService.js";
import { computeSnapshot, StreamingVWAP, computeSupertrend, type OHLCVol } from "../services/indicatorService.js";
import mongoose from "mongoose";
import { clearDashboardCache } from "./aqeaUi.js";
import { getRegimeReport } from "../services/spectralRegimeService.js";

const router = Router();

/* ── In-Memory Strategy Weights Cache ── */
let currentStrategyWeights = { Trend: 0.25, MeanRev: 0.25, Breakout: 0.25, Momentum: 0.25 };

router.post("/weights-update", authGuard, adminGuard, async (req, res) => {
  try {
    if (req.body.weights) {
      currentStrategyWeights = { ...currentStrategyWeights, ...req.body.weights };
    }
    res.json({ success: true, weights: currentStrategyWeights });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/current-weights", optionalAuth, async (req: AuthRequest, res) => {
  try {
    let settings: any = null;
    if (mongoose.connection.readyState === 1 && req.userId) {
      settings = await Settings.findOne({ userId: toValidObjectId(req.userId) }).lean();
    }
    const isDynamic = settings?.dynamicWeights === true;

    // Fetch latest klines for the primary index (BTCUSDT) to detect market regime
    const klines = await binance.getKlines("BTCUSDT", "5m", undefined, undefined, 200);
    if (!klines || klines.length === 0) {
      return res.json(currentStrategyWeights);
    }
    const bars: OHLCVol[] = klines.map((k: any) => ({
      open: parseFloat(k.open),
      high: parseFloat(k.high),
      low: parseFloat(k.low),
      close: parseFloat(k.close),
      volume: parseFloat(k.volume),
    }));
    const ind = computeSnapshot(bars);

    const vwapCalc = new StreamingVWAP();
    bars.forEach((bar) => vwapCalc.update(bar));
    const vwap = vwapCalc.value ?? ind.close;
    const supertrend = computeSupertrend(bars, 10, 3);

    const fundingRate = await binance.getLatestFundingRate("BTCUSDT").catch(() => 0);
    const openInterest = await binance.getFuturesOpenInterest("BTCUSDT").catch(() => 0);
    const oiFactor = Math.min(1, openInterest / 1200000000);
    const fundingSignal = fundingRate > 0.0005 ? 0.1 : fundingRate < -0.0005 ? -0.1 : 0;

    // Calculate raw scores for each strategy regime
    let trend = 0.25;
    let meanRev = 0.25;
    let breakout = 0.25;
    let momentum = 0.25;

    // 1. Trend (ADX trend strength, EMA alignment, VWAP / Supertrend confirmation)
    if (ind.adx14 !== null) {
      trend += (ind.adx14 - 15) / 100;
    }
    if (ind.ema9 !== null && ind.ema21 !== null && ind.ema55 !== null) {
      const bull = ind.ema9 > ind.ema21 && ind.ema21 > ind.ema55;
      const bear = ind.ema9 < ind.ema21 && ind.ema21 < ind.ema55;
      if (bull || bear) trend += 0.15;
    }
    if (supertrend.direction === "bull") {
      trend += 0.12;
      momentum += 0.06;
    } else if (supertrend.direction === "bear") {
      meanRev += 0.08;
    }
    if (ind.close >= vwap) {
      trend += 0.08;
    } else {
      meanRev += 0.08;
    }

    // 2. MeanRev (Low ADX, RSI extremes, Bollinger Bands proximity)
    if (ind.adx14 !== null && ind.adx14 < 20) {
      meanRev += (20 - ind.adx14) / 100;
    }
    if (ind.rsi14 !== null) {
      const rsiDist = Math.abs(ind.rsi14 - 50);
      meanRev += rsiDist / 200;
    }

    // 3. Breakout (High volatility, Bollinger bandwidth, OI surge)
    if (ind.bollinger && ind.bollinger.bandwidth) {
      breakout += ind.bollinger.bandwidth * 2;
    }
    if (ind.stdDev20 !== null && ind.close > 0) {
      const volRatio = ind.stdDev20 / ind.close;
      breakout += volRatio * 15;
    }
    breakout += oiFactor * 0.1;

    // 4. Momentum (MACD strength, RSI momentum, funding-driven bias)
    if (ind.macd && ind.macd.histogram !== null) {
      momentum += Math.abs(ind.macd.histogram) * 2 / Math.max(ind.close, 1);
    }
    if (ind.changePercent) {
      momentum += Math.abs(ind.changePercent) / 10;
    }
    momentum += Math.abs(fundingSignal) * 0.2;

    // Clamp all values to sane ranges (> 0.05)
    trend = Math.max(0.05, trend);
    meanRev = Math.max(0.05, meanRev);
    breakout = Math.max(0.05, breakout);
    momentum = Math.max(0.05, momentum);

    // Normalize so they sum to 1.0
    const sum = trend + meanRev + breakout + momentum || 1.0;
    const finalTrend = isDynamic ? (trend / sum) : (currentStrategyWeights.Trend * 0.5) + (trend / sum * 0.5);
    const finalMeanRev = isDynamic ? (meanRev / sum) : (currentStrategyWeights.MeanRev * 0.5) + (meanRev / sum * 0.5);
    const finalBreakout = isDynamic ? (breakout / sum) : (currentStrategyWeights.Breakout * 0.5) + (breakout / sum * 0.5);
    const finalMomentum = isDynamic ? (momentum / sum) : (currentStrategyWeights.Momentum * 0.5) + (momentum / sum * 0.5);

    const finalSum = finalTrend + finalMeanRev + finalBreakout + finalMomentum || 1.0;

    res.json({
      Trend: +(finalTrend / finalSum).toFixed(4),
      MeanRev: +(finalMeanRev / finalSum).toFixed(4),
      Breakout: +(finalBreakout / finalSum).toFixed(4),
      Momentum: +(finalMomentum / finalSum).toFixed(4),
    });
  } catch (err: any) {
    console.error("[weights_dynamic_error]", err.message);
    res.json(currentStrategyWeights);
  }
});

router.get("/current-animal-weights", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const klines = await binance.getKlines("BTCUSDT", "5m", undefined, undefined, 200);
    if (!klines || klines.length === 0) {
      return res.json({ eagle: 50, tiger: 50, cheetah: 50, fox: 50, tortoise: 50, dog: 50, owl: 50, cow: 50, spider: 50, lion: 50 });
    }
    const bars: OHLCVol[] = klines.map((k: any) => ({
      open: parseFloat(k.open),
      high: parseFloat(k.high),
      low: parseFloat(k.low),
      close: parseFloat(k.close),
      volume: parseFloat(k.volume),
    }));
    const ind = computeSnapshot(bars);
    const vwapCalc = new StreamingVWAP();
    bars.forEach((bar) => vwapCalc.update(bar));
    const vwap = vwapCalc.value ?? ind.close;
    const supertrend = computeSupertrend(bars, 10, 3);

    const volRatio = ind.stdDev20 !== null && ind.close > 0 ? ind.stdDev20 / ind.close : 0.01;
    const fundingRate = await binance.getLatestFundingRate("BTCUSDT").catch(() => 0);
    const openInterest = await binance.getFuturesOpenInterest("BTCUSDT").catch(() => 0);

    let w = {
      eagle: 50,
      tiger: 50,
      cheetah: 50,
      fox: 50,
      tortoise: 50,
      dog: 50,
      owl: 50,
      cow: 50,
      spider: 50,
      lion: 50,
    };

    if (ind.adx14 !== null) {
      w.eagle = ind.adx14 > 25 ? 85 : 35;
    }
    if (ind.rsi14 !== null) {
      w.tiger = (ind.rsi14 < 35 || ind.rsi14 > 65) ? 80 : 35;
      if (ind.close > vwap && w.tiger < 85) {
        w.tiger += 10;
      }
    }
    if (ind.bollinger && ind.bollinger.bandwidth) {
      w.cheetah = ind.bollinger.bandwidth > 0.08 ? 85 : 30;
    }
    w.fox = volRatio > 0.015 ? 90 : 30;
    w.tortoise = volRatio < 0.008 ? 85 : 30;

    let settings: any = null;
    let dailyPnl = 0;
    if (mongoose.connection.readyState === 1 && req.userId) {
      settings = await Settings.findOne({ userId: toValidObjectId(req.userId) }).lean();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayTrades = await Trade.find({
        userId: toValidObjectId(req.userId),
        openedAt: { $gte: todayStart },
      }).lean();
      dailyPnl = todayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
    }
    const maxLoss = settings?.riskConfig?.maxDailyLoss || 100;
    const lossPct = Math.abs(dailyPnl) / maxLoss;
    w.dog = lossPct > 0.6 ? 95 : 50;

    if (ind.rsi14 !== null && ind.macd) {
      const isExtreme = ind.rsi14 < 30 || ind.rsi14 > 70;
      w.owl = isExtreme && Math.abs(ind.macd.histogram) > 0 ? 85 : 35;
    }

    if (ind.adx14 !== null) {
      w.cow = ind.adx14 < 18 && Math.abs(ind.close - vwap) / Math.max(ind.close, 1) < 0.002 ? 85 : 40;
    }

    const openPositionsCount = req.userId ? paper.getOpenPositions(req.userId, "PAPER").length : 0;
    w.spider = openPositionsCount >= 2 || openInterest > 120000000 ? 80 : 40;

    if (ind.ema9 !== null && ind.ema21 !== null && ind.ema55 !== null) {
      const bullish = ind.ema9 > ind.ema21 && ind.ema21 > ind.ema55;
      const bearish = ind.ema9 < ind.ema21 && ind.ema21 < ind.ema55;
      w.lion = (bullish || bearish) ? 90 : 35;
    }

    if (supertrend.direction === "bull") {
      w.eagle = Math.max(w.eagle, 75);
      w.lion = Math.max(w.lion, 85);
    } else if (supertrend.direction === "bear") {
      w.tortoise = Math.max(w.tortoise, 85);
    }

    if (fundingRate > 0.0005) {
      w.cheetah = Math.min(100, w.cheetah + 5);
      w.tiger = Math.min(100, w.tiger + 5);
    }
    if (fundingRate < -0.0005) {
      w.cow = Math.min(100, w.cow + 5);
      w.tortoise = Math.min(100, w.tortoise + 5);
    }

    res.json({
      eagle: Math.min(100, Math.max(10, w.eagle)),
      tiger: Math.min(100, Math.max(10, w.tiger)),
      cheetah: Math.min(100, Math.max(10, w.cheetah)),
      fox: Math.min(100, Math.max(10, w.fox)),
      tortoise: Math.min(100, Math.max(10, w.tortoise)),
      dog: Math.min(100, Math.max(10, w.dog)),
      owl: Math.min(100, Math.max(10, w.owl)),
      cow: Math.min(100, Math.max(10, w.cow)),
      spider: Math.min(100, Math.max(10, w.spider)),
      lion: Math.min(100, Math.max(10, w.lion)),
    });
  } catch (err: any) {
    console.error("[animal_weights_error]", err.message);
    res.json({ eagle: 50, tiger: 50, cheetah: 50, fox: 50, tortoise: 50, dog: 50, owl: 50, cow: 50, spider: 50, lion: 50 });
  }
});

router.get("/market-check", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const symbol = ((req.query.symbol as string) || "BTCUSDT").toUpperCase();
    const interval = (req.query.interval as string) || "5m";
    const limit = Number(req.query.limit) || 200;

    const klines = await binance.getKlines(symbol, interval, undefined, undefined, limit);
    if (!klines || klines.length === 0) {
      return res.status(404).json({ error: "Market data not available" });
    }

    const bars: OHLCVol[] = klines.map((k: any) => ({
      open: parseFloat(k.open),
      high: parseFloat(k.high),
      low: parseFloat(k.low),
      close: parseFloat(k.close),
      volume: parseFloat(k.volume),
    }));

    const ind = computeSnapshot(bars);
    const vwapCalc = new StreamingVWAP();
    bars.forEach((bar) => vwapCalc.update(bar));
    const vwap = vwapCalc.value ?? ind.close;
    const supertrend = computeSupertrend(bars, 10, 3);
    const fundingRate = await binance.getLatestFundingRate(symbol).catch(() => 0);
    const openInterest = await binance.getFuturesOpenInterest(symbol).catch(() => 0);

    const bias = ind.close >= vwap ? "bullish" : "bearish";
    const liquidityPulse = openInterest > 0 ? Math.min(1, openInterest / 1200000000) : 0;
    const marketSignal = fundingRate > 0.0005 ? "long" : fundingRate < -0.0005 ? "short" : "neutral";

    res.json({
      symbol,
      interval,
      close: ind.close,
      vwap,
      supertrend: supertrend.value,
      supertrendDirection: supertrend.direction,
      fundingRate,
      openInterest,
      bias,
      liquidityPulse: +liquidityPulse.toFixed(3),
      marketSignal,
      ruleSet: {
        pcrApprox: fundingRate > 0 ? "long-skew" : fundingRate < 0 ? "short-skew" : "balanced",
        riskGuard: fundingRate > 0.0005 ? "long-favored" : fundingRate < -0.0005 ? "short-favored" : "neutral",
      },
    });
  } catch (err: any) {
    console.error("[market_check_error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/ensemble-report", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const symbol = ((req.query.symbol as string) || "BTCUSDT").toUpperCase();
    const interval = (req.query.interval as string) || "5m";
    const limit = Number(req.query.limit) || 200;
    const userId = req.userId ?? null;

    const report = await ensemble.buildEnsembleReport(symbol, interval, limit, userId);
    return res.json(report);
  } catch (err: any) {
    console.error("[ensemble_report_error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── In-Memory Trading Status Cache ── */
let currentTradingStatus = "RUNNING"; // RUNNING, PAUSED, KILLED

router.post("/control/pause", authGuard, adminGuard, async (req, res) => {
  try {
    console.log("[control] pause route triggered");
    currentTradingStatus = "PAUSED";
    res.json({ success: true, status: currentTradingStatus });
  } catch (err: any) {
    console.error("[control] pause error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/control/resume", authGuard, adminGuard, async (req, res) => {
  try {
    console.log("[control] resume route triggered");
    currentTradingStatus = "RUNNING";
    res.json({ success: true, status: currentTradingStatus });
  } catch (err: any) {
    console.error("[control] resume error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/control/kill", authGuard, adminGuard, async (req, res) => {
  try {
    console.log("[control] kill route triggered");
    currentTradingStatus = "KILLED";
    res.json({ success: true, status: currentTradingStatus });
  } catch (err: any) {
    console.error("[control] kill error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/control/status", async (req, res) => {
  res.json({ status: currentTradingStatus });
});

/* ── get alerts ───────────────────────────────────────── */
router.get("/alerts", optionalAuth, async (req: AuthRequest, res) => {
  try {
    let alerts: any[] = [];
    
    if (mongoose.connection.readyState === 1) {
      const validUserId = mongoose.Types.ObjectId.isValid(req.userId!)
        ? new mongoose.Types.ObjectId(req.userId!)
        : new mongoose.Types.ObjectId("000000000000000000000000");
      alerts = await Alert.find({ userId: validUserId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
    }

    const formattedAlerts = alerts.map((a: any) => ({
      id: a._id.toString(),
      level: a.severity || "GREEN",
      text: `${a.title}: ${a.message}`,
      time: new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }));

    res.json({ alerts: formattedAlerts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── place order ──────────────────────────────────────── */

router.post("/place-order", authGuard, async (req: AuthRequest, res) => {
  try {
    const { symbol, side, quantity, mode, strategy, sl, tp, leverage, accountType } = req.body as {
      symbol: string;
      side: "BUY" | "SELL";
      quantity: number;
      mode: "PAPER" | "LIVE";
      strategy?: string;
      sl?: number;
      tp?: number;
      leverage?: number;
      accountType?: string;
    };

    if (!symbol || !side || !quantity || !mode) {
      res.status(400).json({ error: "symbol, side, quantity, and mode are required" });
      return;
    }
    // A negative or non-finite quantity inverts the margin-debit formula below
    // (cost becomes negative, so `newBalance = usdt - cost` CREDITS the
    // wallet) — letting a caller mint arbitrary paper USDT on every "BUY".
    if (!Number.isFinite(quantity) || quantity <= 0) {
      res.status(400).json({ error: "quantity must be a positive number" });
      return;
    }
    // Binance's own exchange ceiling for most futures pairs is 125x; without
    // an upper bound a caller can inflate buying power arbitrarily and
    // bypass the maxPositionSizePct risk guard below.
    if (leverage !== undefined && (!Number.isFinite(leverage) || leverage < 1 || leverage > 125)) {
      res.status(400).json({ error: "leverage must be between 1 and 125" });
      return;
    }

    let settings: any = {
      allowedSymbols: ["BTCUSDT", "ETHUSDT", "ADAUSDT", "BNBUSDT", "DOGEUSDT", "SHIBUSDT"],
      riskConfig: { maxPositionSizePct: 100, defaultSL: 2, defaultTP: 4 }
    };
    
    if (mongoose.connection.readyState === 1) {
      settings = (await Settings.findOne({ userId: req.userId })) || settings;
    }

    /* validate allowed symbol */
    if (!settings?.allowedSymbols.includes(symbol)) {
      return res.status(400).json({ error: `Symbol ${symbol} not in allowed list` });
    }

    /* risk config defaults for SL/TP */
    const risk = settings.riskConfig;
    const maxPosSizePct = risk?.maxPositionSizePct ?? 100;
    const defaultSL = sl ?? risk?.defaultSL ?? 2;
    const defaultTP = tp ?? risk?.defaultTP ?? 4;
    const finalLeverage = leverage ?? risk?.defaultLeverage ?? 1;

    /* validate risk limits */
    const wallet = paper.getWallet(req.userId!, mode, accountType || "FUTURES");
    const usdt = wallet.get("USDT") ?? 0;

    /* position size check */
    let entryPrice: number;
    try {
      entryPrice = await binance.getTickerPrice(symbol, accountType === "FUTURES");
    } catch {
      entryPrice = 0;
    }

    const orderValue = quantity * (entryPrice || 1);
    const buyingPower = (usdt * finalLeverage);
    const posSizePct = buyingPower > 0 ? (orderValue / buyingPower) * 100 : 100;

    if (posSizePct > maxPosSizePct + 0.5) { // +0.5 tolerance for floating-point 100% fills
      return res.status(400).json({
        error: `Order exceeds max position size (${posSizePct.toFixed(1)}% > ${maxPosSizePct}% of Buying Power)`,
      });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let dailyPnl = 0;
    let weeklyPnl = 0;
    let monthlyPnl = 0;

    // DB Check wrapper for degraded mode
    if (mongoose.connection.readyState === 1) {
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
      // Day/week/month are nested ranges — one superset fetch (bounded at
      // monthStart) plus in-memory filtering replaces 3 round-trips with 1.
      // Benchmarked against the real trades collection: ~27ms for 3 queries
      // vs ~3ms for 1 at current data volume.
      const monthTrades = await Trade.find({ userId: toValidObjectId(req.userId), mode, openedAt: { $gte: monthStart } }).lean();
      const todayTrades = monthTrades.filter(t => t.openedAt >= todayStart);
      const weekTrades = monthTrades.filter(t => t.openedAt >= weekStart);
      dailyPnl = todayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
      weeklyPnl = weekTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
      monthlyPnl = monthTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
    }

    if (dailyPnl < -(risk?.maxDailyLoss ?? 100)) {
      res.status(400).json({ error: "Daily loss limit reached. No more trades today." });
      return;
    }
    // Same rolling-window gap this session's AQEA risk engine fix closed —
    // a string of daily losses each individually under the daily cap could
    // still compound into a much larger loss with nothing here catching it.
    if (weeklyPnl < -(risk?.maxWeeklyLoss ?? 300)) {
      res.status(400).json({ error: "Weekly loss limit reached. No more trades this week." });
      return;
    }
    if (monthlyPnl < -(risk?.maxMonthlyLoss ?? 800)) {
      res.status(400).json({ error: "Monthly loss limit reached. No more trades this month." });
      return;
    }

    /* compute SL/TP prices */
    let slPrice = sl;
    let tpPrice = tp;

    if (slPrice === undefined || tpPrice === undefined) {
      const estAtr = entryPrice * 0.015; // 1.5% ATR estimate for Crypto pairs
      if (side === "BUY") {
        slPrice = slPrice !== undefined ? slPrice : +(entryPrice - estAtr * 1.5).toFixed(8);
        tpPrice = tpPrice !== undefined ? tpPrice : +(entryPrice + estAtr * 3.0).toFixed(8);
      } else {
        slPrice = slPrice !== undefined ? slPrice : +(entryPrice + estAtr * 1.5).toFixed(8);
        tpPrice = tpPrice !== undefined ? tpPrice : +(entryPrice - estAtr * 3.0).toFixed(8);
      }
    } else {
        // If absolute prices provided (>= 50), use as-is; if % (< 50), compute
        if (slPrice < 50) {
            slPrice = side === "BUY" ? +(entryPrice * (1 - slPrice / 100)).toFixed(8) : +(entryPrice * (1 + slPrice / 100)).toFixed(8);
        }
        if (tpPrice < 50) {
            tpPrice = side === "BUY" ? +(entryPrice * (1 + tpPrice / 100)).toFixed(8) : +(entryPrice * (1 - tpPrice / 100)).toFixed(8);
        }
    }

    if (mode === "LIVE") {
      const keys = await import("../models/ApiKeys.js").then(m => m.ApiKeys.findOne({ userId: req.userId }));
      if (!keys) return res.status(400).json({ error: "API Keys required for LIVE trading. Please configure them in Settings." });
      
      const cryptoLib = await import("../lib/crypto.js");
      const apiKey = cryptoLib.decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
      const apiSecret = cryptoLib.decrypt({ ciphertext: keys.encryptedSecret, iv: keys.ivSecret, authTag: keys.authTagSecret });

      const finalQtyStr = accountType === "FUTURES" 
        ? await binance.formatFuturesQuantity(symbol, quantity)
        : await binance.formatQuantity(symbol, quantity);

      let result;
      const clientOrderId = binance.genClientOrderId("aalgo-manual");
      if (accountType === "FUTURES") {
        try {
          await binance.setFuturesLeverage(apiKey, apiSecret, symbol, finalLeverage);
        } catch (err: any) {
          return res.status(400).json({ error: `Binance Futures Leverage Error: ${err.message}` });
        }
        result = await binance.placeFuturesOrder(apiKey, apiSecret, {
          symbol, side, type: "MARKET", quantity: finalQtyStr, clientOrderId,
        });
      } else {
        result = await binance.placeOrder(apiKey, apiSecret, {
          symbol, side, type: "MARKET", quantity: finalQtyStr, clientOrderId,
        }) as any;
      }

      const actualEntryPrice = result.avgPrice 
        ? parseFloat(result.avgPrice)
        : (result.cummulativeQuoteQty 
           ? parseFloat(result.cummulativeQuoteQty) / parseFloat(result.executedQty || result.origQty || "1")
           : entryPrice);
           
      const executedQty = parseFloat(result.executedQty || result.origQty || String(quantity));

      let trade;
      if (mongoose.connection.readyState === 1) {
        // The real Binance order above has ALREADY executed by this point —
        // unlike PAPER mode there's no wallet debit to protect here. The
        // race this closes is different: reading `existing` and deciding
        // new/average/reduce, then saving, all outside a lock meant two
        // concurrent LIVE manual orders on the same symbol could both read
        // the same pre-update `existing` and both call .save() — one
        // update silently overwriting the other (a lost update), leaving
        // the LOCAL record undercounting a position that's correctly
        // larger on the real exchange. This mirrors the exact fix already
        // proven for PAPER mode's place-order route, using the same lock.
        let realizedPnlForResponse = 0;
        await paper.withWalletLock(req.userId!, "LIVE", accountType || "FUTURES", async () => {
          const existing = await Trade.findOne({ userId: toValidObjectId(req.userId), mode: "LIVE", symbol, accountType: accountType || "FUTURES", status: "OPEN" });

          if (existing) {
            if (existing.side !== side) {
              // Reducing position
              const reduceQty = Math.min(executedQty, existing.quantity);
              const remaining = existing.quantity - reduceQty;

              const entryFee = existing.entryPrice * reduceQty * TAKER_FEE;
              const exitFee = actualEntryPrice * reduceQty * TAKER_FEE;
              const grossPnl = existing.side === "BUY"
                ? (actualEntryPrice - existing.entryPrice) * reduceQty
                : (existing.entryPrice - actualEntryPrice) * reduceQty;
              const realizedPnl = grossPnl - entryFee - exitFee;

              if (remaining <= 0.000001) {
                // Fully closed
                existing.status = "CLOSED";
                existing.exitPrice = actualEntryPrice;
                existing.pnl = realizedPnl;
                existing.closedAt = new Date();
              } else {
                // Partially closed
                existing.quantity = remaining;
              }
              await existing.save();
              trade = existing;
              realizedPnlForResponse = realizedPnl;
            } else {
              // Averaging up/down
              const totalValue = (existing.quantity * existing.entryPrice) + (executedQty * actualEntryPrice);
              existing.quantity += executedQty;
              existing.entryPrice = totalValue / existing.quantity;
              await existing.save();
              trade = existing;
            }
          } else {
            // New position
            trade = await Trade.create({
              userId: toValidObjectId(req.userId),
              mode: "LIVE",
              symbol,
              side,
              quantity: executedQty,
              entryPrice: actualEntryPrice,
              leverage: finalLeverage,
              sl: slPrice,
              tp: tpPrice,
              strategy: strategy ?? null,
              status: "OPEN",
              accountType: accountType || "FUTURES",
              meta: { binanceOrderId: result.orderId, clientOrderId, source: "manual" },
              // Required by the schema for the AQEA auto-trade pipeline's
              // decision record — a manual order has no AQEA decision to
              // attach. Without these, every manual LIVE order failed this
              // validation *after* the real Binance order had already
              // executed, leaving an untracked live position with no local
              // Trade record at all.
              entrySource: "MANUAL",
              decisionPath: {},
              authorizedVotes: {},
              shadowVotes: {},
              coreScore: 0,
              finalScore: 0,
            });
          }
        });
        res.json({ trade: (trade as any).toObject(), pnl: realizedPnlForResponse });
      } else {
        res.status(500).json({ error: "DB connection required for LIVE trading" });
      }
    } else {
      /* ── PAPER: simulate at real Binance price ──────── */
      let simEntryPrice: number;
      try {
        simEntryPrice = await binance.getTickerPrice(symbol, accountType === "FUTURES");
      } catch {
        simEntryPrice = 0;
      }

      let cost = 0;
      let finalQty = quantity;
      let finalEntry = simEntryPrice;
      let realizedPnl = 0;       // PnL from closing/reducing a position
      let exitPriceUsed: number | null = null;
      let isReducingPosition = false;
      let reduceQtyUsed = 0;
      let existing = paper.getPosition(req.userId!, symbol, mode, accountType || "FUTURES");

      // Reading `existing` and deciding new-vs-average-vs-reduce here, then
      // debiting the wallet later inside the lock, left a TOCTOU gap: every
      // concurrent request read "no existing position" before any of them
      // had actually committed one, so N concurrent orders on the same
      // symbol each took the "open new" branch instead of only the first
      // one doing so and the rest correctly averaging in — proven live this
      // session (20 concurrent PAPER orders on a flat symbol produced 20
      // separate Trade documents instead of one position with quantity 20).
      // The read-decide-debit sequence now runs as one atomic step per
      // wallet key, matching the pattern already used by
      // debitWalletAndCreateTrade/creditWalletAndCloseTrade.
      let insufficientBalance = false;
      let clampedBalance = 0;
      let actualDebit = 0;
      let memoryTrade: any;
      await paper.withWalletLock(req.userId!, mode, accountType || "FUTURES", async () => {
        existing = paper.getPosition(req.userId!, symbol, mode, accountType || "FUTURES");

        if (side === "BUY") {
          cost = (quantity * simEntryPrice) / finalLeverage;
          if (existing && existing.side === "BUY") {
            // Increase long — average up
            const totalValue = (existing.quantity * existing.entryPrice) + cost;
            finalQty = existing.quantity + quantity;
            finalEntry = totalValue / finalQty;
          } else if (existing && existing.side === "SELL") {
            // Reduce short — compute PnL
            isReducingPosition = true;
            const reduceQty = Math.min(quantity, existing.quantity);
            reduceQtyUsed = reduceQty;
            exitPriceUsed = simEntryPrice;
            const existingLeverage = existing.leverage || 1;
            const initialMargin = (reduceQty * existing.entryPrice) / existingLeverage;
            const entryFee = existing.entryPrice * reduceQty * TAKER_FEE;
            const exitFee = simEntryPrice * reduceQty * TAKER_FEE;
            const grossPnl = (existing.entryPrice - simEntryPrice) * reduceQty; // short PnL
            realizedPnl = grossPnl - entryFee - exitFee;
            cost = -(initialMargin + realizedPnl); // return margin + profit (or margin - loss)
            finalQty = existing.quantity - reduceQty;
            finalEntry = existing.entryPrice;
          }
        } else if (side === "SELL") {
          if (existing && existing.side === "BUY") {
            // Reduce long — compute PnL
            isReducingPosition = true;
            const reduceQty = Math.min(quantity, existing.quantity);
            reduceQtyUsed = reduceQty;
            exitPriceUsed = simEntryPrice;
            const existingLeverage = existing.leverage || 1;
            const initialMargin = (reduceQty * existing.entryPrice) / existingLeverage;
            const entryFee = existing.entryPrice * reduceQty * TAKER_FEE;
            const exitFee = simEntryPrice * reduceQty * TAKER_FEE;
            const grossPnl = (simEntryPrice - existing.entryPrice) * reduceQty; // long PnL
            realizedPnl = grossPnl - entryFee - exitFee;
            cost = -(initialMargin + realizedPnl); // return margin + profit (or margin - loss)
            finalQty = existing.quantity - reduceQty;
            finalEntry = existing.entryPrice;
          } else if (existing && existing.side === "SELL") {
            // Increase short — average down
            cost = (quantity * simEntryPrice) / finalLeverage;
            const totalValue = (existing.quantity * existing.entryPrice) + cost;
            finalQty = existing.quantity + quantity;
            finalEntry = totalValue / finalQty;
          } else {
             // Open new short
             cost = (quantity * simEntryPrice) / finalLeverage;
             finalQty = quantity;
             finalEntry = simEntryPrice;
          }
        }

        const freshUsdt = paper.getWallet(req.userId!, mode, accountType || "FUTURES").get("USDT") ?? 0;
        const newBalance = freshUsdt - cost;

        // 5% Slippage Tolerance Buffer to accommodate micro-delays
        if (newBalance < -(freshUsdt * 0.05 + 1)) {
          insufficientBalance = true;
          return;
        }

        // Clamp negative floating errors & acceptable slippage debts to 0
        clampedBalance = Math.max(0, newBalance);
        actualDebit = freshUsdt - clampedBalance; // may be < cost if the clamp above kicked in
        paper.setWalletBalance(req.userId!, mode, "USDT", clampedBalance, accountType || "FUTURES");

        // Everything below — building the Trade document and writing the
        // in-memory position — used to run AFTER this lock released. That
        // left a second race even once the decision+debit above was fixed:
        // a concurrent request could re-enter the lock, re-read `existing`,
        // and still see nothing if THIS request's Trade.create()/
        // paper.setPosition() (both async, both outside the lock) hadn't
        // finished yet. The entire read-decide-debit-write sequence now
        // completes as one atomic unit per wallet key before the lock
        // releases, closing the gap that produced 20 separate Trade
        // documents from 20 concurrent orders on the same flat symbol
        // (proven live this session) instead of one averaged position.
        const fakeTradeId = `td-${Date.now()}`;
        memoryTrade = {
          userId: req.userId,
          mode: "PAPER",
          symbol,
          side,
          quantity: isReducingPosition ? reduceQtyUsed : finalQty,
          entryPrice: isReducingPosition ? (existing?.entryPrice ?? finalEntry) : finalEntry,
          exitPrice: exitPriceUsed,
          leverage: isReducingPosition ? (existing?.leverage || finalLeverage) : finalLeverage,
          sl: slPrice,
          tp: tpPrice,
          pnl: realizedPnl,
          strategy: strategy ?? null,
          // finalQty already reflects the remaining quantity on every branch
          // above (reduce, average up/down, or new) — deriving status from it
          // directly (instead of forcing CLOSED whenever isReducingPosition is
          // true) is what makes a *partial* reduce correctly stay OPEN.
          status: finalQty > 0.000001 ? "OPEN" : "CLOSED",
          closedAt: finalQty > 0.000001 ? null : new Date(),
          accountType: accountType || "FUTURES",
          // Trade's schema requires these for the AQEA auto-trade pipeline's
          // decision record — a manual order has no AQEA decision to attach,
          // so these are honest "no AI scoring happened" placeholders, not
          // fabricated scores. Without them Trade.create() always threw a
          // validation error for every manual order (LIVE and PAPER alike),
          // and in PAPER mode the wallet had already been debited by the time
          // that throw happened — money vanished with zero trade recorded.
          entrySource: "MANUAL",
          decisionPath: {},
          authorizedVotes: {},
          shadowVotes: {},
          coreScore: 0,
          finalScore: 0,
        };

        if (mongoose.connection.readyState === 1) {
          if (isReducingPosition) {
            if (existing?.tradeId) {
              if (finalQty > 0.000001) {
                // Partial reduce — the position stays OPEN with the reduced
                // quantity. Previously this branch unconditionally set
                // status:"CLOSED" here: the in-memory position correctly kept
                // tracking the remainder (see paper.setPosition below), but the
                // DB record for the same tradeId was marked closed. Since
                // hydrate() only restores trades still OPEN in the DB, a
                // server restart would silently drop the remaining quantity
                // and its locked margin from both the wallet and the position
                // map — a real, permanent equity leak.
                const existingDoc = await Trade.findById(existing.tradeId).lean();
                const partialPnlAccumulated = Number((existingDoc as any)?.meta?.partialPnl) || 0;
                await Trade.updateOne(
                  { _id: existing.tradeId },
                  {
                    $set: {
                      quantity: finalQty,
                      "meta.partialPnl": partialPnlAccumulated + realizedPnl,
                      "meta.closeReason": "MANUAL_PARTIAL",
                    },
                  }
                );
              } else {
                const existingDoc = await Trade.findById(existing.tradeId).lean();
                const partialPnlAccumulated = Number((existingDoc as any)?.meta?.partialPnl) || 0;
                await Trade.updateOne(
                  { _id: existing.tradeId },
                  { $set: { status: "CLOSED", exitPrice: exitPriceUsed, pnl: realizedPnl + partialPnlAccumulated, closedAt: new Date(), "meta.closeReason": "MANUAL_ORDER" } }
                );
              }
              memoryTrade._id = existing.tradeId;
            } else {
              memoryTrade._id = fakeTradeId;
            }
          } else if (existing?.tradeId) {
            // Increasing an existing position (average up/down) — update
            // the existing Trade document in place, exactly like the
            // reduce branches above do. This previously always called
            // Trade.create() here instead, leaving the prior OPEN document
            // dangling in the DB every time a position was added to: N
            // manual adds to the same position left N "OPEN" Trade
            // documents, all superseded except the last, but every one of
            // them still summed into anything that totals status:"OPEN"
            // trades (invested/margin figures on the dashboard, reconciliation
            // checks) — silently multiplying the real margin in use.
            await Trade.updateOne(
              { _id: existing.tradeId },
              { $set: { quantity: finalQty, entryPrice: finalEntry, leverage: finalLeverage } },
            );
            memoryTrade._id = existing.tradeId;
          } else {
            // Genuinely new position — create the Trade document. The
            // wallet above was already debited for this order's cost — if
            // Trade.create() throws for any reason (schema drift, validation),
            // refund it here rather than let the debit stand with no trade to
            // show for it.
            try {
              const trade = await Trade.create(memoryTrade);
              memoryTrade._id = trade._id.toString();
            } catch (createErr: any) {
              const refundWallet = paper.getWallet(req.userId!, mode, accountType || "FUTURES");
              const refunded = (refundWallet.get("USDT") ?? 0) + actualDebit;
              paper.setWalletBalance(req.userId!, mode, "USDT", refunded, accountType || "FUTURES");
              throw createErr;
            }
          }

          await WalletSnapshot.findOneAndUpdate(
            { userId: req.userId, mode, accountType: accountType || "FUTURES" },
            { balances: Object.fromEntries(wallet) },
            { upsert: true },
          );
        } else {
          memoryTrade._id = fakeTradeId;
        }

        if (finalQty > 0 && !isReducingPosition) {
          // New position or increased position
          paper.setPosition(req.userId!, symbol, mode, {
            userId: req.userId!,
            symbol,
            side,
            quantity: finalQty,
            entryPrice: finalEntry,
            tradeId: memoryTrade._id,
            leverage: finalLeverage,
            accountType: accountType as "SPOT" | "FUTURES" || "FUTURES",
          });
        } else if (finalQty > 0 && isReducingPosition) {
          // Partial close — update remaining position (keep original side)
          paper.setPosition(req.userId!, symbol, mode, {
            userId: req.userId!,
            symbol,
            side: existing!.side,
            quantity: finalQty,
            entryPrice: finalEntry,
            tradeId: existing!.tradeId,
            leverage: existing!.leverage,
            accountType: accountType as "SPOT" | "FUTURES" || "FUTURES",
          });
        } else {
          paper.removePosition(req.userId!, symbol, mode, accountType || "FUTURES");
          if (existing?.tradeId) {
            autoTradeEngine.clearPeakPrice(req.userId!, symbol, existing.tradeId);
          }
        }
      });

      if (insufficientBalance) {
        res.status(400).json({ error: "Insufficient USDT balance. Slippage too high." });
        return;
      }

      res.json({
        trade: memoryTrade,
        wallet: Object.fromEntries(wallet),
        pnl: +realizedPnl.toFixed(4),
        exitPrice: exitPriceUsed,
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── open positions ───────────────────────────────────── */

router.get("/open-positions", authGuard, async (req: AuthRequest, res) => {
  try {
    const mode = (req.query?.mode as string) || "PAPER";
    const accountType = req.query?.accountType as string;
    let trades: any[] = [];
    
    const filter: any = { userId: req.userId, mode, status: "OPEN" };
    if (accountType && accountType !== "ALL") {
      filter.accountType = accountType;
    }

    if (mongoose.connection.readyState === 1) {
      trades = await Trade.find(filter).lean();
    } else {
      trades = paper.getOpenPositions(req.userId!, mode);
      if (accountType && accountType !== "ALL") {
        trades = trades.filter(p => p.accountType === accountType);
      }
    }

    await enrichOpenTrades(trades);

    res.json(trades);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── get klines ────────────────────────────────────────── */

router.get("/klines", async (req, res) => {
  try {
    const { symbol, interval = "1h", limit = "100" } = req.query;
    if (!symbol) return res.status(400).json({ error: "symbol required" }) as any;
    
    const klines = await binance.getKlines(symbol as string, interval as string, undefined, undefined, Number(limit));
    res.json(klines);
  } catch (err: any) {
    console.error(`[API_ERROR] Failed to fetch klines for ${req.query.symbol}:`, err.message || err);
    res.status(500).json({ error: err.message });
  }
});

/* ── update SL/TP for open position ─────────────────────── */

router.post("/update-sl-tp", authGuard, async (req: AuthRequest, res) => {
  try {
    const { tradeId, sl, tp } = req.body as { tradeId: string; sl?: number; tp?: number };
    if (!tradeId) {
      res.status(400).json({ error: "tradeId is required" });
      return;
    }

    const trade = await Trade.findOne({ _id: tradeId, userId: req.userId, status: "OPEN" });
    if (!trade) {
      res.status(404).json({ error: "Open trade position not found" });
      return;
    }

    if (sl !== undefined) trade.sl = sl;
    if (tp !== undefined) trade.tp = tp;

    await trade.save();

    res.json({ success: true, trade });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── history ──────────────────────────────────────────── */

router.get("/history", authGuard, async (req: AuthRequest, res) => {
  try {
    const mode = (req.query?.mode as string) || "PAPER";
    const limit = Math.min(Number(req.query?.limit) || 50, 200);
    const skip = Number(req.query?.skip) || 0;
    // Optional status filter (OPEN/CLOSED) — the Closed Orders tab must not
    // mix in open trades. Omitted = all trades (legacy callers).
    const status = (req.query?.status as string)?.toUpperCase();

    let trades: any[] = [];
    let total = 0;

    if (mongoose.connection.readyState === 1) {
      const filter: any = { userId: req.userId, mode };
      if (status === "OPEN" || status === "CLOSED") filter.status = status;
      trades = await Trade.find(filter)
        .sort(status === "CLOSED" ? { closedAt: -1 } : { openedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      total = await Trade.countDocuments(filter);
    }

    res.json({ trades, total });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── wallet ───────────────────────────────────────────── */

router.get("/wallet", authGuard, async (req: AuthRequest, res) => {
  try {
    const mode = (req.query?.mode as string) || "PAPER";
    const accountType = (req.query?.accountType as string) || "FUTURES";
    const wallet = paper.getWallet(req.userId!, mode, accountType);
    res.json(Object.fromEntries(wallet));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/wallet/reset", authGuard, async (req: AuthRequest, res) => {
  try {
    const { amount = 0, mode = "PAPER" } = req.body;

    // Record the balance change before overwriting it, so wallet history
    // always reconciles (deposits + trading PnL + adjustments = balance).
    const prevSpot = paper.getWallet(req.userId!, mode, "SPOT").get("USDT") ?? 0;
    const prevFutures = paper.getWallet(req.userId!, mode, "FUTURES").get("USDT") ?? 0;

    // Set both SPOT and FUTURES USDT balance to the desired amount
    await paper.setWalletBalance(req.userId!, mode, "USDT", amount, "SPOT");
    await paper.setWalletBalance(req.userId!, mode, "USDT", amount, "FUTURES");

    if (mongoose.connection.readyState === 1) {
      const adjustments = [
        { accountType: "SPOT" as const, delta: amount - prevSpot },
        { accountType: "FUTURES" as const, delta: amount - prevFutures },
      ].filter(a => a.delta !== 0);
      if (adjustments.length) {
        await WalletTransaction.insertMany(adjustments.map(a => ({
          userId: req.userId,
          type: "ADJUSTMENT",
          method: "SYSTEM",
          amount: a.delta,
          currency: "USDT",
          status: "COMPLETED",
          accountType: a.accountType,
          note: `Wallet reset to ${amount} USDT (was ${a.accountType === "SPOT" ? prevSpot.toFixed(2) : prevFutures.toFixed(2)}, ${mode})`,
        })));
      }
    }
    
    // Also explicitly zero out INR just in case, to simulate a clean slate
    await paper.setWalletBalance(req.userId!, mode, "INR", 0, "SPOT");
    await paper.setWalletBalance(req.userId!, mode, "INR", 0, "FUTURES");

    if (mode === "PAPER") {
      // Clear all active paper positions so they don't eat up leverage ceiling
      const positions = paper.getOpenPositions(req.userId!, mode);
      for (const p of positions) {
        paper.removePosition(req.userId!, p.symbol, mode, p.accountType);
      }
      // Delete paper trades from DB
      await Trade.deleteMany({ userId: req.userId, mode: "PAPER" });
    }

    // 🛡️ If resetting to 0, disable autoTrade to prevent engine from immediately re-entering
    if (amount === 0) {
      autoTradeEngine.clearUserState(req.userId!.toString());
      autoTradeEngine.disableUserAll(req.userId!.toString());
      if (mongoose.Types.ObjectId.isValid(req.userId!)) {
        await Settings.updateOne(
          { userId: new mongoose.Types.ObjectId(req.userId!) },
          { $set: { autoTrade: false, autoTradeSpot: false, autoTradeFutures: false } }
        );
      }
    }

    res.json({ success: true, newBalance: amount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/wallet/allocate", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { spotAmount, futuresAmount } = req.body as { spotAmount: number; futuresAmount: number };
    const mode = (req.body?.mode as string) || "PAPER";
    const userId = req.userId || "guest_user";

    if (!Number.isFinite(spotAmount) || spotAmount < 0 || !Number.isFinite(futuresAmount) || futuresAmount < 0) {
      res.status(400).json({ error: "Amounts must be non-negative numbers" });
      return;
    }

    await paper.setWalletBalance(userId, mode, "USDT", spotAmount, "SPOT");
    await paper.setWalletBalance(userId, mode, "USDT", futuresAmount, "FUTURES");

    if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(userId)) {
      try {
        await WalletTransaction.create({
          userId: new mongoose.Types.ObjectId(userId),
          type: "ADJUSTMENT",
          method: "SYSTEM",
          amount: spotAmount + futuresAmount,
          currency: "USDT",
          status: "COMPLETED",
          txnRef: `ALLOC${Date.now()}`,
          note: `Capital Allocation: ${spotAmount.toFixed(2)} USDT (Spot) / ${futuresAmount.toFixed(2)} USDT (Futures)`,
          accountType: "BOTH",
        });
      } catch {}
    }

    res.json({
      message: `Capital allocation saved! Spot: $${spotAmount.toLocaleString()} USDT | Futures: $${futuresAmount.toLocaleString()} USDT`,
      spot: spotAmount,
      futures: futuresAmount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── wallet/adjust — reconcile free balance without touching open
   positions. Unlike /wallet/reset (which wipes positions), this only nudges
   the free USDT balance for one account type, e.g. to correct drift found
   by an audit. Every adjustment is logged as a WalletTransaction. ── */
router.post("/wallet/adjust", authGuard, async (req: AuthRequest, res) => {
  try {
    const { delta, mode = "PAPER", accountType = "FUTURES", note } = req.body;
    if (typeof delta !== "number" || !Number.isFinite(delta)) {
      return res.status(400).json({ error: "delta (finite number) is required" }) as any;
    }

    const wallet = paper.getWallet(req.userId!, mode, accountType);
    const prev = wallet.get("USDT") ?? 0;
    const next = prev + delta;
    await paper.setWalletBalance(req.userId!, mode, "USDT", next, accountType);

    if (mongoose.connection.readyState === 1) {
      await WalletTransaction.create({
        userId: req.userId,
        type: "ADJUSTMENT",
        method: "SYSTEM",
        amount: delta,
        currency: "USDT",
        status: "COMPLETED",
        accountType,
        note: note || `Manual balance correction: ${prev.toFixed(4)} -> ${next.toFixed(4)} (${mode})`,
      });
    }

    res.json({ success: true, previousBalance: prev, delta, newBalance: next });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── close-position (manual market exit) ─────────────── */

router.post("/close-position", authGuard, async (req: AuthRequest, res) => {
  try {
    const { tradeId, mode = "PAPER" } = req.body;
    if (!tradeId) return res.status(400).json({ error: "tradeId required" }) as any;

    const trade = await Trade.findOne({ _id: tradeId, userId: req.userId!, status: "OPEN" });
    if (!trade) return res.status(404).json({ error: "Open trade not found" }) as any;

    let exitPrice = trade.entryPrice;
    let pnl = 0;

    if (mode === "LIVE") {
      const keys = await import("../models/ApiKeys.js").then(m => m.ApiKeys.findOne({ userId: req.userId }));
      if (!keys) return res.status(400).json({ error: "API Keys required for LIVE trading" }) as any;
      const cryptoLib = await import("../lib/crypto.js");
      const apiKey = cryptoLib.decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
      const apiSecret = cryptoLib.decrypt({ ciphertext: keys.encryptedSecret, iv: keys.ivSecret, authTag: keys.authTagSecret });

      const exitSide = trade.side === "BUY" ? "SELL" : "BUY";
      const formattedQty = trade.accountType === "FUTURES"
        ? await binance.formatFuturesQuantity(trade.symbol, trade.quantity)
        : await binance.formatQuantity(trade.symbol, trade.quantity);

      let result;
      const exitClientOrderId = binance.genClientOrderId("aalgo-manual-exit");
      try {
        if (trade.accountType === "FUTURES") {
          result = await binance.placeFuturesOrder(apiKey, apiSecret, {
            symbol: trade.symbol, side: exitSide, type: "MARKET", quantity: formattedQty, clientOrderId: exitClientOrderId, reduceOnly: true,
          });
        } else {
          result = await binance.placeOrder(apiKey, apiSecret, {
            symbol: trade.symbol, side: exitSide, type: "MARKET", quantity: formattedQty, clientOrderId: exitClientOrderId,
          }) as any;
        }
        
        exitPrice = result.avgPrice
          ? parseFloat(result.avgPrice)
          : (result.cummulativeQuoteQty
             ? parseFloat(result.cummulativeQuoteQty) / parseFloat(result.executedQty || result.origQty || "1")
             : exitPrice);

        // A MARKET close order can partially fill (illiquid pair, volatile
        // moment). This route previously always used `trade.quantity` (the
        // full position size) for PnL and unconditionally marked the trade
        // CLOSED — if Binance only filled part of it, that both booked the
        // wrong PnL and left a real, untracked remainder open on the
        // exchange while the local record said "closed."
        const executedQty = parseFloat(result.executedQty || result.origQty || "0");
        const closedQty = Number.isFinite(executedQty) && executedQty > 0 ? Math.min(executedQty, trade.quantity) : trade.quantity;

        const entryFee = trade.entryPrice * closedQty * TAKER_FEE;
        const exitFee = exitPrice * closedQty * TAKER_FEE;
        const grossPnl = trade.side === "BUY"
          ? (exitPrice - trade.entryPrice) * closedQty
          : (trade.entryPrice - exitPrice) * closedQty;
        pnl = grossPnl - entryFee - exitFee;

        const remainingQty = trade.quantity - closedQty;
        if (remainingQty > 1e-9) {
          // Partial fill — keep the trade OPEN with the reduced quantity,
          // same pattern already used for PAPER partial-reduces above.
          await Trade.findByIdAndUpdate(tradeId, {
            $set: { quantity: remainingQty, "meta.closeReason": "MANUAL_LIVE_PARTIAL", "meta.exitClientOrderId": exitClientOrderId, "meta.exitBinanceOrderId": result.orderId },
            $inc: { "meta.partialPnl": pnl },
          });
          return res.json({ success: true, partial: true, executedQty: closedQty, remainingQty, exitPrice, pnl: +pnl.toFixed(4), symbol: trade.symbol });
        }
      } catch (err: any) {
        return res.status(400).json({ error: `Binance LIVE Close Error: ${err.message}` }) as any;
      }

      // Update DB
      await Trade.updateOne({ _id: tradeId }, {
        $set: { status: "CLOSED", exitPrice, pnl, closedAt: new Date(), "meta.closeReason": "MANUAL_LIVE", "meta.exitClientOrderId": exitClientOrderId, "meta.exitBinanceOrderId": result.orderId }
      });
    } else {
      // PAPER MODE Close
      try {
        exitPrice = await binance.getTickerPrice(trade.symbol, trade.accountType === "FUTURES");
      } catch {
        try {
          const klines = await binance.getKlines(trade.symbol, "1m", undefined, undefined, 1);
          if (klines.length) exitPrice = parseFloat(klines[0].close);
        } catch { /* fallback to entry */ }
      }

      const entryFee = trade.entryPrice * trade.quantity * TAKER_FEE;
      const exitFee = exitPrice * trade.quantity * TAKER_FEE;
      const grossPnl = trade.side === "BUY"
        ? (exitPrice - trade.entryPrice) * trade.quantity
        : (trade.entryPrice - exitPrice) * trade.quantity;
      pnl = grossPnl - entryFee - exitFee;

      // Atomically claim the OPEN → CLOSED transition AND credit the wallet
      // in one MongoDB transaction. The auto-trade engine's own SL/TP/exit
      // monitor can race this same tradeId — without the claim, both paths
      // would independently credit margin + PnL, minting phantom balance
      // for one trade; without the transaction, a crash between "claimed"
      // and "credited" left the trade CLOSED with its payout permanently
      // lost (invisible to hydrate(), which only restores OPEN trades).
      const tradeLeverage = trade.leverage || 1;
      const initialMargin = (trade.quantity * trade.entryPrice) / tradeLeverage;
      const claimed = await paper.creditWalletAndCloseTrade(
        req.userId!, mode, trade.accountType || "FUTURES", initialMargin + pnl,
        (session) => Trade.findOneAndUpdate(
          { _id: tradeId, status: "OPEN" },
          { $set: { status: "CLOSED", exitPrice, pnl, closedAt: new Date(), "meta.closeReason": "MANUAL" } },
          { session },
        ),
      );
      if (!claimed) {
        paper.removePosition(req.userId!, trade.symbol, mode, trade.accountType || "FUTURES");
        return res.status(409).json({ error: "Position was already closed (likely by the auto-trade engine)" }) as any;
      }

      // Remove from in-memory positions
      paper.removePosition(req.userId!, trade.symbol, mode, trade.accountType || "FUTURES");
    }

    // 🛡️ FIX: Set a 2-minute cooldown on the auto-trade engine for this symbol
    // to prevent it from immediately re-opening the position on the next tick
    const { setCooldown } = await import("../services/autoTradeEngine.js");
    setCooldown(req.userId!, (trade.accountType as "SPOT" | "FUTURES") || "FUTURES", trade.symbol, 120_000); // 2 minutes

    await Alert.create({
      userId: req.userId,
      severity: pnl >= 0 ? "GREEN" : "AMBER",
      symbol: trade.symbol,
      title: `Manual Close: ${trade.symbol}`,
      message: `Exited ${trade.quantity.toFixed(4)} @ ${exitPrice.toFixed(4)} | PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT`,
    });

    res.json({ success: true, exitPrice, pnl: +pnl.toFixed(4), symbol: trade.symbol });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


/* ── modify-position (edit SL/TP) ────────────────────── */

router.patch("/modify-position", authGuard, async (req: AuthRequest, res) => {
  try {
    const { tradeId, sl, tp } = req.body;
    if (!tradeId) return res.status(400).json({ error: "tradeId required" }) as any;

    const trade = await Trade.findOne({ _id: tradeId, userId: req.userId!, status: "OPEN" });
    if (!trade) return res.status(404).json({ error: "Open trade not found" }) as any;

    const update: Record<string, number> = {};
    if (sl !== undefined) {
      let slPrice = sl;
      if (sl < 50) {
        slPrice = trade.side === "BUY" ? trade.entryPrice * (1 - sl / 100) : trade.entryPrice * (1 + sl / 100);
      }
      // Check direction
      if (trade.side === "BUY" && slPrice >= trade.entryPrice) return res.status(400).json({ error: "Long SL must be below entry" }) as any;
      if (trade.side === "SELL" && slPrice <= trade.entryPrice) return res.status(400).json({ error: "Short SL must be above entry" }) as any;
      update.sl = slPrice;
    }
    if (tp !== undefined) {
      let tpPrice = tp;
      if (tp < 200) {
        tpPrice = trade.side === "BUY" ? trade.entryPrice * (1 + tp / 100) : trade.entryPrice * (1 - tp / 100);
      }
      // Check direction
      if (trade.side === "BUY" && tpPrice <= trade.entryPrice) return res.status(400).json({ error: "Long TP must be above entry" }) as any;
      if (trade.side === "SELL" && tpPrice >= trade.entryPrice) return res.status(400).json({ error: "Short TP must be below entry" }) as any;
      update.tp = tpPrice;
    }

    await Trade.updateOne({ _id: tradeId }, { $set: update });

    res.json({ success: true, updated: update, symbol: trade.symbol });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── HARD RESET — wipe all trades, positions, alerts and set wallet to 100 USDT ── */

router.post("/hard-reset", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const rawUserId = req.userId || "guest-user";
    const primaryUserId = rawUserId.toString();
    console.log(`[HARD_RESET] Initializing total purge for user ${primaryUserId}`);

    const objId = mongoose.Types.ObjectId.isValid(primaryUserId)
      ? new mongoose.Types.ObjectId(primaryUserId)
      : new mongoose.Types.ObjectId("000000000000000000000000");

      // 1. Delete all trade history, alerts, decisions, audits, and snapshots completely
      clearDashboardCache();
      const safeDelete = async (model: any, query: any) => {
        try {
          await model.deleteMany(query);
        } catch (e: any) {
          console.warn(`[HARD_RESET_WARN] Deletion warning: ${e?.message}`);
        }
      };

      await Promise.all([
        safeDelete(Trade, {}),
        safeDelete(Alert, {}),
        safeDelete(WalletTransaction, {}),
        safeDelete(AIDecision, {}),
        safeDelete(AqeaAudit, {}),
        safeDelete(AqeaPerformance, {}),
        safeDelete(AqeaTradeAnalytics, {}),
        safeDelete(WalletSnapshot, {}),
      ]);

      // 2. Wipe memory maps physically across all users
      if (paper && typeof (paper as any).clearAllMemory === 'function') {
        await (paper as any).clearAllMemory();
      } else if (paper && typeof (paper as any).clearUserMemory === 'function') {
        await (paper as any).clearUserMemory(primaryUserId); 
      }
      autoTradeEngine.clearUserState(primaryUserId);
      
      // 2b. ⚡ Pause AutoTrade so user gets clean $0.00 baseline without instant new orders
      autoTradeEngine.disableUser(primaryUserId);
      try {
        await Settings.updateOne(
          { userId: objId },
          { $set: { autoTrade: false, autoTradeSpot: false, autoTradeFutures: false } },
          { upsert: true }
        ).maxTimeMS(5000);
      } catch (err: any) {
        console.warn(`[HARD_RESET_WARN] Settings update warning: ${err?.message}`);
      }
      
      // 3. Force re-seed clean baseline ($20k USDT & ₹20L INR)
      if (paper && typeof paper.setWalletBalance === 'function') {
        await Promise.all([
          paper.setWalletBalance(primaryUserId, "PAPER", "USDT", 20000, "FUTURES"),
          paper.setWalletBalance(primaryUserId, "PAPER", "USDT", 20000, "SPOT"),
          paper.setWalletBalance(primaryUserId, "LIVE", "USDT", 0, "FUTURES"),
          paper.setWalletBalance(primaryUserId, "LIVE", "USDT", 0, "SPOT"),
          paper.setWalletBalance("guest-user", "PAPER", "USDT", 20000, "FUTURES"),
          paper.setWalletBalance("guest-user", "PAPER", "USDT", 20000, "SPOT"),
        ]);
      }

      // 4. Force DB sync (Defensive Upsert)
      const safeUpsert = async (query: any, update: any) => {
        try {
          await WalletSnapshot.findOneAndUpdate(query, update, { upsert: true, new: true }).maxTimeMS(5000);
        } catch (e: any) {
          console.warn(`[HARD_RESET_WARN] WalletSnapshot upsert warning: ${e?.message}`);
        }
      };

      await Promise.all([
        safeUpsert(
          { userId: objId, mode: "PAPER", accountType: "FUTURES" },
          { $set: { balances: { USDT: 20000, INR: 2000000 } } }
        ),
        safeUpsert(
          { userId: objId, mode: "PAPER", accountType: "SPOT" },
          { $set: { balances: { USDT: 20000, INR: 2000000 } } }
        )
      ]);

    console.log(`[HARD_RESET] Purge complete. Account ${primaryUserId} restored to $20,000 USDT (₹20,00,000 INR) baseline.`);

    res.json({
      success: true,
      message: "Hard reset complete. All trades vaporized. AutoTrade PAUSED. Wallet set to 20,000 USDT ($20k). Re-enable AutoTrade in Settings when ready.",
      newBalance: 20000,
    });
  } catch (err: any) {
    console.error("[HARD_RESET_FATAL]", err);
    res.status(500).json({ error: err.message });
  }
});

/* ── SYSTEM-WIDE HARD RESET ── */
router.post("/hard-reset-system", authGuard, adminGuard, async (req: AuthRequest, res) => {
  try {
    console.info(`[ADMIN_ACTION] System-wide hard reset initiated by admin: ${req.userId}`);
    // For a total wipe, we can just delete everything
    await Trade.deleteMany({});
    await Alert.deleteMany({});
    await WalletSnapshot.deleteMany({});
    
    // Reset memory for all symbols and users and purge DB
    await paper.clearAllMemory();
    
    // Get all distinct users and restore to $0 + disable autoTrade
    const users = await User.find({}).lean();
    for (const u of users) {
      const uid = u._id.toString();
      await paper.setWalletBalance(uid, "PAPER", "USDT", 0);
      await paper.setWalletBalance(uid, "LIVE", "USDT", 0);
      // 🛡️ CRITICAL: Disable autoTrade (both legs) and remove from engine scan
      autoTradeEngine.disableUserAll(uid);
    }
    // Disable autoTrade for ALL users in DB
    await Settings.updateMany({}, { $set: { autoTrade: false, autoTradeSpot: false, autoTradeFutures: false } });

    res.json({ success: true, message: "System hard reset complete. All engines stopped." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── DEBUG STATE ── */
router.get("/debug-state", authGuard, adminGuard, async (req: AuthRequest, res) => {
  try {
    console.info(`[ADMIN_ACTION] Debug state requested by admin: ${req.userId}`);
    const wallets = await WalletSnapshot.find().lean();
    const trades = await Trade.find({ status: "OPEN" }).lean();
    const settings = await Settings.find().lean();
    
    // Also grab in-memory states
    const users = await User.find({}).lean();
    const inMemWallets: any = {};
    for (const u of users) {
      inMemWallets[u._id.toString()] = {
        PAPER: Object.fromEntries(paper.getWallet(u._id.toString(), "PAPER").entries()),
        LIVE: Object.fromEntries(paper.getWallet(u._id.toString(), "LIVE").entries()),
      };
    }
    
    res.json({ 
      dbWallets: wallets, 
      dbTrades: trades, 
      dbSettings: settings, 
      inMemWallets,
      activeSockets: binance.getActiveSocketsInfo()
    });
  } catch(err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/spectral-regime", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const report = getRegimeReport();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── In-Memory Response Caches for Ticker Feeds ── */
const tickerPricesCache = new Map<string, { timestamp: number; data: any }>();
const ticker24hrCache = new Map<string, { timestamp: number; data: any }>();

/* ── get current ticker prices ──────────────────────────────── */
router.get("/ticker-prices", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const symbolsQuery = (req.query.symbols as string | undefined) || "";
    const cacheKey = symbolsQuery || "DEFAULT";
    const cached = tickerPricesCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 2000) {
      return res.json(cached.data);
    }

    const symbols = symbolsQuery ? symbolsQuery.split(",") : ["BTCUSDT", "ETHUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "SHIBUSDT", "XRPUSDT", "SOLUSDT"];
    const prices: Record<string, number> = {};
    
    await Promise.all(symbols.map(async (symbol) => {
      const sym = symbol.toUpperCase();
      try {
        prices[sym] = await binance.getTickerPrice(sym, false);
      } catch {
        prices[sym] = 0;
      }
    }));
    
    tickerPricesCache.set(cacheKey, { timestamp: Date.now(), data: prices });
    res.json(prices);
  } catch (err: any) {
    console.error("[ticker_prices_error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/ticker-24hr", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const symbolsQuery = (req.query.symbols as string | undefined) || "";
    const cacheKey = symbolsQuery || "DEFAULT";
    const cached = ticker24hrCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 2000) {
      return res.json(cached.data);
    }

    const symbols = symbolsQuery ? symbolsQuery.split(",") : ["BTCUSDT", "ETHUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "SHIBUSDT", "XRPUSDT", "SOLUSDT"];
    const tickerData: Record<string, any> = {};
    
    await Promise.all(symbols.map(async (symbol) => {
      const sym = symbol.toUpperCase();
      try {
        const data = await binance.get24hrTicker(sym, false);
        tickerData[sym] = {
          symbol: data.symbol,
          price: data.lastPrice,
          open: data.openPrice,
          high: data.highPrice,
          low: data.lowPrice,
          volume: data.volume,
          time: data.closeTime
        };
      } catch (err) {
        console.error(`[ticker_24hr] Failed to fetch ${sym}:`, err);
      }
    }));
    
    ticker24hrCache.set(cacheKey, { timestamp: Date.now(), data: tickerData });
    res.json(tickerData);
  } catch (err: any) {
    console.error("[ticker_24hr_error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/leaderboard", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const pipeline = [
      { $match: { status: "CLOSED" } },
      { $group: {
          _id: { $ifNull: ["$strategy", "$meta.strategy"] },
          trades: { $sum: 1 },
          wins: { $sum: { $cond: [{ $gt: ["$pnl", 0] }, 1, 0] } },
          losses: { $sum: { $cond: [{ $lt: ["$pnl", 0] }, 1, 0] } },
          totalWinPnL: { $sum: { $cond: [{ $gt: ["$pnl", 0] }, "$pnl", 0] } },
          totalLossPnL: { $sum: { $cond: [{ $lt: ["$pnl", 0] }, "$pnl", 0] } },
          totalPnL: { $sum: "$pnl" },
          lastTradeDate: { $max: "$closedAt" }
      }},
      { $project: {
          strategy: { $ifNull: ["$_id", "UNKNOWN"] },
          trades: 1,
          winRate: { $multiply: [{ $divide: ["$wins", "$trades"] }, 100] },
          profitFactor: { 
            $cond: [
              { $eq: ["$totalLossPnL", 0] }, 999, 
              { $divide: ["$totalWinPnL", { $abs: "$totalLossPnL" }] }
            ] 
          },
          avgWin: { $cond: [{ $eq: ["$wins", 0] }, 0, { $divide: ["$totalWinPnL", "$wins"] }] },
          avgLoss: { $cond: [{ $eq: ["$losses", 0] }, 0, { $divide: [{ $abs: "$totalLossPnL" }, "$losses"] }] },
          totalPnL: 1,
          lastTradeDate: 1,
          _id: 0
      }},
      { $sort: { profitFactor: -1 as const } },
      { $skip: skip },
      { $limit: limit }
    ];

    const stats = await Trade.aggregate(pipeline as any[]);
    res.json({ page, limit, data: stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

