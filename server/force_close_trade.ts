import mongoose from "mongoose";
import { Trade } from "./src/models/Trade.js";
import { Alert } from "./src/models/Alert.js";
import * as paper from "./src/services/paperState.js";
import * as binance from "./src/services/binanceService.js";
import { setCooldown } from "./src/services/autoTradeEngine.js";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error("MONGO_URI not defined");

async function main() {
  console.log("Starting Agent Force Close Script...");
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.");

  // Hydrate in-memory states
  await paper.hydrate();

  // Find the latest open trade
  const trade = await Trade.findOne({ status: "OPEN" }).sort({ openedAt: -1 });
  if (!trade) {
    console.log("No open trades found in database! The wallet is currently empty of active trades.");
    await mongoose.disconnect();
    return;
  }

  const tradeId = trade._id.toString();
  const userId = trade.userId.toString();
  const symbol = trade.symbol;
  const mode = trade.mode || "PAPER";
  const accountType = trade.accountType || "FUTURES";

  console.log(`\nExit target selected: ${symbol} ${trade.side} | Qty: ${trade.quantity} | Entry: ${trade.entryPrice}`);

  // Fetch current market price
  let exitPrice = trade.entryPrice;
  try {
    exitPrice = await binance.getTickerPrice(symbol);
    console.log(`Fetched current market price: ${exitPrice}`);
  } catch (err: any) {
    console.warn(`Failed to fetch live price, using entry fallback: ${err.message}`);
  }

  // Fees and Net PnL calculation
  const entryFee = trade.entryPrice * trade.quantity * 0.0004;
  const exitFee = exitPrice * trade.quantity * 0.0004;
  const grossPnl = trade.side === "BUY"
    ? (exitPrice - trade.entryPrice) * trade.quantity
    : (trade.entryPrice - exitPrice) * trade.quantity;
  const pnl = grossPnl - entryFee - exitFee;

  console.log(`Net PnL calculation complete:`);
  console.log(`  Gross PnL: ${grossPnl.toFixed(4)} USDT`);
  console.log(`  Entry Fee (0.04%): -${entryFee.toFixed(4)} USDT`);
  console.log(`  Exit Fee (0.04%): -${exitFee.toFixed(4)} USDT`);
  console.log(`  Net Realized PnL: ${pnl.toFixed(4)} USDT`);

  // 1. Update Trade document in MongoDB to status: CLOSED
  await Trade.updateOne({ _id: trade._id }, {
    $set: { status: "CLOSED", exitPrice, pnl, closedAt: new Date(), "meta.closeReason": "MANUAL_AGENT_DIAGNOSTIC" }
  });
  console.log(`[DB] Trade document ${tradeId} closed successfully.`);

  // 2. Return initial margin + PnL to virtual wallet
  const wallet = paper.getWallet(userId, mode, accountType);
  const currentUsdt = wallet.get("USDT") ?? 0;
  const tradeLeverage = trade.leverage || 1;
  const initialMargin = (trade.quantity * trade.entryPrice) / tradeLeverage;
  const newBalance = currentUsdt + initialMargin + pnl;

  await paper.setWalletBalance(userId, mode, "USDT", newBalance, accountType);
  console.log(`[Wallet] Released Margin ($${initialMargin.toFixed(2)}) + booked PnL ($${pnl.toFixed(4)}). Wallet: ${currentUsdt.toFixed(4)} -> ${newBalance.toFixed(4)} USDT`);

  // 3. Remove from in-memory positions list
  paper.removePosition(userId, symbol, mode, accountType);
  console.log(`[Memory] Flushed in-memory position for ${symbol}.`);

  // 4. Inject temporary auto-trade cooldown to prevent instant re-entry
  setCooldown(userId, symbol, 120_000);
  console.log(`[Mutex] 2-minute auto-trading cooldown set on ${symbol}.`);

  // 5. Create System Alert in MongoDB for visibility
  await Alert.create({
    userId: trade.userId,
    severity: pnl >= 0 ? "GREEN" : "AMBER",
    symbol,
    title: `Agent Manual Close: ${symbol}`,
    message: `Exited ${trade.quantity.toFixed(4)} @ ${exitPrice.toFixed(4)} | PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)} USDT`,
  });
  console.log(`[Alert] Stored system notification document.`);

  console.log("\n========================================================");
  console.log(`🎉 SUCCESS! Dynamic manual close fully completed by your Agent.`);
  console.log(`Net Realized PnL of ${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)} USDT has been booked.`);
  console.log(`Your frontend screen should now update instantly!`);
  console.log("========================================================\n");

  await mongoose.disconnect();
}

main().catch(console.error);
