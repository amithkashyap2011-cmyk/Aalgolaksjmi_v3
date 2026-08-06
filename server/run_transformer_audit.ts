import { TransformerAuditEngine } from "./src/services/aqea/research/transformerAuditEngine.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(" AQEA v2.2A — TRANSFORMER ACTION DISTRIBUTION AUDIT");
  console.log("═══════════════════════════════════════════════════════════════════");

  try {
    // Generate 5000 audit samples
    const samples = TransformerAuditEngine.generateData(5000);

    // Run Audit
    const metrics = TransformerAuditEngine.run(samples);

    console.log("\n--- ACTION DISTRIBUTION MATRIX ---");
    console.log(`LONG:  ${(metrics.longRate * 100).toFixed(2)}%`);
    console.log(`SHORT: ${(metrics.shortRate * 100).toFixed(2)}%`);
    console.log(`HOLD:  ${(metrics.holdRate * 100).toFixed(2)}%`);

    console.log("\n--- CONFIDENCE BY ACTION ---");
    console.log(`LONG:  ${metrics.confByAction.LONG.toFixed(4)}`);
    console.log(`SHORT: ${metrics.confByAction.SHORT.toFixed(4)}`);
    console.log(`HOLD:  ${metrics.confByAction.HOLD.toFixed(4)}`);

    console.log("\n--- REGIME BREAKDOWN ---");
    console.table(Object.entries(metrics.regimeBreakdown).map(([regime, dist]: any) => ({
        Regime: regime,
        "LONG%": (dist.LONG * 100).toFixed(2) + "%",
        "SHORT%": (dist.SHORT * 100).toFixed(2) + "%",
        "HOLD%": (dist.HOLD * 100).toFixed(2) + "%"
    })));

    console.log("\n--- HOLD EFFECTIVENESS ---");
    console.log(`Hold Avoidance Rate: ${(metrics.holdAvoidanceRate * 100).toFixed(2)}%`);
    console.log(`False Hold Rate:     ${(metrics.falseHoldRate * 100).toFixed(2)}%`);
    console.log(`PF Contribution:     +${metrics.profitabilityImpact.toFixed(2)}`);

    console.log("\n--- CONFUSION MATRIX (Actual row, Predicted col) ---");
    console.table(metrics.confusionMatrix);

    console.log("\n--- PROMOTION AUDIT ---");
    console.log(`Recommendation: ${metrics.recommendation}`);
    
    if (metrics.recommendation === "PROMOTE_TO_ROUTER") {
        console.log(">>> PROMOTE_TO_ROUTER <<<");
        console.log("Transformer behavior is balanced or provides superior loss avoidance.");
    } else {
        console.log(">>> RETRAIN_MODEL <<<");
        console.log("Excessive HOLD bias detected with insufficient avoidance alpha.");
    }

  } catch (err) {
    console.error("Audit failed:", err);
  } finally {
    console.log("═══════════════════════════════════════════════════════════════════");
  }
}

run();
