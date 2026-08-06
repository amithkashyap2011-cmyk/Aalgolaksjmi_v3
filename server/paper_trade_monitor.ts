import mongoose from "mongoose";
import fs from "node:fs";
import { Trade } from "./src/models/Trade.js";
import { AQEA_CONFIG } from "./src/services/aqea/config.js";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error("MONGO_URI not defined");
const REPORT_PATH = "AQEA_DAILY_REPORT.md";

async function generateReport() {
  await mongoose.connect(MONGO_URI);
  
  const trades = await Trade.find({ mode: "PAPER" }).lean();
  const closedTrades = trades.filter(t => t.status === "CLOSED");
  const openTrades = trades.filter(t => t.status === "OPEN" || t.status === "PARTIALLY_FILLED");

  // Daily Filter
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dailyTrades = closedTrades.filter(t => t.closedAt && t.closedAt >= today);

  const calculateStats = (ts: any[]) => {
    if (ts.length === 0) return { pf: 0, wr: 0, net: 0, count: 0, dd: 0 };
    const wins = ts.filter(t => t.pnl > 0);
    const losses = ts.filter(t => t.pnl < 0);
    const gp = wins.reduce((s, t) => s + t.pnl, 0);
    const gl = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const pf = gl === 0 ? (gp > 0 ? 99 : 1) : gp / gl;
    const wr = (wins.length / ts.length) * 100;
    const net = gp - gl;
    
    // Drawdown
    let bal = 0, peak = 0, mdd = 0;
    ts.sort((a,b) => a.closedAt.getTime() - b.closedAt.getTime()).forEach(t => {
      bal += t.pnl;
      if (bal > peak) peak = bal;
      if (peak - bal > mdd) mdd = peak - bal;
    });
    
    return { pf, wr, net, count: ts.length, dd: mdd };
  };

  const globalStats = calculateStats(closedTrades);
  const dailyStats = calculateStats(dailyTrades);

  let report = `# AQEA v2.9 DAILY REPORT — ${new Date().toISOString().split('T')[0]}\n\n`;
  
  report += `## AGGREGATE PERFORMANCE (PAPER)\n`;
  report += `* **Total Trades**: ${globalStats.count}\n`;
  report += `* **Profit Factor**: ${globalStats.pf.toFixed(4)}\n`;
  report += `* **Win Rate**: ${globalStats.wr.toFixed(2)}%\n`;
  report += `* **Net PnL**: $${globalStats.net.toFixed(2)}\n`;
  report += `* **Max Drawdown**: $${globalStats.dd.toFixed(2)}\n\n`;

  report += `## DAILY PERFORMANCE\n`;
  report += `* **Daily PF**: ${dailyStats.pf.toFixed(4)}\n`;
  report += `* **Daily WR**: ${dailyStats.wr.toFixed(2)}%\n`;
  report += `* **Daily PnL**: $${dailyStats.net.toFixed(2)}\n`;
  report += `* **Daily DD**: $${dailyStats.dd.toFixed(2)}\n\n`;

  report += `## RISK COMPLIANCE\n`;
  report += `* **Max Leverage Cap**: ${AQEA_CONFIG.MAX_LEVERAGE}x\n`;
  report += `* **Max Risk/Trade**: ${(AQEA_CONFIG.MAX_RISK_PER_TRADE * 100).toFixed(1)}%\n`;
  
  const violations = closedTrades.filter(t => t.leverage > AQEA_CONFIG.MAX_LEVERAGE).length;
  report += `* **Risk Violations**: ${violations}\n\n`;

  report += `## OPEN POSITIONS (${openTrades.length})\n`;
  if (openTrades.length > 0) {
    report += `| Symbol | Side | Entry | Qty | Leverage | UnrPnL |\n`;
    report += `|---|---|---|---|---|---|\n`;
    openTrades.forEach(t => {
      report += `| ${t.symbol} | ${t.side} | ${t.entryPrice} | ${t.quantity.toFixed(4)} | ${t.leverage}x | - |\n`;
    });
  } else {
    report += `*No active positions.*\n`;
  }

  report += `\n## TRADE GATES\n`;
  const gates = [
    { target: 100, pf: 1.10, wr: 45, dd: 15 },
    { target: 250, pf: 1.15, wr: 45, dd: 15 },
    { target: 500, pf: 1.20, wr: 45, dd: 20 },
  ];

  gates.forEach(g => {
    const status = globalStats.count >= g.target ? (globalStats.pf >= g.pf ? "✅ PASS" : "❌ FAIL") : "⏳ PENDING";
    report += `* **${g.target} Trade Gate**: ${status} (Req: PF>${g.pf.toFixed(2)})\n`;
  });

  fs.writeFileSync(REPORT_PATH, report);
  console.log(`Report generated: ${REPORT_PATH}`);
  
  await mongoose.disconnect();
}

generateReport().catch(console.error);
