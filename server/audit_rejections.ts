import mongoose from "mongoose";
import { AQEAEngine } from "./src/services/aqea/engine.js";
import { AQEA_CONFIG } from "./src/services/aqea/config.js";
import * as paper from "./src/services/paperState.js";
import dotenv from "dotenv";

dotenv.config();

async function auditRejections() {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(" AQEA — TRADE BLOCKING AUDIT (v2.4I)");
  console.log("═══════════════════════════════════════════════════════════════════");

  const uri = process.env.MONGO_URI || "process.env.MONGO_URI";
  await mongoose.connect(uri);

  const userId = "69c2bc93c8601b4eaf3abe2f";
  const symbol = "BTCUSDT";

  // Force extremely bullish environment to trigger LONG
  const indicators = { 
    adx14: 40, 
    atr14: 1000, 
    rsi14: 75,
    ema9: 55000,
    ema21: 52000,
    ema200: 45000,
    bars: Array(100).fill({ close: 54000, high: 54100, low: 53900, open: 53950, volume: 5000 }),
    macd: { histogram: 10 }
  };

  const marketData = {
    btcDominance: 55,
    fundingRate: 0.0001,
    volumeAvg: 800
  };

  paper.setWalletBalance(userId, "PAPER", "USDT", 10000, "FUTURES");

  console.log("--- RUNNING DIAGNOSTIC DECISION ---");
  
  const d = await AQEAEngine.decide(symbol, userId, {
    mode: "PAPER",
    accountType: "FUTURES",
    currentPrice: 50000,
    indicators: { ...indicators, sma200: 45000 }, // Fix mapping
    bars: indicators.bars, // Pass actual bars
    marketData,
    performance: { winRate: 0.60, rewardRisk: 2.0 }
  });

  console.log(`\nDecision:       ${d.decision}`);
  console.log(`Score:          ${d.confidence}/100`);
  console.log(`Risk Approved:  ${d.riskApproved}`);
  console.log(`Position Size:  $${d.positionSize.toFixed(2)}`);
  
  console.log("\n--- SCORE BREAKDOWN ---");
  console.log(`Regime State:   ${d.meta.regime}`);
  console.log(`Core Score:     ${d.meta.aqeaScore}`);
  console.log(`OF Score:       ${d.meta.orderFlowScore}`);
  console.log(`SM Score:       ${d.meta.smartMoneyScore}`);
  console.log(`Final Score:    ${d.meta.finalScore}`);
  
  console.log("\n--- REJECTION REASONS ---");
  d.reasons.forEach(r => console.log(`- ${r}`));

  if (d.decision === "HOLD") {
    if (d.meta.finalScore <= 75) {
        console.log("\nROOT CAUSE: SCORE_THRESHOLD_NOT_MET (Score <= 75)");
    } else if (!d.riskApproved) {
        console.log("\nROOT CAUSE: RISK_ENGINE_REJECTION");
    } else if (d.meta.institutional.entriesHalted) {
        console.log("\nROOT CAUSE: DRIFT_HALT_ACTIVE");
    }
  }

  console.log("═══════════════════════════════════════════════════════════════════");
}

auditRejections();
