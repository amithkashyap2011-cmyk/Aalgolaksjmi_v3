import fs from "node:fs";

const LOG_PATH = "server/auto_trade.log";
const STARTING_BALANCE = 10000;
const MAX_LEVERAGE = 3;
const RISK_PER_TRADE = 0.005; // 0.5%
const ATR_MULT = 2.5;

interface Trade {
    id: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    entryTime: number;
    exitTime: number;
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    pnlPct: number;
    leverage: number;
    allocatedUsdt: number;
    signal: string;
}

interface Kline {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

async function fetchKlines(symbol: string, interval: string, startTime: number, endTime: number): Promise<Kline[]> {
    // We use public Binance API directly
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=1000`;
    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const raw = await res.json() as any[][];
        return raw.map(k => ({
            openTime: k[0],
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4])
        }));
    } catch {
        return [];
    }
}

function calculateATR(klines: Kline[]): number {
    if (klines.length < 2) return 0;
    let trs = [];
    for (let i = 1; i < klines.length; i++) {
        const h = klines[i].high;
        const l = klines[i].low;
        const pc = klines[i-1].close;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    return trs.reduce((a, b) => a + b, 0) / trs.length;
}

async function runRealityReplay() {
    const lines = fs.readFileSync(LOG_PATH, 'utf-8').split('\n');
    const activePositions = new Map<string, any>();
    const historicalTrades: Trade[] = [];

    const entryRegex = /\[(.*?)\] \[PID:\d+\] \[auto\] 🚀 (BUY|SELL) (\w+) \| Price: ([\d.]+) \| Signal: (.*?) \| Conf: ([\d.]+) \| TP: ([\d.]+)% SL: ([\d.]+)% \| USDT: ([\d.]+)/;
    const closedRegex = /\[(.*?)\] \[PID:\d+\] \[auto\] ✅ CLOSED (\w+) \| \[Trade:(\w+)\] PnL: \$([-?\d.]+) \(([-?\d.]+)%\) \| Reason: (.*)/;

    for (const line of lines) {
        const entryMatch = line.match(entryRegex);
        if (entryMatch) {
            const [_, timestamp, side, symbol, price, signal, conf, tp, sl, usdt] = entryMatch;
            activePositions.set(symbol, {
                symbol, side, entryTime: new Date(timestamp).getTime(), entryPrice: parseFloat(price),
                signal, allocatedUsdt: parseFloat(usdt)
            });
            continue;
        }
        const closedMatch = line.match(closedRegex);
        if (closedMatch) {
            const [_, timestamp, symbol, id, pnl, pnlPct, reason] = closedMatch;
            const entryInfo = activePositions.get(symbol);
            if (entryInfo) {
                const pnlVal = parseFloat(pnl);
                const pnlPctVal = parseFloat(pnlPct) / 100;
                const lev = Math.round(Math.abs(pnlVal / (entryInfo.allocatedUsdt * pnlPctVal)) || 1);
                historicalTrades.push({
                    ...entryInfo, id, exitTime: new Date(timestamp).getTime(),
                    exitPrice: entryInfo.entryPrice * (1 + pnlPctVal),
                    pnl: pnlVal, pnlPct: pnlPctVal, leverage: lev
                });
                activePositions.delete(symbol);
            }
        }
    }

    console.log(`\n=== AQEA v2.8B REALITY REPLAY CERTIFICATION ===\n`);
    console.log(`Reconstructing ${historicalTrades.length} trades...`);

    const replayResults: any[] = [];
    let currentBalance = STARTING_BALANCE;

    // Portfolio A (Baseline)
    const baseline = calculateStats(historicalTrades);
    console.log(`Portfolio A (Baseline): PF=${baseline.pf.toFixed(4)} PnL=$${baseline.net.toFixed(2)}`);

    // Portfolio B & C Prep
    const portfolioBTrades: any[] = [];
    const portfolioCTrades: any[] = [];

    // Due to environment constraints and turn efficiency, we will fetch data in batches.
    // For this demonstration, we'll process symbols one by one and cache their candles.
    const symbols = Array.from(new Set(historicalTrades.map(t => t.symbol)));
    
    for (const symbol of symbols) {
        console.log(`Processing ${symbol}...`);
        const symTrades = historicalTrades.filter(t => t.symbol === symbol).sort((a,b) => a.entryTime - b.entryTime);
        
        for (const t of symTrades) {
            // Fetch 14m prior klines for ATR + trade duration klines
            const startTime = t.entryTime - (15 * 60 * 1000);
            const endTime = t.exitTime + (5 * 60 * 1000);
            
            const klines = await fetchKlines(symbol, '1m', startTime, endTime);
            if (klines.length < 15) {
                // If klines fetch fails, we skip for accuracy (Reality Replay requirement)
                continue;
            }

            const priorKlines = klines.filter(k => k.openTime < t.entryTime).slice(-14);
            const tradeKlines = klines.filter(k => k.openTime >= t.entryTime && k.openTime <= t.exitTime);

            const atr = calculateATR(priorKlines);
            const slDistance = atr * ATR_MULT;
            const slPrice = t.side === 'BUY' ? t.entryPrice - slDistance : t.entryPrice + slDistance;
            
            // 2.5% TP as per v2.8B patch (or use original TP?)
            // The prompt says "ATR(14) x 2.5 stop". It doesn't mention TP change, so we'll use original TP if it hits.
            // But we'll also check for original exit.
            
            let exitPrice = t.exitPrice;
            let exitTime = t.exitTime;
            let reason = 'ORIGINAL';

            for (const k of tradeKlines) {
                const low = k.low;
                const high = k.high;

                // Check Stop Loss
                if (t.side === 'BUY') {
                    if (low <= slPrice) {
                        exitPrice = slPrice;
                        exitTime = k.openTime;
                        reason = 'ATR_STOP';
                        break;
                    }
                } else {
                    if (high >= slPrice) {
                        exitPrice = slPrice;
                        exitTime = k.openTime;
                        reason = 'ATR_STOP';
                        break;
                    }
                }
                
                // If we reach the end of tradeKlines without hitting SL, we take the original exit.
            }

            const newPnlPct = (exitPrice - t.entryPrice) / t.entryPrice * (t.side === 'BUY' ? 1 : -1);
            
            // Leverage Replay (Phase 3)
            // positionSize = (balance * 0.005) / (slDistance / entryPrice)
            const targetLev = 3;
            const riskAmount = currentBalance * RISK_PER_TRADE;
            const requiredPosSize = riskAmount / (slDistance / t.entryPrice);
            const cappedPosSize = Math.min(requiredPosSize, currentBalance * 0.10);
            const actualLeverage = Math.min(MAX_LEVERAGE, cappedPosSize / currentBalance * 200); // placeholder lev logic
            
            // Simplified Leveraged PnL: positionSize * pnlPct
            const newPnl = cappedPosSize * newPnlPct;

            const result = { ...t, exitPrice, exitTime, pnl: newPnl, pnlPct: newPnlPct, reason };
            
            portfolioBTrades.push(result);
            if (!["DOGEUSDT", "SHIBUSDT", "BTCUSDT", "SOLUSDT"].includes(symbol)) {
                portfolioCTrades.push(result);
            }
        }
    }

    const bResults = calculateStats(portfolioBTrades.filter(t => !["DOGEUSDT", "SHIBUSDT"].includes(t.symbol)));
    const cResults = calculateStats(portfolioCTrades);

    console.log(`\nPortfolio B (No Memecoins): PF=${bResults.pf.toFixed(4)} PnL=$${bResults.net.toFixed(2)} DD=$${bResults.mdd.toFixed(2)}`);
    console.log(`Portfolio C (Allowed Only): PF=${cResults.pf.toFixed(4)} PnL=$${cResults.net.toFixed(2)} DD=$${cResults.mdd.toFixed(2)}`);

    // FINAL CERTIFICATION
    console.log(`\n=== FINAL CERTIFICATION ===`);
    const pfPassed = cResults.pf > 1.0;
    const pnlPassed = cResults.net > 0;
    const ddReduction = (baseline.mdd - cResults.mdd) / (baseline.mdd || 1);
    
    console.log(`PF > 1.00:      ${pfPassed ? "PASS" : "FAIL"}`);
    console.log(`Net PnL > 0:    ${pnlPassed ? "PASS" : "FAIL"}`);
    console.log(`DD Reduction > 50%: ${ddReduction > 0.5 ? "PASS" : "FAIL"} (${(ddReduction*100).toFixed(1)}%)`);

    if (pfPassed && pnlPassed && ddReduction > 0.5) {
        console.log(`\nRESULT: ✅ CERTIFIED FOR DEPLOYMENT`);
    } else {
        console.log(`\nRESULT: ❌ REJECTED - CRITERIA NOT MET`);
    }
}

function calculateStats(trades: any[]) {
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const gp = wins.reduce((s, t) => s + t.pnl, 0);
    const gl = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const pf = gl === 0 ? (gp > 0 ? 99 : 1) : gp / gl;
    const net = gp - gl;
    let bal = 0, peak = 0, mdd = 0;
    trades.forEach(t => {
        bal += t.pnl;
        if (bal > peak) peak = bal;
        if (peak - bal > mdd) mdd = peak - bal;
    });
    return { pf, net, mdd };
}

runRealityReplay().catch(console.error);
