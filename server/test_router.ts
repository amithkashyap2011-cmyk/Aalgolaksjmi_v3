import { RegimeRoutingService } from "./src/services/aqea/routing/regimeRoutingService.js";
import { RegimeState } from "./src/services/aqea/regimeEngine.js";
import { FeatureVector } from "./src/services/aqea/featureStore.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function testRouter() {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(" AQEA v2.2A — DYNAMIC REGIME ROUTER VALIDATION TEST");
  console.log("═══════════════════════════════════════════════════════════════════");

  const uri = process.env.MONGO_URI || "process.env.MONGO_URI";
  await mongoose.connect(uri);

  const mockFV: any = {
    userId: "60b8d4f0f1d2b3a4c5d6e7f8", // Valid ObjectId string for mock
    symbol: "BTCUSDT",
    market: { rsi: 50 },
    regime: { score: 75 },
    orderFlow: {},
    smartMoney: {},
    execution: {}
  };

  const regimes: RegimeState[] = [
    "TRENDING_BULL",
    "TRENDING_BEAR",
    "RANGING",
    "HIGH_VOLATILITY",
    "TRANSITION"
  ];

  for (const regime of regimes) {
    console.log(`\nTesting Regime: ${regime}`);
    const decision = await RegimeRoutingService.route(regime, mockFV);
    console.log(`Active Model:   ${decision.activeModel}`);
    console.log(`Reason:         ${decision.routingReason}`);
    console.log(`Prediction:     ${decision.prediction?.direction} (Conf: ${decision.prediction?.confidence.toFixed(2)})`);
    
    if (decision.prediction?.meta?.gated) {
        console.log(`Status:         GATED (Reason: ${decision.prediction.meta.reason})`);
    } else {
        console.log(`Status:         ACTIVE`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════════════");
}

testRouter();
