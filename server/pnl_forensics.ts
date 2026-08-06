import fs from "node:fs";
import readline from "node:readline";

const LOG_PATH = "server/auto_trade.log";

interface Trade {
    symbol: string;
    side: string;
    entryTime: Date;
    entryPrice: number;
    signal: string;
    confidence: number;
    exitTime: Date | null;
    exitPrice: number | null;
    pnl: number;
    pnlPct: number;
    reason: string;
    tradeId: string;
}

async function runForensics() {
    const fileStream = fs.createReadStream(LOG_PATH);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    const activePositions = new Map<string, any>();
    const closedTrades: Trade[] = [];

    const entryRegex = /\[(.*?)\] \[PID:\d+\] \[auto\] 🚀 (BUY|SELL) (\w+) \| Price: ([\d.]+) \| Signal: (.*?) \| Conf: ([\d.]+) \| TP: ([\d.]+)% SL: ([\d.]+)%/;
    const closedRegex = /\[(.*?)\] \[PID:\d+\] \[auto\] ✅ CLOSED (\w+) \| \[Trade:(\w+)\] PnL: \$([-?\d.]+) \(([-?\d.]+)%\) \| Reason: (.*)/;

    for await (const line of rl) {
        const entryMatch = line.match(entryRegex);
        if (entryMatch) {
            const [_, timestamp, side, symbol, price, signal, confidence] = entryMatch;
            activePositions.set(symbol, {
                entryTime: new Date(timestamp),
                side,
                entryPrice: parseFloat(price),
                signal,
                confidence: parseFloat(confidence)
            });
            continue;
        }

        const closedMatch = line.match(closedRegex);
        if (closedMatch) {
            const [_, timestamp, symbol, tradeId, pnl, pnlPct, reason] = closedMatch;
            const entryInfo = activePositions.get(symbol);
            
            closedTrades.push({
                symbol,
                tradeId,
                side: entryInfo?.side || "UNKNOWN",
                entryTime: entryInfo?.entryTime || new Date(timestamp),
                entryPrice: entryInfo?.entryPrice || 0,
                signal: entryInfo?.signal || "UNKNOWN",
                confidence: entryInfo?.confidence || 0,
                exitTime: new Date(timestamp),
                exitPrice: 0, // Not explicitly in log but PnL is enough
                pnl: parseFloat(pnl),
                pnlPct: parseFloat(pnlPct) / 100,
                reason: reason.trim()
            });
            activePositions.delete(symbol);
        }
    }

    console.log(`\n=== AQEA PRODUCTION PNL FORENSICS REPORT ===\n`);

    // Phase 2: Core Metrics
    const totalTrades = closedTrades.length;
    const winners = closedTrades.filter(t => t.pnl > 0);
    const losers = closedTrades.filter(t => t.pnl <= 0);
    const winRate = (winners.length / totalTrades) * 100;
    
    const grossProfit = winners.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss === 0 ? 0 : grossProfit / grossLoss;
    
    const avgWin = winners.length === 0 ? 0 : grossProfit / winners.length;
    const avgLoss = losers.length === 0 ? 0 : grossLoss / losers.length;
    const expectancy = (winRate / 100 * avgWin) - ((1 - winRate / 100) * avgLoss);

    // Max Drawdown Calculation
    let balance = 0;
    let peak = 0;
    let maxDD = 0;
    const equityCurve = closedTrades.map(t => {
        balance += t.pnl;
        if (balance > peak) peak = balance;
        const dd = peak - balance;
        if (dd > maxDD) maxDD = dd;
        return balance;
    });

    console.log(`[PHASE 2: AGGREGATE PERFORMANCE]`);
    console.log(`TOTAL_TRADES:        ${totalTrades}`);
    console.log(`WIN_RATE:            ${winRate.toFixed(2)}%`);
    console.log(`PROFIT_FACTOR:       ${profitFactor.toFixed(4)}`);
    console.log(`AVERAGE_WIN:         $${avgWin.toFixed(2)}`);
    console.log(`AVERAGE_LOSS:        $${avgLoss.toFixed(2)}`);
    console.log(`EXPECTANCY:          $${expectancy.toFixed(4)}`);
    console.log(`MAX_DRAWDOWN (PNL):  $${maxDD.toFixed(2)}`);
    console.log(`NET_PNL:             $${balance.toFixed(2)}`);

    // Phase 3: Exit Reasons
    const reasonStats: Record<string, { count: number, pnl: number }> = {};
    closedTrades.forEach(t => {
        const r = t.reason.split(' ')[0]; // Simplify reasons like "STOP_LOSS (0.35%)"
        if (!reasonStats[r]) reasonStats[r] = { count: 0, pnl: 0 };
        reasonStats[r].count++;
        reasonStats[r].pnl += t.pnl;
    });

    console.log(`\n[PHASE 3: EXIT REASONS]`);
    console.log(`Reason\t\tCount\tNet PnL\t\tAvg PnL`);
    Object.entries(reasonStats).sort((a, b) => a[1].pnl - b[1].pnl).forEach(([r, s]) => {
        console.log(`${r.padEnd(15)}\t${s.count}\t$${s.pnl.toFixed(2)}\t$${(s.pnl/s.count).toFixed(4)}`);
    });

    // Phase 4: Strategy Ranking
    const strategyStats: Record<string, { count: number, wins: number, pnl: number }> = {};
    closedTrades.forEach(t => {
        const s = t.signal;
        if (!strategyStats[s]) strategyStats[s] = { count: 0, wins: 0, pnl: 0 };
        strategyStats[s].count++;
        if (t.pnl > 0) strategyStats[s].wins++;
        strategyStats[s].pnl += t.pnl;
    });

    console.log(`\n[PHASE 4: STRATEGY RANKING (TOP 10)]`);
    console.log(`Strategy\t\tCount\tWinRate\tNet PnL`);
    Object.entries(strategyStats)
        .sort((a, b) => b[1].pnl - a[1].pnl)
        .slice(0, 10)
        .forEach(([s, st]) => {
            const wr = (st.wins / st.count) * 100;
            console.log(`${s.substring(0, 20).padEnd(20)}\t${st.count}\t${wr.toFixed(1)}%\t$${st.pnl.toFixed(2)}`);
        });

    // Phase 5: Worst Offenders
    console.log(`\n[PHASE 5: WORST OFFENDERS]`);
    
    console.log(`\nTOP 10 LOSING SYMBOLS:`);
    const symbolStats: Record<string, number> = {};
    closedTrades.forEach(t => {
        symbolStats[t.symbol] = (symbolStats[t.symbol] || 0) + t.pnl;
    });
    Object.entries(symbolStats)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 10)
        .forEach(([sym, pnl]) => console.log(`${sym.padEnd(12)}: $${pnl.toFixed(2)}`));

    console.log(`\nTOP 10 LARGEST LOSSES:`);
    closedTrades.sort((a, b) => a.pnl - b.pnl)
        .slice(0, 10)
        .forEach(t => console.log(`${t.symbol.padEnd(12)}: $${t.pnl.toFixed(2)} (${t.reason})`));

    // Phase 6: Root Cause Insights
    console.log(`\n[PHASE 6: ROOT CAUSE ANALYSIS]`);
    const slLosses = reasonStats['STOP_LOSS']?.pnl || 0;
    const totalLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnl, 0));
    console.log(`1. Stop Loss accounts for ${(Math.abs(slLosses)/totalLoss*100).toFixed(1)}% of all losses.`);
    
    const volatileAssets = ['DOGEUSDT', 'SHIBUSDT'];
    const volatilePnL = volatileAssets.reduce((sum, sym) => sum + (symbolStats[sym] || 0), 0);
    console.log(`2. Volatile Memecoins (DOGE/SHIB) account for ${((volatilePnL/balance)*100).toFixed(1)}% of total net loss.`);
    
    const highConfLoses = closedTrades.filter(t => t.confidence >= 0.8 && t.pnl < 0).length;
    const highConfTotal = closedTrades.filter(t => t.confidence >= 0.8).length;
    console.log(`3. High Confidence (>= 0.8) Failure Rate: ${(highConfLoses/highConfTotal*100).toFixed(1)}%`);
}

runForensics().catch(console.error);
