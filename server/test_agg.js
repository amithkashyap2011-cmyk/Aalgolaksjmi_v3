import mongoose from 'mongoose';
import { Trade } from './src/models/Trade.js';

mongoose.connect('process.env.MONGO_URI').then(async () => {
  const userId = '69c2bc93c8601b4eaf3abe2f';
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const pnlAggregation = await Trade.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        mode: "LIVE",
        status: "CLOSED",
        closedAt: { $gte: startOfDay }
      }
    },
    { $group: { _id: null, dailyPnl: { $sum: "$pnl" } } }
  ]);
  console.log("LIVE mode dailyRealizedPnl:", pnlAggregation.length > 0 ? pnlAggregation[0].dailyPnl : 0);

  const pnlAggregationPaper = await Trade.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        mode: "PAPER",
        status: "CLOSED",
        closedAt: { $gte: startOfDay }
      }
    },
    { $group: { _id: null, dailyPnl: { $sum: "$pnl" } } }
  ]);
  console.log("PAPER mode dailyRealizedPnl:", pnlAggregationPaper.length > 0 ? pnlAggregationPaper[0].dailyPnl : 0);
  
  process.exit(0);
});
