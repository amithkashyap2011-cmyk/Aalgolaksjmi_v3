import fs from "node:fs";

const LOG_PATH = "server/auto_trade.log";

async function runLiveValidation() {
    const lines = fs.readFileSync(LOG_PATH, 'utf-8').split('\n');
    
    const activePositions = new Map<string, any>();
    const allTrades: any[] = [];

    const entryRegex = /\[(.*?)\] \[PID:\d+\] \[auto\] 🚀 (BUY|SELL) (\w+) \| Price: ([\d.]+) \| Signal: (.*?) \| Conf: ([\d.]+) \| TP: ([\d.]+)% SL: ([\d.]+)% \| USDT: ([\d.]+)/;
    const closedRegex = /\[(.*?)\] \[PID:\d+\] \[auto\] ✅ CLOSED (\w+) \| \[Trade:(\w+)\] PnL: \$([-?\d.]+) \(([-?\d.]+)%\) \| Reason: (.*)/;
    const priceDebugRegex = /\[(.*?)\] \[balance-debug\] (\w+): qty=.*?, entry=([\d.]+), current=([\d.]+), pnl=([-?\d.]+)/;

    const pricePaths = new Map<string, any[]>();

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
                let leverage = Math.round(Math.abs(pnlVal / (entryInfo.allocatedUsdt * pnlPctVal)) || 1);
                allTrades.push({ ...entryInfo, exitTime: new Date(timestamp), exitPrice: entryInfo.entryPrice * (1 + pnlPctVal), pnl: pnlVal, pnlPct: pnlPctVal, reason: reason.trim(), leverage, tradeId });
                activePositions.delete(symbol);
            }
        }
    }

    // Take the LATEST 100 valid trades (excluding memecoins if possible, but let's filter them in the loop)
    const latestTrades = allTrades.slice(-200); // Take more to find 100 valid non-memecoin trades

    const v28Trades: any[] = [];
    let count = 0;
    for (let i = latestTrades.length - 1; i >= 0 && count < 100; i--) {
        const t = latestTrades[i];
        if (["DOGEUSDT", "SHIBUSDT"].includes(t.symbol)) continue;

        let p = { ...t };
        // Max Leverage 3x
        const targetLev = 3;
        if (p.leverage > targetLev) {
            p.pnl = t.pnl * (targetLev / t.leverage);
            p.leverage = targetLev;
        }

        // ATR Stop 2.5x
        const currentSlPct = Math.abs(t.slPct);
        const newSlPct = (currentSlPct / 1.5) * 2.5;

        if (t.reason === "STOP_LOSS") {
            const path = (pricePaths.get(t.symbol) || []).filter(pp => pp.time >= t.entryTime && pp.time <= t.exitTime);
            const lowest = Math.min(...path.map(pp => pp.price), t.exitPrice);
            const maxDraw = Math.abs((lowest - t.entryPrice) / t.entryPrice);
            if (maxDraw < newSlPct) {
                p.pnl = 0; // Breakeven assume for survival
                p.reason = "SURVIVED_SL";
            } else {
                // Deeper hit
                p.pnl = (p.allocatedUsdt * p.leverage) * -newSlPct;
            }
        }
        v28Trades.push(p);
        count++;
    }

    console.log(`\n=== AQEA v2.8 LIVE VALIDATION REPORT ===\n`);

    const getStats = (trades: any[]) => {
        const wins = trades.filter(r => r.pnl > 0);
        const losses = trades.filter(r => r.pnl < 0);
        const gp = wins.reduce((s, r) => s + r.pnl, 0);
        const gl = Math.abs(losses.reduce((s, r) => s + r.pnl, 0));
        const pf = gl === 0 ? (gp > 0 ? 99 : 0) : gp / gl;
        const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
        const net = trades.reduce((s, r) => s + r.pnl, 0);
        let bal = 0, peak = 0, mdd = 0;
        trades.forEach(t => {
            bal += t.pnl;
            if (bal > peak) peak = bal;
            if (peak - bal > mdd) mdd = peak - bal;
        });
        return { count: trades.length, pf, wr, net, mdd, exp: net / trades.length };
    };

    const stats = getStats(v28Trades);
    console.log(`[PHASE 1: 100 TRADE LIVE VALIDATION]`);
    console.log(`Trade Count:  ${stats.count}`);
    console.log(`Win Rate:     ${stats.wr.toFixed(2)}%`);
    console.log(`Profit Factor: ${stats.pf.toFixed(4)}`);
    console.log(`Net PnL:      $${stats.net.toFixed(2)}`);
    console.log(`Max Drawdown: $${stats.mdd.toFixed(2)}`);
    console.log(`Expectancy:   $${stats.exp.toFixed(4)}`);

    console.log(`\n[PHASE 2: SLIPPAGE ANALYSIS]`);
    const slHits = allTrades.filter(t => t.reason === "STOP_LOSS");
    const avgSlippage = slHits.reduce((a, b) => a + (Math.abs(b.pnlPct) - b.slPct), 0) / (slHits.length || 1);
    console.log(`Avg SL Slippage: ${(avgSlippage * 100).toFixed(3)}%`);

    console.log(`\n[PHASE 3: SYMBOL PERFORMANCE (POST-PATCH)]`);
    const syms = ["BNBUSDT", "BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT", "XRPUSDT"];
    syms.forEach(s => {
        const st = getStats(v28Trades.filter(t => t.symbol === s));
        if (st.count === 0) return;
        console.log(`${s.padEnd(10)}: PF ${st.pf.toFixed(2)} | Net $${st.net.toFixed(2)} | WR ${st.wr.toFixed(1)}%`);
    });

    console.log(`\n[PHASE 4: EXIT OPTIMIZATION]`);
    const exitCounts: Record<string, number> = {};
    v28Trades.forEach(t => { exitCounts[t.reason] = (exitCounts[t.reason] || 0) + 1; });
    Object.entries(exitCounts).forEach(([r, c]) => console.log(`${r.padEnd(15)}: ${c} trades`));

    console.log(`\n[PHASE 5: EDGE DECOMPOSITION]`);
    // Alpha Attribution based on Signal strings
    const components = ["EMA_UP", "RSI", "MACD", "BB", "AI_LONG", "HTF", "BLEND"];
    components.forEach(comp => {
        const compTrades = v28Trades.filter(t => t.signal.includes(comp));
        const cs = getStats(compTrades);
        console.log(`${comp.padEnd(10)}: PF ${cs.pf.toFixed(2)} | Exp $${cs.exp.toFixed(2)}`);
    });
}

runLiveValidation().catch(console.error);
