/*
 * ─── Backtest routes ───────────────────────────────────
 *
 * POST /backtest/run  – run a backtest and return results
 */
import { Router } from "express";
import { authGuard, type AuthRequest } from "../middleware/auth.js";
import { BacktestRun } from "../models/BacktestRun.js";
import * as binance from "../services/binanceService.js";
import { computeSnapshot, type OHLC } from "../services/indicatorService.js";
import {
  evaluateAaryan,
  evaluateAayush,
  evaluateGayatri,
  evaluateLakshmi,
  evaluateOhmkara,
} from "../services/strategies/index.js";

const router = Router();

interface BacktestReq {
  symbol: string;
  timeframe: string;
  startDate: string;   // ISO string
  endDate: string;      // ISO string
  strategies: string[];
  initialCapital?: number;
}

/** Convert kline strings → OHLC numbers */
function klineToOHLC(k: binance.Kline): OHLC {
  return {
    open: parseFloat(k.open),
    high: parseFloat(k.high),
    low: parseFloat(k.low),
    close: parseFloat(k.close),
  };
}

import { evaluateHybridSignal } from "../services/hybridEngine.js";

/** Run the selected strategy on an IndicatorSnapshot, return signal + SL/TP. */
async function evaluateStrategy(
  strategyName: string,
  bars: OHLC[],
): Promise<{ signal: string; slPct: number; tpPct: number }> {
  const ind = computeSnapshot(bars);

  // HYBRID AKS FALLBACK
  if (strategyName === "HYBRID_AKS") {
    // Build dummy hybrid market context
    const hybridCtx = {
       ind,
       htfTrendBullish: ind.ema9 !== null && ind.ema21 !== null ? ind.ema9 > ind.ema21 : true,
       volatilityRatio: ind.stdDev20 !== null && ind.close > 0 ? ind.stdDev20 / ind.close : 0.01,
       tradesToday: 0,
       dailyPnl: 0,
       risk: { maxDailyLoss: 100 }
    };
    const hybridSig = await evaluateHybridSignal(hybridCtx, "BACKTEST_USER");
    const mappedSignal = hybridSig.direction === "LONG" ? "BUY" : hybridSig.direction === "SHORT" ? "SELL" : "NEUTRAL";
    return { signal: mappedSignal, slPct: 2, tpPct: 4 };
  }

  switch (strategyName.toUpperCase()) {
    case "AARYAN": {
      const r = evaluateAaryan(ind);
      return { signal: r.signal, slPct: r.slPct, tpPct: r.tpPct };
    }
    case "AAYUSH": {
      const r = evaluateAayush(ind);
      return { signal: r.signal, slPct: r.slPct, tpPct: r.tpPct };
    }
    case "GAYATRI": {
      const r = evaluateGayatri(ind);
      return { signal: r.signal, slPct: r.slPct, tpPct: r.tpPct };
    }
    case "OHMKARA": {
      const r = evaluateOhmkara(ind);
      return { signal: r.signal, slPct: r.slPct, tpPct: r.tpPct };
    }
    case "ENSEMBLE": {
      return evaluateEnsembleBacktest(bars);
    }
    case "LAKSHMI":
    default: {
      const r = evaluateLakshmi(ind);
      return { signal: r.signal, slPct: r.slPct, tpPct: r.tpPct };
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function evaluateEnsembleBacktest(bars: OHLC[]): { signal: string; slPct: number; tpPct: number } {
  const ind = computeSnapshot(bars);
  const close = ind.close || 1;
  const trendScore = ind.ema9 !== null && ind.ema21 !== null
    ? clamp((ind.ema9 - ind.ema21) / Math.max(1, Math.abs(ind.ema21)), -0.2, 0.2)
    : 0;
  const macdHist = ind.macd?.histogram ?? 0;
  const momentumScore = clamp(macdHist / Math.max(10, close), -0.08, 0.08);
  const rsiBalance = ind.rsi14 !== null ? clamp(1 - Math.abs(ind.rsi14 - 50) / 50, 0, 1) : 0.5;
  const adxScore = ind.adx14 !== null ? clamp(ind.adx14 / 40, 0, 1) : 0.5;
  const volatility = ind.stdDev20 !== null ? clamp(ind.stdDev20 / close, 0, 0.2) : 0.02;

  const longProb = clamp(
    0.50 + trendScore * 0.55 + momentumScore * 0.6 + (rsiBalance - 0.5) * 0.12 + (adxScore - 0.5) * 0.06,
    0.05,
    0.95,
  );

  const confidence = 0.45 + Math.abs(longProb - 0.5) * 0.85;
  const signal = longProb > 0.62 && confidence >= 0.55
    ? "BUY"
    : longProb < 0.38 && confidence >= 0.55
      ? "SELL"
      : "NEUTRAL";

  const slPct = clamp((0.008 + volatility * 0.4) * 100, 0.6, 1.4);
  const tpPct = clamp((0.012 + volatility * 0.7) * 100, 1.0, 2.8);

  return { signal, slPct, tpPct };
}

/* ── run backtest ─────────────────────────────────────── */

router.post("/run", authGuard, async (req: AuthRequest, res) => {
  try {
    const {
      symbol,
      timeframe,
      startDate,
      endDate,
      strategies,
      initialCapital = 10_000,
    } = req.body as BacktestReq;

    if (!symbol || !timeframe || !startDate || !endDate || !strategies?.length) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    /* Fetch historical klines from Binance public API */
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const klines = await binance.getKlines(symbol, timeframe, startMs, endMs, 1000);

    if (!klines.length) {
      res.status(400).json({ error: "No kline data returned for given range" });
      return;
    }

    /* Convert klines to OHLC bars */
    const bars: OHLC[] = klines.map(klineToOHLC);

    /* Use the first strategy requested (or LAKSHMI by default) */
    const primaryStrategy = strategies[0] ?? "LAKSHMI";

    /* ── Strategy-driven backtest engine ──────────────── */
    let equity = initialCapital;
    const equityCurve: { ts: number; value: number }[] = [];
    const btTrades: {
      entryTs: number; exitTs: number;
      entryPrice: number; exitPrice: number;
      side: string; pnl: number;
    }[] = [];
    let wins = 0;
    let losses = 0;
    let maxEquity = equity;
    let maxDrawdown = 0;

    // Minimum 55 bars for indicators to warm up (EMA55)
    const warmup = 55;

    const slippagePct = 0.0002; // 0.02% slippage (2 bps)
    const feePct = 0.0004; // 0.04% perpetual futures taker fee

    for (let i = warmup; i < bars.length; i++) {
      const windowBars = bars.slice(Math.max(0, i - 200), i);
      if (windowBars.length < 50) continue; // safety check for strategy indicators

      const { signal, slPct, tpPct } = await evaluateStrategy(primaryStrategy, windowBars);
      const openPrice = bars[i].open;

      if (signal === "BUY" || signal === "STRONG_BUY") {
        // Allocate 10% of equity per trade
        const actualEntryPrice = openPrice * (1 + slippagePct);
        const qty = (equity * 0.1) / actualEntryPrice;
        const entryFee = (equity * 0.1) * feePct;

        const slPrice = openPrice * (1 - slPct / 100);
        const tpPrice = openPrice * (1 + tpPct / 100);

        // Walk forward to find exit, starting from entry bar i
        let exitPrice = bars[i].close;
        let exitIdx = i;
        for (let j = i; j < Math.min(i + 20, bars.length); j++) {
          if (bars[j].low <= slPrice) { exitPrice = slPrice; exitIdx = j; break; }
          if (bars[j].high >= tpPrice) { exitPrice = tpPrice; exitIdx = j; break; }
          exitPrice = bars[j].close;
          exitIdx = j;
        }

        const actualExitPrice = exitPrice * (1 - slippagePct);
        const exitFee = (qty * actualExitPrice) * feePct;
        const pnl = qty * (actualExitPrice - actualEntryPrice) - (entryFee + exitFee);

        equity += pnl;
        if (pnl > 0) wins++; else losses++;
        btTrades.push({
          entryTs: klines[i].openTime, exitTs: klines[exitIdx].openTime,
          entryPrice: openPrice, exitPrice, side: "BUY", pnl,
        });
        // Skip past exit bar to avoid overlapping trades
        i = exitIdx;
      } else if (signal === "SELL" || signal === "STRONG_SELL") {
        const actualEntryPrice = openPrice * (1 - slippagePct);
        const qty = (equity * 0.1) / actualEntryPrice;
        const entryFee = (equity * 0.1) * feePct;

        const slPrice = openPrice * (1 + slPct / 100);
        const tpPrice = openPrice * (1 - tpPct / 100);

        let exitPrice = bars[i].close;
        let exitIdx = i;
        for (let j = i; j < Math.min(i + 20, bars.length); j++) {
          if (bars[j].high >= slPrice) { exitPrice = slPrice; exitIdx = j; break; }
          if (bars[j].low <= tpPrice) { exitPrice = tpPrice; exitIdx = j; break; }
          exitPrice = bars[j].close;
          exitIdx = j;
        }

        const actualExitPrice = exitPrice * (1 + slippagePct);
        const exitFee = (qty * actualExitPrice) * feePct;
        const pnl = qty * (actualEntryPrice - actualExitPrice) - (entryFee + exitFee);

        equity += pnl;
        if (pnl > 0) wins++; else losses++;
        btTrades.push({
          entryTs: klines[i].openTime, exitTs: klines[exitIdx].openTime,
          entryPrice: openPrice, exitPrice, side: "SELL", pnl,
        });
        i = exitIdx;
      }

      maxEquity = Math.max(maxEquity, equity);
      const dd = (maxEquity - equity) / maxEquity;
      maxDrawdown = Math.max(maxDrawdown, dd);
      equityCurve.push({ ts: klines[Math.min(i, klines.length - 1)].openTime, value: +equity.toFixed(2) });
    }

    const totalTrades = btTrades.length;
    const winRate = totalTrades ? +(wins / totalTrades * 100).toFixed(1) : 0;
    const grossProfit = btTrades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(btTrades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : 999;
    const daysHeld = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000;
    const cagr = daysHeld > 0
      ? +((Math.pow(equity / initialCapital, 365 / daysHeld) - 1) * 100).toFixed(2)
      : 0;
    const meanPnl = totalTrades > 0 ? btTrades.reduce((s, t) => s + t.pnl, 0) / totalTrades : 0;
    const variance = totalTrades > 1
      ? btTrades.reduce((s, t) => s + (t.pnl - meanPnl) ** 2, 0) / totalTrades
      : 1;
    const sharpeEst = totalTrades > 1
      ? +(meanPnl / (Math.sqrt(variance) || 1)).toFixed(2)
      : 0;

    /* Persist */
    const run = await BacktestRun.create({
      userId: req.userId,
      params: { symbol, timeframe, startDate, endDate, strategies, initialCapital },
      metrics: { cagr, maxDD: +(maxDrawdown * 100).toFixed(2), winRate, profitFactor, sharpeEst, totalTrades },
      equityCurve: equityCurve.map(e => ({ time: e.ts, equity: e.value })),
      trades: btTrades.map((t) => ({
        symbol,
        side: t.side as "BUY" | "SELL",
        entry: t.entryPrice,
        exit: t.exitPrice,
        pnl: +t.pnl.toFixed(2),
        openedAt: t.entryTs,
        closedAt: t.exitTs,
      })),
    });

    res.json({
      id: run._id,
      metrics: run.metrics,
      equityCurve,
      totalTrades,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
