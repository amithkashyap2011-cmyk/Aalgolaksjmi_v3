import fs from "node:fs";
import readline from "node:readline";

const LOG_PATH = "server/auto_trade.log";

async function runValidation() {
    const fileStream = fs.createReadStream(LOG_PATH);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    const activePositions = new Map();
    let closedTrades: any[] = [];

    const entryRegex = /\[(.*?)\] \[PID:\d+\] \[auto\] 🚀 (BUY|SELL) (\w+) \| Price: ([\d.]+) \| Signal: (.*?) \| Conf: ([\d.]+) \| TP: ([\d.]+)% SL: ([\d.]+)% \| USDT: ([\d.]+)/;
    const closedRegex = /\[(.*?)\] \[PID:\d+\] \[auto\] ✅ CLOSED (\w+) \| \[Trade:(\w+)\] PnL: \$([-?\d.]+) \(([-?\d.]+)%\) \| Reason: (.*)/;

    for await (const line of rl) {
        const entryMatch = line.match(entryRegex);
        if (entryMatch) {
            const [_, timestamp, side, symbol, price, signal, confidence, tp, sl, usdt] = entryMatch;
            activePositions.set(symbol, { symbol, confidence: parseFloat(confidence), allocatedUsdt: parseFloat(usdt) });
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
                symbol,
                confidence: entryInfo?.confidence || 0,
                pnl: pnlVal,
                reason: reason.trim(),
                leverage
            });
            activePositions.delete(symbol);
        }
    }

    const getStats = (trades: any[], label: string) => {
        const wins = trades.filter(t => t.pnl > 0);
        const losses = trades.filter(t => t.pnl <= 0);
        const gp = wins.reduce((sum, t) => sum + t.pnl, 0);
        const gl = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
        const pf = gl === 0 ? (gp > 0 ? 99 : 0) : gp / gl;
        const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
        const netPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
        console.log(`=== ${label} ===`);
        console.log(`Trades: ${trades.length} | PF: ${pf.toFixed(2)} | WR: ${wr.toFixed(1)}% | NetPnL: $${netPnl.toFixed(2)}\n`);
    };

    getStats(closedTrades, "BASELINE");

    let sim1 = closedTrades.filter(t => t.symbol === 'BNBUSDT');
    getStats(sim1, "ONLY BNBUSDT");

    let sim2 = closedTrades.filter(t => !['DOGEUSDT', 'SHIBUSDT', 'ETHUSDT'].includes(t.symbol));
    sim2 = sim2.filter(t => t.leverage <= 3);
    sim2 = sim2.filter(t => t.confidence <= 0.8 || t.confidence >= 0.9);
    getStats(sim2, "NO_TOXIC + LEV<=3 + FIX_CONFIDENCE");
    
    let sim3 = closedTrades.filter(t => !['DOGEUSDT', 'SHIBUSDT', 'ETHUSDT'].includes(t.symbol));
    sim3 = sim3.map(t => {
        if (t.reason === 'AI_REVERSAL' || t.reason === 'TIME_DECAY_TIMEOUT') {
            return { ...t, pnl: t.pnl > 0 ? t.pnl : t.pnl * 0.2 };
        }
        if (t.reason.includes('STOP_LOSS')) {
            return { ...t, pnl: t.pnl * 0.4 }; 
        }
        return t;
    });
    getStats(sim3, "NO_TOXIC + ATR_SL_SIM + EXIT_SIM");

    let sim4 = closedTrades.filter(t => t.leverage <= 3);
    getStats(sim4, "ONLY LEV <= 3");

    let sim5 = closedTrades.filter(t => t.leverage <= 3 && !['DOGEUSDT', 'SHIBUSDT'].includes(t.symbol));
    getStats(sim5, "LEV <= 3 + NO_MEME");
}

runValidation().catch(console.error);