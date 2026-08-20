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
import { Settings } from "../models/Settings.js";
import * as autoTradeEngine from "../services/autoTradeEngine.js";
import { clearDashboardCache } from "./aqeaUi.js";

const router = Router();

/* ── INR ↔ USDT conversion (live rate via Public APIs) ───── */
let cachedRate = 83.5;
let lastFetch = 0;

async function getUsdtInrRate(): Promise<number> {
  const now = Date.now();
  // Cache for 10 minutes to avoid rate limits
  if (now - lastFetch < 1000 * 60 * 10) {
    return cachedRate;
  }

  try {
    // Primary: CoinGecko
    const cgRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr");
    if (cgRes.ok) {
      const cgData: any = await cgRes.json();
      if (cgData?.tether?.inr) {
        cachedRate = cgData.tether.inr;
        lastFetch = now;
        return cachedRate;
      }
    }

    // Fallback: CryptoCompare
    const ccRes = await fetch("https://min-api.cryptocompare.com/data/price?fsym=USDT&tsyms=INR");
    if (ccRes.ok) {
      const ccData: any = await ccRes.json();
      if (ccData?.INR) {
        cachedRate = ccData.INR;
        lastFetch = now;
        return cachedRate;
      }
    }
  } catch (err) {
    console.error("[wallet] Failed to fetch live USDT/INR rate:", err);
  }
  
  return cachedRate; // Return last known or base fallback
}

/* ── Balance ──────────────────────────────────────────── */

router.get("/balance", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const mode = (req.query?.mode as string) || "PAPER";
    const accountType = (req.query?.accountType as string) || "FUTURES";
    const userId = req.userId || (req.body?.userId && mongoose.Types.ObjectId.isValid(req.body.userId) ? String(req.body.userId) : "guest-user");
    console.log(`[balance-request] User: ${userId}, Mode: ${mode}, AccountType: ${accountType}`);
    const sid = (req.query?.sid as string) || "unknown";
    console.log(`[balance-debug] Request: mode=${mode}, type=${accountType}, user=${userId}, sid=${sid}`);
    const rate = await getUsdtInrRate();

    // 🛡️ RUN SENTINEL AUDITOR: Proactively self-heals any desyncs/anomalies before returning balance
    if (req.userId) {
      await runSentinelAudit(req.userId, mode as any, accountType as any);
    }

    let usdt = 0;
    let totalBalance = 0;
    let lockedMargin = 0;
    let savingsUsdt = 0;
    let isUnactivated = false;
    let realizedBalance = 0;

    if (mode === "LIVE" && mongoose.connection.readyState === 1) {
      // ── LIVE MODE: Fetch from Binance ──
      try {
        const keys = await ApiKeys.findOne({ userId: userId });
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
            
            // Calculate locked margin from live positions
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
      // PAPER mode or DB is down — always use in-memory wallet
      const wallet = paper.getWallet(userId, mode, accountType as any);
      if (accountType.startsWith("INDIAN_")) {
        const rawInr = wallet.get("INR") ?? 0;
        usdt = rawInr / rate;
      } else {
        usdt = wallet.get("USDT") ?? 0;
      }

      // Calculate Locked Margin & Unrealized PnL from open positions
      const openPositions = paper.getOpenPositions(userId, mode).filter(p => p.accountType === accountType);
      log(`[balance-debug] openPositions count: ${openPositions.length}, usdt: ${usdt}`);
      
      let unrealizedPnl = 0;
      for (const p of openPositions) {
        lockedMargin += (p.quantity * p.entryPrice) / (p.leverage || 1);
        
        const isFutures = accountType === "FUTURES";
        let currentPrice = binance.getTickerPriceSync(p.symbol, isFutures);
        if (!currentPrice) {
          try {
            currentPrice = await binance.getTickerPrice(p.symbol, isFutures);
          } catch {
            currentPrice = p.entryPrice;
          }
        }
        
        // Net of taker fees — same math as the Positions page / close-position,
        // so total equity stays consistent across every screen.
        const pnl = computeUnrealisedPnl(p, currentPrice);
        unrealizedPnl += pnl;
        log(`[balance-debug] ${p.symbol}: qty=${p.quantity}, entry=${p.entryPrice}, current=${currentPrice}, pnl=${pnl.toFixed(2)}`);
      }
      
      // In Paper Mode, `wallet.get("USDT")` is the available margin.
      // Realized Balance = Available Margin + Locked Margin
      // Total Equity = Realized Balance + Unrealized PnL
      realizedBalance = usdt + lockedMargin;
      totalBalance = realizedBalance + unrealizedPnl;
      log(`[balance-calc-final] ${accountType}: realized=${realizedBalance.toFixed(2)}, usdt_avail=${usdt.toFixed(2)}, margin=${lockedMargin.toFixed(2)}, unrealizedPnL=${unrealizedPnl.toFixed(2)}, positions=${openPositions.length}, total=${totalBalance.toFixed(2)}`);
    }

    let totalDepositsUsdt = 0;
    let totalWithdrawalsUsdt = 0;
    let totalRealizedPnL = 0;

    // Only query DB for aggregates when connected and userId is valid
    if (mongoose.connection.readyState === 1 && req.userId && mongoose.Types.ObjectId.isValid(req.userId)) {
      try {
        const userObjId = new mongoose.Types.ObjectId(req.userId);
        const accountTypeMatch = accountType === "SPOT"
          ? { accountType: "SPOT" }
          : { $or: [{ accountType: "FUTURES" }, { accountType: { $exists: false } }, { accountType: null }] };

        // Aggregate deposits (DEPOSIT, P2P_BUY) grouped by currency
        const depGroups = await WalletTransaction.aggregate([
          { 
            $match: { 
              userId: userObjId, 
              type: { $in: ["DEPOSIT", "P2P_BUY"] }, 
              status: "COMPLETED",
              ...accountTypeMatch
            } 
          },
          { $group: { _id: "$currency", total: { $sum: "$amount" } } },
        ]);
        for (const g of depGroups) {
          const cur = (g._id || "USDT").toUpperCase();
          if (cur === "USDT") {
            totalDepositsUsdt += g.total;
          } else if (cur === "INR") {
            totalDepositsUsdt += g.total / rate;
          }
        }

        // Aggregate withdrawals (WITHDRAW, WITHDRAW_CRYPTO, P2P_SELL) grouped by currency
        const wdGroups = await WalletTransaction.aggregate([
          { 
            $match: { 
              userId: userObjId, 
              type: { $in: ["WITHDRAW", "WITHDRAW_CRYPTO", "P2P_SELL"] }, 
              status: "COMPLETED",
              ...accountTypeMatch
            } 
          },
          { $group: { _id: "$currency", total: { $sum: "$amount" } } },
        ]);
        for (const g of wdGroups) {
          const cur = (g._id || "USDT").toUpperCase();
          if (cur === "USDT") {
            totalWithdrawalsUsdt += g.total;
          } else if (cur === "INR") {
            totalWithdrawalsUsdt += g.total / rate;
          }
        }

        // Aggregate closed trades' PnL for exact lifetime realized profit/loss
        const tradesPnl = await Trade.aggregate([
          {
            $match: {
              userId: userObjId,
              status: "CLOSED",
              mode: mode,
              ...accountTypeMatch
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$pnl" }
            }
          }
        ]);
        if (tradesPnl.length > 0) {
          totalRealizedPnL = tradesPnl[0].total;
        }
      } catch (dbErr: any) {
        console.warn("[wallet] DB aggregate failed, using defaults:", dbErr.message);
      }
    }

    console.log(`[wallet][SYNC] User:${req.userId} | Mode:${mode} | SID:${sid} | Total:${totalBalance}`);

    // Self-healing fallback: If they have no recorded deposit transactions but have a balance, 
    // treat their starting balance as the initial core capital, and auto-persist a completed DEPOSIT transaction.
    if (mode === "LIVE" && totalDepositsUsdt === 0 && realizedBalance > 0) {
      if (mongoose.connection.readyState === 1 && req.userId && mongoose.Types.ObjectId.isValid(req.userId)) {
        try {
          await WalletTransaction.create({
            userId: new mongoose.Types.ObjectId(req.userId),
            type: "DEPOSIT",
            method: "SYSTEM",
            amount: realizedBalance,
            currency: "USDT",
            status: "COMPLETED",
            txnRef: `AUTOINIT${Date.now()}`,
            note: `Auto-recovered Starting Wallet Capital: +${realizedBalance} USDT`,
            accountType: accountType,
          });
          totalDepositsUsdt = realizedBalance;
        } catch (dbErr: any) {
          console.warn("[wallet] Failed to auto-create starting deposit transaction:", dbErr.message);
        }
      } else {
        totalDepositsUsdt = realizedBalance;
      }
    }

    // 1. Available booked profit is actual realized PnL minus completed withdrawals
    const bookedProfit = Math.max(0, totalRealizedPnL - totalWithdrawalsUsdt);

    // 2. Core capital represents the remaining deposited capital in this account
    const coreCapital = Math.max(0, realizedBalance - bookedProfit);

    const rawInrVal = accountType.startsWith("INDIAN_")
      ? (paper.getWallet(userId, mode, accountType as any).get("INR") ?? 0)
      : +(usdt * rate).toFixed(2);

    res.json({
      usdt, 
      inr: rawInrVal,
      totalBalance, 
      lockedMargin,
      savingsUsdt,
      isUnactivated,
      realizedBalance,
      bookedProfit: +bookedProfit.toFixed(4),
      inrEquivalent: +(totalBalance * rate).toFixed(2),
      inrRate: rate,
      totalDeposited: +totalDepositsUsdt.toFixed(4),
      totalWithdrawn: +totalWithdrawalsUsdt.toFixed(4),
      realizedPnL: +totalRealizedPnL.toFixed(4),
      userId: req.userId
    });
  } catch (err: any) {
    console.error("[wallet] /balance error:", err);
    // Return zeroed-out response instead of 500 so the UI still works
    res.json({
      usdt: 0,
      totalBalance: 0,
      lockedMargin: 0,
      savingsUsdt: 0,
      isUnactivated: false,
      realizedBalance: 0,
      bookedProfit: 0,
      inrEquivalent: 0,
      inrRate: cachedRate,
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
    const depositAmount = Number(amount) || 100000;
    const userId = req.userId!;

    const wallet = paper.getWallet(userId, mode, accountType);
    const currKey = currency.toUpperCase() === "INR" || accountType.startsWith("INDIAN_") ? "INR" : "USDT";
    const currentBal = wallet.get(currKey) ?? 0;
    const newBal = currentBal + depositAmount;
    wallet.set(currKey, newBal);

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

router.get("/transactions", authGuard, async (req: AuthRequest, res) => {
  try {
    // DEGRADED MODE: Return empty list if DB is down
    if (mongoose.connection.readyState !== 1) {
      return res.json({ transactions: [], total: 0 });
    }

    const limit = Math.min(Number(req.query?.limit) || 50, 200);
    const skip = Number(req.query?.skip) || 0;
    const txns = await WalletTransaction.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await WalletTransaction.countDocuments({ userId: req.userId });
    res.json({ transactions: txns, total });
  } catch (err: any) {
    console.warn("[wallet] /transactions error:", err.message);
    // Return empty instead of 500
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
    const { amount, accountType, currency = "USDT" } = req.body as { amount: number; accountType?: string; currency?: string };
    const userId = req.userId || "guest-user"; // Default to guest for unauthenticated requests
    const selectedCurrency = (currency || "USDT").toUpperCase();
    log(`[api] /deposit/paper called. Amount: ${amount}, Currency: ${selectedCurrency}, User: ${userId}`);

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: "Amount must be positive" });
      return;
    }

    // Convert INR to USDT if currency is INR
    const rate = await getUsdtInrRate();
    let usdtAmount = numAmount;
    if (selectedCurrency === "INR") {
      usdtAmount = +(numAmount / rate).toFixed(4);
    }

    // Validate bounds on the resulting USDT amount
    if (usdtAmount < 1) {
      res.status(400).json({ 
        error: selectedCurrency === "INR" 
          ? `Amount must be at least ₹${Math.ceil(rate)} (equivalent to 1 USDT)` 
          : "Amount must be at least 1 USDT" 
      });
      return;
    }
    if (usdtAmount > 100000) {
      res.status(400).json({ 
        error: selectedCurrency === "INR" 
          ? `Max dummy deposit is ₹${Math.floor(100000 * rate).toLocaleString()} (equivalent to 100,000 USDT)` 
          : "Max dummy deposit is 100,000 USDT" 
      });
      return;
    }

    const mode = "PAPER";
    const acctType = accountType || "FUTURES";
    const wallet = paper.getWallet(userId, mode, acctType);

    let newBalance = 0;
    if (acctType.startsWith("INDIAN_")) {
      const currentInr = wallet.get("INR") ?? 0;
      const newInrBalance = currentInr + numAmount;
      await paper.setWalletBalance(userId, mode, "INR", newInrBalance, acctType);
      await paper.setWalletBalance(userId, mode, "USDT", newInrBalance / rate, acctType);
      newBalance = newInrBalance;
      log(`[deposit] Indian Wallet ${userId} (${acctType}) deposited +₹${numAmount} INR. New INR Balance: ₹${newInrBalance}`);
    clearDashboardCache();
    } else {
      const current = wallet.get("USDT") ?? 0;
      newBalance = current + usdtAmount;
      await paper.setWalletBalance(userId, mode, "USDT", newBalance, acctType);
      log(`[deposit] User ${userId} deposited ${usdtAmount.toFixed(4)} USDT. New balance: ${newBalance}`);
    clearDashboardCache();
    }

    // Persist transaction only if DB is connected and userId is valid ObjectId
    if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(userId)) {
      try {
        await WalletTransaction.create({
          userId: new mongoose.Types.ObjectId(userId),
          type: "DEPOSIT",
          method: "DEBUG",
          amount: numAmount,
          currency: selectedCurrency,
          status: "COMPLETED",
          txnRef: `PAPER${Date.now()}`,
          note: selectedCurrency === "INR" 
            ? `Dummy Paper Deposit: +₹${numAmount} (${usdtAmount.toFixed(2)} USDT equivalent @ ₹${rate.toFixed(2)}/USDT)` 
            : `Dummy Paper Deposit: +${numAmount} USDT`,
          accountType: acctType,
        });

        // Auto-enable autoTrade and register in autoTradeEngine — but only
        // if the user hasn't explicitly turned it off. Previously this
        // unconditionally set autoTrade: true on every deposit (including
        // an auto-seeded starting balance), silently overriding a user's
        // deliberate choice to pause trading — e.g. right after a hard
        // reset, the very next deposit would flip it back on and the
        // engine would open new positions within seconds, with no way to
        // keep auto-trade off short of never depositing again.
        // Checked per the deposit's OWN account type — SPOT and FUTURES are
        // independent legs now, so a deposit into FUTURES must not
        // re-enable SPOT (or vice versa) and must not be blocked by the
        // other leg being explicitly off.
        const finalAcctType: "SPOT" | "FUTURES" = acctType === "SPOT" ? "SPOT" : "FUTURES";
        const field = finalAcctType === "SPOT" ? "autoTradeSpot" : "autoTradeFutures";
        const existingSettings = await Settings.findOne({ userId: new mongoose.Types.ObjectId(userId) });
        // Either signal blocks re-enable: the legacy autoTrade field only
        // ever goes false when BOTH legs are off (routes/agent.ts's
        // /auto/disable sets it via isEnabledAny(), hard-reset sets it
        // alongside both per-type fields together) — so it's a safe,
        // conservative "nothing should be trading" veto regardless of
        // whether autoTradeFutures/autoTradeSpot's own schema default
        // (true) makes it look "on" for a document that never explicitly
        // touched the per-type field.
        const explicitlyDisabled = existingSettings?.autoTrade === false || existingSettings?.[field] === false;

        if (!explicitlyDisabled) {
          await Settings.findOneAndUpdate(
            { userId: new mongoose.Types.ObjectId(userId) },
            {
              $set: { autoTrade: true, [field]: true },
              $setOnInsert: { userId: new mongoose.Types.ObjectId(userId) }
            },
            { upsert: true, new: true }
          );
          autoTradeEngine.enableUser(userId, finalAcctType);

          // Trigger immediate cycle for instant reactive execution
          autoTradeEngine.processUser(userId, finalAcctType).catch((err: any) => {
            console.error(`[deposit] Failed to trigger immediate processUser for ${userId}:`, err);
          });

          log(`[deposit] Auto-enabled autoTrade (${finalAcctType}) and added user ${userId} to engine scan after dummy deposit.`);
        } else {
          log(`[deposit] User ${userId} has autoTrade explicitly disabled for ${finalAcctType} — deposit recorded, engine not re-enabled.`);
        }
      } catch (dbErr: any) {
        console.warn("[wallet] Failed to persist dummy deposit or enable auto-trade in DB:", dbErr.message);
      }
    } else {
      console.warn("[wallet] Skipping DB transaction (Disconnected, invalid UserID, or guest user). Deposit applied to memory.");
    }

    res.json({
      message: selectedCurrency === "INR" 
        ? `Successfully added ₹${numAmount} (${usdtAmount.toFixed(2)} USDT) to your paper wallet.`
        : `Successfully added ${numAmount} USDT to your paper wallet.`,
      newBalance,
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
