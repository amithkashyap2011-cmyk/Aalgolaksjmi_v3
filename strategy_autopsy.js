const fs = require('fs');

const worst20 = JSON.parse(fs.readFileSync('WORST_20_LOSSES.json', 'utf8'));

let report = '# STRATEGY AUTOPSY: WORST 20 LOSSES\n\n';

worst20.forEach((t, i) => {
  const aqea = t.meta?.aqea || {};
  const reason = t.meta?.exitReason || t.aiReasoning || 'Unknown';
  const strategy = t.strategy || 'Unknown';
  
  report += `### #${i + 1} ${t.symbol} (${t.side}) - PnL: $${(t.netPnl || 0).toFixed(2)}\n`;
  report += `- **Strategy:** ${strategy}\n`;
  report += `- **Entry Reason:** ${t.aiReasoning || 'N/A'}\n`;
  report += `- **Exit Reason:** ${reason}\n`;
  report += `- **Model Votes:** CNN=${aqea.cnnDecision || 'N/A'}, PPO=${aqea.ppoDecision || 'N/A'}\n`;
  report += `- **Approval:** ${strategy === 'AQEA_V3.0' ? 'Legacy Logic' : 'Hybrid Engine'}\n`;
  
  // Autopsy logic
  if (strategy === 'AQEA_V3.0') {
      report += `- **Analysis:** This was a legacy trade. It followed V3 logic which lacked modern AI gating. Should have been blocked by V8 gates.\n`;
  } else if (reason.includes('STOP_LOSS')) {
      report += `- **Analysis:** Exit triggered by Exit Engine (STOP_LOSS). SL was set too tight or market reversed sharply.\n`;
  } else {
      report += `- **Analysis:** Source of loss unidentified in current meta data.\n`;
  }
  report += `\n`;
});

fs.writeFileSync('STRATEGY_AUTOPSY.md', report);
console.log('Autopsy complete.');
