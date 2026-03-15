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
import { authGuard, type AuthRequest } from "../middleware/auth.js";
import { WalletTransaction } from "../models/WalletTransaction.js";
import * as paper from "../services/paperState.js";
import * as binance from "../services/binanceService.js";

const router = Router();

/* ── INR ↔ USDT conversion (live rate via Binance) ───── */
async function getUsdtInrRate(): Promise<number> {
  try {
    // Binance doesn't have direct USDT/INR, approximate via USDT price
    // In production, use a real INR gateway rate
    return 83.5; // approximate INR per USDT
  } catch {
    return 83.5;
  }
}

/* ── Balance ──────────────────────────────────────────── */

router.get("/balance", authGuard, async (req: AuthRequest, res) => {
  try {
    const mode = (req.query?.mode as string) || "PAPER";
    const wallet = paper.getWallet(req.userId!, mode);
    const usdt = wallet.get("USDT") ?? 0;
    const rate = await getUsdtInrRate();

    // sum up completed deposits/withdrawals
    const deposits = await WalletTransaction.aggregate([
      { $match: { userId: req.userId, type: "DEPOSIT", status: "COMPLETED" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const withdrawals = await WalletTransaction.aggregate([
      { $match: { userId: req.userId, type: "WITHDRAW", status: "COMPLETED" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.json({
      usdt,
      inrEquivalent: +(usdt * rate).toFixed(2),
      inrRate: rate,
      totalDeposited: deposits[0]?.total ?? 0,
      totalWithdrawn: withdrawals[0]?.total ?? 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Transaction history ──────────────────────────────── */

router.get("/transactions", authGuard, async (req: AuthRequest, res) => {
  try {
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
    res.status(500).json({ error: err.message });
  }
});

/* ── UPI Deposit ──────────────────────────────────────── */

router.post("/deposit/upi", authGuard, async (req: AuthRequest, res) => {
  try {
    const { amount, upiId } = req.body as { amount: number; upiId: string };
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
    });

    // In production: integrate with Razorpay/PayU/Cashfree UPI gateway
    // For now: auto-complete after simulated delay
    setTimeout(async () => {
      try {
        txn.status = "COMPLETED";
        await txn.save();

        // credit USDT to wallet
        const mode = "PAPER"; // deposits go to paper wallet for now
        const wallet = paper.getWallet(req.userId!, mode);
        const current = wallet.get("USDT") ?? 0;
        paper.setWalletBalance(req.userId!, mode, "USDT", current + usdtAmount);
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
    const { usdtAmount, upiId } = req.body as { usdtAmount: number; upiId: string };
    if (!usdtAmount || usdtAmount <= 0) {
      res.status(400).json({ error: "Amount must be positive" });
      return;
    }
    if (!upiId || !upiId.includes("@")) {
      res.status(400).json({ error: "Valid UPI ID required" });
      return;
    }

    const mode = "PAPER";
    const wallet = paper.getWallet(req.userId!, mode);
    const current = wallet.get("USDT") ?? 0;
    if (usdtAmount > current) {
      res.status(400).json({ error: `Insufficient balance. Available: ${current.toFixed(2)} USDT` });
      return;
    }

    const rate = await getUsdtInrRate();
    const inrAmount = +(usdtAmount * rate).toFixed(2);

    // Debit immediately
    paper.setWalletBalance(req.userId!, mode, "USDT", current - usdtAmount);

    const txn = await WalletTransaction.create({
      userId: req.userId,
      type: "WITHDRAW",
      method: "UPI",
      amount: inrAmount,
      currency: "INR",
      status: "PENDING",
      upiId,
      txnRef: `WD${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      note: `Withdraw ${usdtAmount} USDT → ₹${inrAmount} @ ₹${rate}/USDT`,
    });

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

/* ── P2P: list offers ─────────────────────────────────── */

router.get("/p2p/offers", authGuard, async (req: AuthRequest, res) => {
  try {
    const offers = await WalletTransaction.find({
      type: "P2P_SELL",
      status: "PENDING",
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(offers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

    const offer = await WalletTransaction.create({
      userId: req.userId,
      type: "P2P_SELL",
      method: "P2P",
      amount: usdtAmount,
      currency: "USDT",
      status: "PENDING",
      p2pPrice: pricePerUsdt,
      note: `Selling ${usdtAmount} USDT @ ₹${pricePerUsdt}/USDT`,
    });

    res.json({ offer, message: `P2P sell offer created: ${usdtAmount} USDT @ ₹${pricePerUsdt}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── P2P: buy from offer ──────────────────────────────── */

router.post("/p2p/buy", authGuard, async (req: AuthRequest, res) => {
  try {
    const { offerId } = req.body as { offerId: string };
    const offer = await WalletTransaction.findById(offerId);
    if (!offer || offer.type !== "P2P_SELL" || offer.status !== "PENDING") {
      res.status(404).json({ error: "Offer not found or already taken" });
      return;
    }
    if (offer.userId.toString() === req.userId) {
      res.status(400).json({ error: "Cannot buy your own offer" });
      return;
    }

    const usdtAmount = offer.amount;

    // credit buyer
    const buyerWallet = paper.getWallet(req.userId!, "PAPER");
    const buyerBalance = buyerWallet.get("USDT") ?? 0;
    paper.setWalletBalance(req.userId!, "PAPER", "USDT", buyerBalance + usdtAmount);

    // mark offer completed
    offer.status = "COMPLETED";
    offer.p2pCounterparty = req.userId;
    await offer.save();

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
    });

    res.json({
      message: `Bought ${usdtAmount} USDT @ ₹${offer.p2pPrice}/USDT`,
      newBalance: buyerBalance + usdtAmount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
