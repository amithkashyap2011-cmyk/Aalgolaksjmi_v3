import { MetaAlphaEngine, AlphaSignal } from "./src/services/aqea/research/MetaAlphaEngine.js";
import { RegimeState } from "./src/services/aqea/regimeEngine.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function runValidation() {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(" AQEA v2.4A — META ALPHA ENSEMBLE VALIDATION REPORT");
  console.log("═══════════════════════════════════════════════════════════════════");

  const uri = process.env.MONGO_URI || "process.env.MONGO_URI";
  await mongoose.connect(uri);

  try {
    const totalSamples = 5000;
    const regimes: RegimeState[] = ["TRENDING_BULL", "TRENDING_BEAR", "RANGING", "TRANSITION", "HIGH_VOLATILITY"];
    
    let baselineWins = 0;
    let metaAlphaWins = 0;
    let totalTrades = 0;

    const performanceHistory: any = {
        CNN: { rollingAccuracy: 60 },
        MAMBA: { rollingAccuracy: 58 },
        TRANSFORMER: { rollingAccuracy: 62 },
        CORE: { rollingAccuracy: 55 },
        ORDER_FLOW: { rollingAccuracy: 57 },
        SMART_MONEY: { rollingAccuracy: 59 }
    };

    const driftScores = { CNN: 10, MAMBA: 5, TRANSFORMER: 8 };

    for (let i = 0; i < totalSamples; i++) {
        const regime = regimes[Math.floor(Math.random() * regimes.length)];
        const actualMove = Math.random() > 0.5 ? "LONG" : "SHORT";

        // Realistic signal generation with noise
        const getSignal = (acc: number) => Math.random() < acc ? actualMove : (actualMove === "LONG" ? "SHORT" : "LONG");

        const signals: AlphaSignal[] = [
            { source: "CNN", direction: getSignal(0.58), confidence: 0.75 },
            { source: "MAMBA", direction: getSignal(0.56), confidence: 0.70 },
            { source: "TRANSFORMER", direction: getSignal(0.60), confidence: 0.82 },
            { source: "CORE", direction: getSignal(0.54), confidence: 0.55 },
            { source: "ORDER_FLOW", direction: getSignal(0.57), confidence: 0.65 },
            { source: "SMART_MONEY", direction: getSignal(0.59), confidence: 0.78 }
        ];

        // 1. Baseline Decision (Simple CNN-dominant baseline)
        const baselineDecision = signals[0].direction; 
        if (baselineDecision === actualMove) baselineWins++;

        // 2. Meta Alpha Blended Decision
        const weighted = MetaAlphaEngine.calculateWeights(signals, regime, performanceHistory, driftScores);
        const meta = MetaAlphaEngine.blend(weighted);

        if (meta.decision !== "HOLD") {
            totalTrades++;
            if (meta.decision === actualMove) metaAlphaWins++;
        }
    }

    const baselineWR = (baselineWins / totalSamples) * 100;
    const metaAlphaWR = (metaAlphaWins / totalTrades) * 100;
    
    const baselinePF = (baselineWins * 1.5) / (totalSamples - baselineWins);
    const metaAlphaPF = (metaAlphaWins * 1.5) / (totalTrades - metaAlphaWins);

    console.log("\n--- PHASE 5: SHADOW VALIDATION (5000 SAMPLES) ---");
    console.log(`Baseline WR:        ${baselineWR.toFixed(2)}%`);
    console.log(`Meta Alpha WR:      ${metaAlphaWR.toFixed(2)}%`);
    console.log(`Baseline PF:        ${baselinePF.toFixed(2)}`);
    console.log(`Meta Alpha PF:      ${metaAlphaPF.toFixed(2)}`);

    const pfImprovement = metaAlphaPF - baselinePF;
    console.log(`PF Improvement:      +${pfImprovement.toFixed(2)}`);

    console.log("\n--- PHASE 6: SCIENTIFIC GATES ---");
    const gate1 = pfImprovement > 0.10;
    const gate2 = metaAlphaPF > 2.0;
    
    console.log(`Gate 1 (PF Improv > 0.10):  ${gate1 ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`Gate 2 (Meta PF > 2.0):     ${gate2 ? "✅ PASS" : "❌ FAIL"}`);

    console.log("\n--- FINAL RECOMMENDATION ---");
    if (gate1 && gate2) {
        console.log(">>> PROMOTE_TO_SHADOW_VOTING <<<");
        console.log("Meta Alpha dynamic weighting significantly outperforms the static/routed baseline.");
    } else {
        console.log(">>> REMAIN_RESEARCH <<<");
        console.log("Weighted ensemble does not yet meet scientific gate requirements.");
    }

  } catch (err) {
    console.error("Validation failed:", err);
  } finally {
    await mongoose.disconnect();
    console.log("═══════════════════════════════════════════════════════════════════");
  }
}

runValidation();
