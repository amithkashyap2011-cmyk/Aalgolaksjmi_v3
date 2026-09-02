/*
 * ─── Wallet routes ─────────────────────────────────────
 *
 * GET  /wallet/balance         – current balances (USDT, INR equivalent)
 * GET  /wallet/transactions    – deposit/withdraw/P2P history
 * POST /wallet/deposit/upi     – deposit via UPI
 * POST /wallet/withdraw/upi    – withdraw via UPI
 * GET  /wallet/p2p/offers      – list P2P sell offers
 * POST /wallet/p2p/create      – create P2P sell offer
 * POST /wallet/p2p/buy         – buy from a P2P offer
 */
import { Router } from "express";
import { authGuard, optionalAuth, type AuthRequest } from "../middleware/auth.js";
import { WalletTransaction } from "../models/WalletTransaction.js";
import * as paper from "../services/paperState.js";
import * as binance from "../services/binanceService.js";
import { computeUnrealisedPnl } from "../services/pnlService.js";
import fs from "node:fs";
import mongoose from "mongoose";
import { ApiKeys } from "../models/ApiKeys.js";
import { decrypt } from "../lib/crypto.js";
import { log } from "../utils/logger.js";
import { Trade } from "../models/Trade.js";
import { Alert } from "../models/Alert.js";
import { WalletSnapshot } from "../models/WalletSnapshot.js";
import { runSentinelAudit } from "../services/sentinelAuditor.js";
// Settings and autoTradeEngine imports removed — deposits no longer touch auto-trading
import { clearDashboardCache } from "./aqeaUi.js";
import { CurrencyService } from "../services/currencyService.js";

const router = Router();

/* ── INR ↔ USDT conversion ───── */
function getUsdtInrRate(): number {
  return CurrencyService.getRate();
}

// Sentinel audit throttle map (userId:mode:accountType -> timestamp)
const sentinelAuditThrottle = new Map<string, number>();

function scheduleSentinelAudit(userId: string, mode: "PAPER" | "LIVE", accountType: string) {
  const key = `${userId}:${mode}:${accountType}`;
  const now = Date.now();
  const last = sentinelAuditThrottle.get(key) || 0;
  if (now - last > 60_000) { // at most once every 60s
    sentinelAuditThrottle.set(key, now);
    runSentinelAudit(userId, mode as any, accountType as any).catch(err => {
      console.warn("[wallet] Background sentinel audit warning:", err.message);
    });
  }
}

// In-memory cache for DB aggregates (deposits, withdrawals, realized PnL)
const walletAggregatesCache = new Map<string, { stats: { deposits: number; withdrawals: number; realizedPnL: number }; expiresAt: number }>();

async function getCachedWalletAggregates(userId: string, mode: string, accountType: string, rate: number) {
  const key = `${userId}:${mode}:${accountType}`;
  const cached = walletAggregatesCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.stats;
  }

  let totalDepositsUsdt = 0;
  let totalWithdrawalsUsdt = 0;
  let totalRealizedPnL = 0;

  if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(userId)) {
    try {
      const userObjId = new mongoose.Types.ObjectId(userId);
      const accountTypeMatch = accountType === "SPOT"
        ? { accountType: "SPOT" }
        : { $or: [{ accountType: "FUTURES" }, { accountType: { $exists: false } }, { accountType: null }] };

      const [depGroups, wdGroups, tradesPnl] = await Promise.all([
        WalletTransaction.aggregate([
          { $match: { userId: userObjId, type: { $in: ["DEPOSIT", "P2P_BUY"] }, status: "COMPLETED", ...accountTypeMatch } },
          { $group: { _id: "$currency", total: { $sum: "$amount" } } },
        ]),
        WalletTransaction.aggregate([
          { $match: { userId: userObjId, type: { $in: ["WITHDRAW", "WITHDRAW_CRYPTO", "P2P_SELL"] }, status: "COMPLETED", ...accountTypeMatch } },
          { $group: { _id: "$currency", total: { $sum: "$amount" } } },
        ]),
        Trade.aggregate([
          { $match: { userId: userObjId, status: "CLOSED", mode: mode, ...accountTypeMatch } },
          { $group: { _id: null, total: { $sum: "$pnl" } } }
        ])
      ]);

      for (const g of depGroups) {
        const cur = (g._id || "USDT").toUpperCase();
        if (cur === "USDT") totalDepositsUsdt += g.total;
        else if (cur === "INR") totalDepositsUsdt += g.total / rate;
      }
      for (const g of wdGroups) {
        const cur = (g._id || "USDT").toUpperCase();
        if (cur === "USDT") totalWithdrawalsUsdt += g.total;
        else if (cur === "INR") totalWithdrawalsUsdt += g.total / rate;
      }
      if (tradesPnl.length > 0) {
        totalRealizedPnL = tradesPnl[0].total;
      }
    } catch (err: any) {
      console.warn("[wallet] Aggregates query error:", err.message);
    }
  }

  const stats = { deposits: totalDepositsUsdt, withdrawals: totalWithdrawalsUsdt, realizedPnL: totalRealizedPnL };
  walletAggregatesCache.set(key, { stats, expiresAt: Date.now() + 30_000 }); // cache for 30s
  return stats;
}

export async function computeAccountBalance(userId: string, mode: "PAPER" | "LIVE", accountType: string, rate: number) {
  if (userId && userId !== "guest-user") {
    scheduleSentinelAudit(userId, mode, accountType);
  }

  let usdt = 0;
  let totalBalance = 0;
  let lockedMargin = 0;
  let savingsUsdt = 0;
  let isUnactivated = false;
  let realizedBalance = 0;

  if (mode === "LIVE" && mongoose.connection.readyState === 1 && userId && userId !== "guest-user") {
    try {
      const keys = await ApiKeys.findOne({ userId });
      if (keys) {
        const apiKey = decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
        const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.ivSecret, authTag: keys.authTagSecret });
        if (accountType === "SPOT") {
          const balances = await binance.getAccount(apiKey, apiSecret);
          const usdtAsset = balances.find(b => b.asset === "USDT");
          const ldUsdtAsset = balances.find(b => b.asset === "LDUSDT");
          savingsUsdt = ldUsdtAsset ? parseFloat(ldUsdtAsset.free) : 0;
          usdt = usdtAsset ? parseFloat(usdtAsset.free) : 0;
          lockedMargin = usdtAsset ? parseFloat(usdtAsset.locked) : 0;
          totalBalance = usdt + lockedMargin + savingsUsdt;
        } else {
          const account = await binance.getFuturesAccount(apiKey, apiSecret);
          const positions = await binance.getFuturesPositions(apiKey, apiSecret);
          usdt = parseFloat(account.availableBalance) || 0;
          totalBalance = parseFloat(account.totalMarginBalance) || parseFloat(account.totalWalletBalance) || 0;
          isUnactivated = account.canTrade === false && (account.totalWalletBalance === "" || account.totalWalletBalance === undefined);
          lockedMargin = positions.reduce((sum, p) => {
            const qty = Math.abs(parseFloat(p.positionAmt)) || 0;
            const entry = parseFloat(p.entryPrice) || 0;
            const lev = parseFloat(p.leverage) || 1;
            return sum + (qty * entry) / lev;
          }, 0);
          realizedBalance = parseFloat(account.totalWalletBalance) || totalBalance;
        }
      }
    } catch (binanceErr: any) {
      console.error(`[wallet] Binance LIVE ${accountType} error:`, binanceErr.message);
    }
  } else {
    // PAPER mode - instant in-memory lookup
    const wallet = paper.getWallet(userId, mode, accountType as any);
    const isIndian = accountType.startsWith("INDIAN_");
    usdt = isIndian ? 0 : (wallet.get("USDT") ?? 0);

    const openPositions = paper.getOpenPositions(userId, mode).filter(p => p.accountType === accountType);
    let unrealizedPnl = 0;
    for (const p of openPositions) {
      lockedMargin += (p.quantity * p.entryPrice) / (p.leverage || 1);
      const isFutures = accountType === "FUTURES";
      const currentPrice = binance.getTickerPriceSync(p.symbol, isFutures) || p.entryPrice;
      const pnl = computeUnrealisedPnl(p, currentPrice);
      unrealizedPnl += pnl;
    }

    if (isIndian) {
      const rawInr = wallet.get("INR") ?? 0;
      realizedBalance = rawInr + lockedMargin;
      totalBalance = realizedBalance + unrealizedPnl;
    } else {
      realizedBalance = usdt + lockedMargin;
      totalBalance = realizedBalance + unrealizedPnl;
    }
  }

  const { deposits, withdrawals, realizedPnL } = await getCachedWalletAggregates(userId, mode, accountType, rate);
  const bookedProfit = Math.max(0, realizedPnL - withdrawals);
  const isIndianAcc = accountType.startsWith("INDIAN_");
  const rawInrVal = isIndianAcc
    ? (paper.getWallet(userId, mode, accountType as any).get("INR") ?? 0)
    : +(usdt * rate).toFixed(2);

  return {
    usdt: isIndianAcc ? 0 : +usdt.toFixed(4),
    inr: +rawInrVal.toFixed(2),
    currency: isIndianAcc ? "INR" : "USDT",
    totalBalance: +totalBalance.toFixed(4),
    lockedMargin: +lockedMargin.toFixed(4),
    savingsUsdt: +savingsUsdt.toFixed(4),
    isUnactivated,
    realizedBalance: +realizedBalance.toFixed(4),
    bookedProfit: +bookedProfit.toFixed(4),
    inrEquivalent: isIndianAcc ? +totalBalance.toFixed(2) : +(totalBalance * rate).toFixed(2),
    inrRate: rate,
    totalDeposited: +deposits.toFixed(4),
    totalWithdrawn: +withdrawals.toFixed(4),
    realizedPnL: +realizedPnL.toFixed(4),
    userId
  };
}

/* ── Unified Multi-Account Summary (1 Instant Request) ───── */
router.get("/summary", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const mode = (req.query?.mode as "PAPER" | "LIVE") || "PAPER";
    const userId = req.userId || (req.body?.userId && mongoose.Types.ObjectId.isValid(req.body.userId) ? String(req.body.userId) : "guest-user");
    const rate = getUsdtInrRate();

    const [spot, futures, nse, bse, nifty50] = await Promise.all([
      computeAccountBalance(userId, mode, "SPOT", rate),
      computeAccountBalance(userId, mode, "FUTURES", rate),
      computeAccountBalance(userId, mode, "INDIAN_NSE", rate),
      computeAccountBalance(userId, mode, "INDIAN_BSE", rate),
      computeAccountBalance(userId, mode, "INDIAN_NIFTY50", rate),
    ]);

    res.json({
      spot,
      futures,
      nse,
      bse,
      nifty50,
      inrRate: rate,
      timestamp: Date.now()
    });
  } catch (err: any) {
    console.error("[wallet] /summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Single Account Balance ─────────────────────────────── */
router.get("/balance", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const mode = (req.query?.mode as "PAPER" | "LIVE") || "PAPER";
    const accountType = (req.query?.accountType as string) || "FUTURES";
    const userId = req.userId || (req.body?.userId && mongoose.Types.ObjectId.isValid(req.body.userId) ? String(req.body.userId) : "guest-user");
    const rate = getUsdtInrRate();

    const balanceData = await computeAccountBalance(userId, mode, accountType, rate);
    res.json(balanceData);
  } catch (err: any) {
    console.error("[wallet] /balance error:", err);
    res.json({
      usdt: 0,
      totalBalance: 0,
      lockedMargin: 0,
      savingsUsdt: 0,
      isUnactivated: false,
      realizedBalance: 0,
      bookedProfit: 0,
      inrEquivalent: 0,
      inrRate: CurrencyService.getRate(),
      totalDeposited: 0,
      totalWithdrawn: 0,
      realizedPnL: 0,
      userId: req.userId
    });
  }
});

/* ── Add Test Funds (Dummy Amount for Testing) ────────── */
router.post("/deposit/test-funds", authGuard, async (req: AuthRequest, res) => {
  try {
    const { amount, accountType = "INDIAN_NSE", mode = "PAPER", currency = "INR" } = req.body;
    const depositAmount = Number(amount) || 10000;
    const userId = req.userId!;

    const isIndian = accountType.startsWith("INDIAN_");
    const currKey = isIndian ? "INR" : "USDT";
    const wallet = paper.getWallet(userId, mode, accountType);
    const currentBal = wallet.get(currKey) ?? 0;
    const newBal = currentBal + depositAmount;

    await paper.setWalletBalance(userId, mode, currKey, newBal, accountType);
    if (isIndian) {
      await paper.setWalletBalance(userId, mode, "USDT", 0, accountType);
    } else {
      await paper.setWalletBalance(userId, mode, "INR", 0, accountType);
    }
    clearDashboardCache();

    if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(userId)) {
      try {
        await WalletTransaction.create({
          userId: new mongoose.Types.ObjectId(userId),
          type: "DEPOSIT",
          method: "DEBUG",
          amount: depositAmount,
          currency: currKey,
          status: "COMPLETED",
          txnRef: `TEST${Date.now()}`,
          note: `Dummy Test Funds Deposit: +${depositAmount} ${currKey}`,
          accountType,
        });
      } catch (dbErr: any) {
        console.warn("[wallet] Failed to log test funds transaction:", dbErr.message);
      }
    }

    res.json({
      ok: true,
      accountType,
      mode,
      deposited: depositAmount,
      newBalance: newBal,
      currency: currKey,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Transaction history ──────────────────────────────── */

router.get("/transactions", optionalAuth, async (req: AuthRequest, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ transactions: [], total: 0 });
    }

    const limit = Math.min(Number(req.query?.limit) || 50, 200);
    const skip = Number(req.query?.skip) || 0;
    const userId = req.userId || "6a39c0e7a5e2995ed257ca68";

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.json({ transactions: [], total: 0 });
    }

    const userObjId = new mongoose.Types.ObjectId(userId);
    const txns = await WalletTransaction.find({ userId: userObjId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .catch(() => []);

    res.json({ transactions: txns, total: txns.length });
  } catch (err: any) {
    console.warn("[wallet] /transactions error:", err.message);
    res.json({ transactions: [], total: 0 });
  }
});

/* ── UPI Deposit ──────────────────────────────────────── */

router.post("/deposit/upi", authGuard, async (req: AuthRequest, res) => {
  try {
    const { amount, upiId, accountType = "FUTURES" } = req.body as { amount: number; upiId: string; accountType?: string };
    if (!amount || amount <= 0) {
      res.status(400).json({ error: "Amount must be positive" });
      return;
    }
    if (!upiId || !upiId.includes("@")) {
      res.status(400).json({ error: "Valid UPI ID required (e.g. name@upi)" });
      return;
    }

    const rate = await getUsdtInrRate();
    const usdtAmount = +(amount / rate).toFixed(4);

    // Create pending transaction
    const txn = await WalletTransaction.create({
      userId: req.userId,
      type: "DEPOSIT",
      method: "UPI",
      amount,
      currency: "INR",
      status: "PENDING",
      upiId,
      txnRef: `UPI${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      note: `Deposit ₹${amount} → ${usdtAmount} USDT @ ₹${rate}/USDT`,
      accountType,
    });

    // In production: integrate with Razorpay/PayU/Cashfree UPI gateway
    // For now: auto-complete after simulated delay
    setTimeout(async () => {
      try {
        txn.status = "COMPLETED";
        await txn.save();

        // credit USDT to wallet
        const mode = "PAPER"; // deposits go to paper wallet for now
        const wallet = paper.getWallet(req.userId!, mode, accountType as any);
        const current = wallet.get("USDT") ?? 0;
        paper.setWalletBalance(req.userId!, mode, "USDT", current + usdtAmount, accountType as any);
      } catch { /* log error */ }
    }, 2000);

    res.json({
      transaction: txn,
      usdtAmount,
      rate,
      message: `Processing ₹${amount} deposit via UPI (${upiId}). ~${usdtAmount} USDT will be credited.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── UPI Withdraw ─────────────────────────────────────── */

router.post("/withdraw/upi", authGuard, async (req: AuthRequest, res) => {
  try {
    const { usdtAmount, upiId, accountType = "FUTURES" } = req.body as { usdtAmount: number; upiId: string; accountType?: string };
    if (!usdtAmount || usdtAmount <= 0) {
      res.status(400).json({ error: "Amount must be positive" });
      return;
    }
    if (!upiId || !upiId.includes("@")) {
      res.status(400).json({ error: "Valid UPI ID required" });
      return;
    }

    const mode = "PAPER";
    // Fetch the rate BEFORE reading the balance so there's no `await` gap
    // between the read and the write below — previously `current` was read,
    // then `await getUsdtInrRate()` created a window where a concurrent
    // request (another withdrawal, a trade closing) could change the wallet
    // before this debit landed, silently clobbering that update (lost-update
    // race). With no intervening await, the read-then-write is atomic under
    // Node's single-threaded event loop.
    const rate = await getUsdtInrRate();
    const wallet = paper.getWallet(req.userId!, mode, accountType as any);
    const current = wallet.get("USDT") ?? 0;
    if (usdtAmount > current) {
      res.status(400).json({ error: `Insufficient balance. Available: ${current.toFixed(2)} USDT` });
      return;
    }

    const inrAmount = +(usdtAmount * rate).toFixed(2);

    // Debit immediately
    paper.setWalletBalance(req.userId!, mode, "USDT", current - usdtAmount, accountType as any);

    // If the transaction record fails to write, the debit above must not
    // silently stand with nothing to show for it — same refund-on-failure
    // pattern already proven for manual trade placement earlier this
    // session, applied here for the same reason.
    let txn;
    try {
      txn = await WalletTransaction.create({
        userId: req.userId,
        type: "WITHDRAW",
        method: "UPI",
        amount: inrAmount,
        currency: "INR",
        status: "PENDING",
        upiId,
        txnRef: `WD${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        note: `Withdraw ${usdtAmount} USDT → ₹${inrAmount} @ ₹${rate}/USDT`,
        accountType,
      });
    } catch (createErr: any) {
      const refundWallet = paper.getWallet(req.userId!, mode, accountType as any);
      paper.setWalletBalance(req.userId!, mode, "USDT", (refundWallet.get("USDT") ?? 0) + usdtAmount, accountType as any);
      throw createErr;
    }

    // In production: integrate with payout API
    setTimeout(async () => {
      try {
        txn.status = "COMPLETED";
        await txn.save();
      } catch { /* log */ }
    }, 3000);

    res.json({
      transaction: txn,
      inrAmount,
      rate,
      message: `Processing withdrawal of ${usdtAmount} USDT → ₹${inrAmount} to ${upiId}.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Crypto Withdraw (Binance-style) ──────────────────── */

router.post("/withdraw/crypto", authGuard, async (req: AuthRequest, res) => {
  try {
    const { symbol, amount, address, network, accountType = "FUTURES" } = req.body as {
      symbol: string;
      amount: number;
      address: string;
      network: string;
      accountType?: string;
    };

    if (!symbol || !amount || amount <= 0 || !address || !network) {
      res.status(400).json({ error: "All fields are required and amount must be positive" });
      return;
    }

    const mode = "PAPER";
    const wallet = paper.getWallet(req.userId!, mode, accountType as any);
    const current = wallet.get("USDT") ?? 0; // fallback to USDT for simulated balancing

    if (symbol === "USDT" && amount > current) {
      res.status(400).json({ error: `Insufficient balance. Available: ${current.toFixed(2)} USDT` });
      return;
    }

    // lock or debit
    if (symbol === "USDT") {
      paper.setWalletBalance(req.userId!, mode, "USDT", current - amount, accountType as any);
    }

    // Same refund-on-failure pattern as withdraw/upi above — the debit
    // must not stand with nothing to show for it if the record write fails.
    let txn;
    try {
      txn = await WalletTransaction.create({
        userId: req.userId,
        type: "WITHDRAW_CRYPTO",
        method: "CRYPTO",
        amount,
        currency: symbol,
        status: "PENDING",
        txnRef: `CRYPTO${Date.now()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
        note: `Withdraw ${amount} ${symbol} to ${address} via ${network} network`,
        accountType,
      });
    } catch (createErr: any) {
      if (symbol === "USDT") {
        const refundWallet = paper.getWallet(req.userId!, mode, accountType as any);
        paper.setWalletBalance(req.userId!, mode, "USDT", (refundWallet.get("USDT") ?? 0) + amount, accountType as any);
      }
      throw createErr;
    }

    // simulate completion
    setTimeout(async () => {
      try {
        txn.status = "COMPLETED";
        await txn.save();
      } catch {}
    }, 4000);

    res.json({
      transaction: txn,
      message: `Submitted withdrawal of ${amount} ${symbol} along address ${address} on ${network} network.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── P2P: list offers ───────────────────────────────── */

router.get("/p2p/offers", authGuard, async (req: AuthRequest, res) => {
  try {
    // DEGRADED MODE: Return empty list if DB is down
    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }

    const offers = await WalletTransaction.find({
      type: "P2P_SELL",
      status: "PENDING",
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(offers);
  } catch (err: any) {
    console.warn("[wallet] /p2p/offers error:", err.message);
    res.json([]);
  }
});

/* ── P2P: create sell offer ───────────────────────────── */

router.post("/p2p/create", authGuard, async (req: AuthRequest, res) => {
  try {
    const { usdtAmount, pricePerUsdt } = req.body as {
      usdtAmount: number;
      pricePerUsdt: number;
    };
    if (!usdtAmount || usdtAmount <= 0) {
      res.status(400).json({ error: "USDT amount must be positive" });
      return;
    }
    if (!pricePerUsdt || pricePerUsdt <= 0) {
      res.status(400).json({ error: "Price per USDT must be positive" });
      return;
    }

    // check seller has enough balance
    const wallet = paper.getWallet(req.userId!, "PAPER");
    const current = wallet.get("USDT") ?? 0;
    if (usdtAmount > current) {
      res.status(400).json({ error: `Insufficient balance. Available: ${current.toFixed(2)} USDT` });
      return;
    }

    // lock the USDT
    paper.setWalletBalance(req.userId!, "PAPER", "USDT", current - usdtAmount);

    // Same refund-on-failure pattern as the withdraw routes — the lock
    // must not stand with no sell offer to show for it if this fails.
    let offer;
    try {
      offer = await WalletTransaction.create({
        userId: req.userId,
        type: "P2P_SELL",
        method: "P2P",
        amount: usdtAmount,
        currency: "USDT",
        status: "PENDING",
        p2pPrice: pricePerUsdt,
        note: `Selling ${usdtAmount} USDT @ ₹${pricePerUsdt}/USDT`,
        accountType: "FUTURES",
      });
    } catch (createErr: any) {
      const refundWallet = paper.getWallet(req.userId!, "PAPER");
      paper.setWalletBalance(req.userId!, "PAPER", "USDT", (refundWallet.get("USDT") ?? 0) + usdtAmount);
      throw createErr;
    }

    res.json({ offer, message: `P2P sell offer created: ${usdtAmount} USDT @ ₹${pricePerUsdt}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── P2P: buy from offer ──────────────────────────────── */

router.post("/p2p/buy", authGuard, async (req: AuthRequest, res) => {
  try {
    const { offerId } = req.body as { offerId: string };
    
    // 🛡️ SECURITY FIX: Atomic lock via findOneAndUpdate to prevent Double-Spend
    const offer = await WalletTransaction.findOneAndUpdate(
      { _id: offerId, type: "P2P_SELL", status: "PENDING" },
      { status: "COMPLETED", p2pCounterparty: req.userId },
      { new: false } // returns the original document
    );
    
    if (!offer) {
      res.status(404).json({ error: "Offer not found or already taken" });
      return;
    }
    if (offer.userId.toString() === req.userId) {
      // Revert the lock if they tried to buy their own offer
      await WalletTransaction.findByIdAndUpdate(offerId, { status: "PENDING", p2pCounterparty: undefined });
      res.status(400).json({ error: "Cannot buy your own offer" });
      return;
    }

    const usdtAmount = offer.amount;

    // credit buyer
    const buyerWallet = paper.getWallet(req.userId!, "PAPER");
    const buyerBalance = buyerWallet.get("USDT") ?? 0;
    paper.setWalletBalance(req.userId!, "PAPER", "USDT", buyerBalance + usdtAmount);

    // record buy side
    await WalletTransaction.create({
      userId: req.userId,
      type: "P2P_BUY",
      method: "P2P",
      amount: usdtAmount,
      currency: "USDT",
      status: "COMPLETED",
      p2pPrice: offer.p2pPrice,
      p2pCounterparty: offer.userId.toString(),
      note: `Bought ${usdtAmount} USDT @ ₹${offer.p2pPrice}/USDT via P2P`,
      accountType: "FUTURES",
    });

    res.json({
      message: `Bought ${usdtAmount} USDT @ ₹${offer.p2pPrice}/USDT`,
      newBalance: buyerBalance + usdtAmount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Dummy Paper Deposit ──────────────────────────────── */
router.post("/deposit/paper", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { amount, accountType, currency = "USDT", confirmConversion = false } = req.body as {
      amount: number;
      accountType?: string;
      currency?: string;
      confirmConversion?: boolean;
    };
    const userId = req.userId || "guest-user";
    const selectedCurrency = (currency || "USDT").toUpperCase();
    log(`[api] /deposit/paper called. Amount: ${amount}, Currency: ${selectedCurrency}, Account: ${accountType}, User: ${userId}`);

    const ALLOWED_ACCOUNT_TYPES = ["SPOT", "FUTURES", "INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50"];
    if (!accountType || !ALLOWED_ACCOUNT_TYPES.includes(accountType)) {
      res.status(400).json({
        error: "accountType is required and must be one of: SPOT, FUTURES, INDIAN_NSE, INDIAN_BSE, INDIAN_NIFTY50"
      });
      return;
    }

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: "Amount must be positive" });
      return;
    }

    const mode = "PAPER";
    const acctType = accountType;
    const wallet = paper.getWallet(userId, mode, acctType);
    const isIndian = acctType.startsWith("INDIAN_");
    const rate = await getUsdtInrRate();

    let newBalance = 0;
    let creditedCurrency = "USDT";
    let creditedAmount = 0;
    let note = "";

    if (isIndian) {
      // ── INDIAN DOMAIN VALIDATION (NSE / BSE / NIFTY50) ──
      if (selectedCurrency !== "INR") {
        res.status(400).json({
          error: "Indian market accounts accept INR deposits only. Cannot deposit USDT into an Indian account."
        });
        return;
      }
      if (numAmount < 100) {
        res.status(400).json({ error: "Minimum Indian deposit is ₹100" });
        return;
      }
      if (numAmount > 10000000) {
        res.status(400).json({ error: "Maximum Indian deposit is ₹1,00,00,000 (1 Crore INR)" });
        return;
      }

      const currentInr = wallet.get("INR") ?? 0;
      newBalance = currentInr + numAmount;
      creditedAmount = numAmount;
      creditedCurrency = "INR";

      // Native INR credit — strictly 0 USDT
      await paper.setWalletBalance(userId, mode, "INR", newBalance, acctType);
      await paper.setWalletBalance(userId, mode, "USDT", 0, acctType);
      clearDashboardCache();

      note = `Paper Deposit: +₹${numAmount.toLocaleString("en-IN")} INR`;
      log(`[deposit] Indian Wallet ${userId} (${acctType}) deposited +₹${numAmount} INR. New INR Balance: ₹${newBalance}`);
    } else {
      // ── CRYPTO DOMAIN VALIDATION (SPOT / FUTURES) ──
      if (selectedCurrency === "USDT") {
        if (numAmount < 1) {
          res.status(400).json({ error: "Amount must be at least 1 USDT" });
          return;
        }
        if (numAmount > 100000) {
          res.status(400).json({ error: "Max dummy deposit is 100,000 USDT" });
          return;
        }

        const currentUsdt = wallet.get("USDT") ?? 0;
        newBalance = currentUsdt + numAmount;
        creditedAmount = numAmount;
        creditedCurrency = "USDT";

        await paper.setWalletBalance(userId, mode, "USDT", newBalance, acctType);
        await paper.setWalletBalance(userId, mode, "INR", 0, acctType);
        clearDashboardCache();

        note = `Paper Deposit: +${numAmount} USDT`;
        log(`[deposit] Crypto Wallet ${userId} (${acctType}) deposited +${numAmount} USDT. New USDT Balance: ${newBalance}`);
      } else if (selectedCurrency === "INR") {
        // Explicit conversion required for INR → Crypto
        if (!confirmConversion) {
          res.status(400).json({
            error: "Depositing INR into a Crypto account requires explicit conversion confirmation (confirmConversion: true)."
          });
          return;
        }

        const usdtAmount = +(numAmount / rate).toFixed(4);
        if (usdtAmount < 1) {
          res.status(400).json({
            error: `Amount must be at least ₹${Math.ceil(rate)} (equivalent to 1 USDT)`
          });
          return;
        }
        if (usdtAmount > 100000) {
          res.status(400).json({
            error: `Max dummy deposit is ₹${Math.floor(100000 * rate).toLocaleString()} (equivalent to 100,000 USDT)`
          });
          return;
        }

        const currentUsdt = wallet.get("USDT") ?? 0;
        newBalance = currentUsdt + usdtAmount;
        creditedAmount = usdtAmount;
        creditedCurrency = "USDT";

        await paper.setWalletBalance(userId, mode, "USDT", newBalance, acctType);
        await paper.setWalletBalance(userId, mode, "INR", 0, acctType);
        clearDashboardCache();

        note = `Paper Deposit (INR→USDT On-Ramp): +${usdtAmount} USDT (converted from ₹${numAmount.toLocaleString("en-IN")} INR @ ₹${rate.toFixed(2)}/USDT)`;
        log(`[deposit] Crypto Wallet ${userId} (${acctType}) converted ₹${numAmount} INR to +${usdtAmount} USDT. New balance: ${newBalance}`);
      } else {
        res.status(400).json({
          error: `Unsupported currency '${selectedCurrency}' for Crypto account. Must be USDT or INR with conversion.`
        });
        return;
      }
    }

    // Persist auditable transaction record
    if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(userId)) {
      try {
        await WalletTransaction.create({
          userId: new mongoose.Types.ObjectId(userId),
          type: "DEPOSIT",
          method: "DEBUG",
          amount: creditedAmount,
          currency: creditedCurrency,
          status: "COMPLETED",
          txnRef: `PAPER${Date.now()}`,
          note,
          accountType: acctType,
        });

        log(`[deposit] PAPER deposit persisted for user ${userId} (${acctType}). Auto-trade NOT touched — requires explicit user action.`);
      } catch (dbErr: any) {
        console.warn("[wallet] Failed to persist dummy deposit in DB:", dbErr.message);
      }
    } else {
      console.warn("[wallet] Skipping DB transaction (Disconnected, invalid UserID, or guest user). Deposit applied to memory.");
    }

    res.json({
      message: isIndian
        ? `Successfully added ₹${numAmount.toLocaleString("en-IN")} INR to your Indian Market (${acctType}) wallet.`
        : (selectedCurrency === "INR"
            ? `Successfully converted ₹${numAmount.toLocaleString("en-IN")} INR to ${creditedAmount.toFixed(2)} USDT in your ${acctType} wallet.`
            : `Successfully added ${numAmount} USDT to your ${acctType} wallet.`),
      newBalance,
      currency: creditedCurrency,
      accountType: acctType,
      mode,
    });
  } catch (err: any) {
    console.error("[wallet] /deposit/paper error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Initialize wallet with default starting balance ──– */
router.post("/init", authGuard, async (req: AuthRequest, res) => {
  try {
    const mode = (req.body?.mode as string) || "PAPER";
    const initialBalance = req.body?.balance ?? 0; // Clean 0 baseline
    const accountType = (req.body?.accountType as string) || "FUTURES";

    const wallet = paper.getWallet(req.userId!, mode, accountType);
    const currentBalance = wallet.get("USDT") ?? 0;

    // Only initialize if wallet is empty
    if (currentBalance === 0) {
      await paper.setWalletBalance(req.userId!, mode, "USDT", initialBalance, accountType);

      // Persist initialization transaction in DB
      if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(req.userId!)) {
        try {
          await WalletTransaction.create({
            userId: new mongoose.Types.ObjectId(req.userId!),
            type: "DEPOSIT",
            method: "SYSTEM",
            amount: initialBalance,
            currency: "USDT",
            status: "COMPLETED",
            txnRef: `INIT${Date.now()}`,
            note: `System Wallet Initialization Capital: +${initialBalance} USDT`,
            accountType,
          });
        } catch (dbErr: any) {
          console.warn("[wallet] Failed to persist wallet init transaction:", dbErr.message);
        }
      }

      res.json({
        message: `Paper wallet initialized with ${initialBalance} USDT`,
        newBalance: initialBalance,
        mode,
        initialized: true,
      });
    } else {
      res.json({
        message: `Wallet already initialized with ${currentBalance} USDT`,
        newBalance: currentBalance,
        mode,
        initialized: false,
      });
    }
  } catch (err: any) {
    console.error("[wallet] /init error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Reset wallet ────────────────────────────────────── */
router.post("/reset", authGuard, async (req: AuthRequest, res) => {
  try {
    const mode = (req.body?.mode as string) || "PAPER";
    const accountType = (req.body?.accountType as string) || "FUTURES";

    // 1. Wipe memory positions, wallets and delete trades/snapshots from MongoDB
    await paper.clearUserMemory(req.userId!);

    // 2. Delete all wallet transaction history, trades, snapshots and alerts for a true clean slate
    if (mongoose.connection.readyState === 1 && req.userId && mongoose.Types.ObjectId.isValid(req.userId)) {
      try {
        const userObjId = new mongoose.Types.ObjectId(req.userId);
        await WalletTransaction.deleteMany({ userId: userObjId });
        await Trade.deleteMany({ userId: userObjId });
        await Alert.deleteMany({ userId: userObjId });
        await WalletSnapshot.deleteMany({ userId: userObjId });
      } catch (dbErr: any) {
        console.warn("[wallet] Failed to delete user records during reset:", dbErr.message);
      }
    }

    // Re-seed $20,000 USDT & ₹20,00,000 INR baseline
    await paper.setWalletBalance(req.userId!, mode, "USDT", 0, accountType);

    res.json({
      message: "Wallet reset to standard baseline 20,000 USDT ($20k) state.",
      newBalance: 0,
      mode,
    });
  } catch (err: any) {
    console.error("[wallet] /reset error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Transfer ──────────────────────────────────────────── */
// Two kinds, both simulated (PAPER mode only — this platform has no real
// payment processor or real Binance sub-account transfer integration):
//  - "internal": moves dummy USDT between the user's own Spot and Futures
//    paper wallets. A real balance move, just between two accountTypes
//    that both live in this app's own ledger.
//  - "external": a one-way simulated "send to Binance main account" — the
//    dummy money is debited and recorded as a WITHDRAW, exactly like a
//    real off-platform withdrawal would be, since there's nowhere real to
//    receive it. This does not call any real Binance API.
router.post("/transfer", authGuard, async (req: AuthRequest, res) => {
  try {
    const kind = (req.body?.kind as string) || "internal";
    const amount = Number(req.body?.amount);
    const mode = (req.body?.mode as string) || "PAPER";
    const userId = req.userId!;

    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "Amount must be positive" });
      return;
    }

    if (kind === "internal") {
      const from = (req.body?.from as string) === "SPOT" ? "SPOT" : "FUTURES";
      const to = from === "SPOT" ? "FUTURES" : "SPOT";

      const fromWallet = paper.getWallet(userId, mode, from);
      const fromBalance = fromWallet.get("USDT") ?? 0;
      if (fromBalance < amount) {
        res.status(400).json({ error: `Insufficient ${from} balance (has ${fromBalance.toFixed(2)}, needs ${amount.toFixed(2)})` });
        return;
      }

      const toWallet = paper.getWallet(userId, mode, to);
      const toBalance = toWallet.get("USDT") ?? 0;

      await paper.setWalletBalance(userId, mode, "USDT", fromBalance - amount, from);
      await paper.setWalletBalance(userId, mode, "USDT", toBalance + amount, to);

      if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(userId)) {
        await WalletTransaction.create({
          userId: new mongoose.Types.ObjectId(userId), type: "ADJUSTMENT", method: "SYSTEM",
          amount, currency: "USDT", status: "COMPLETED", txnRef: `XFER${Date.now()}`,
          note: `Internal transfer: ${amount.toFixed(4)} USDT ${from} → ${to}`, accountType: to,
        });
      }

      res.json({ message: `Transferred ${amount.toFixed(2)} USDT from ${from} to ${to}.`, from, to, amount });
      return;
    }

    if (kind === "external") {
      const accountType = (req.body?.accountType as string) || "FUTURES";
      const wallet = paper.getWallet(userId, mode, accountType);
      const balance = wallet.get("USDT") ?? 0;
      if (balance < amount) {
        res.status(400).json({ error: `Insufficient balance (has ${balance.toFixed(2)}, needs ${amount.toFixed(2)})` });
        return;
      }

      await paper.setWalletBalance(userId, mode, "USDT", balance - amount, accountType);

      if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(userId)) {
        await WalletTransaction.create({
          userId: new mongoose.Types.ObjectId(userId), type: "WITHDRAW", method: "SYSTEM",
          amount, currency: "USDT", status: "COMPLETED", txnRef: `BNBXFER${Date.now()}`,
          note: `Simulated transfer to Binance main account (${amount.toFixed(4)} USDT) — no real transfer occurred, dummy funds only.`,
          accountType,
        });
      }

      res.json({ message: `Simulated: ${amount.toFixed(2)} USDT sent to your Binance main account (dummy funds, no real transfer).`, newBalance: balance - amount });
      return;
    }

    res.status(400).json({ error: "Invalid transfer kind — must be 'internal' or 'external'" });
  } catch (err: any) {
    console.error("[wallet] /transfer error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Custom Capital Allocation (Spot vs Futures) ────────── */
router.post("/allocate", optionalAuth, async (req: AuthRequest, res) => {
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
      } catch (dbErr: any) {
        console.warn("[wallet] Failed to persist allocation transaction:", dbErr.message);
      }
    }

    res.json({
      message: `Capital allocation saved! Spot: $${spotAmount.toLocaleString()} USDT | Futures: $${futuresAmount.toLocaleString()} USDT`,
      spot: spotAmount,
      futures: futuresAmount,
    });
  } catch (err: any) {
    console.error("[wallet] /allocate error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
