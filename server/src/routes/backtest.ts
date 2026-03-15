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
  type StrategyName,
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

/** Run the selected strategy on an IndicatorSnapshot, return signal + SL/TP. */
function evaluateStrategy(
  strategyName: string,
  bars: OHLC[],
): { signal: string; slPct: number; tpPct: number } {
  const ind = computeSnapshot(bars);
  switch (strategyName.toUpperCase() as StrategyName) {
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
    case "LAKSHMI":
    default: {
      const r = evaluateLakshmi(ind);
      return { signal: r.signal, slPct: r.slPct, tpPct: r.tpPct };
    }
  }
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

    for (let i = warmup; i < bars.length; i++) {
      const windowBars = bars.slice(Math.max(0, i - 200), i + 1);
      const { signal, slPct, tpPct } = evaluateStrategy(primaryStrategy, windowBars);
      const close = bars[i].close;

      if (signal === "BUY" || signal === "STRONG_BUY") {
        // Allocate 10% of equity per trade
        const qty = (equity * 0.1) / close;
        const slPrice = close * (1 - slPct / 100);
        const tpPrice = close * (1 + tpPct / 100);

        // Walk forward to find exit
        let exitPrice = close;
        let exitIdx = i;
        for (let j = i + 1; j < Math.min(i + 20, bars.length); j++) {
          if (bars[j].low <= slPrice) { exitPrice = slPrice; exitIdx = j; break; }
          if (bars[j].high >= tpPrice) { exitPrice = tpPrice; exitIdx = j; break; }
          exitPrice = bars[j].close;
          exitIdx = j;
        }

        const pnl = qty * (exitPrice - close);
        equity += pnl;
        if (pnl > 0) wins++; else losses++;
        btTrades.push({
          entryTs: klines[i].openTime, exitTs: klines[exitIdx].openTime,
          entryPrice: close, exitPrice, side: "BUY", pnl,
        });
        // Skip past exit bar to avoid overlapping trades
        i = exitIdx;
      } else if (signal === "SELL" || signal === "STRONG_SELL") {
        const qty = (equity * 0.1) / close;
        const slPrice = close * (1 + slPct / 100);
        const tpPrice = close * (1 - tpPct / 100);

        let exitPrice = close;
        let exitIdx = i;
        for (let j = i + 1; j < Math.min(i + 20, bars.length); j++) {
          if (bars[j].high >= slPrice) { exitPrice = slPrice; exitIdx = j; break; }
          if (bars[j].low <= tpPrice) { exitPrice = tpPrice; exitIdx = j; break; }
          exitPrice = bars[j].close;
          exitIdx = j;
        }

        const pnl = qty * (close - exitPrice);
        equity += pnl;
        if (pnl > 0) wins++; else losses++;
        btTrades.push({
          entryTs: klines[i].openTime, exitTs: klines[exitIdx].openTime,
          entryPrice: close, exitPrice, side: "SELL", pnl,
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
