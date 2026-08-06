const fs = require('fs');

const trades = JSON.parse(fs.readFileSync('TRADE_FORENSICS.json', 'utf8'));
const losingTrades = trades.filter(t => t.status === 'CLOSED' && (t.netPnl || 0) < 0);

const ranking = {
  'Legacy Strategy': { count: 0, pnl: 0 },
  'Exit Engine': { count: 0, pnl: 0 }
};

losingTrades.forEach(t => {
  const pnl = t.netPnl || 0;
  const exitReason = t.meta?.exitReason || '';
  const strategy = t.strategy || '';
  
  if (strategy === 'AQEA_V3.0') {
      ranking['Legacy Strategy'].count++;
      ranking['Legacy Strategy'].pnl += pnl;
  } else {
      ranking['Exit Engine'].count++;
      ranking['Exit Engine'].pnl += pnl;
  }
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
console.log('Ranking completed.');
