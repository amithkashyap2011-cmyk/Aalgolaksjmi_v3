import mongoose from 'mongoose';
import { Trade } from './src/models/Trade.ts';
import { WalletTransaction } from './src/models/WalletTransaction.ts';

mongoose.connect('process.env.MONGO_URI').then(async () => {
  const userId = '69c2bc93c8601b4eaf3abe2f';
  const trades = await Trade.find({ userId: new mongoose.Types.ObjectId(userId) });
  console.log(`Total trades found: ${trades.length}`);
  
  if (trades.length > 0) {
    const pnlAggregation = await Trade.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), status: "CLOSED" } },
      { $group: { _id: null, total: { $sum: "$pnl" } } }
    ]);
    console.log("Total Lifetime PnL in DB:", pnlAggregation[0]?.total);
  }

  const w = await WalletTransaction.find({ userId: new mongoose.Types.ObjectId(userId) });
  console.log(`Total wallet transactions found: ${w.length}`);
  
  process.exit(0);
});
