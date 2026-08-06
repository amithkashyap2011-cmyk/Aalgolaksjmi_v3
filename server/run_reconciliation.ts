import mongoose from "mongoose";
import * as paper from "./src/services/paperState.js";
import { ExposureMonitor } from "./src/services/aqea/exposureMonitor.js";
import { Trade } from "./src/models/Trade.js";
import dotenv from "dotenv";

dotenv.config();

async function runReconciliation() {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(" AQEA — EXPOSURE RECONCILIATION REPORT (v2.4I)");
  console.log("═══════════════════════════════════════════════════════════════════");

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not defined");
  await mongoose.connect(uri);

  try {
    const userId = "69c2bc93c8601b4eaf3abe2f";
    const mode = "PAPER";

    // 1. Fetch Real-time Report
    const report = await ExposureMonitor.getReport(userId, mode);
    
    console.log(`User ID:        ${report.userId}`);
    console.log(`Total Equity:   $${report.equity.toFixed(2)}`);
    console.log(`Liquid USDT:    $${report.freeMargin.toFixed(2)}`);
    console.log(`Margin Used:    $${report.marginUsed.toFixed(2)}`);
    console.log(`Notional Exp:   $${report.notionalExposure.toFixed(2)} (${((report.notionalExposure / report.equity) * 100).toFixed(2)}%)`);
    console.log(`Risk Exposure:  $${report.riskExposure.toFixed(2)} (${((report.riskExposure / report.equity) * 100).toFixed(2)}%)`);

    console.log("\n--- VIOLATIONS ---");
    if (report.violationDetected) {
        report.reasons.forEach(r => console.log(`❌ ${r}`));
    } else {
        console.log("✅ NONE DETECTED");
    }

    // 2. Database Reconciliation
    const openTrades = await Trade.find({ userId: new mongoose.Types.ObjectId(userId), status: "OPEN" });
    const dbNotional = openTrades.reduce((s, t) => s + (t.quantity * t.entryPrice), 0);
    
    console.log("\n--- DB RECONCILIATION ---");
    console.log(`DB Open Trades: ${openTrades.length}`);
    console.log(`DB Notional:    $${dbNotional.toFixed(2)}`);
    console.log(`Diff:           $${(dbNotional - report.notionalExposure).toFixed(2)}`);

    if (Math.abs(dbNotional - report.notionalExposure) < 1.0) {
        console.log("✅ RECONCILIATION PASS");
    } else {
        console.log("⚠️ RECONCILIATION FAIL: Mismatch between memory and database.");
    }

  } catch (err) {
    console.error("Reconciliation failed:", err);
  } finally {
    await mongoose.disconnect();
    console.log("═══════════════════════════════════════════════════════════════════");
  }
}

runReconciliation();
