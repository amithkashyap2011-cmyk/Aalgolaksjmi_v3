import mongoose from "mongoose";
import { Trade } from "../models/Trade.js";
import { WalletSnapshot } from "../models/WalletSnapshot.js";
import { toValidObjectId } from "../utils/mongoUtils.js";

const TAKER_FEE = 0.0004;

async function squareOffStalePositions() {
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";
  await mongoose.connect(mongoUri);
  console.log("[SQUARE_OFF] Connected to MongoDB");

  const openTrades = await Trade.find({ status: "OPEN" });
  console.log(`[SQUARE_OFF] Found ${openTrades.length} OPEN trades in database.`);

  const priceCache = new Map<string, number>();

  for (const t of openTrades) {
    let currentPrice = t.entryPrice;
    if (!priceCache.has(t.symbol)) {
      try {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${t.symbol}`);
        if (res.ok) {
          const data = await res.json() as { price: string };
          priceCache.set(t.symbol, parseFloat(data.price));
        }
      } catch (err: any) {
        console.warn(`[SQUARE_OFF] Could not fetch live price for ${t.symbol}: ${err.message}`);
      }
    }
    currentPrice = priceCache.get(t.symbol) || t.entryPrice;

    const qty = t.quantity || 0;
    const entryNotional = t.entryPrice * qty;
    const exitNotional = currentPrice * qty;
    const entryFee = entryNotional * TAKER_FEE;
    const exitFee = exitNotional * TAKER_FEE;

    let grossPnl = 0;
    if (t.side === "BUY" || (t as any).type === "BUY") {
      grossPnl = (currentPrice - t.entryPrice) * qty;
    } else {
      grossPnl = (t.entryPrice - currentPrice) * qty;
    }
    const netPnl = grossPnl - (entryFee + exitFee);
    const pnlPercent = entryNotional > 0 ? (netPnl / entryNotional) * 100 : 0;

    // Update trade record
    t.status = "CLOSED";
    t.closedAt = new Date();
    t.exitPrice = currentPrice;
    t.pnl = netPnl;
    (t as any).pnlPercent = pnlPercent;
    t.exitReason = "STAGNANT_STALE_POSITION_SQUARE_OFF";
    await t.save();

    console.log(`[SQUARE_OFF_CLOSED] ${t.symbol} side=${t.side} entry=${t.entryPrice} exit=${currentPrice} PnL=$${netPnl.toFixed(2)}`);

    // Credit margin and PnL to WalletSnapshot
    const leverage = t.leverage || 1;
    const marginUsed = entryNotional / leverage;
    const returnAmount = Math.max(0, marginUsed + netPnl);

    if (t.userId && t.mode === "PAPER") {
      const snap = await WalletSnapshot.findOne({
        userId: toValidObjectId(t.userId.toString()),
        mode: t.mode,
        accountType: t.accountType || "FUTURES"
      });
      if (snap && snap.balances) {
        const currUsdt = (snap.balances as any).USDT || 0;
        const newUsdt = currUsdt + returnAmount;
        (snap.balances as any).USDT = newUsdt;
        snap.markModified("balances");
        snap.updatedAt = new Date();
        await snap.save();
      }
    }
  }

  console.log("[SQUARE_OFF] All stale open positions successfully squared off and reconciled!");
  await mongoose.disconnect();
  process.exit(0);
}

squareOffStalePositions().catch((err) => {
  console.error(err);
  process.exit(1);
});
