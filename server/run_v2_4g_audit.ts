import { MetaAlphaPromotionGates } from "./src/services/aqea/research/MetaAlphaPromotionGates.js";
import { MetaAlphaPerformanceTracker } from "./src/services/aqea/research/MetaAlphaPerformanceTracker.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function runAudit() {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(" AQEA v2.4G — META ALPHA LIVE SHADOW DATA AUDIT");
  console.log("═══════════════════════════════════════════════════════════════════");

  const uri = process.env.MONGO_URI || "process.env.MONGO_URI";
  await mongoose.connect(uri);

  try {
    const readiness = await MetaAlphaPromotionGates.evaluateReadiness();
    const metrics7d = await MetaAlphaPerformanceTracker.computeMetrics(7);
    const metrics30d = await MetaAlphaPerformanceTracker.computeMetrics(30);

    console.log("\n--- READINESS STATUS ---");
    console.log(`Readiness Score:     ${readiness.readinessScore.toFixed(1)}/100`);
    console.log(`Decisions Collected: ${readiness.decisionsCollected}/5000`);
    console.log(`Trade Outcomes:      ${readiness.tradesOutcomeCollected}/2000`);
    console.log(`Status:              ${readiness.status}`);

    console.log("\n--- PERFORMANCE (LIVE SHADOW) ---");
    if (metrics30d) {
        console.log(`Profit Factor (30d): ${metrics30d.profitFactor.toFixed(2)}`);
        console.log(`Win Rate (30d):      ${(metrics30d.winRate * 100).toFixed(2)}%`);
        console.log(`Avg Latency:         ${metrics30d.avgLatency.toFixed(1)}ms`);
    } else {
        console.log("Insufficient live data for metrics generation.");
    }

    console.log("\n--- DATA STILL REQUIRED ---");
    console.log(`Decisions:           ${readiness.dataStillRequired.decisions}`);
    console.log(`Trades:              ${readiness.dataStillRequired.trades}`);

    console.log("\n--- FINAL RECOMMENDATION ---");
    console.log(`>>> ${readiness.status} <<<`);

  } catch (err) {
    console.error("Audit failed:", err);
  } finally {
    await mongoose.disconnect();
    console.log("═══════════════════════════════════════════════════════════════════");
  }
}

runAudit();
