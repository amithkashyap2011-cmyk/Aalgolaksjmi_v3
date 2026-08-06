import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error("MONGO_URI not defined");

async function runOrderFlowForensics() {
    await mongoose.connect(MONGO_URI);
    
    const audits = await mongoose.connection.db!.collection("aqeaaudits")
        .find({ component: "orchestrator" })
        .sort({ timestamp: -1 })
        .limit(1000)
        .toArray();

    const total = audits.length;
    const stats = {
        liquidations: 0,
        oiExpansion: 0,
        fundingDivergence: 0, // monitored but not in votingScore currently?
        volumeSpikes: 0,      // momentum check in regime?
        neutral: 0
    };

    const scores: number[] = [];
    const values = {
        oiExpansion: [] as number[],
        fundingRate: [] as number[],
        liqLongs: [] as number[],
        liqShorts: [] as number[],
        bookImbalance: [] as number[]
    };

    let dataFailures = 0;

    for (const audit of audits) {
        const d = audit.data;
        if (!d || !d.ofDiagnostics) {
            dataFailures++;
            continue;
        }

        const of = d.ofDiagnostics;
        const vb = of.votingBreakdown || {};

        scores.push(d.orderFlowScore || 50);
        if (d.orderFlowScore === 50) stats.neutral++;

        if (vb.liquidationImpact !== 0) stats.liquidations++;
        if (vb.oiExpansionImpact !== 0) stats.oiExpansion++;
        
        // Monitoring-only checks
        if (Math.abs(of.fundingRate) > 0.0005) stats.fundingDivergence++;
        
        values.oiExpansion.push(of.oiExpansion || 0);
        values.fundingRate.push(of.fundingRate || 0);
        values.liqLongs.push(of.liqLongs || 0);
        values.liqShorts.push(of.liqShorts || 0);
        values.bookImbalance.push(of.bookImbalance || 0);
    }

    const calcDist = (arr: number[]) => {
        if (arr.length === 0) return { mean: 0, stddev: 0, p95: 0, max: 0, min: 0 };
        const mean = arr.reduce((a,b) => a+b, 0) / arr.length;
        const variance = arr.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / arr.length;
        const stddev = Math.sqrt(variance);
        arr.sort((a,b) => a-b);
        return {
            mean, stddev,
            p95: arr[Math.floor(arr.length * 0.95)],
            max: arr[arr.length - 1],
            min: arr[0]
        };
    };

    console.log(`\n=== AQEA v2.9H ORDER FLOW FORENSICS ===\n`);
    
    console.log(`[PHASE 1: RAW SIGNAL COUNTS]`);
    console.log(`Liquidation Signals:      ${stats.liquidations}`);
    console.log(`OI Expansion Signals:     ${stats.oiExpansion}`);
    console.log(`Funding Divergence (>5bp):${stats.fundingDivergence}`);
    console.log(`Volume Spike Signals:     N/A (Regime Only)`);

    console.log(`\n[PHASE 2: SCORE VARIANCE]`);
    const sDist = calcDist(scores);
    console.log(`Mean:   ${sDist.mean.toFixed(2)}`);
    console.log(`StdDev: ${sDist.stddev.toFixed(2)}`);
    console.log(`P95:    ${sDist.p95}`);
    console.log(`Max:    ${sDist.max}`);
    console.log(`Min:    ${sDist.min}`);

    console.log(`\n[PHASE 3: NEUTRALITY AUDIT]`);
    console.log(`Score = 50: ${stats.neutral} (${((stats.neutral/total)*100).toFixed(1)}%)`);

    console.log(`\n[PHASE 4: DATA SOURCE AUDIT]`);
    const checkValue = (name: string, arr: number[]) => {
        const zeros = arr.filter(v => v === 0).length;
        const nulls = arr.filter(v => v === null || v === undefined).length;
        console.log(`${name.padEnd(15)}: Zeros=${zeros}, Nulls=${nulls}, Sample=${arr[0]?.toFixed(6) || 0}`);
    };
    checkValue("OpenInterest", values.oiExpansion);
    checkValue("FundingRate", values.fundingRate);
    checkValue("Liquidations", values.liqLongs);
    checkValue("BookImbalance", values.bookImbalance);

    console.log(`\n[PHASE 5: THRESHOLD AUDIT]`);
    console.log(`OI Expansion Threshold: 0.005 (0.5%)`);
    const maxOI = Math.max(...values.oiExpansion);
    console.log(`Max Observed OI Exp:   ${(maxOI*100).toFixed(3)}%`);
    console.log(`Status: ${maxOI < 0.005 ? "🔴 UNREACHABLE" : "🟢 REACHABLE"}`);

    console.log(`\nLiquidation Cluster Threshold: 3:1 ratio + >0`);
    console.log(`Status: ${stats.liquidations > 0 ? "🟢 DETECTED" : "🔴 NOT DETECTED"}`);

    console.log(`\n=== FINAL VERDICT ===`);
    if (dataFailures > 500) {
        console.log(`ORDERFLOW_DATA_FAILURE`);
    } else if (stats.neutral / total > 0.95) {
        console.log(`ORDERFLOW_DORMANT`);
    } else {
        console.log(`ORDERFLOW_HEALTHY`);
    }

    await mongoose.disconnect();
}

runOrderFlowForensics().catch(console.error);
