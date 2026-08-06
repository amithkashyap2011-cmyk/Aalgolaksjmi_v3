import mongoose from "mongoose";
import { Trade } from "../models/Trade.js";

const MONGO_URI = "mongodb://127.0.0.1:27017/aalgolakshmi";

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("=== DB CONNECTED ===");

  const closedTrades = await Trade.find({ status: "CLOSED" }).lean();
  console.log(`Loaded ${closedTrades.length} closed trades.`);

  if (closedTrades.length === 0) {
    console.log("No closed trades found.");
    await mongoose.disconnect();
    return;
  }

  // 1. Basic Stats
  let wins = 0;
  let losses = 0;
  let totalWinPnL = 0;
  let totalLossPnL = 0;
  let totalPnL = 0;

  const pnlList: number[] = [];

  for (const t of closedTrades) {
    const pnl = t.pnl || 0;
    totalPnL += pnl;
    pnlList.push(pnl);

    if (pnl > 0) {
      wins++;
      totalWinPnL += pnl;
    } else {
      losses++;
      totalLossPnL += pnl;
    }
  }

  const winRate = wins / closedTrades.length;
  const avgWin = wins > 0 ? totalWinPnL / wins : 0;
  const avgLoss = losses > 0 ? totalLossPnL / losses : 0;
  const profitFactor = Math.abs(totalLossPnL) > 0 ? totalWinPnL / Math.abs(totalLossPnL) : 0;
  const expectancy = (winRate * avgWin) - ((1 - winRate) * Math.abs(avgLoss));

  // Sharpe ratio estimate (mean / stdDev * sqrt(252))
  const meanPnL = totalPnL / closedTrades.length;
  const variance = pnlList.reduce((acc, val) => acc + Math.pow(val - meanPnL, 2), 0) / pnlList.length;
  const stdDev = Math.sqrt(variance);
  const sharpe = stdDev > 0 ? (meanPnL / stdDev) * Math.sqrt(252) : 0;

  console.log("\n=== PERFORMANCE METRICS ===");
  console.log(`Win Rate: ${(winRate * 100).toFixed(2)}% (${wins} W / ${losses} L)`);
  console.log(`Avg Win:  $${avgWin.toFixed(4)}`);
  console.log(`Avg Loss: $${avgLoss.toFixed(4)}`);
  console.log(`Expectancy: $${expectancy.toFixed(4)}`);
  console.log(`Profit Factor: ${profitFactor.toFixed(4)}`);
  console.log(`Sharpe Est:    ${sharpe.toFixed(4)}`);
  console.log(`Total PnL:     $${totalPnL.toFixed(4)}`);

  // 2. Confidence Calibration Check
  // We'll bin by confidence: 0.3-0.5, 0.5-0.6, 0.6-0.7, 0.7-0.8, 0.8-0.9, 0.9-1.0
  const confBins: Record<string, { count: number; wins: number; pnl: number }> = {
    "0.0-0.3": { count: 0, wins: 0, pnl: 0 },
    "0.3-0.5": { count: 0, wins: 0, pnl: 0 },
    "0.5-0.6": { count: 0, wins: 0, pnl: 0 },
    "0.6-0.7": { count: 0, wins: 0, pnl: 0 },
    "0.7-0.8": { count: 0, wins: 0, pnl: 0 },
    "0.8-0.9": { count: 0, wins: 0, pnl: 0 },
    "0.9-1.0": { count: 0, wins: 0, pnl: 0 },
  };

  for (const t of closedTrades) {
    const meta = t.meta || {};
    const confidence = parseFloat(meta.confidence as string || meta.confidenceLong as string || meta.confidenceExit as string || "0");
    const pnl = t.pnl || 0;
    let bin = "0.0-0.3";
    if (confidence >= 0.9) bin = "0.9-1.0";
    else if (confidence >= 0.8) bin = "0.8-0.9";
    else if (confidence >= 0.7) bin = "0.7-0.8";
    else if (confidence >= 0.6) bin = "0.6-0.7";
    else if (confidence >= 0.5) bin = "0.5-0.6";
    else if (confidence >= 0.3) bin = "0.3-0.5";

    confBins[bin].count++;
    confBins[bin].pnl += pnl;
    if (pnl > 0) {
      confBins[bin].wins++;
    }
  }

  console.log("\n=== CONFIDENCE CALIBRATION REPORT ===");
  console.log("Bin\tTrades\tWinRate\tTotalPnL\tAvgPnL");
  for (const bin of Object.keys(confBins)) {
    const b = confBins[bin];
    const wr = b.count > 0 ? b.wins / b.count : 0;
    const avg = b.count > 0 ? b.pnl / b.count : 0;
    console.log(`${bin}\t${b.count}\t${(wr*100).toFixed(1)}%\t$${b.pnl.toFixed(2)}\t$${avg.toFixed(4)}`);
  }

  // 3. Exit Reason Analysis
  const exitReasons: Record<string, { count: number; wins: number; pnl: number }> = {};
  for (const t of closedTrades) {
    const meta = t.meta || {};
    const reason = (meta.exitReason || meta.reason || "UNKNOWN") as string;
    if (!exitReasons[reason]) {
      exitReasons[reason] = { count: 0, wins: 0, pnl: 0 };
    }
    exitReasons[reason].count++;
    exitReasons[reason].pnl += t.pnl || 0;
    if ((t.pnl || 0) > 0) {
      exitReasons[reason].wins++;
    }
  }

  console.log("\n=== EXIT REASON PERFORMANCE ===");
  console.log("Reason\tTrades\tWinRate\tTotalPnL\tAvgPnL");
  for (const reason of Object.keys(exitReasons)) {
    const r = exitReasons[reason];
    const wr = r.count > 0 ? r.wins / r.count : 0;
    const avg = r.count > 0 ? r.pnl / r.count : 0;
    console.log(`${reason.padEnd(20)}\t${r.count}\t${(wr*100).toFixed(1)}%\t$${r.pnl.toFixed(2)}\t$${avg.toFixed(4)}`);
  }

  // 4. Asset Performance Analysis
  const assetStats: Record<string, { count: number; wins: number; pnl: number }> = {};
  for (const t of closedTrades) {
    const symbol = t.symbol;
    if (!assetStats[symbol]) {
      assetStats[symbol] = { count: 0, wins: 0, pnl: 0 };
    }
    assetStats[symbol].count++;
    assetStats[symbol].pnl += t.pnl || 0;
    if ((t.pnl || 0) > 0) {
      assetStats[symbol].wins++;
    }
  }

  console.log("\n=== ASSET PERFORMANCE ===");
  console.log("Asset\tTrades\tWinRate\tTotalPnL\tAvgPnL");
  const sortedAssets = Object.keys(assetStats).sort((a, b) => assetStats[a].pnl - assetStats[b].pnl);
  for (const symbol of sortedAssets) {
    const a = assetStats[symbol];
    const wr = a.count > 0 ? a.wins / a.count : 0;
    const avg = a.count > 0 ? a.pnl / a.count : 0;
    console.log(`${symbol.padEnd(12)}\t${a.count}\t${(wr*100).toFixed(1)}%\t$${a.pnl.toFixed(2)}\t$${avg.toFixed(4)}`);
  }

  // 5. Inspect meta properties of a few losing trades to find active indicators/agent votes
  const losingTrades = closedTrades.filter(t => (t.pnl || 0) < 0).slice(0, 5);
  console.log("\n=== SAMPLE LOSING TRADES META DECOMPOSITION ===");
  losingTrades.forEach((t, i) => {
    console.log(`\nLoss #${i+1}: ${t.symbol} ${t.side} | PnL: $${t.pnl.toFixed(2)} | Reason: ${t.meta?.exitReason || t.meta?.reason || "UNKNOWN"}`);
    console.log(`Entry Meta: ${JSON.stringify(t.meta)}`);
  });

  await mongoose.disconnect();
}

main().catch(console.error);
