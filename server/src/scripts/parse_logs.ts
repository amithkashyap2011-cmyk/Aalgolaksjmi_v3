import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";

const LOG_PATH = new URL("../../auto_trade.log", import.meta.url).pathname;

interface ParsedTrade {
  symbol: string;
  side: string;
  entryTime: string | null;
  entryPrice: number | null;
  signal: string | null;
  confidence: number | null;
  tpPct: number | null;
  slPct: number | null;
  exitTime: string | null;
  exitPrice: number | null;
  pnl: number;
  pnlPct: number;
  reason: string;
  tradeId: string | null;
}

async function main() {
  if (!fs.existsSync(LOG_PATH)) {
    console.error(`Log file not found at ${LOG_PATH}`);
    return;
  }

  const fileStream = fs.createReadStream(LOG_PATH);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const activePositions = new Map<string, any>(); // symbol -> entryInfo
  const closedTrades: ParsedTrade[] = [];

  // Regex patterns
  // 1. Entry log: [2026-06-03T19:04:00.351Z] [PID:42652] [auto] 🚀 SELL XRPUSDT | Price: 1.2181 | Signal: EMA_DOWN+RSI(47)+MACD-+BB-+AI_SHORT(80%)+BLEND- | Conf: 0.80 | TP: 1.75% SL: 0.80% | USDT: 80.72
  const entryRegex = /\[(.*?)\] \[PID:\d+\] \[auto\] 🚀 (BUY|SELL) (\w+) \| Price: ([\d.]+) \| Signal: (.*?) \| Conf: ([\d.]+) \| TP: ([\d.]+)% SL: ([\d.]+)%/;

  // 2. Closed log: [2026-06-03T19:02:56.903Z] [PID:42631] [auto] ✅ CLOSED ADAUSDT | [Trade:6a207669fe5eb09892236219] PnL: $-0.0738 (0.048%) | Reason: AI_REVERSAL
  // Or negative: PnL: $-0.0738 (-0.048%)
  const closedRegex = /\[(.*?)\] \[PID:\d+\] \[auto\] ✅ CLOSED (\w+) \| \[Trade:(\w+)\] PnL: \$([-?\d.]+) \(([-?\d.]+)%\) \| Reason: (.*)/;

  for await (const line of rl) {
    // Check entry
    const entryMatch = line.match(entryRegex);
    if (entryMatch) {
      const [_, timestamp, side, symbol, priceStr, signal, confidenceStr, tpStr, slStr] = entryMatch;
      activePositions.set(symbol, {
        timestamp,
        side,
        price: parseFloat(priceStr),
        signal,
        confidence: parseFloat(confidenceStr),
        tpPct: parseFloat(tpStr) / 100,
        slPct: parseFloat(slStr) / 100,
      });
      continue;
    }

    // Check exit
    const closedMatch = line.match(closedRegex);
    if (closedMatch) {
      const [_, timestamp, symbol, tradeId, pnlStr, pnlPctStr, reason] = closedMatch;
      const entryInfo = activePositions.get(symbol);
      
      const trade: ParsedTrade = {
        symbol,
        side: entryInfo?.side || "UNKNOWN",
        entryTime: entryInfo?.timestamp || null,
        entryPrice: entryInfo?.price || null,
        signal: entryInfo?.signal || null,
        confidence: entryInfo?.confidence || null,
        tpPct: entryInfo?.tpPct || null,
        slPct: entryInfo?.slPct || null,
        exitTime: timestamp,
        exitPrice: null, // Let's estimate exit price if needed, but PnL is main
        pnl: parseFloat(pnlStr),
        pnlPct: parseFloat(pnlPctStr) / 100,
        reason: reason.trim(),
        tradeId,
      };

      closedTrades.push(trade);
      // Remove from active positions
      activePositions.delete(symbol);
    }
  }

  console.log(`=== PARSED LOG AUDIT ===`);
  console.log(`Total Parsed Closed Trades: ${closedTrades.length}`);

  if (closedTrades.length === 0) {
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
    const pnl = t.pnl;
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
    "UNKNOWN": { count: 0, wins: 0, pnl: 0 },
    "0.0-0.3": { count: 0, wins: 0, pnl: 0 },
    "0.3-0.5": { count: 0, wins: 0, pnl: 0 },
    "0.5-0.6": { count: 0, wins: 0, pnl: 0 },
    "0.6-0.7": { count: 0, wins: 0, pnl: 0 },
    "0.7-0.8": { count: 0, wins: 0, pnl: 0 },
    "0.8-0.9": { count: 0, wins: 0, pnl: 0 },
    "0.9-1.0": { count: 0, wins: 0, pnl: 0 },
  };

  for (const t of closedTrades) {
    const confidence = t.confidence;
    const pnl = t.pnl;
    let bin = "UNKNOWN";
    if (confidence !== null) {
      if (confidence >= 0.9) bin = "0.9-1.0";
      else if (confidence >= 0.8) bin = "0.8-0.9";
      else if (confidence >= 0.7) bin = "0.7-0.8";
      else if (confidence >= 0.6) bin = "0.6-0.7";
      else if (confidence >= 0.5) bin = "0.5-0.6";
      else if (confidence >= 0.3) bin = "0.3-0.5";
      else bin = "0.0-0.3";
    }

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
    const reason = t.reason || "UNKNOWN";
    if (!exitReasons[reason]) {
      exitReasons[reason] = { count: 0, wins: 0, pnl: 0 };
    }
    exitReasons[reason].count++;
    exitReasons[reason].pnl += t.pnl;
    if (t.pnl > 0) {
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
    assetStats[symbol].pnl += t.pnl;
    if (t.pnl > 0) {
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

  // 5. Signal Analysis (Identify loss-causing indicators)
  // Let's parse active indicators from signal strings:
  // e.g. "EMA_DOWN+RSI(47)+MACD-+BB-+AI_SHORT(80%)+BLEND-"
  const indStats: Record<string, { count: number; wins: number; pnl: number }> = {};
  for (const t of closedTrades) {
    if (!t.signal) continue;
    const parts = t.signal.split("+");
    for (let part of parts) {
      // Normalize indicator names (remove parameter values like (47) or (80%))
      const normalized = part.replace(/\(\d+%\)|\(\d+\)|[+-]/g, "").trim();
      if (!normalized) continue;
      if (!indStats[normalized]) {
        indStats[normalized] = { count: 0, wins: 0, pnl: 0 };
      }
      indStats[normalized].count++;
      indStats[normalized].pnl += t.pnl;
      if (t.pnl > 0) {
        indStats[normalized].wins++;
      }
    }
  }

  console.log("\n=== INDICATOR PERFORMANCE (EXPECTANCY) ===");
  console.log("Indicator\tTrades\tWinRate\tTotalPnL\tAvgPnL");
  const sortedInds = Object.keys(indStats).sort((a, b) => indStats[a].pnl - indStats[b].pnl);
  for (const ind of sortedInds) {
    const i = indStats[ind];
    const wr = i.count > 0 ? i.wins / i.count : 0;
    const avg = i.count > 0 ? i.pnl / i.count : 0;
    console.log(`${ind.padEnd(15)}\t${i.count}\t${(wr*100).toFixed(1)}%\t$${i.pnl.toFixed(2)}\t$${avg.toFixed(4)}`);
  }
}

main().catch(console.error);
