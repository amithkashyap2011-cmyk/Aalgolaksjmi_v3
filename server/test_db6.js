import mongoose from 'mongoose';
import { WalletTransaction } from './src/models/WalletTransaction.ts';
import { Trade } from './src/models/Trade.ts';

mongoose.connect('process.env.MONGO_URI').then(async () => {
  const userId = '69c2bc93c8601b4eaf3abe2f';

  const txs = await WalletTransaction.find({ userId: new mongoose.Types.ObjectId(userId) }).sort({ createdAt: -1 }).limit(5);
  console.log("Recent wallet transactions:");
  txs.forEach(t => console.log(t.type, t.amount, t.createdAt));

  const trades = await Trade.find({ userId: new mongoose.Types.ObjectId(userId), status: "CLOSED" }).sort({ closedAt: -1 }).limit(5);
  console.log("\nRecent closed trades:");
  trades.forEach(t => console.log(t.symbol, t.pnl, t.closedAt));

  process.exit(0);
});
