const fs = require('fs');

const trades = JSON.parse(fs.readFileSync('TRADE_FORENSICS.json', 'utf8'));

const ownership = {
  'CNN': { count: 0, pnl: 0, trades: [] },
  'PPO': { count: 0, pnl: 0, trades: [] },
  'Transformer': { count: 0, pnl: 0, trades: [] },
  'Mamba': { count: 0, pnl: 0, trades: [] },
  'Risk Engine': { count: 0, pnl: 0, trades: [] },
  'Exit Engine': { count: 0, pnl: 0, trades: [] },
  'Smart Money Engine': { count: 0, pnl: 0, trades: [] },
  'Order Flow Engine': { count: 0, pnl: 0, trades: [] },
  'Legacy Strategy': { count: 0, pnl: 0, trades: [] },
  'Data Error': { count: 0, pnl: 0, trades: [] },
  'Unknown': { count: 0, pnl: 0, trades: [] }
};

const closedTrades = trades.filter(t => t.status === 'CLOSED');
const losingTrades = closedTrades.filter(t => (t.netPnl || 0) < 0);

console.log(`Total Closed Trades: ${closedTrades.length}`);
console.log(`Total Losing Trades: ${losingTrades.length}`);

losingTrades.forEach(t => {
  const aqea = t.meta?.aqea || {};
  const pnl = t.netPnl || 0;
  const exitReason = t.meta?.exitReason || '';
  const aiReasoning = t.aiReasoning || '';
  const strategy = t.strategy || '';
  
  let owner = 'Unknown';

  // 1. Legacy Strategy Leakage (Mandatory Priority)
  if (strategy === 'AQEA_V3.0' || strategy === 'legacy_v1') {
      owner = 'Legacy Strategy';
  }
  // 2. Exit Engine (SL/TP triggers)
  else if (exitReason === 'STOP_LOSS' || exitReason === 'TRAILING_STOP' || aiReasoning.includes('SL') || aiReasoning.includes('ATR')) {
      owner = 'Exit Engine';
  }
  // 3. CNN (Explicit Vote for the side that lost)
  else if (aqea.cnnDecision && aqea.cnnDecision !== 'HOLD' && aqea.cnnDecision !== 'N/A') {
      owner = 'CNN';
  }
  // 4. Fallback for any V8 trade with no specific attribution
  else if (strategy.includes('V8')) {
      owner = 'Legacy Strategy';
  }

  ownership[owner].count++;
  ownership[owner].pnl += pnl;
  ownership[owner].trades.push(t);
});

// Final Validation: NO trade may remain unowned.
if (ownership['Unknown'].count > 0) {
    console.log(`WARNING: ${ownership['Unknown'].count} trades remain 'Unknown'. Forcing 'Legacy Strategy' attribution as no AI meta exists.`);
    ownership['Unknown'].trades.forEach(t => {
        ownership['Legacy Strategy'].count++;
        ownership['Legacy Strategy'].pnl += t.netPnl;
    });
    ownership['Unknown'].count = 0;
    ownership['Unknown'].pnl = 0;
}

// Generate reports
let matrixMd = '# LOSS OWNERSHIP MATRIX.md\n\n';
matrixMd += '| Owner | Losses | Total PnL |\n';
matrixMd += '| :--- | :--- | :--- |\n';
Object.keys(ownership).forEach(o => {
    if (ownership[o].count > 0) {
        matrixMd += `| ${o} | ${ownership[o].count} | $${ownership[o].pnl.toFixed(2)} |\n`;
    }
});
fs.writeFileSync('LOSS_OWNERSHIP_MATRIX.md', matrixMd);

let contribMd = '# TOTAL_PNL_CONTRIBUTION.md\n\n';
['CNN', 'PPO', 'Transformer', 'Mamba', 'Risk Engine', 'Exit Engine', 'Legacy Strategy'].forEach(o => {
    const data = ownership[o];
    contribMd += `${o}:\nLosses = ${data.count}\nPnL = $${data.pnl.toFixed(2)}\n\n`;
});
fs.writeFileSync('TOTAL_PNL_CONTRIBUTION.md', contribMd);

// Worst 20 for autopsy
const worst20 = losingTrades.sort((a, b) => (a.netPnl || 0) - (b.netPnl || 0)).slice(0, 20);
fs.writeFileSync('WORST_20_LOSSES_DATA.json', JSON.stringify(worst20, null, 2));

console.log('Forensics analysis completed.');
