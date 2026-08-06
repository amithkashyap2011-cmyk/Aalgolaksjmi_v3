const fs = require('fs');
const trades = JSON.parse(fs.readFileSync('ALL_TRADES_AUDIT.json', 'utf8'));
const breakdown = {};

trades.forEach(t => {
    const s = t.strategy || 'Unknown';
    if (!breakdown[s]) breakdown[s] = { count: 0, pnl: 0, trades: [] };
    breakdown[s].count++;
    breakdown[s].pnl += (t.netPnl || 0);
    breakdown[s].trades.push({
        id: t._id.$oid || t._id,
        symbol: t.symbol,
        entry: t.openedAt?.$date || t.openedAt,
        exit: t.closedAt?.$date || t.closedAt,
        pnl: t.netPnl
    });
});

let md = '# STRATEGY PnL BREAKDOWN\n\n';
Object.keys(breakdown).sort().forEach(s => {
    md += `## ${s}\n`;
    md += `Trades: ${breakdown[s].count}\n`;
    md += `PnL: $${breakdown[s].pnl.toFixed(2)}\n\n`;
    md += '| Trade ID | Symbol | Entry | Exit | PnL |\n';
    md += '| :--- | :--- | :--- | :--- | :--- |\n';
    breakdown[s].trades.forEach(tr => {
        md += `| ${tr.id} | ${tr.symbol} | ${tr.entry} | ${tr.exit} | $${(tr.pnl || 0).toFixed(2)} |\n`;
    });
    md += '\n';
});
fs.writeFileSync('STRATEGY_PNL_BREAKDOWN.md', md);
console.log('STRATEGY_PNL_BREAKDOWN.md generated.');
