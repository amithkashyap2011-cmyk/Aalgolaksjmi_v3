import mongoose from "mongoose";
import fs from "node:fs";
import { Trade } from "./src/models/Trade.js";
import { AQEA_CONFIG } from "./src/services/aqea/config.js";

const MONGO_URI = process.env.MONGO_URI || "process.env.MONGO_URI";
const REPORT_PATH = "AQEA_GATEKEEPER_REPORT.md";

async function runGatekeeper() {
  await mongoose.connect(MONGO_URI);
  
  const trades = await Trade.find({ mode: "PAPER" }).sort({ closedAt: 1 }).lean();
  const closedTrades = trades.filter(t => t.status === "CLOSED" && t.closedAt);
  const totalCount = closedTrades.length;

  const calculateStats = (ts: any[]) => {
    if (ts.length === 0) return { pf: 0, wr: 0, net: 0, count: 0, dd: 0, avgR: 0 };
    const wins = ts.filter(t => t.pnl > 0);
    const losses = ts.filter(t => t.pnl < 0);
    const gp = wins.reduce((s, t) => s + t.pnl, 0);
    const gl = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const pf = gl === 0 ? (gp > 0 ? 99 : 1) : gp / gl;
    const wr = (wins.length / ts.length) * 100;
    const net = gp - gl;
    
    // Average R (PnL / RiskAmount)
    // Risk amount = balance * 0.01 (approx)
    const avgR = ts.reduce((s, t) => s + (t.pnl / (t.meta?.maxLoss || 1)), 0) / ts.length;

    // Drawdown
    let bal = 0, peak = 0, mdd = 0;
    ts.forEach(t => {
      bal += t.pnl;
      if (bal > peak) peak = bal;
      if (peak - bal > mdd) mdd = peak - bal;
    });
    
    return { pf, wr, net, count: ts.length, dd: mdd, avgR };
  };

  const rolling25 = calculateStats(closedTrades.slice(-25));
  const rolling50 = calculateStats(closedTrades.slice(-50));
  const rolling100 = calculateStats(closedTrades.slice(-100));
  const globalStats = calculateStats(closedTrades);

  // Early Warning Triggers
  const warnings: string[] = [];
  if (rolling25.count >= 25 && rolling25.pf < 1.0) warnings.push("PF < 1.0 over last 25 trades");
  if (globalStats.dd > 1000) warnings.push("DD > 10% (assuming $10k base)"); // Adjust based on actual balance if known
  
  // Consecutive SL
  let consecutiveSL = 0;
  for (let i = closedTrades.length - 1; i >= 0; i--) {
    if (closedTrades[i].meta?.exitReason === "STOP_LOSS") consecutiveSL++;
    else break;
  }
  if (consecutiveSL >= 3) warnings.push("3 consecutive ATR stop losses occurred");

  // Circuit Breaker
  let circuitBroken = false;
  if (rolling50.count >= 50 && rolling50.pf < 0.8) circuitBroken = true;
  // (Daily/Weekly DD logic requires historical balance snapshots, omitted for now)

  let report = `# AQEA v2.9A GATEKEEPER REPORT — ${new Date().toISOString()}\n\n`;

  report += `## CURRENT STATUS\n`;
  let stage = "PAPER_TRADING";
  if (totalCount >= 500) stage = "500_TRADE_GATE";
  else if (totalCount >= 250) stage = "250_TRADE_GATE";
  else if (totalCount >= 100) stage = "100_TRADE_GATE";
  
  report += `* **Current Stage**: ${stage}\n`;
  report += `* **Trades Executed**: ${totalCount}\n`;
  report += `* **Circuit Breaker**: ${circuitBroken ? "🔴 BROKEN (Trading Disabled)" : "🟢 ACTIVE"}\n\n`;

  report += `## ROLLING PERFORMANCE\n`;
  report += `| Period | PF | WR% | Net PnL | Avg R | Max DD |\n`;
  report += `|---|---|---|---|---|---|\n`;
  report += `| Last 25 | ${rolling25.pf.toFixed(2)} | ${rolling25.wr.toFixed(1)}% | $${rolling25.net.toFixed(2)} | ${rolling25.avgR.toFixed(2)} | $${rolling25.dd.toFixed(2)} |\n`;
  report += `| Last 50 | ${rolling50.pf.toFixed(2)} | ${rolling50.wr.toFixed(1)}% | $${rolling50.net.toFixed(2)} | ${rolling50.avgR.toFixed(2)} | $${rolling50.dd.toFixed(2)} |\n`;
  report += `| Last 100 | ${rolling100.pf.toFixed(2)} | ${rolling100.wr.toFixed(1)}% | $${rolling100.net.toFixed(2)} | ${rolling100.avgR.toFixed(2)} | $${rolling100.dd.toFixed(2)} |\n`;
  report += `| **Overall** | **${globalStats.pf.toFixed(4)}** | **${globalStats.wr.toFixed(2)}%** | **$${globalStats.net.toFixed(2)}** | **${globalStats.avgR.toFixed(2)}** | **$${globalStats.dd.toFixed(2)}** |\n\n`;

  if (warnings.length > 0) {
    report += `## ⚠️ EARLY WARNINGS\n`;
    warnings.forEach(w => report += `* ${w}\n`);
    report += `\n`;
  }

  report += `## PROMOTION GATES\n`;
  const gates = [
    { target: 100, pf: 1.10, wr: 45 },
    { target: 250, pf: 1.15, net: 0 },
    { target: 500, pf: 1.20, net: 0 },
  ];

  gates.forEach(g => {
    let status = "⏳ PENDING";
    if (totalCount >= g.target) {
        const pfPass = globalStats.pf > g.pf;
        const wrPass = g.wr ? globalStats.wr > g.wr : true;
        const netPass = g.net !== undefined ? globalStats.net > g.net : true;
        status = (pfPass && wrPass && netPass) ? "✅ PASS" : "❌ FAIL";
    }
    report += `* **${g.target} Trade Gate**: ${status} (Required PF > ${g.pf.toFixed(2)})\n`;
  });

  fs.writeFileSync(REPORT_PATH, report);
  if (circuitBroken) {
      console.log(`[AQEA_CIRCUIT_BREAKER_EVENT] Performance degraded. PF=${rolling50.pf.toFixed(2)}`);
  }

  await mongoose.disconnect();
}

runGatekeeper().catch(console.error);
