import { AQEAEngine } from "../services/aqea/engine.js";
import * as agent from "../services/agentService.js";
import { Settings } from "../models/Settings.js";
import mongoose from "mongoose";

async function testAllSymbols() {
  await mongoose.connect("mongodb://localhost:27017/aalgolakshmi");
  const settings = await Settings.findOne({}).lean();
  const userId = settings?.userId ? String(settings.userId) : "6a39c0e7a5e2995ed257ca68";
  const symbols = settings?.allowedSymbols || ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOTUSDT", "LINKUSDT", "BNBUSDT"];
  
  console.log(`Evaluating symbols: ${symbols.join(", ")}`);
  
  for (const symbol of symbols) {
    try {
      const ctx = await agent.buildContext(symbol, "PAPER", userId, "FUTURES");
      const avgVol = ctx.bars.slice(-20).reduce((a: number, b: any) => a + (b.volume || 0), 0) / 20;
      
      const decision = await AQEAEngine.decide(symbol, userId, {
        mode: "PAPER",
        accountType: "FUTURES",
        currentPrice: ctx.ind.close,
        indicators: ctx.ind,
        bars: ctx.bars,
        marketData: {
          btcDominance: 53.5,
          fundingRate: ctx.fundingRate || 0,
          volumeAvg: avgVol
        },
        performance: { winRate: 0.5, rewardRisk: 1.5 }
      });
      
      console.log(`\n--- SYMBOL: ${symbol} ---`);
      console.log(`Close Price: ${ctx.ind.close}`);
      console.log(`Regime: ${decision.decisionPath.regime}`);
      console.log(`Core Score: ${decision.decisionPath.coreScore}`);
      console.log(`Order Flow Score: ${decision.decisionPath.orderFlowScore}`);
      console.log(`Smart Money Score: ${decision.decisionPath.smartMoneyScore}`);
      console.log(`Final Score: ${decision.decisionPath.finalScore}`);
      console.log(`Model Votes: CNN=${decision.decisionPath.cnnVote}, PPO=${decision.decisionPath.ppoVote}, Transformer=${decision.decisionPath.transformerVote}, Mamba=${decision.decisionPath.mambaVote}`);
      console.log(`Consensus HOLD: ${decision.decisionPath.aiConsensusHold}`);
      console.log(`Final Decision: ${decision.decision}`);
      console.log(`Reasons: ${decision.reasons.join(" | ")}`);
    } catch (e: any) {
      console.error(`Error on ${symbol}: ${e.message}`);
    }
  }
  await mongoose.disconnect();
}

testAllSymbols().catch(console.error);
