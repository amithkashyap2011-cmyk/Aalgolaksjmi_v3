import mongoose from "mongoose";
import { AQEAEngine } from "./src/services/aqea/engine.js";
import * as paper from "./src/services/paperState.js";
import { Trade } from "./src/models/Trade.js";
import { ExposureMonitor } from "./src/services/aqea/exposureMonitor.js";
import dotenv from "dotenv";

dotenv.config();

async function runCapitalPreservationTest() {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(" AQEA — 100 TRADE CAPITAL PRESERVATION TEST (v2.4I)");
  console.log("═══════════════════════════════════════════════════════════════════");

  const uri = process.env.MONGO_URI || "process.env.MONGO_URI";
  await mongoose.connect(uri);

  try {
    const userId = "69c2bc93c8601b4eaf3abe2f";
    const mode = "PAPER";
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "ADAUSDT"];

    // 1. Reset Environment
    await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
    paper.setWalletBalance(userId, mode, "USDT", 10000, "FUTURES");
    const open = paper.getOpenPositions(userId, mode);
    open.forEach(p => paper.removePosition(userId, p.symbol, mode, p.accountType));

    console.log("Environment Reset: Wallet=$10,000, Trades=0, Positions=0");

    let totalTrades = 0;
    let wins = 0;
    let violations = 0;
    let maxDD = 0;
    let peakEquity = 10000;

    // 2. Execute 100 Simulated Trade Cycles
    for (let i = 0; i < 100; i++) {
        const symbol = symbols[i % symbols.length];
        
        // Mock market tick
        const currentPrice = 50000 + Math.random() * 1000;
        const indicators = { adx14: 30, atr14: 1000, bars: [] };

        // AQEA Decision
        const d = await AQEAEngine.decide(symbol, userId, {
            mode,
            accountType: "FUTURES",
            currentPrice,
            indicators,
            marketData: { btcDominance: 53, fundingRate: 0.0001, volumeAvg: 1000 },
            performance: { winRate: 0.55, rewardRisk: 2 }
        });

        if (d.decision !== "HOLD") {
            // Verify Risk
            if (d.positionSize > 10000 * 0.10) {
                console.log(`❌ VIOLATION: Position size ${d.positionSize} > 10% notional cap`);
                violations++;
            }
            
            // Open Position (Simulated handleLong side effects)
            totalTrades++;
            const isWin = Math.random() < 0.55;
            const pnl = isWin ? (d.positionSize * 0.04) : -(d.positionSize * 0.02);
            if (isWin) wins++;

            // Update stats
            const stats = paper.getWalletStats(userId, mode, "FUTURES");
            const currentEquity = stats.equity + pnl;
            if (currentEquity > peakEquity) peakEquity = currentEquity;
            const dd = (peakEquity - currentEquity) / peakEquity;
            if (dd > maxDD) maxDD = dd;
        }

        // Periodic Status
        if (i % 20 === 0) {
            const report = await ExposureMonitor.getReport(userId, mode);
            console.log(`Cycle ${i}: Equity=$${report.equity.toFixed(2)} Exposure=${((report.notionalExposure / report.equity) * 100).toFixed(2)}% Positions=${paper.getOpenPositions(userId, mode).length}`);
        }
    }

    console.log("\n--- FINAL TEST RESULTS ---");
    console.log(`Total Trades:       ${totalTrades}`);
    console.log(`Win Rate:           ${((wins / totalTrades) * 100).toFixed(2)}%`);
    console.log(`Risk Violations:    ${violations}`);
    console.log(`Max Drawdown:       ${(maxDD * 100).toFixed(2)}%`);

    if (violations === 0 && maxDD < 0.10) {
        console.log("\n>>> CERTIFICATION: PASS <<<");
    } else {
        console.log("\n>>> CERTIFICATION: FAIL <<<");
    }

  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await mongoose.disconnect();
    console.log("═══════════════════════════════════════════════════════════════════");
  }
}

runCapitalPreservationTest();
