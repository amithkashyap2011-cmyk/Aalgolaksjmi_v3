import { RiskEngine } from "./src/services/aqea/riskEngine.js";

async function run() {
    console.log("=== FAILURE INJECTION TEST ===");
    try {
        const ctx = {
            userId: "test", symbol: "BNBUSDT", mode: "PAPER" as const, accountType: "FUTURES" as const,
            currentPrice: 300, atr: 5, winRate: 0.55, rewardRisk: 2.0, fundingRate: 0.0001
        };
        const res = await RiskEngine.validateTrade(ctx);
        console.log("1. Normal Condition (No balance fallback):", res.reason);
    } catch(e) {
        console.log("1. Normal Condition Error:", e.message);
    }
}
run();
