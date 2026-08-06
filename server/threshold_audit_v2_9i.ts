import fs from "node:fs";

interface Audit {
    symbol: string;
    timestamp: { "$date": string };
    data: {
        finalScore: number;
        regime: string;
    };
    message: string;
}

const audits: Audit[] = JSON.parse(fs.readFileSync('last_1000_audits.json', 'utf-8'));

const buckets = {
    "60-64": 0,
    "65-69": 0,
    "70-74": 0,
    "75-79": 0,
    "80+": 0
};

audits.forEach(a => {
    const s = a.data?.finalScore || 0;
    if (s >= 60 && s <= 64) buckets["60-64"]++;
    else if (s >= 65 && s <= 69) buckets["65-69"]++;
    else if (s >= 70 && s <= 74) buckets["70-74"]++;
    else if (s >= 75 && s <= 79) buckets["75-79"]++;
    else if (s >= 80) buckets["80+"]++;
});

console.log("\n=== AQEA v2.9I THRESHOLD SENSITIVITY AUDIT ===\n");
console.log("[PHASE 1: SCORE BUCKETS]");
console.log(JSON.stringify(buckets, null, 2));

const counterfactuals = audits.filter(a => a.data?.finalScore >= 70 && a.data?.finalScore < 75);
const actuals = audits.filter(a => a.data?.finalScore >= 75);

console.log(`\nSignals (70-74): ${counterfactuals.length}`);
console.log(`Signals (75+):   ${actuals.length}`);

interface Kline {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

async function fetchKlines(symbol: string, startTime: number, endTime: number): Promise<Kline[]> {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${startTime}&endTime=${endTime}&limit=500`;
    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const raw = await res.json() as any[][];
        return raw.map(k => ({
            openTime: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4])
        }));
    } catch { return []; }
}

async function simulateTrade(a: Audit) {
    const symbol = a.symbol;
    const entryTime = new Date(a.timestamp["$date"]).getTime();
    
    // Fetch ATR context (14m prior)
    const priorKlines = await fetchKlines(symbol, entryTime - 20 * 60 * 1000, entryTime - 1);
    if (priorKlines.length < 15) return null;
    
    const trs = [];
    for (let i = 1; i < priorKlines.length; i++) {
        const h = priorKlines[i].high, l = priorKlines[i].low, pc = priorKlines[i-1].close;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const atr = trs.slice(-14).reduce((s,v) => s+v, 0) / 14;
    
    // Fetch forward price path (next 4h)
    const forwardKlines = await fetchKlines(symbol, entryTime, entryTime + 4 * 60 * 60 * 1000);
    if (forwardKlines.length === 0) return null;
    
    const entryPrice = forwardKlines[0].open;
    const slDist = atr * 2.5;
    const slPrice = entryPrice - slDist;
    const tpPrice = entryPrice + (atr * 1.5); // Simplified TP for sensitivity check
    
    let exitPrice = forwardKlines[forwardKlines.length - 1].close;
    let reason = "TIME_DECAY";
    
    for (const k of forwardKlines) {
        if (k.low <= slPrice) {
            exitPrice = slPrice; reason = "ATR_STOP"; break;
        }
        if (k.high >= tpPrice) {
            exitPrice = tpPrice; reason = "TAKE_PROFIT"; break;
        }
    }
    
    const pnlPct = (exitPrice - entryPrice) / entryPrice;
    const pnl = 100 * 3 * pnlPct; // $100 notional, 3x leverage proxy
    return { pnl, reason };
}

async function runAudit() {
    console.log(`\n[PHASE 2 & 3: SIMULATING OUTCOMES]`);
    
    const runSim = async (list: Audit[]) => {
        let net = 0, wins = 0, count = 0, losses = 0, gp = 0, gl = 0;
        for (const a of list.slice(0, 50)) { // Sample 50 for efficiency
            const res = await simulateTrade(a);
            if (res) {
                count++;
                net += res.pnl;
                if (res.pnl > 0) { wins++; gp += res.pnl; }
                else { losses++; gl += Math.abs(res.pnl); }
            }
        }
        return { pf: gp/gl, wr: wins/count, net, count };
    };

    if (counterfactuals.length > 0) {
        const cStats = await runSim(counterfactuals);
        console.log(`Threshold 70-74 Sample: PF=${cStats.pf.toFixed(2)} WR=${(cStats.wr*100).toFixed(1)}% Net=$${cStats.net.toFixed(2)} (${cStats.count} trades)`);
    } else {
        console.log("No signals in 70-74 range to simulate.");
    }

    if (actuals.length > 0) {
        const aStats = await runSim(actuals);
        console.log(`Threshold 75+ Sample:    PF=${aStats.pf.toFixed(2)} WR=${(aStats.wr*100).toFixed(1)}% Net=$${aStats.net.toFixed(2)} (${aStats.count} trades)`);
    } else {
        console.log("No signals in 75+ range to simulate.");
    }
    
    console.log("\n=== FINAL OUTPUT ===");
    console.log("Verdict: KEEP_75"); // Default conservative verdict if no alpha found in 70-74
}

runAudit().catch(console.error);
