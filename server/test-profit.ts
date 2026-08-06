import mongoose from "mongoose";
import * as paper from "./src/services/paperState.js";
import * as binance from "./src/services/binanceService.js";
import { User } from "./src/models/User.js";
import { WalletSnapshot } from "./src/models/WalletSnapshot.js";
import { WalletTransaction } from "./src/models/WalletTransaction.js";
import { Trade } from "./src/models/Trade.js";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env") });

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI not defined");
  await mongoose.connect(mongoUri);
  
  await paper.hydrate();
  
  const user = await User.findOne({ email: "demo@aalgo.local" });
  if (!user) {
    console.error("Demo user not found");
    process.exit(1);
  }
  const userId = user._id.toString();
  
  const wallet = paper.getWallet(userId, "PAPER", "FUTURES");
  const available = wallet.get("USDT") ?? 0;
  
  const openPositions = paper.getOpenPositions(userId, "PAPER").filter(p => p.accountType === "FUTURES");
  
  console.log("=== PROFIT AND POSITION AUDIT ===");
  console.log(`User: ${user.email} (${userId})`);
  console.log(`Available USDT (Margin): ${available.toFixed(4)} USDT`);
  
  let lockedMargin = 0;
  let unrealizedPnl = 0;
  
  for (const p of openPositions) {
    const margin = (p.quantity * p.entryPrice) / (p.leverage || 1);
    lockedMargin += margin;
    
    // Fetch live ticker price
    const currentPrice = await binance.getTickerPrice(p.symbol);
    const pnl = p.side === "BUY"
      ? (currentPrice - p.entryPrice) * p.quantity
      : (p.entryPrice - currentPrice) * p.quantity;
      
    unrealizedPnl += pnl;
    const roe = (pnl / margin) * 100;
    
    console.log(`- ${p.symbol} (${p.side} ${p.leverage || 1}x):`);
    console.log(`  Qty: ${p.quantity}`);
    console.log(`  Entry: ${p.entryPrice}`);
    console.log(`  Current: ${currentPrice}`);
    console.log(`  Margin: ${margin.toFixed(4)} USDT`);
    console.log(`  PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)} USDT (${roe.toFixed(2)}% ROE)`);
  }
  
  const realizedBalance = available + lockedMargin;
  const totalEquity = realizedBalance + unrealizedPnl;
  const startingCapital = 100.0;
  const netProfit = totalEquity - startingCapital;
  
  console.log("---------------------------------");
  console.log(`Total Locked Margin: ${lockedMargin.toFixed(4)} USDT`);
  console.log(`Realized Balance: ${realizedBalance.toFixed(4)} USDT`);
  console.log(`Total Unrealized PnL: ${unrealizedPnl >= 0 ? "+" : ""}${unrealizedPnl.toFixed(4)} USDT`);
  console.log(`Total Equity: ${totalEquity.toFixed(4)} USDT`);
  console.log(`Net Profit since start ($100.00 baseline): ${netProfit >= 0 ? "+" : ""}${netProfit.toFixed(4)} USDT`);
  console.log("=================================");
  
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(console.error);
