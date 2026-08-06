import mongoose from 'mongoose';
import { WalletTransaction } from './src/models/WalletTransaction.ts';
import { Trade } from './src/models/Trade.ts';

mongoose.connect('process.env.MONGO_URI').then(async () => {
  const userId = '69c2bc93c8601b4eaf3abe2f';

  const wdGroups = await WalletTransaction.aggregate([
    { 
      $match: { 
        userId: new mongoose.Types.ObjectId(userId), 
        type: { $in: ["WITHDRAW", "WITHDRAW_CRYPTO", "P2P_SELL"] }, 
        status: "COMPLETED"
      } 
    },
    { $group: { _id: "$currency", total: { $sum: "$amount" } } },
  ]);
  
  let totalWithdrawalsUsdt = 0;
  for (const g of wdGroups) {
    if (g._id === "USDT") totalWithdrawalsUsdt += g.total;
    else if (g._id === "INR") totalWithdrawalsUsdt += g.total / 83.5;
  }
  
  const tradesPnl = await Trade.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), status: "CLOSED" } },
    { $group: { _id: null, total: { $sum: "$pnl" } } }
  ]);
  
  const totalRealizedPnL = tradesPnl.length > 0 ? tradesPnl[0].total : 0;
  
  console.log("totalWithdrawalsUsdt:", totalWithdrawalsUsdt);
  console.log("totalRealizedPnL:", totalRealizedPnL);
  console.log("bookedProfit:", Math.max(0, totalRealizedPnL - totalWithdrawalsUsdt));

  process.exit(0);
});
