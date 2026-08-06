import mongoose from "mongoose";
import { Trade } from "./src/models/Trade.js";
import { WalletSnapshot } from "./src/models/WalletSnapshot.js";
import dotenv from "dotenv";

dotenv.config();

async function closeAll() {
  await mongoose.connect(process.env.MONGO_URI || "process.env.MONGO_URI");
  console.log("Connected to MongoDB.");

  const openTrades = await Trade.find({ status: "OPEN" });
  console.log(`Found ${openTrades.length} open trades.`);

  const usersToUpdate = new Set<string>();

  for (const trade of openTrades) {
    trade.status = "CLOSED";
    trade.exitPrice = trade.entryPrice; // Just exit at break even for simplicity
    trade.pnl = 0;
    trade.closedAt = new Date();
    await trade.save();
    console.log(`Closed trade ${trade.symbol} for user ${trade.userId}`);
    usersToUpdate.add(trade.userId.toString());
  }

  // Restore the USDT alloc + pnl. Since we just want to reset, we'll reset paper wallets to $100
  for (const userId of usersToUpdate) {
    const snapshot = await WalletSnapshot.findOne({ userId, mode: "PAPER", accountType: "FUTURES" });
    if (snapshot) {
      snapshot.balances = { USDT: 104.15 }; // Restoring to previous equity
      await snapshot.save();
      console.log(`Reset wallet for user ${userId} to 104.15 USDT`);
    }
  }

  console.log("Done. Please restart the server for paperState to re-hydrate.");
  process.exit(0);
}

closeAll().catch(console.error);
