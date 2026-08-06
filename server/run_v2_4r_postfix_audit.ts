/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.4R — Post-Fix Production Audit
 * ═══════════════════════════════════════════════════════════════════
 */

import { AQEAEngine } from "./src/services/aqea/engine.js";
import { AQEA_CONFIG } from "./src/services/aqea/config.js";
import * as paper from "./src/services/paperState.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function runPostfixAudit() {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(" AQEA v2.4R — POST-REPAIR VERIFICATION AUDIT");
  console.log("═══════════════════════════════════════════════════════════════════");

  const uri = process.env.MONGO_URI || "process.env.MONGO_URI";
  await mongoose.connect(uri);

  const userId = "69c2bc93c8601b4eaf3abe2f";
  const symbol = "BTCUSDT";

  // Setup Paper Wallet
  paper.setWalletBalance(userId, "PAPER", "USDT", 10000, "FUTURES");

  const samples = 10; // We'll run a few controlled samples
  const results = [];

  console.log(`Running ${samples} controlled validation samples...`);

  for (let i = 0; i < samples; i++) {
    // Alternate between Bullish/Bearish/Transition to check variance
    const isBull = i % 3 === 0;
    const isBear = i % 3 === 1;
    
    const price = isBull ? 55000 : (isBear ? 45000 : 50000);
    const sma200 = 50000; // Fixed SMA200 to see regime cross
    
    // Construct bars with some "action" for SmartMoney
    // First 50 bars are baseline
    const bars = Array(60).fill({}).map((_, idx) => ({
      open: price,
      high: price + 10,
      low: price - 10,
      close: price,
      volume: 1000
    }));

    // Trigger a Bearish Sweep on the last bar
    if (i === 0) {
      // Sample 0: BULLISH Regime + BULLISH SM Sweep (Confluence)
      bars[59].low = price - 100;
      bars[59].close = price + 5; // Close above low
    } else if (i % 2 === 0) {
      bars[59].high = price + 100;
      bars[59].close = price + 5;
    } else {
      // Trigger a Bullish Sweep on the last bar
      bars[59].low = price - 100;
      bars[59].close = price - 5;
    }

    const indicators = {
      adx14: 45, // Strong Trend
      atr14: 500,
      rsi14: isBull ? 75 : (isBear ? 25 : 50),
      sma200: sma200, // Defect #2 Target
      open: price, high: price + 50, low: price - 50, close: price,
      volume: 1200,
      macd: { macd: 10, signal: 5, histogram: 5 } // Bullish MACD
    };

    const d = await AQEAEngine.decide(symbol, userId, {
      mode: "PAPER",
      accountType: "FUTURES",
      currentPrice: price,
      indicators,
      bars, // Defect #1 Target
      marketData: { btcDominance: 55, fundingRate: 0.0001, volumeAvg: 1000 },
      performance: { winRate: 0.60, rewardRisk: 2.0 }
    });
    
    console.log(`Sample ${i}: Regime=${d.meta.regime}, SM Score=${d.meta.smartMoneyScore}, Sweeps=${JSON.stringify(d.meta.smDiagnostics.liquiditySweeps)}`);

    results.push(d);
  }

  // --- ANALYSIS ---
  const smScores = results.map(r => r.meta.smartMoneyScore);
  const smVariance = Math.max(...smScores) - Math.min(...smScores);
  const regimes = new Set(results.map(r => r.meta.regime));
  const ppoRecs = results.map(r => r.meta.ppoRecommendation);
  const finalScores = results.map(r => r.confidence);

  console.log("\n--- REPAIR EVIDENCE ---");
  
  // Requirement 1: SmartMoney Variance > 0
  console.log(`SmartMoney Variance:   ${smVariance.toFixed(2)} (Expected > 0)`);
  if (smVariance > 0) console.log("✅ DEFECT #1 FIXED: SmartMoney is receiving bars and producing varying scores.");
  else console.log("❌ DEFECT #1 FAILED: SmartMoney still locked at 50.");

  // Requirement 2: Regime Variance > 0
  console.log(`Regimes Observed:      ${Array.from(regimes).join(", ")}`);
  if (regimes.size > 1) console.log("✅ DEFECT #2 FIXED: Regime classification correctly reacts to SMA200 mapping.");
  else console.log("❌ DEFECT #2 FAILED: Regime stuck in single state (check SMA200 mapping).");

  // Requirement 3: PPO Recommendation Availability
  const ppoDefined = ppoRecs.every(rec => rec !== undefined);
  console.log(`PPO_SHADOW_REC defined: ${ppoDefined} (Sample: ${ppoRecs[0]})`);
  if (ppoDefined) console.log("✅ DEFECT #3 FIXED: PPO returns structured meta object (never undefined).");
  else console.log("❌ DEFECT #3 FAILED: PPO still returning undefined metadata.");

  // Final Score Check
  const maxFinal = Math.max(...finalScores);
  console.log(`Final Score Max:       ${maxFinal} (Expected > 70)`);
  if (maxFinal > 70) console.log("✅ SUCCESS: Final score capable of reaching trade thresholds.");

  console.log("═══════════════════════════════════════════════════════════════════");

  await mongoose.disconnect();
}

runPostfixAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
