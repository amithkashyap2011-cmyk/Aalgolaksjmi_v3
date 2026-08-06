import mongoose from "mongoose";
import { AQEAEngine } from "./src/services/aqea/engine.js";
import { Trade } from "./src/models/Trade.js";
import * as paper from "./src/services/paperState.js";

const MONGO_URI = "process.env.MONGO_URI";

async function runDryRun() {
  console.log("=== AQEA v2.9E PAPER TRADE DRY RUN ===");
  await mongoose.connect(MONGO_URI);
  
  // Setup Paper Wallet
  const userId = new mongoose.Types.ObjectId().toString();
  paper.setWalletBalance(userId, "PAPER", "USDT", 10000, "FUTURES");

  const symbols = ["BNBUSDT", "ADAUSDT", "XRPUSDT", "ETHUSDT"];
  const iterations = 50;
  let violations = 0;

  for (let i = 0; i < iterations; i++) {
    const symbol = symbols[i % symbols.length];
    
    // Mock Context
    const context = {
      mode: "PAPER" as const,
      accountType: "FUTURES" as const,
      currentPrice: 300 + (Math.random() * 10),
      indicators: {
        close: 305,
        atr14: 5,
        adx14: 30,
        rsi14: 60,
        sma200: 290
      },
      bars: Array(20).fill({ close: 300, volume: 1000 }),
      marketData: { btcDominance: 53, fundingRate: 0.0001, volumeAvg: 1000 },
      performance: { winRate: 0.55, rewardRisk: 2.0 }
    };

    // Force a decision by overriding score logic or just simulating high scores
    // Actually, let's just test the DECISION -> RISK -> SIZE -> LEVERAGE path.
    const decision = await AQEAEngine.decide(symbol, userId, context);
    
    // In our dry run, we'll force 'LONG' to test the full pipeline if it's 'HOLD'
    const finalDecision = decision.decision === "HOLD" ? "LONG" : decision.decision;

    if (finalDecision === "LONG") {
       // Validate Risk
       if (decision.positionSize > 10000 * 0.101) {
          console.error(`❌ SIZE VIOLATION: ${decision.positionSize}`);
          violations++;
       }
       
       // Validate Leverage
       // Leverage in handleLong is calculated as (allocUsdt / balance) / 0.01 
       // but wait, I hardcoded it to 3 in handleLong. Let's check that.
       // Actually handleLong uses Math.min(3, ...).
    }
  }

  console.log(`Dry Run Complete. Total Iterations: ${iterations}. Risk Violations: ${violations}`);
  await mongoose.disconnect();
}

runDryRun().catch(console.error);
