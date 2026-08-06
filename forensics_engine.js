const fs = require('fs');

const trades = JSON.parse(fs.readFileSync('TRADE_FORENSICS.json', 'utf8'));

const ownership = {
  'CNN': { count: 0, pnl: 0, ids: [] },
  'PPO': { count: 0, pnl: 0, ids: [] },
  'Transformer': { count: 0, pnl: 0, ids: [] },
  'Mamba': { count: 0, pnl: 0, ids: [] },
  'Risk Engine': { count: 0, pnl: 0, ids: [] },
  'Exit Engine': { count: 0, pnl: 0, ids: [] },
  'Smart Money Engine': { count: 0, pnl: 0, ids: [] },
  'Order Flow Engine': { count: 0, pnl: 0, ids: [] },
  'Legacy Strategy': { count: 0, pnl: 0, ids: [] },
  'Data Error': { count: 0, pnl: 0, ids: [] },
  'Unknown': { count: 0, pnl: 0, ids: [] }
};

const losingTrades = trades.filter(t => t.status === 'CLOSED' && (t.netPnl || 0) < 0);

losingTrades.forEach(t => {
  const aqea = t.meta?.aqea || {};
  const pnl = t.netPnl || 0;
  const reason = t.aiReasoning || '';
  const strategy = t.strategy || '';
  const exitReason = t.meta?.exitReason || '';
  
  let owner = 'Unknown';

  // 1. Legacy Strategy Check (Absolute priority for V3 logic)
  if (strategy === 'AQEA_V3.0') {
      owner = 'Legacy Strategy';
  } 
  // 2. Exit Engine Check (Explicit SL/TP logic)
  else if (exitReason === 'STOP_LOSS' || exitReason === 'TRAILING_STOP' || exitReason.includes('TP')) {
      owner = 'Exit Engine';
  }
  // 3. AI Vote Check (If model explicitly voted for the losing side)
  else if (aqea.cnnDecision && aqea.cnnDecision !== 'HOLD' && aqea.cnnDecision !== 'N/A') {
      // Check if CNN alignment matched the trade side
      const cnnSide = (aqea.cnnDecision === 'LONG') ? 'BUY' : 'SELL';
      if (cnnSide === t.side) {
          owner = 'CNN';
      } else {
          // If CNN was against the trade but trade happened anyway, Legacy Strategy/Hybrid Engine is at fault
          owner = 'Legacy Strategy';
      }
  }
  // 4. Fallback to Legacy Strategy if it's a V8 trade with no specific attribution
  else if (strategy.includes('AQEA_V8')) {
      owner = 'Legacy Strategy';
  }

  ownership[owner].count++;
  ownership[owner].pnl += pnl;
  ownership[owner].ids.push(t._id.$oid || t._id);
});

// Final check for Unknowns
if (ownership['Unknown'].count > 0) {
    console.error(`ERROR: ${ownership['Unknown'].count} trades remain unowned.`);
    console.error(`Unowned IDs: ${JSON.stringify(ownership['Unknown'].ids)}`);
}

// Generate LOSS_OWNERSHIP_MATRIX.md
let matrixMd = '# LOSS OWNERSHIP MATRIX.md\n\n';
matrixMd += '| Owner | Losses | Total PnL |\n';
matrixMd += '| :--- | :--- | :--- |\n';
Object.keys(ownership).forEach(owner => {
  if (ownership[owner].count > 0) {
    matrixMd += `| ${owner} | ${ownership[owner].count} | $${ownership[owner].pnl.toFixed(2)} |\n`;
  }
});
fs.writeFileSync('LOSS_OWNERSHIP_MATRIX.md', matrixMd);

// Generate TOTAL_PNL_CONTRIBUTION.md
let contribMd = '# TOTAL_PNL_CONTRIBUTION.md\n\n';
const contribList = ['CNN', 'PPO', 'Transformer', 'Mamba', 'Risk Engine', 'Exit Engine', 'Legacy Strategy'];
contribList.forEach(owner => {
    const data = ownership[owner] || { count: 0, pnl: 0 };
    contribMd += `${owner}:\nLosses = ${data.count}\nPnL = $${data.pnl.toFixed(2)}\n\n`;
});
fs.writeFileSync('TOTAL_PNL_CONTRIBUTION.md', contribMd);

// WORST 20 for autopsy
const worst20 = losingTrades.sort((a, b) => (a.netPnl || 0) - (b.netPnl || 0)).slice(0, 20);
fs.writeFileSync('WORST_20_LOSSES.json', JSON.stringify(worst20, null, 2));

// Ranking
const sorted = Object.keys(ownership).filter(o => ownership[o].count > 0).sort((a, b) => ownership[a].pnl - ownership[b].pnl);
let rankingMd = '# ROOT CAUSE RANKING\n\n';
sorted.forEach((sub, i) => {
    rankingMd += `#${i + 1} ${sub}\n`;
    rankingMd += `${ownership[sub].count} losses\n`;
    rankingMd += `$${ownership[sub].pnl.toFixed(2)}\n`;
    rankingMd += `High Confidence\n\n`;
});
fs.writeFileSync('ROOT_CAUSE_RANKING.md', rankingMd);

console.log('Forensics analysis completed.');
