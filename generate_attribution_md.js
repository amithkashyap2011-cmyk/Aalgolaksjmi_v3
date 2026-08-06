const fs = require('fs');

const trades = JSON.parse(fs.readFileSync('all_trades.json', 'utf8'));

let report = `# AI ATTRIBUTION REPORT\n\n`;
report += `**AQEA V21 — EVIDENCE-BASED MODEL PERFORMANCE**\n\n`;
report += `| Trade ID | Symbol | Side | PnL | CNN | PPO | Transformer | Mamba | Final Score |\n`;
report += `|---|---|---|---|---|---|---|---|---|\n`;

trades.forEach(t => {
  const aqea = t.meta?.aqea || {};
  const pnl = (t.netPnl || 0).toFixed(2);
  const cnn = aqea.cnnDecision || 'N/A';
  const ppo = aqea.ppoDecision || 'N/A';
  const trm = aqea.transformerDecision || 'N/A';
  const mam = aqea.mambaDecision || 'N/A';
  const score = aqea.finalScore || 'N/A';
  
  if (Object.keys(aqea).length > 0) {
      const id = t._id.$oid || t._id;
      report += `| ${id} | ${t.symbol} | ${t.side} | ${pnl} | ${cnn} | ${ppo} | ${trm} | ${mam} | ${score} |\n`;
  }
});

fs.writeFileSync('AI_ATTRIBUTION_REPORT.md', report);
console.log('AI_ATTRIBUTION_REPORT.md generated.');
