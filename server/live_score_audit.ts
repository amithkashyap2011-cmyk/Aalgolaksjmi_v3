import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function runAudit() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not defined");
  await mongoose.connect(uri);

  try {
    const docs = await mongoose.connection.db.collection("aqeaaudits").find({ component: "orchestrator" }).sort({ timestamp: -1 }).limit(500).toArray();
    
    if (docs.length === 0) {
      console.log("No audit records found.");
      return;
    }

    const stats = {
      finalScore: { sum: 0, vals: [] as number[] },
      coreScore: { sum: 0, vals: [] as number[] },
      ofScore: { sum: 0, vals: [] as number[] },
      smScore: { sum: 0, vals: [] as number[] }
    };

    const regimes: Record<string, number> = {};
    const smDiagnostics = {
      sweeps: 0,
      obs: 0,
      fvgs: 0,
      bos: 0
    };

    docs.forEach(doc => {
      const d = doc.data;
      stats.finalScore.sum += d.finalScore;
      stats.finalScore.vals.push(d.finalScore);
      
      stats.coreScore.sum += d.aqeaScore;
      stats.coreScore.vals.push(d.aqeaScore);
      
      stats.ofScore.sum += d.orderFlowScore;
      stats.ofScore.vals.push(d.orderFlowScore);
      
      stats.smScore.sum += d.smartMoneyScore;
      stats.smScore.vals.push(d.smartMoneyScore);

      regimes[d.regime] = (regimes[d.regime] || 0) + 1;

      if (d.smDiagnostics) {
        if (d.smDiagnostics.liquiditySweeps?.length) smDiagnostics.sweeps++;
        if (d.smDiagnostics.orderBlocks?.length) smDiagnostics.obs++;
        if (d.smDiagnostics.fvgs?.length) smDiagnostics.fvgs++;
        if (d.smDiagnostics.marketStructure?.includes("BOS")) smDiagnostics.bos++;
      }
    });

    const getMetrics = (s: { sum: number, vals: number[] }) => {
      s.vals.sort((a,b) => a-b);
      return {
        avg: s.sum / docs.length,
        median: s.vals[Math.floor(docs.length/2)],
        max: s.vals[docs.length-1],
        p95: s.vals[Math.floor(docs.length * 0.95)]
      };
    };

    console.log("═══════════════════════════════════════════════════════════════════");
    console.log(" AQEA — LIVE SCORE DECOMPOSITION AUDIT (Last 500 Samples)");
    console.log("═══════════════════════════════════════════════════════════════════");
    
    console.log("\n--- PHASE 1: SCORE STATISTICS ---");
    console.table({
      Final: getMetrics(stats.finalScore),
      Core: getMetrics(stats.coreScore),
      OF: getMetrics(stats.ofScore),
      SM: getMetrics(stats.smScore)
    });

    console.log("\n--- PHASE 4: REGIME DISTRIBUTION ---");
    Object.entries(regimes).forEach(([r, count]) => {
      console.log(`${r.padEnd(20)}: ${(count / docs.length * 100).toFixed(1)}% (${count})`);
    });

    console.log("\n--- PHASE 5: SMART MONEY DORMANCY CHECK ---");
    console.log(`Liquidity Sweeps:     ${smDiagnostics.sweeps}`);
    console.log(`Order Blocks:         ${smDiagnostics.obs}`);
    console.log(`Fair Value Gaps:      ${smDiagnostics.fvgs}`);
    console.log(`Break of Structure:   ${smDiagnostics.bos}`);

    console.log("\n--- PHASE 2: BOTTLENECK IDENTIFICATION ---");
    const weights = docs[0].data.weightsApplied;
    console.log("Current Weights:", JSON.stringify(weights));
    
    if (getMetrics(stats.smScore).max === 50 && getMetrics(stats.ofScore).max === 50) {
      console.log("VERDICT: MICROSTRUCTURE_DORMANT");
      console.log("Both SM and OF are returning exactly 50 (neutral) for 100% of samples.");
    } else {
      console.log("VERDICT: DIVERSIFIED_NOISE");
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

runAudit();
