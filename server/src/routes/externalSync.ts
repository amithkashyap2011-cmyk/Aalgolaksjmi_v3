/*
 * ─── External Sync routes ──────────────────────────────
 *
 * Backs the Settings → EXTERNAL_SYNC tab. Everything that keeps the node
 * aligned with the outside world in one place:
 *
 * GET  /system/external-sync/status         – connectivity + sync state overview
 * POST /system/external-sync/time           – force Binance server-time re-sync
 * POST /system/external-sync/exchange-info  – force spot+futures exchangeInfo refresh
 * POST /system/external-sync/account        – pull live Binance balances (needs saved keys)
 */
import { Router } from "express";
import mongoose from "mongoose";
import { authGuard, optionalAuth, type AuthRequest } from "../middleware/auth.js";
import * as binance from "../services/binanceService.js";
import { systemManager } from "../services/systemManager.js";
import { ApiKeys } from "../models/ApiKeys.js";
import { decrypt } from "../lib/crypto.js";

const router = Router();

router.get("/status", optionalAuth, async (req: AuthRequest, res) => {
  const ping = await binance.pingBinance();

  let apiKeysSaved = false;
  if (req.userId && mongoose.connection.readyState === 1) {
    apiKeysSaved = !!(await ApiKeys.exists({ userId: req.userId }).catch(() => null));
  }

  const sys = systemManager.getStatusReport();
  res.json({
    now: Date.now(),
    binance: ping,
    timeSync: binance.getTimeSyncInfo(),
    exchangeInfo: binance.getExchangeInfoCacheInfo(),
    mongodb: mongoose.connection.readyState === 1,
    apiKeysSaved,
    systemState: sys.state,
    services: sys.services,
  });
});

router.post("/time", async (_req, res) => {
  await binance.syncTime();
  res.json({ ok: true, timeSync: binance.getTimeSyncInfo() });
});

router.post("/exchange-info", async (_req, res) => {
  try {
    binance.invalidateExchangeInfoCache();
    const [spot, futures] = await Promise.all([
      binance.getExchangeInfo(),
      binance.getFuturesExchangeInfo(),
    ]);
    res.json({ ok: true, spotSymbols: spot.length, futuresSymbols: futures.length, exchangeInfo: binance.getExchangeInfoCacheInfo() });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || "exchange_info_refresh_failed" });
  }
});

router.post("/account", authGuard, async (req: AuthRequest, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "MongoDB offline — cannot read stored API keys" });
    }
    const keys = await ApiKeys.findOne({ userId: req.userId });
    if (!keys) {
      return res.status(400).json({ error: "No Binance API keys saved. Add them in the API_KEYS tab first." });
    }
    const apiKey = decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
    const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.ivSecret, authTag: keys.authTagSecret });

    const [spotResult, futuresResult] = await Promise.allSettled([
      binance.getAccount(apiKey, apiSecret),
      binance.getFuturesAccount(apiKey, apiSecret),
    ]);

    let spot: any = { ok: false };
    if (spotResult.status === "fulfilled") {
      const usdt = spotResult.value.find(b => b.asset === "USDT");
      const nonZero = spotResult.value.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
      spot = {
        ok: true,
        usdtFree: usdt ? parseFloat(usdt.free) : 0,
        usdtLocked: usdt ? parseFloat(usdt.locked) : 0,
        assets: nonZero.length,
      };
    } else {
      spot.error = spotResult.reason?.message || "spot_account_failed";
    }

    let futures: any = { ok: false };
    if (futuresResult.status === "fulfilled") {
      const acc = futuresResult.value;
      futures = {
        ok: true,
        availableBalance: parseFloat(acc.availableBalance) || 0,
        totalWalletBalance: parseFloat(acc.totalWalletBalance) || 0,
        canTrade: acc.canTrade !== false,
      };
    } else {
      futures.error = futuresResult.reason?.message || "futures_account_failed";
    }

    res.json({ ok: spot.ok || futures.ok, syncedAt: Date.now(), spot, futures });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || "account_sync_failed" });
  }
});

export default router;
