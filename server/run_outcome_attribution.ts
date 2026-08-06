import mongoose from "mongoose";
import { Trade } from "./src/models/Trade.js";
import { AqeaAudit } from "./src/models/AqeaAudit.js";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  const uri = process.env.MONGO_URI || "process.env.MONGO_URI";
  await mongoose.connect(uri);

  const closedTrades = await Trade.find({ status: "CLOSED" }).sort({ entryTime: -1 }).lean();
  console.log(`Analyzing ${closedTrades.length} trades...`);

  const results: any[] = [];

  for (const trade of closedTrades) {
    // Find the audit log that triggered this trade
    // It should be an "orchestrator" component entry just before entryTime
    const audit = await AqeaAudit.findOne({
      symbol: trade.symbol,
      component: "orchestrator",
      timestamp: { $lte: trade.entryTime }
    }).sort({ timestamp: -1 }).lean();

    if (!audit) continue;

    const outcome = (trade.pnl || 0) > 0 ? "WIN" : ((trade.pnl || 0) < 0 ? "LOSS" : "BREAKEVEN");
    const marketDirection = trade.side === "BUY" ? (outcome === "WIN" ? "UP" : "DOWN") : (outcome === "WIN" ? "DOWN" : "UP");

    const data = audit.data || {};
    const ai = data.aiPredictions || [];
    const cnn = ai.find((p: any) => p.predictor.includes("CNN"));
    const ppo = ai.find((p: any) => p.predictor.includes("PPO"));
    const transformer = ai.find((p: any) => p.predictor.includes("TRANSFORMER"));

    results.push({
      symbol: trade.symbol,
      side: trade.side,
      outcome,
      marketDirection,
      cnn: cnn?.direction || "HOLD",
      ppo: ppo?.direction || "HOLD",
      transformer: transformer?.direction || "HOLD",
      ofScore: data.orderFlowScore,
      smScore: data.smartMoneyScore,
      coreScore: data.aqeaScore,
      finalDecision: audit.message.replace("Decision: ", "")
    });
  }

  const attribution = {
    cnn: { correct: 0, total: 0 },
    ppo: { correct: 0, total: 0 },
    transformer: { correct: 0, total: 0 },
    core: { correct: 0, total: 0 },
    aqea: { correct: 0, total: 0 }
  };

  results.forEach(r => {
    const isUp = r.marketDirection === "UP";
    const isDown = r.marketDirection === "DOWN";

    // CNN
    if (r.cnn !== "HOLD") {
      attribution.cnn.total++;
      if ((r.cnn === "LONG" && isUp) || (r.cnn === "SHORT" && isDown)) attribution.cnn.correct++;
    }

    // PPO
    if (r.ppo !== "HOLD") {
      attribution.ppo.total++;
      if ((r.ppo === "LONG" && isUp) || (r.ppo === "SHORT" && isDown)) attribution.ppo.correct++;
    }

    // Transformer
    if (r.transformer !== "HOLD") {
      attribution.transformer.total++;
      if ((r.transformer === "LONG" && isUp) || (r.transformer === "SHORT" && isDown)) attribution.transformer.correct++;
    }

    // Core
    attribution.core.total++;
    if ((r.coreScore > 50 && isUp) || (r.coreScore < 50 && isDown)) attribution.core.correct++;

    // AQEA
    attribution.aqea.total++;
    if (r.outcome === "WIN") attribution.aqea.correct++;
  });

  console.log("\n--- SIGNAL OUTCOME ATTRIBUTION ---");
  Object.entries(attribution).forEach(([comp, stats]: [string, any]) => {
     const acc = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
     console.log(`${comp.toUpperCase()}: Accuracy ${acc.toFixed(1)}% (${stats.correct}/${stats.total})`);
  });

  console.log("\nRecent Trade Data Table:");
  console.table(results.slice(0, 10));

  await mongoose.disconnect();
}

run();
