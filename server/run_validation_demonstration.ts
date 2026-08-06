import { TransformerValidationProgram } from "./src/services/aqea/research/transformerValidationProgram.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(" AQEA v2.1D — TRANSFORMER MICROSTRUCTURE VALIDATION REPORT");
  console.log("═══════════════════════════════════════════════════════════════════");

  const uri = process.env.MONGO_URI || "process.env.MONGO_URI";
  await mongoose.connect(uri);

  try {
    // Phase 3: Shadow Data Collection (Synthetic for Demonstration)
    const { predictions, outcomes } = TransformerValidationProgram.generateSyntheticData(2000);

    // Run Validation Program (Phases 4-9)
    const results = await TransformerValidationProgram.run(predictions, outcomes);

    console.log("\n--- METRICS ---");
    console.log(`Trades Analyzed:      ${results.tradesAnalyzed}`);
    console.log(`Unique Alpha Rate:    ${(results.uniqueAlpha * 100).toFixed(2)}%`);
    console.log(`PF Contribution:      +${results.pfContribution.toFixed(2)}`);
    console.log(`Sharpe Contribution:  +${results.sharpeContribution.toFixed(2)}`);
    console.log(`p-Value:              ${results.pValue.toFixed(4)}`);
    console.log(`Redundancy (Corr):    ${results.redundancy.toFixed(2)}`);
    console.log(`Avg Latency:          ${results.latency}ms`);

    console.log("\n--- REGIME SPECIALIZATION ---");
    Object.entries(results.regimePerformance).forEach(([regime, perf]) => {
        console.log(`${regime.padEnd(16)} | Accuracy: ${(perf.accuracy * 100).toFixed(2)}% | PF: ${perf.pf.toFixed(2)}`);
    });

    console.log("\n--- FINAL RECOMMENDATION ---");
    if (results.recommendation === "PROMOTE_TO_VOTING") {
        console.log(">>> PROMOTE_TO_VOTING <<<");
        console.log("Transformer provides statistically significant unique alpha.");
    } else {
        console.log(">>> REMAIN_SHADOW_ONLY <<<");
        console.log("Validation criteria not fully met (check p-Value or unique alpha).");
    }

  } catch (err) {
    console.error("Validation failed:", err);
  } finally {
    await mongoose.disconnect();
    console.log("═══════════════════════════════════════════════════════════════════");
  }
}

run();
