import mongoose from "mongoose";
import { AqeaAudit } from "./src/models/AqeaAudit.js";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  const uri = process.env.MONGO_URI || "process.env.MONGO_URI";
  await mongoose.connect(uri);

  const logs = await AqeaAudit.find({ component: "orchestrator" })
    .sort({ timestamp: -1 })
    .limit(1000)
    .lean();

  const runSimulation = (mode: string) => {
    const stats = { LONG: 0, SHORT: 0, HOLD: 0, total: 0 };
    
    logs.forEach(log => {
      const data = log.data || {};
      const regimeState = data.regime || "TRANSITION";
      
      // We need to approximate multiTfScore from the current coreScore and multiplier
      // coreScore = regimeScore * (0.9 + multiTfScore/200)
      // Since regimeScore for TRANSITION is 50, and coreScore is 68 in samples:
      // 68 = 50 * (0.9 + X/200) => 1.36 = 0.9 + X/200 => 0.46 = X/200 => X = 92
      // This confirms the trend (92) is lifting the neutral regime (50) to 68.
      
      const currentCore = data.aqeaScore || 50;
      let simulatedCore = currentCore;
      const multiTfScore = 90; // Approximation based on audit data (Avg Core 92)

      if (regimeState === "TRANSITION" || regimeState === "RANGING") {
         if (mode === "AVERAGE") {
            simulatedCore = (50 + multiTfScore) / 2; // 70
         } else if (mode === "NEUTRAL_RESET") {
            simulatedCore = 50;
         } else if (mode === "AI_LEAD") {
            simulatedCore = 40; // Allow AI to easily pull to SHORT
         }
      }

      // Ensembled weighting
      const ofScore = data.orderFlowScore || 50;
      const smScore = data.smartMoneyScore || 50;
      const ai = data.aiPredictions || [];
      const cnnPred = ai.find((p: any) => p.predictor.includes("CNN"));
      const cnnScore = cnnPred ? (cnnPred.direction === "LONG" ? 100 : (cnnPred.direction === "SHORT" ? 0 : 50)) : 50;

      const w = data.weightsApplied || { core: 0.70, orderFlow: 0.15, smartMoney: 0.10, cnn: 0.05 };
      const finalScore = (simulatedCore * w.core) + (ofScore * w.orderFlow) + (smScore * w.smartMoney) + (cnnScore * w.cnn);

      let decision = "HOLD";
      if (finalScore > 75) decision = "LONG";
      else if (finalScore < 25) decision = "SHORT";

      stats[decision as keyof typeof stats]++;
      stats.total++;
    });

    return {
      LONG: ((stats.LONG / stats.total) * 100).toFixed(1) + "%",
      SHORT: ((stats.SHORT / stats.total) * 100).toFixed(1) + "%",
      HOLD: ((stats.HOLD / stats.total) * 100).toFixed(1) + "%"
    };
  };

  const current = runSimulation("CURRENT");
  const average = runSimulation("AVERAGE");
  const reset = runSimulation("NEUTRAL_RESET");
  const aiLead = runSimulation("AI_LEAD");

  console.log("Current (Multiplier Bias):");
  console.log(`L: ${current.LONG}, S: ${current.SHORT}, H: ${current.HOLD}`);

  console.log("\nScenario: Simple Average in Transition:");
  console.log(`L: ${average.LONG}, S: ${average.SHORT}, H: ${average.HOLD}`);

  console.log("\nScenario: Neutral Reset (50) in Transition:");
  console.log(`L: ${reset.LONG}, S: ${reset.SHORT}, H: ${reset.HOLD}`);

  console.log("\nScenario: AI Lead (40) in Transition:");
  console.log(`L: ${aiLead.LONG}, S: ${aiLead.SHORT}, H: ${aiLead.HOLD}`);

  await mongoose.disconnect();
}

run();
