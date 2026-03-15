/*
 * ─── Trading routes ────────────────────────────────────
 *
 * POST /trading/place-order   – PAPER or LIVE order
 * GET  /trading/open-positions
 * GET  /trading/history
 * GET  /trading/wallet
 */
import { Router } from "express";
import { authGuard, type AuthRequest } from "../middleware/auth.js";
import { Settings } from "../models/Settings.js";
import { Trade } from "../models/Trade.js";
import { WalletSnapshot } from "../models/WalletSnapshot.js";
import { ApiKeys } from "../models/ApiKeys.js";
import { decrypt } from "../lib/crypto.js";
import * as binance from "../services/binanceService.js";
import * as paper from "../services/paperState.js";

const router = Router();

/* ── place order ──────────────────────────────────────── */

router.post("/place-order", authGuard, async (req: AuthRequest, res) => {
  try {
    const { symbol, side, quantity, mode, strategy, sl, tp } = req.body as {
      symbol: string;
      side: "BUY" | "SELL";
      quantity: number;
      mode: "PAPER" | "LIVE";
      strategy?: string;
      sl?: number;
      tp?: number;
    };

    if (!symbol || !side || !quantity || !mode) {
      res.status(400).json({ error: "symbol, side, quantity, and mode are required" });
      return;
    }

    /* validate allowed symbol */
    const settings = await Settings.findOne({ userId: req.userId });
    if (!settings?.allowedSymbols.includes(symbol)) {
      res.status(400).json({ error: `Symbol ${symbol} not in allowed list` });
      return;
    }

    /* risk config defaults for SL/TP */
    const risk = settings.riskConfig;
    const maxPosSizePct = risk?.maxPositionSizePct ?? 21;
    const defaultSL = sl ?? risk?.defaultSL ?? 2;
    const defaultTP = tp ?? risk?.defaultTP ?? 4;

    /* validate risk limits */
    const wallet = paper.getWallet(req.userId!, mode);
    const usdt = wallet.get("USDT") ?? 0;

    /* position size check */
    let entryPrice: number;
    try {
      entryPrice = await binance.getTickerPrice(symbol);
    } catch {
      entryPrice = 0;
    }
    const orderValue = quantity * (entryPrice || 1);
    const posSizePct = usdt > 0 ? (orderValue / usdt) * 100 : 100;
    if (posSizePct > maxPosSizePct) {
      res.status(400).json({
        error: `Order exceeds max position size (${posSizePct.toFixed(1)}% > ${maxPosSizePct}%)`,
      });
      return;
    }

    /* daily loss check */
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTrades = await Trade.find({
      userId: req.userId, mode,
      openedAt: { $gte: todayStart },
    }).lean();
    const dailyPnl = todayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
    if (dailyPnl < -(risk?.maxDailyLoss ?? 100)) {
      res.status(400).json({ error: "Daily loss limit reached. No more trades today." });
      return;
    }

    /* compute SL/TP prices */
    const slPrice = side === "BUY"
      ? +(entryPrice * (1 - defaultSL / 100)).toFixed(8)
      : +(entryPrice * (1 + defaultSL / 100)).toFixed(8);
    const tpPrice = side === "BUY"
      ? +(entryPrice * (1 + defaultTP / 100)).toFixed(8)
      : +(entryPrice * (1 - defaultTP / 100)).toFixed(8);

    if (mode === "LIVE") {
      /* ── LIVE: call Binance ─────────────────────────── */
      const keys = await ApiKeys.findOne({ userId: req.userId });
      if (!keys) {
        res.status(400).json({ error: "No API keys configured. Go to Settings → API Keys." });
        return;
      }
      const apiKey = decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
      const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.ivSecret, authTag: keys.authTagSecret });
      const result = await binance.placeOrder(apiKey, apiSecret, {
        symbol,
        side,
        type: "MARKET",
        quantity: String(quantity),
      });
      const liveEntryPrice = parseFloat(result.cummulativeQuoteQty) / parseFloat(result.executedQty);
      const trade = await Trade.create({
        userId: req.userId,
        mode: "LIVE",
        symbol,
        side,
        quantity: parseFloat(result.executedQty),
        entryPrice: liveEntryPrice,
        sl: slPrice,
        tp: tpPrice,
        strategy: strategy ?? null,
        status: "OPEN",
        meta: { binanceOrderId: result.orderId },
      });
      res.json({ trade });
    } else {
      /* ── PAPER: simulate at real Binance price ──────── */
      let entryPrice: number;
      try {
        entryPrice = await binance.getTickerPrice(symbol);
      } catch {
        entryPrice = 0;
      }

      const cost = side === "BUY" ? quantity * entryPrice : 0;
      const newBalance = usdt - cost;
      if (newBalance < 0) {
        res.status(400).json({ error: "Insufficient USDT balance" });
        return;
      }

      paper.setWalletBalance(req.userId!, mode, "USDT", newBalance);

      const trade = await Trade.create({
        userId: req.userId,
        mode: "PAPER",
        symbol,
        side,
        quantity,
        entryPrice,
        sl: slPrice,
        tp: tpPrice,
        strategy: strategy ?? null,
        status: "OPEN",
      });

      paper.setPosition(req.userId!, symbol, mode, {
        userId: req.userId!,
        symbol,
        side,
        quantity,
        entryPrice,
        tradeId: trade._id.toString(),
      });

      // persist wallet snapshot
      await WalletSnapshot.findOneAndUpdate(
        { userId: req.userId, mode },
        { balances: Object.fromEntries(wallet) },
        { upsert: true },
      );

      res.json({ trade, wallet: Object.fromEntries(wallet) });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── open positions ───────────────────────────────────── */

router.get("/open-positions", authGuard, async (req: AuthRequest, res) => {
  try {
    const mode = (req.query?.mode as string) || "PAPER";
    const trades = await Trade.find({ userId: req.userId, mode, status: "OPEN" }).lean();
    res.json(trades);
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
    const trades = await Trade.find({ userId: req.userId, mode })
      .sort({ openedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await Trade.countDocuments({ userId: req.userId, mode });
    res.json({ trades, total });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── wallet ───────────────────────────────────────────── */

router.get("/wallet", authGuard, async (req: AuthRequest, res) => {
  try {
    const mode = (req.query?.mode as string) || "PAPER";
    const wallet = paper.getWallet(req.userId!, mode);
    res.json(Object.fromEntries(wallet));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
