const fs = require('fs');

const trades = JSON.parse(fs.readFileSync('TRADE_FORENSICS.json', 'utf8'));
const losingTrades = trades.filter(t => t.status === 'CLOSED' && (t.netPnl || 0) < 0);

const ranking = {
  'Legacy Strategy': { count: 0, pnl: 0 },
  'Exit Engine': { count: 0, pnl: 0 },
  'CNN': { count: 0, pnl: 0 },
  'Unknown': { count: 0, pnl: 0 }
};

losingTrades.forEach(t => {
  const aqea = t.meta?.aqea || {};
  const pnl = t.netPnl || 0;
  const reason = t.aiReasoning || '';
  const strategy = t.strategy || '';

  let subsystem = 'Unknown';
  if (strategy === 'AQEA_V3.0') subsystem = 'Legacy Strategy';
  else if (reason.includes('SL') || reason.includes('ATR') || t.meta?.exitReason === 'STOP_LOSS') subsystem = 'Exit Engine';
  else if (aqea.cnnDecision && aqea.cnnDecision !== 'HOLD') subsystem = 'CNN';

  ranking[subsystem].count++;
  ranking[subsystem].pnl += pnl;
});

const sorted = Object.keys(ranking).sort((a, b) => ranking[a].pnl - ranking[b].pnl);

let report = '# ROOT CAUSE RANKING\n\n';
sorted.forEach((sub, i) => {
    report += `#${i + 1} ${sub}\n`;
    report += `${ranking[sub].count} losses\n`;
    report += `$${ranking[sub].pnl.toFixed(2)}\n`;
    report += `High Confidence\n\n`;
});

fs.writeFileSync('ROOT_CAUSE_RANKING.md', report);
console.log('Ranking complete.');
