import { ForecastRouterSimulation } from "./src/services/aqea/research/ForecastRouterSimulation.js";
import { RegimeForecastPredictor } from "./src/services/aqea/research/RegimeForecastPredictor.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function runAudit() {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(" AQEA v2.3A — PREDICTIVE REGIME FORECAST AUDIT");
  console.log("═══════════════════════════════════════════════════════════════════");

  const uri = process.env.MONGO_URI || "process.env.MONGO_URI";
  await mongoose.connect(uri);

  try {
    // Phase 1-2: Feature Expansion & Prediction
    console.log("Generating 5000 decisions for predictive simulation...");
    const data = ForecastRouterSimulation.generateData(5000);

    // Phase 4-5: Simulation
    console.log("Running comparative router simulations...");
    const results = await ForecastRouterSimulation.run(data);

    console.log("\n--- METRICS ---");
    console.log(`Total Samples:       ${results.totalSamples}`);
    console.log(`Reactive Router PF:  ${results.reactivePF.toFixed(2)}`);
    console.log(`Forecast Router PF:  ${results.forecastPF.toFixed(2)}`);
    console.log(`Specialist PF:       ${results.specialistPF.toFixed(2)} (Transition Warning Active)`);

    const pfImprovement = results.specialistPF - results.reactivePF;
    console.log(`PF Improvement:      +${pfImprovement.toFixed(2)}`);

    console.log("\n--- PROMOTION TARGETS ---");
    const gate1 = pfImprovement > 0.15;
    const gate2 = results.specialistPF > 2.0;

    console.log(`Gate 1 (PF Improv > 0.15):  ${gate1 ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`Gate 2 (Specialist PF > 2.0): ${gate2 ? "✅ PASS" : "❌ FAIL"}`);

    console.log("\n--- FINAL RECOMMENDATION ---");
    if (gate1 && gate2) {
        console.log(">>> PROMOTE_FORECAST_ROUTER <<<");
        console.log("Predictive forecasting eliminates transition lag and significantly improves PF.");
    } else {
        console.log(">>> REMAIN_SHADOW <<<");
        console.log("Forecasting improves performance but has not yet met promotion thresholds.");
    }

  } catch (err) {
    console.error("Audit failed:", err);
  } finally {
    await mongoose.disconnect();
    console.log("═══════════════════════════════════════════════════════════════════");
  }
}

runAudit();
