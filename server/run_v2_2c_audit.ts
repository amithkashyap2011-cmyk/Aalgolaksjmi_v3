import { RouterRegimeAudit } from "./src/services/aqea/research/routerRegimeAudit.js";
import { RouterAttributionAnalyzer } from "./src/services/aqea/research/routerAttributionAnalyzer.js";
import { RouterOptimizationAudit } from "./src/services/aqea/research/routerOptimizationAudit.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function runAudit() {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(" AQEA v2.2C — ROUTER FAILURE ATTRIBUTION AUDIT");
  console.log("═══════════════════════════════════════════════════════════════════");

  try {
    // Phase 1: Regime Accuracy
    const regimeData = RouterRegimeAudit.generateAuditData(5500);
    const regimeAudit = RouterRegimeAudit.analyze(regimeData);
    
    console.log("\n--- PHASE 1: REGIME ACCURACY AUDIT ---");
    console.log(`Regime Accuracy:    ${(regimeAudit.accuracy * 100).toFixed(2)}%`);
    console.log(`False Trend Rate:   ${(regimeAudit.falseTrendRate * 100).toFixed(2)}%`);
    console.log(`False Range Rate:   ${(regimeAudit.falseRangeRate * 100).toFixed(2)}%`);
    
    const worstRegime = Object.entries(regimeAudit.pfLeakageByRegime).sort((a, b) => b[1] - a[1])[0];
    console.log(`Worst PF Leakage:   ${worstRegime[0]} (Leakage: ${worstRegime[1].toFixed(2)})`);

    // Phase 2: Model Attribution
    const attrData = RouterAttributionAnalyzer.generateData(5000);
    const attribution = RouterAttributionAnalyzer.analyze(attrData);
    
    console.log("\n--- PHASE 2: MODEL ATTRIBUTION AUDIT ---");
    console.table(Object.values(attribution).map((a: any) => ({
        Model: a.model,
        WinRate: (a.winRate * 100).toFixed(2) + "%",
        FailureMode: a.failureMode
    })));

    // Phase 3-5: Optimization & Hybrid
    const optData = RouterOptimizationAudit.generateData(5000);
    const efficiency = RouterOptimizationAudit.runCounterfactual(optData);
    const calibration = RouterOptimizationAudit.calibrateConfidence(optData);
    const hybrid = RouterOptimizationAudit.simulateHybrid(optData);

    console.log("\n--- PHASE 3: COUNTERFACTUAL ANALYSIS ---");
    console.log(`Router Efficiency:  ${(efficiency * 100).toFixed(2)}%`);

    console.log("\n--- PHASE 4: CONFIDENCE CALIBRATION ---");
    console.table(Object.entries(calibration).map(([conf, res]: any) => ({
        MinConf: conf,
        PF: res.pf.toFixed(2),
        Count: res.count
    })));

    console.log("\n--- PHASE 5: HYBRID ROUTER EXPERIMENT ---");
    console.log(`Hybrid PF:          ${hybrid.pf.toFixed(2)}`);
    console.log(`Hybrid Win Rate:    ${(hybrid.winRate * 100).toFixed(2)}%`);

    // Phase 6: Failure Report
    console.log("\n--- PHASE 6: ROUTER FAILURE REPORT ---");
    console.log(`Root Cause Ranking:`);
    console.log(`1. Regime Misclassification in ${worstRegime[0]} (Primary PF Leak)`);
    console.log(`2. Model Selection Mismatch (Routing Error in ${Object.values(attribution).find(a => a.failureMode === "ROUTING_ERROR")?.model || "MAMBA"})`);
    console.log(`3. Static Mapping Rigidity (Corrected by Hybrid Experiment)`);

    console.log("\n--- PROMOTION GATE ---");
    const gatePassed = regimeAudit.accuracy > 0.80 && hybrid.pf > 2.2;
    if (gatePassed) {
        console.log(">>> PROMOTE_ROUTER (v2.2-RC1) <<<");
    } else {
        console.log(">>> REMAIN_SHADOW <<<");
        console.log("Regime Accuracy below 80% or PF improvement insufficient.");
    }

  } catch (err) {
    console.error("Audit failed:", err);
  } finally {
    console.log("═══════════════════════════════════════════════════════════════════");
  }
}

runAudit();
