const fs = require('fs');

const raw = fs.readFileSync('last_1000_trades.json', 'utf8');

try {
  let trades;
  // Make string replacements to handle Mongo export syntax
  const jsCode = raw
    .replace(/ObjectId\('([^']+)'\)/g, '"$1"')
    .replace(/ISODate\('([^']+)'\)/g, '"$1"');
  
  eval(`trades = ${jsCode}`);

  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let expectedPnL = 0;
  let actualPnL = 0;
  let falseSignals = 0;
  let lateEntries = 0;
  let badSl = 0;

  const failureReasons = {};

  trades.forEach(t => {
    if (t.pnl > 0) {
      wins++;
      grossProfit += t.pnl;
    } else if (t.pnl < 0) {
      losses++;
      grossLoss += Math.abs(t.pnl);
    }
    
    actualPnL += t.pnl || 0;

    const reason = t.meta && t.meta.exitReason ? t.meta.exitReason : "UNKNOWN";
    failureReasons[reason] = (failureReasons[reason] || 0) + 1;
    
    // Evaluate SL logic errors
    if (t.side === 'BUY') {
      if (t.sl >= t.entryPrice) badSl++;
    } else if (t.side === 'SELL') {
      if (t.sl <= t.entryPrice) badSl++;
    }
    
    // Evaluate false signals
    if (t.meta && t.meta.aqea && t.meta.aqea.finalScore < 50 && t.pnl < 0) {
       falseSignals++;
    }
    
    // Fee / Slippage drag
    if (t.feeCost > Math.abs(t.grossPnl || 0)) {
        failureReasons["FEES_EXCEED_GROSS"] = (failureReasons["FEES_EXCEED_GROSS"] || 0) + 1;
    }
  });

  const wr = (wins / trades.length) * 100;
  const pf = grossLoss > 0 ? grossProfit / grossLoss : Infinity;

  console.log(`Total Trades: ${trades.length}`);
  console.log(`Win Rate: ${wr.toFixed(2)}%`);
  console.log(`Profit Factor: ${pf.toFixed(2)}`);
  console.log(`Gross Profit: ${grossProfit.toFixed(2)}`);
  console.log(`Gross Loss: ${grossLoss.toFixed(2)}`);
  console.log(`Net PnL: ${actualPnL.toFixed(2)}`);
  console.log(`Bad SL Configs: ${badSl}`);
  console.log(`False Signals (Score < 50 but traded): ${falseSignals}`);
  console.log("\nExit Reasons:");
  console.table(failureReasons);
  
} catch(e) {
  console.error("Error evaluating:", e);
}
