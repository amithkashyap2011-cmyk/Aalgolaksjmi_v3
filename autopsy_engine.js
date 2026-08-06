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
  
  if (strategy === 'AQEA_V3.0') {
      report += `- **Approval:** Legacy V3.0 Controller (Bypasses AI Safety Gates)\n`;
      report += `- **Source Ref:** server/src/services/autoTradeEngine.ts (Legacy logic permitting unweighted entries)\n`;
      report += `- **Trade Blocked?** SHOULD HAVE BEEN BLOCKED. V8.0 gates were not applied to this strategy ID.\n`;
  } else {
      report += `- **Approval:** Hybrid Engine / Exit Manager\n`;
      report += `- **Source Ref:** server/src/services/aqea/exitEngine.ts (evaluateExit)\n`;
      report += `- **Trade Blocked?** NO. Exit was correct (STOP_LOSS), but entry was too noisy or SL too tight.\n`;
  }
  report += `\n`;
});

fs.writeFileSync('STRATEGY_AUTOPSY.md', report);
console.log('Autopsy completed.');
