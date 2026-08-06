import mongoose from "mongoose";
import { Trade } from "./src/models/Trade.js";
import { CurrencyService } from "./src/services/currencyService.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * AQEA Daily Performance Reporter (V4.0 Currency Standardized)
 * Generates summary metrics for all trades executed today.
 */
async function run() {
  const uri = process.env.MONGO_URI || "process.env.MONGO_URI";
  await mongoose.connect(uri);
  
  // Ensure rate is fresh
  await CurrencyService.refreshRate();

  const now = new Date();
  const startOfDay = new Date(now.setHours(0, 0, 0, 0));

  const trades = await Trade.find({
    openedAt: { $gte: startOfDay }
  }).lean();

  const closedTrades = trades.filter(t => t.status === "CLOSED");
  const openTrades = trades.filter(t => t.status === "OPEN");

  let longCount = 0;
  let shortCount = 0;
  let wins = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalDurationMs = 0;
  
  let coreSum = 0, ofSum = 0, smSum = 0, scoreCount = 0;

  closedTrades.forEach(t => {
    if (t.side === "BUY") longCount++; else shortCount++;
    const pnl = t.pnl || 0;
    if (pnl > 0) {
      wins++;
      grossProfit += pnl;
    } else {
      grossLoss += Math.abs(pnl);
    }

    if (t.openedAt && t.closedAt) {
      totalDurationMs += (new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime());
    }

    if (t.meta?.aqea) {
      coreSum += (t.meta.aqea.coreScore || 0);
      ofSum += (t.meta.aqea.orderFlowScore || 0);
      smSum += (t.meta.aqea.smartMoneyScore || 0);
      scoreCount++;
    }
  });

  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99.9 : 0);
  const avgDuration = closedTrades.length > 0 ? (totalDurationMs / closedTrades.length) / 60000 : 0;

  console.log("\n====================================================");
  console.log(`   AQEA DAILY PERFORMANCE REPORT - ${new Date().toLocaleDateString()}`);
  console.log("====================================================");

  const summary = [
    { Metric: "Trades Today", Value: trades.length },
    { Metric: "LONG Count", Value: longCount },
    { Metric: "SHORT Count", Value: shortCount },
    { Metric: "Open Positions", Value: openTrades.length },
    { Metric: "Closed Positions", Value: closedTrades.length },
    { Metric: "Win Rate", Value: `${winRate.toFixed(1)}%` },
    { Metric: "Profit Factor", Value: profitFactor === 99.9 ? "MAX" : profitFactor.toFixed(2) },
    { Metric: "Gross Profit", Value: CurrencyService.formatDual(grossProfit) },
    { Metric: "Gross Loss", Value: CurrencyService.formatDual(grossLoss) },
    { Metric: "Net PnL", Value: CurrencyService.formatDual(grossProfit - grossLoss) },
    { Metric: "Avg Duration", Value: `${avgDuration.toFixed(1)} mins` },
    { Metric: "Avg Core Score", Value: scoreCount > 0 ? (coreSum / scoreCount).toFixed(1) : "N/A" },
    { Metric: "Avg OrderFlow", Value: scoreCount > 0 ? (ofSum / scoreCount).toFixed(1) : "N/A" },
    { Metric: "Avg SmartMoney", Value: scoreCount > 0 ? (smSum / scoreCount).toFixed(1) : "N/A" }
  ];

  console.table(summary);

  const winners = [...closedTrades].sort((a, b) => (b.pnl || 0) - (a.pnl || 0)).slice(0, 5);
  const losers = [...closedTrades].sort((a, b) => (a.pnl || 0) - (b.pnl || 0)).slice(0, 5);

  if (winners.length > 0) {
    console.log("\nTOP 5 WINNERS:");
    console.table(winners.map(w => ({ Symbol: w.symbol, PnL: CurrencyService.formatDual(w.pnl || 0), Side: w.side })));
  }

  if (losers.length > 0) {
    console.log("\nTOP 5 LOSERS:");
    console.table(losers.map(l => ({ Symbol: l.symbol, PnL: CurrencyService.formatDual(l.pnl || 0), Side: l.side })));
  }

  await mongoose.disconnect();
}

run().catch(console.error);
