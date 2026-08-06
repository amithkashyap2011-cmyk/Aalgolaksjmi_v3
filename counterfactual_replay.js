const fs = require('fs');

const raw = fs.readFileSync('last_1000_trades.json', 'utf8');
const jsCode = raw.replace(/ObjectId\('([^']+)'\)/g, '"$1"').replace(/ISODate\('([^']+)'\)/g, '"$1"');
let trades;
eval(`trades = ${jsCode}`);

function isMatch(decision, side) {
    if (!decision) return false;
    if (decision === 'LONG' && side === 'BUY') return true;
    if (decision === 'SHORT' && side === 'SELL') return true;
    return false;
}

function evaluateSubset(filterFn, name) {
    let wins = 0;
    let losses = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    
    let filteredTrades = trades.filter(filterFn);
    
    filteredTrades.forEach(t => {
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
    const pf = grossLoss > 0 ? grossProfit / grossLoss : Infinity;
    const expectancy = (grossProfit - grossLoss) / total;

    return { name, wr: (wr * 100).toFixed(2) + "%", pf: pf.toFixed(2), expectancy: expectancy.toFixed(4), count: total };
}

const results = [];

// Baseline
results.push(evaluateSubset(() => true, "Baseline"));

// No CNN
results.push(evaluateSubset(t => !isMatch(t.meta?.aqea?.cnnDecision, t.side), "No CNN"));

// No PPO
results.push(evaluateSubset(t => !isMatch(t.meta?.aqea?.ppoDecision, t.side), "No PPO"));

// No Transformer
results.push(evaluateSubset(t => !isMatch(t.meta?.aqea?.transformerDecision, t.side), "No Transformer"));

// No Ensemble
results.push(evaluateSubset(t => {
    // Ensemble active if multiple models agree
    const cnn = isMatch(t.meta?.aqea?.cnnDecision, t.side) ? 1 : 0;
    const ppo = isMatch(t.meta?.aqea?.ppoDecision, t.side) ? 1 : 0;
    const trans = isMatch(t.meta?.aqea?.transformerDecision, t.side) ? 1 : 0;
    return (cnn + ppo + trans) < 2; 
}, "No Ensemble"));

// No Regime Filter
results.push(evaluateSubset(t => !t.meta?.aqea?.regime || t.meta.aqea.regime === 'UNKNOWN', "No Regime Filter"));

// No Risk Scaling (assuming risk scaling is size > threshold)
results.push(evaluateSubset(t => t.quantity < 1.0, "No Risk Scaling"));

console.table(results);
