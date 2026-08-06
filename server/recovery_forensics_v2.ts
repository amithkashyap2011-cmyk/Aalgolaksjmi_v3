import fs from "node:fs";
import readline from "node:readline";

const LOG_PATH = "server/auto_trade.log";

interface TradeInfo {
    symbol: string;
    side: string;
    entryTime: Date;
    entryPrice: number;
    signal: string;
    confidence: number;
    tpPct: number;
    slPct: number;
    allocatedUsdt: number;
}

interface ClosedTrade extends TradeInfo {
    exitTime: Date;
    exitPrice: number;
    pnl: number;
    pnlPct: number;
    reason: string;
    tradeId: string;
    leverage: number;
}

async function runRecoveryForensics() {
    const fileStream = fs.createReadStream(LOG_PATH);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    const activePositions = new Map<string, TradeInfo>();
    const closedTrades: ClosedTrade[] = [];

    // [2026-05-02T04:21:19.344Z] [PID:65577] [auto] 🚀 BUY BTCUSDT | Price: 78285.48 | Signal: RSI(44)+AI_LONG(89%)+HTF+BLEND+ | Conf: 0.60 | TP: 0.80% SL: 0.35% | USDT: 100.00
    const entryRegex = /\[(.*?)\] \[PID:\d+\] \[auto\] 🚀 (BUY|SELL) (\w+) \| Price: ([\d.]+) \| Signal: (.*?) \| Conf: ([\d.]+) \| TP: ([\d.]+)% SL: ([\d.]+)% \| USDT: ([\d.]+)/;
    
    // [2026-06-08T10:01:53.881Z] [PID:63253] [auto] 💰 CLOSE DOGEUSDT | [Trade:6a268c1b7954a6c9305d24ab] Price: 0.08586 | Entry: 0.08555 | PnL: 0.362% | Reason: AI_REVERSAL_RL
    const preCloseRegex = /\[(.*?)\] \[PID:\d+\] \[auto\] 💰 CLOSE (\w+) \| \[Trade:(\w+)\] Price: ([\d.]+) \| Entry: ([\d.]+) \| PnL: ([-?\d.]+)% \| Reason: (.*)/;
    
    // [2026-06-08T10:01:53.890Z] [PID:63253] [auto] ✅ CLOSED DOGEUSDT | [Trade:6a268c1b7954a6c9305d24ab] PnL: $1.7478 (0.362%) | Reason: AI_REVERSAL_RL
    const closedRegex = /\[(.*?)\] \[PID:\d+\] \[auto\] ✅ CLOSED (\w+) \| \[Trade:(\w+)\] PnL: \$([-?\d.]+) \(([-?\d.]+)%\) \| Reason: (.*)/;

    for await (const line of rl) {
        const entryMatch = line.match(entryRegex);
        if (entryMatch) {
            const [_, timestamp, side, symbol, price, signal, confidence, tp, sl, usdt] = entryMatch;
            activePositions.set(symbol, {
                symbol,
                side,
                entryTime: new Date(timestamp),
                entryPrice: parseFloat(price),
                signal,
                confidence: parseFloat(confidence),
                tpPct: parseFloat(tp) / 100,
                slPct: parseFloat(sl) / 100,
                allocatedUsdt: parseFloat(usdt)
            });
            continue;
        }

        const closedMatch = line.match(closedRegex);
        if (closedMatch) {
            const [_, timestamp, symbol, tradeId, pnl, pnlPct, reason] = closedMatch;
            const entryInfo = activePositions.get(symbol);
            
            const pnlVal = parseFloat(pnl);
            const pnlPctVal = parseFloat(pnlPct) / 100;
            
            // Calculate leverage
            // Notional = PnL / PnL%
            // Leverage = Notional / AllocatedUSDT
            let leverage = 0;
            if (pnlPctVal !== 0 && entryInfo) {
                const notional = Math.abs(pnlVal / pnlPctVal);
                leverage = notional / entryInfo.allocatedUsdt;
            }

            closedTrades.push({
                ...(entryInfo || {
                    symbol,
                    side: "UNKNOWN",
                    entryTime: new Date(timestamp),
                    entryPrice: 0,
                    signal: "UNKNOWN",
                    confidence: 0,
                    tpPct: 0,
                    slPct: 0,
                    allocatedUsdt: 1 // fallback
                }),
                exitTime: new Date(timestamp),
                exitPrice: 0, // placeholder
                pnl: pnlVal,
                pnlPct: pnlPctVal,
                reason: reason.trim(),
                tradeId,
                leverage
            });
            activePositions.delete(symbol);
        }
    }

    console.log(`\n=== AQEA v2.6 RECOVERY FORENSICS REPORT ===\n`);

    // PHASE 1: SYMBOL FORENSICS
    const symbolStats: Record<string, any> = {};
    closedTrades.forEach(t => {
        if (!symbolStats[t.symbol]) symbolStats[t.symbol] = { trades: 0, wins: 0, pnl: 0, losses: [], maxDD: 0, peak: 0, balance: 0 };
        const s = symbolStats[t.symbol];
        s.trades++;
        if (t.pnl > 0) s.wins++;
        s.pnl += t.pnl;
        s.balance += t.pnl;
        if (s.balance > s.peak) s.peak = s.balance;
        const dd = s.peak - s.balance;
        if (dd > s.maxDD) s.maxDD = dd;
        if (t.pnl < 0) s.losses.push(Math.abs(t.pnl));
    });

    console.log(`[PHASE 1: SYMBOL FORENSICS]`);
    console.log(`Symbol\t\tTrades\tWR%\tPF\tPnL\tExp\tMaxDD`);
    const symTable = Object.entries(symbolStats).map(([sym, s]) => {
        const wr = (s.wins / s.trades) * 100;
        const grossProfit = closedTrades.filter(t => t.symbol === sym && t.pnl > 0).reduce((a, b) => a + b.pnl, 0);
        const grossLoss = Math.abs(closedTrades.filter(t => t.symbol === sym && t.pnl <= 0).reduce((a, b) => a + b.pnl, 0));
        const pf = grossLoss === 0 ? (grossProfit > 0 ? 99 : 0) : grossProfit / grossLoss;
        const exp = s.pnl / s.trades;
        return { sym, trades: s.trades, wr, pf, pnl: s.pnl, exp, maxDD: s.maxDD };
    }).sort((a, b) => a.pnl - b.pnl);

    symTable.forEach(row => {
        console.log(`${row.sym.padEnd(12)}\t${row.trades}\t${row.wr.toFixed(1)}%\t${row.pf.toFixed(2)}\t$${row.pnl.toFixed(2)}\t$${row.exp.toFixed(2)}\t$${row.maxDD.toFixed(2)}`);
    });

    const blacklist = symTable.filter(r => r.pf < 0.8 || r.exp < -1).map(r => r.sym);
    console.log(`\nSYMBOL_BLACKLIST_RECOMMENDATION: ${blacklist.join(", ")}`);

    // PHASE 2: EXIT FORENSICS
    const exitStats: Record<string, any> = {};
    closedTrades.forEach(t => {
        const r = t.reason.split(' ')[0];
        if (!exitStats[r]) exitStats[r] = { count: 0, wins: 0, pnl: 0, grossProfit: 0, grossLoss: 0 };
        const s = exitStats[r];
        s.count++;
        if (t.pnl > 0) {
            s.wins++;
            s.grossProfit += t.pnl;
        } else {
            s.grossLoss += Math.abs(t.pnl);
        }
        s.pnl += t.pnl;
    });

    console.log(`\n[PHASE 2: EXIT FORENSICS]`);
    console.log(`Reason\t\tCount\tWR%\tPF\tNet PnL`);
    Object.entries(exitStats).sort((a, b) => a[1].pnl - b[1].pnl).forEach(([r, s]) => {
        const wr = (s.wins / s.count) * 100;
        const pf = s.grossLoss === 0 ? (s.grossProfit > 0 ? 99 : 0) : s.grossProfit / s.grossLoss;
        console.log(`${r.padEnd(15)}\t${s.count}\t${wr.toFixed(1)}%\t${pf.toFixed(2)}\t$${s.pnl.toFixed(2)}`);
    });

    // PHASE 3: LEVERAGE FORENSICS
    const levBuckets = [
        { name: "1-3x", min: 0, max: 3.5 },
        { name: "4-6x", min: 3.5, max: 6.5 },
        { name: "7-10x", min: 6.5, max: 10.5 },
        { name: "11-20x", min: 10.5, max: 20.5 },
        { name: ">20x", min: 20.5, max: 1000 }
    ];
    console.log(`\n[PHASE 3: LEVERAGE FORENSICS]`);
    console.log(`Bucket\tTrades\tPF\tWR%\tPnL`);
    levBuckets.forEach(b => {
        const ts = closedTrades.filter(t => t.leverage >= b.min && t.leverage < b.max);
        if (ts.length === 0) return;
        const winners = ts.filter(t => t.pnl > 0);
        const wr = (winners.length / ts.length) * 100;
        const gp = winners.reduce((a, b) => a + b.pnl, 0);
        const gl = Math.abs(ts.filter(t => t.pnl <= 0).reduce((a, b) => a + b.pnl, 0));
        const pf = gl === 0 ? (gp > 0 ? 99 : 0) : gp / gl;
        const pnl = ts.reduce((a, b) => a + b.pnl, 0);
        console.log(`${b.name.padEnd(8)}\t${ts.length}\t${pf.toFixed(2)}\t${wr.toFixed(1)}%\t$${pnl.toFixed(2)}`);
    });

    // PHASE 4: STOP LOSS FORENSICS
    console.log(`\n[PHASE 4: STOP LOSS FORENSICS]`);
    const slHits = closedTrades.filter(t => t.reason.includes("STOP_LOSS"));
    const avgSlSlippage = slHits.reduce((a, b) => a + (Math.abs(b.pnlPct) - b.slPct), 0) / (slHits.length || 1);
    console.log(`Current Static SL: 0.35%`);
    console.log(`SL Hit Rate:       ${((slHits.length / closedTrades.length) * 100).toFixed(1)}%`);
    console.log(`Avg SL Slippage:   ${(avgSlSlippage * 100).toFixed(3)}%`);
    
    // Simulate ATR SL (Simplified: Assume ATR-based SL is wider, say 1.2%)
    const widerSl = 0.012; 
    const savedByWiderSl = slHits.filter(t => Math.abs(t.pnlPct) < widerSl).length;
    console.log(`Simulated ATR SL (1.2% avg):`);
    console.log(`Estimated SL Hits Avoided: ${savedByWiderSl} (${((savedByWiderSl/slHits.length)*100).toFixed(1)}% of SL hits)`);

    // PHASE 5: AI CONFIDENCE AUDIT
    console.log(`\n[PHASE 5: AI CONFIDENCE AUDIT]`);
    const confBuckets = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    console.log(`Bucket\tPF\tWR%\tPnL\tAvgPnL`);
    for (let i = 0; i < confBuckets.length - 1; i++) {
        const min = confBuckets[i];
        const max = confBuckets[i+1];
        const ts = closedTrades.filter(t => t.confidence >= min && t.confidence < max);
        if (ts.length === 0) continue;
        const winners = ts.filter(t => t.pnl > 0);
        const wr = (winners.length / ts.length) * 100;
        const gp = winners.reduce((a, b) => a + b.pnl, 0);
        const gl = Math.abs(ts.filter(t => t.pnl <= 0).reduce((a, b) => a + b.pnl, 0));
        const pf = gl === 0 ? (gp > 0 ? 99 : 0) : gp / gl;
        const pnl = ts.reduce((a, b) => a + b.pnl, 0);
        console.log(`${min.toFixed(1)}-${max.toFixed(1)}\t${pf.toFixed(2)}\t${wr.toFixed(1)}%\t$${pnl.toFixed(2)}\t$${(pnl/ts.length).toFixed(2)}`);
    }

    // PHASE 6: DOGE LOSS INVESTIGATION
    console.log(`\n[PHASE 6: DOGE LOSS INVESTIGATION (PnL < -$50)]`);
    console.log(`Symbol\t\tEntry\t\tExit\t\tLev\tSL%\tPnL\tReason`);
    closedTrades.filter(t => t.pnl < -50).forEach(t => {
        console.log(`${t.symbol.padEnd(12)}\t${t.entryTime.toISOString().split('T')[1].split('.')[0]}\t${t.exitTime.toISOString().split('T')[1].split('.')[0]}\t${t.leverage.toFixed(1)}x\t${(t.slPct*100).toFixed(2)}%\t$${t.pnl.toFixed(2)}\t${t.reason}`);
    });
}

runRecoveryForensics().catch(console.error);
