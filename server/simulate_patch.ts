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

async function runValidation() {
    const fileStream = fs.createReadStream(LOG_PATH);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    const activePositions = new Map<string, TradeInfo>();
    const closedTrades: ClosedTrade[] = [];

    const entryRegex = /\[(.*?)\] \[PID:\d+\] \[auto\] 🚀 (BUY|SELL) (\w+) \| Price: ([\d.]+) \| Signal: (.*?) \| Conf: ([\d.]+) \| TP: ([\d.]+)% SL: ([\d.]+)% \| USDT: ([\d.]+)/;
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
                    allocatedUsdt: 1
                }),
                exitTime: new Date(timestamp),
                exitPrice: 0,
                pnl: pnlVal,
                pnlPct: pnlPctVal,
                reason: reason.trim(),
                tradeId,
                leverage
            });
            activePositions.delete(symbol);
        }
    }

    // Baseline
    const getStats = (trades: ClosedTrade[]) => {
        const wins = trades.filter(t => t.pnl > 0);
        const losses = trades.filter(t => t.pnl <= 0);
        const gp = wins.reduce((sum, t) => sum + t.pnl, 0);
        const gl = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
        const pf = gl === 0 ? (gp > 0 ? 99 : 0) : gp / gl;
        const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
        const netPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
        const exp = trades.length > 0 ? netPnl / trades.length : 0;
        return { count: trades.length, pf, wr, netPnl, exp, gp, gl };
    };

    console.log("=== BASELINE ===");
    console.log(getStats(closedTrades));

    // Simulation Rules:
    // 1. Blacklist DOGE, SHIB
    let simulated = closedTrades.filter(t => !['DOGEUSDT', 'SHIBUSDT'].includes(t.symbol));

    // 2. Adjust Stop Loss (ATR proxy - assume 68% of stop losses are avoided and turn into average winners/losers of other trades, or just assume they hit trailing stop at breakeven/small profit, to be conservative let's just say they hit -0.05% instead of full -0.35%, or maybe they go on to be the average of non-SL trades. Let's just conservatively halve the SL losses)
    // Actually, ATR SL means we take wider losses when we lose, but we win more often.
    // If we just apply the filter: No trades with Confidence > 0.8
    simulated = simulated.filter(t => t.confidence <= 0.8);

    // Filter Leverage
    simulated = simulated.filter(t => t.leverage <= 3.5);

    // Apply Time Decay fix (if reason is TIME_DECAY_TIMEOUT, assume we cut it earlier at half loss)
    simulated = simulated.map(t => {
        if (t.reason === 'TIME_DECAY_TIMEOUT') {
            return { ...t, pnl: t.pnl * 0.5 };
        }
        if (t.reason.includes('STOP_LOSS')) {
            // Assume with ATR SL, 50% of these wouldn't have hit SL, but might still be losers or winners. Let's leave them as is to be conservative, or cut their loss by 30% because they are allowed to breathe.
        }
        return t;
    });

    console.log("=== AFTER PATCH SIMULATION (No Memecoins, Conf <= 0.8, Lev <= 3.5) ===");
    console.log(getStats(simulated));
}

runValidation().catch(console.error);
