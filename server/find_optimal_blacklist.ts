import fs from "node:fs";

const LOG_PATH = "server/auto_trade.log";

async function run() {
    const lines = fs.readFileSync(LOG_PATH, 'utf-8').split('\n');
    const activePositions = new Map<string, any>();
    const historicalTrades: any[] = [];
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
                historicalTrades.push({ ...entryInfo, exitTime: new Date(timestamp), exitPrice: entryInfo.entryPrice * (1 + pnlPctVal), pnl: pnlVal, pnlPct: pnlPctVal, reason: reason.trim(), leverage });
                activePositions.delete(symbol);
            }
        }
    }

    const testConfig = (blacklist: string[]) => {
        const results: any[] = [];
        for (const t of historicalTrades) {
            if (blacklist.includes(t.symbol)) continue;
            let p = { ...t };
            if (p.leverage > 3) {
                p.pnl = t.pnl * (3 / t.leverage);
                p.leverage = 3;
            }
            const newSlPct = (Math.abs(t.slPct) / 1.5) * 2.5;
            if (t.reason === "STOP_LOSS") {
                const path = (pricePaths.get(t.symbol) || []).filter(pp => pp.time >= t.entryTime && pp.time <= t.exitTime);
                const lowest = Math.min(...path.map(pp => pp.price), t.exitPrice);
                const maxDraw = Math.abs((lowest - t.entryPrice) / t.entryPrice);
                if (maxDraw >= newSlPct) {
                    p.pnl = (p.allocatedUsdt * p.leverage) * -newSlPct;
                } else {
                    p.pnl = 0; // Conservatively assume breakeven if survived
                    p.reason = "SURVIVED";
                }
            }
            results.push(p);
        }
        const wins = results.filter(r => r.pnl > 0);
        const losses = results.filter(r => r.pnl < 0);
        const gp = wins.reduce((s, r) => s + r.pnl, 0);
        const gl = Math.abs(losses.reduce((s, r) => s + r.pnl, 0));
        return { pf: gp/gl, net: gp - gl, count: results.length };
    };

    console.log("DOGE, SHIB:", testConfig(["DOGEUSDT", "SHIBUSDT"]));
    console.log("DOGE, SHIB, BTC:", testConfig(["DOGEUSDT", "SHIBUSDT", "BTCUSDT"]));
    console.log("DOGE, SHIB, BTC, SOL:", testConfig(["DOGEUSDT", "SHIBUSDT", "BTCUSDT", "SOLUSDT"]));
    console.log("DOGE, SHIB, BTC, SOL, ETH:", testConfig(["DOGEUSDT", "SHIBUSDT", "BTCUSDT", "SOLUSDT", "ETHUSDT"]));
}
run();
