const fs = require('fs');

const raw = fs.readFileSync('last_1000_trades.json', 'utf8');
const jsCode = raw.replace(/ObjectId\('([^']+)'\)/g, '"$1"').replace(/ISODate\('([^']+)'\)/g, '"$1"');
let trades;
eval(`trades = ${jsCode}`);

function analyze(subset, name) {
    let wins = 0;
    let losses = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    
    subset.forEach(t => {
        let pnl = t.pnl || 0;
        if (pnl > 0) {
            wins++;
            grossProfit += pnl;
        } else if (pnl < 0) {
            losses++;
            grossLoss += Math.abs(pnl);
        }
    });

    const total = wins + losses;
    if (total === 0) return { name, wr: 0, pf: 0, expectancy: 0, count: 0 };
    
    const wr = wins / total;
    const pf = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);
    const expectancy = (grossProfit - grossLoss) / total;

    return { 
        name, 
        wr: parseFloat((wr * 100).toFixed(2)), 
        pf: parseFloat(pf.toFixed(2)), 
        expectancy: parseFloat(expectancy.toFixed(4)), 
        count: total 
    };
}

console.log("Overall:", analyze(trades, "All"));
console.log("Only BUYs:", analyze(trades.filter(t => t.side === 'BUY'), "BUY"));
console.log("Only SELLs:", analyze(trades.filter(t => t.side === 'SELL'), "SELL"));

console.log("Score > 50:", analyze(trades.filter(t => t.meta?.aqea?.finalScore > 50), "Score > 50"));
console.log("Score < 40:", analyze(trades.filter(t => t.meta?.aqea?.finalScore < 40), "Score < 40"));

let correctedTrades = trades.map(t => {
    let newT = {...t};
    const reason = t.meta?.exitReason || "";
    if (t.side === 'SELL' && (reason === 'STOP_LOSS' || reason === 'TP3_HIT')) {
        if (t.pnl < 0) {
            // Give it a synthetic win to see if the underlying signal had edge
            newT.pnl = Math.abs(t.pnl) * 1.5; 
        }
    }
    return newT;
});

console.log("Simulated Corrected SL/TP:", analyze(correctedTrades, "Corrected"));
