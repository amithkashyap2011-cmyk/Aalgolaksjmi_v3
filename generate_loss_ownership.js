const fs = require('fs');

const trades = JSON.parse(fs.readFileSync('TRADE_FORENSICS.json', 'utf8'));

const ownership = {
  'CNN': { count: 0, pnl: 0 },
  'PPO': { count: 0, pnl: 0 },
  'Transformer': { count: 0, pnl: 0 },
  'Mamba': { count: 0, pnl: 0 },
  'Risk Engine': { count: 0, pnl: 0 },
  'Exit Engine': { count: 0, pnl: 0 },
  'Smart Money Engine': { count: 0, pnl: 0 },
  'Order Flow Engine': { count: 0, pnl: 0 },
  'Legacy Strategy': { count: 0, pnl: 0 },
  'Data Error': { count: 0, pnl: 0 },
  'Unknown': { count: 0, pnl: 0 }
};

const losingTrades = trades.filter(t => t.status === 'CLOSED' && (t.netPnl || 0) < 0);

losingTrades.forEach(t => {
  const aqea = t.meta?.aqea || {};
  const pnl = t.netPnl || 0;
  const reason = t.aiReasoning || '';
  
  let owner = 'Unknown';

  // Ownership Logic
  if (reason.includes('SL') || reason.includes('ATR')) {
      owner = 'Exit Engine';
  } else if (reason.includes('RISK') || reason.includes('BREACH')) {
      owner = 'Risk Engine';
  } else if (aqea.cnnDecision && aqea.cnnDecision !== 'HOLD' && aqea.cnnDecision !== 'N/A') {
      owner = 'CNN';
  } else if (aqea.ppoDecision && aqea.ppoDecision !== 'HOLD' && aqea.ppoDecision !== 'N/A') {
      owner = 'PPO';
  } else if (t.strategy && (t.strategy.includes('AQEA_V8') || t.strategy.includes('legacy'))) {
      owner = 'Legacy Strategy';
  }

  ownership[owner].count++;
  ownership[owner].pnl += pnl;
});

let matrixMd = '# LOSS OWNERSHIP MATRIX.md\n\n';
matrixMd += '| Owner | Losses | Total PnL |\n';
matrixMd += '| :--- | :--- | :--- |\n';

Object.keys(ownership).forEach(owner => {
  if (ownership[owner].count > 0) {
    matrixMd += `| ${owner} | ${ownership[owner].count} | $${ownership[owner].pnl.toFixed(2)} |\n`;
  }
});

fs.writeFileSync('LOSS_OWNERSHIP_MATRIX.md', matrixMd);

let contribMd = '# TOTAL_PNL_CONTRIBUTION.md\n\n';
Object.keys(ownership).forEach(owner => {
  if (ownership[owner].count > 0) {
    contribMd += `${owner}:\nLosses = ${ownership[owner].count}\nPnL = $${ownership[owner].pnl.toFixed(2)}\n\n`;
  }
});

fs.writeFileSync('TOTAL_PNL_CONTRIBUTION.md', contribMd);

// Strategy Autopsy: Worst 20
const worst20 = losingTrades.sort((a, b) => (a.netPnl || 0) - (b.netPnl || 0)).slice(0, 20);
fs.writeFileSync('WORST_20_LOSSES.json', JSON.stringify(worst20, null, 2));

console.log('Forensics complete.');
