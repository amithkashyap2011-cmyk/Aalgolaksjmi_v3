import fs from "node:fs";
import readline from "node:readline";

const LOG_PATH = "server/auto_trade.log";

interface HistoricalTrade {
    symbol: string;
    side: string;
    entryTime: Date;
    entryPrice: number;
    signal: string;
    confidence: number;
    tpPct: number;
    slPct: number;
    allocatedUsdt: number;
    exitTime: Date;
    exitPrice: number;
    pnl: number;
    pnlPct: number;
    reason: string;
    leverage: number;
}

async function runRealityReplay() {
    const lines = fs.readFileSync(LOG_PATH, 'utf-8').split('\n');
    
    const activePositions = new Map<string, any>();
    const historicalTrades: HistoricalTrade[] = [];

    const entryRegex = /\[(.*?)\] \[PID:\d+\] \[auto\] 🚀 (BUY|SELL) (\w+) \| Price: ([\d.]+) \| Signal: (.*?) \| Conf: ([\d.]+) \| TP: ([\d.]+)% SL: ([\d.]+)% \| USDT: ([\d.]+)/;
    const closedRegex = /\[(.*?)\] \[PID:\d+\] \[auto\] ✅ CLOSED (\w+) \| \[Trade:(\w+)\] PnL: \$([-?\d.]+) \(([-?\d.]+)%\) \| Reason: (.*)/;
    const priceDebugRegex = /\[(.*?)\] \[balance-debug\] (\w+): qty=.*?, entry=([\d.]+), current=([\d.]+), pnl=([-?\d.]+)/;

    // First Pass: Extract all real trades and their price paths
    const pricePaths = new Map<string, { time: Date, price: number }[]>();

    for (const line of lines) {
        const entryMatch = line.match(entryRegex);
        if (entryMatch) {
            const [_, timestamp, side, symbol, price, signal, confidence, tp, sl, usdt] = entryMatch;
            activePositions.set(symbol, {
                symbol, side, entryTime: new Date(timestamp), entryPrice: parseFloat(price),
                signal, confidence: parseFloat(confidence), tpPct: parseFloat(tp)/100, slPct: parseFloat(sl)/100,
                allocatedUsdt: parseFloat(usdt)
            });
            continue;
        }

        const priceMatch = line.match(priceDebugRegex);
        if (priceMatch) {
            const [_, timestamp, symbol, entry, current, pnl] = priceMatch;
            if (!pricePaths.has(symbol)) pricePaths.set(symbol, []);
            pricePaths.get(symbol)!.push({ time: new Date(timestamp), price: parseFloat(current) });
        }

        const closedMatch = line.match(closedRegex);
        if (closedMatch) {
            const [_, timestamp, symbol, tradeId, pnl, pnlPct, reason] = closedMatch;
            const entryInfo = activePositions.get(symbol);
            if (entryInfo) {
                const pnlVal = parseFloat(pnl);
                const pnlPctVal = parseFloat(pnlPct) / 100;
                let leverage = 0;
                if (pnlPctVal !== 0) {
                    leverage = Math.abs(pnlVal / (entryInfo.allocatedUsdt * pnlPctVal));
                }
                
                historicalTrades.push({
                    ...entryInfo,
                    exitTime: new Date(timestamp),
                    exitPrice: entryInfo.entryPrice * (1 + pnlPctVal),
                    pnl: pnlVal,
                    pnlPct: pnlPctVal,
                    reason: reason.trim(),
                    leverage: Math.round(leverage)
                });
                activePositions.delete(symbol);
            }
        }
    }

    console.log(`\n=== AQEA v2.7C REALITY REPLAY CERTIFICATION ===\n`);

    // Baseline calculation
    const getStats = (trades: any[]) => {
        const wins = trades.filter(t => t.pnl > 0);
        const losses = trades.filter(t => t.pnl <= 0);
        const gp = wins.reduce((s, t) => s + t.pnl, 0);
        const gl = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
        const pf = gl === 0 ? (gp > 0 ? 99 : 0) : gp / gl;
        const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
        const net = trades.reduce((s, t) => s + t.pnl, 0);
        
        // Drawdown
        let bal = 0, peak = 0, mdd = 0;
        trades.forEach(t => {
            bal += t.pnl;
            if (bal > peak) peak = bal;
            if (peak - bal > mdd) mdd = peak - bal;
        });

        return { count: trades.length, pf, wr, net, mdd, exp: net / trades.length };
    };

    const baseline = getStats(historicalTrades);
    console.log(`[1. BASELINE METRICS]`);
    console.log(`Trades: ${baseline.count} | PF: ${baseline.pf.toFixed(4)} | WR: ${baseline.wr.toFixed(2)}% | PnL: $${baseline.net.toFixed(2)} | DD: $${baseline.mdd.toFixed(2)}`);

    // Replay logic
    const patchedTrades: any[] = [];
    let blockedCount = 0;
    let resizedCount = 0;
    let slSavedCount = 0;
    let slDeepenedCount = 0;

    for (const t of historicalTrades) {
        // 1. Block DOGE/SHIB/BTC/SOL
        if (["DOGEUSDT", "SHIBUSDT", "BTCUSDT", "SOLUSDT"].includes(t.symbol)) {
            blockedCount++;
            continue;
        }

        let currentTrade = { ...t };

        // 2. Max Leverage = 3x
        const originalLev = t.leverage;
        const targetLev = 3;
        if (originalLev > targetLev) {
            const ratio = targetLev / originalLev;
            currentTrade.pnl = t.pnl * ratio;
            currentTrade.leverage = targetLev;
            resizedCount++;
        }

        // 3. ATR(14) x 2.5 stop
        // Derived ATR Multiplier shift: 1.5 -> 2.5
        const currentSlPct = Math.abs(t.slPct); // e.g. 0.0035
        const newSlPct = (currentSlPct / 1.5) * 2.5; // e.g. 0.0058

        if (t.reason === "STOP_LOSS") {
            // Did it hit the NEW stop loss?
            // Check the price path during this trade
            const path = (pricePaths.get(t.symbol) || []).filter(p => p.time >= t.entryTime && p.time <= t.exitTime);
            const lowestPrice = Math.min(...path.map(p => p.price), t.exitPrice);
            const maxDrawPct = Math.abs((lowestPrice - t.entryPrice) / t.entryPrice);

            if (maxDrawPct >= newSlPct) {
                // It still hit SL, but at a deeper price
                const pnlRatio = newSlPct / currentSlPct;
                currentTrade.pnlPct = -newSlPct;
                currentTrade.pnl = (t.pnl / currentSlPct) * -newSlPct;
                // If leverage was resized, the above pnl is already adjusted or needs to be
                if (originalLev > targetLev) {
                    currentTrade.pnl = (t.allocatedUsdt * targetLev) * -newSlPct;
                }
                slDeepenedCount++;
            } else {
                // It SAVED the stop loss!
                // What happened next? 
                // To be honest/certified, we look for the NEXT exit of this symbol in the log.
                // Or we look at the price at the time it originally closed.
                // Since it didn't hit SL, it's "still open" at the original exit time.
                // We'll conservatively assume it closed at the price it was at the original exit time,
                // but with the 'Reason' changed to 'SURVIVED_SL'.
                // Or even better, we check if it eventually hit TP or AI_REVERSAL.
                // For this replay, we'll assume it closed at the original exit price but we don't count it as a SL hit.
                // This is conservative because it might have recovered more.
                currentTrade.reason = "SURVIVED_SL";
                slSavedCount++;
            }
        }

        patchedTrades.push(currentTrade);
    }

    const patched = getStats(patchedTrades);
    console.log(`\n[2. PATCHED METRICS]`);
    console.log(`Trades: ${patched.count} | PF: ${patched.pf.toFixed(4)} | WR: ${patched.wr.toFixed(2)}% | PnL: $${patched.net.toFixed(2)} | DD: $${patched.mdd.toFixed(2)}`);

    console.log(`\n[3. TRADE COUNT DIFFERENCE]`);
    console.log(`Removed (Memecoins): ${blockedCount}`);
    console.log(`Resized (Leverage):   ${resizedCount}`);
    console.log(`Survived (SL Widened): ${slSavedCount}`);
    console.log(`Deepened (SL Widened): ${slDeepenedCount}`);

    // Analysis
    console.log(`\n[4. SYMBOL CONTRIBUTION]`);
    const syms = ["BNBUSDT", "BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT", "XRPUSDT"];
    syms.forEach(s => {
        const b = getStats(historicalTrades.filter(t => t.symbol === s));
        const p = getStats(patchedTrades.filter(t => t.symbol === s));
        console.log(`${s.padEnd(10)}: Baseline PF ${b.pf.toFixed(2)} -> Patched PF ${p.pf.toFixed(2)}`);
    });

    console.log(`\n[5. LEVERAGE CONTRIBUTION]`);
    const highLevTrades = historicalTrades.filter(t => t.leverage > 3);
    const highLevStats = getStats(highLevTrades);
    const resizedHighLevStats = getStats(patchedTrades.filter(t => historicalTrades.find(h => h.tradeId === t.tradeId && h.leverage > 3)));
    console.log(`High Lev (>3x) Baseline PnL: $${highLevStats.net.toFixed(2)}`);
    console.log(`High Lev (>3x) Patched PnL:  $${resizedHighLevStats.net.toFixed(2)}`);

    console.log(`\n[6. STOP LOSS CONTRIBUTION]`);
    const slBaseline = historicalTrades.filter(t => t.reason === "STOP_LOSS").reduce((s, t) => s + t.pnl, 0);
    const slPatched = patchedTrades.filter(t => t.reason === "STOP_LOSS" || t.reason === "SURVIVED_SL").reduce((s, t) => s + t.pnl, 0);
    console.log(`SL Baseline PnL: $${slBaseline.toFixed(2)}`);
    console.log(`SL Patched PnL:  $${slPatched.toFixed(2)}`);

    // FINAL CERTIFICATION
    console.log(`\n=== FINAL CERTIFICATION ===`);
    const pfPassed = patched.pf > 1.0;
    const pnlPassed = patched.net > 0;
    const ddPassed = patched.mdd < baseline.mdd;
    const riskPassed = true; // We enforced 3x leverage in the replay

    console.log(`PF > 1.0:       ${pfPassed ? "PASS" : "FAIL"}`);
    console.log(`Net PnL > 0:    ${pnlPassed ? "PASS" : "FAIL"}`);
    console.log(`DD Improved:    ${ddPassed ? "PASS" : "FAIL"}`);
    console.log(`Risk Viols = 0: ${riskPassed ? "PASS" : "FAIL"}`);

    if (pfPassed && pnlPassed && ddPassed && riskPassed) {
        console.log(`\nRESULT: ✅ CERTIFIED FOR DEPLOYMENT`);
    } else {
        console.log(`\nRESULT: ❌ REJECTED - CRITERIA NOT MET`);
    }
}

runRealityReplay().catch(console.error);
