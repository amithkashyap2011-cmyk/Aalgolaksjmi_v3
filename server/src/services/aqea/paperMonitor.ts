/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Paper Trading Monitor (V9.4)
 * ═══════════════════════════════════════════════════════════════════
 */

import { Trade } from "../../models/Trade.js";
import { toValidObjectId } from "../../utils/mongoUtils.js";
import fs from "fs";
import path from "path";

export interface PaperMonitorMetrics {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  sharpeRatio: number;
  maxDrawdown: number;
  tradeDistribution: Record<string, number>;
  drift: {
    pfDelta: number;
    wrDelta: number;
  };
  alerts: string[];
}

export class PaperTradingMonitorService {
  // V9.2 Backtest Benchmark (Config B)
  private static BENCHMARK = {
    PF: 1.83,
    WR: 53.7,
    EXPECTANCY: 0.0013
  };

  /**
   * Generates a daily paper trading performance report.
   */
  public static async generateDailyReport(dayNumber: number, userId: string): Promise<string> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const trades = await Trade.find({
      userId: toValidObjectId(userId),
      mode: "PAPER",
      status: "CLOSED",
      closedAt: { $gte: startOfDay }
    }).lean();

    const metrics = await this.calculateMetrics(trades);
    const reportPath = path.join((process.env.PROJECT_ROOT || path.resolve(__dirname, "../../../")), `AQEA_PAPER_DAY_${dayNumber}.md`);
    
    let content = `# AQEA Paper Trading Monitor — Day ${dayNumber}\n\n`;
    content += `**Timestamp:** ${new Date().toISOString()}\n`;
    content += `**Total Trades:** ${metrics.totalTrades}\n\n`;
    
    content += `## 1. Institutional Metrics\n`;
    content += `- **Win Rate:** ${metrics.winRate.toFixed(1)}% (Target: > 50%)\n`;
    content += `- **Profit Factor:** ${metrics.profitFactor.toFixed(2)} (Target: > 1.20)\n`;
    content += `- **Expectancy:** ${metrics.expectancy.toFixed(4)}\n`;
    content += `- **Sharpe Ratio:** ${metrics.sharpeRatio.toFixed(2)}\n`;
    content += `- **Max Drawdown:** ${metrics.maxDrawdown.toFixed(2)}%\n\n`;
    
    content += `## 2. Benchmark Comparison (vs V9.2 Backtest)\n`;
    content += `| Metric | Paper | V9.2 | Delta |\n| :--- | :--- | :--- | :--- |\n`;
    content += `| PF | ${metrics.profitFactor.toFixed(2)} | ${this.BENCHMARK.PF} | ${(metrics.drift.pfDelta).toFixed(2)} |\n`;
    content += `| WR | ${metrics.winRate.toFixed(1)}% | ${this.BENCHMARK.WR}% | ${(metrics.drift.wrDelta).toFixed(1)}% |\n\n`;
    
    content += `## 3. Trade Distribution\n`;
    content += `| Side | Count | Percentage |\n| :--- | :--- | :--- |\n`;
    for (const [side, count] of Object.entries(metrics.tradeDistribution)) {
      const pct = (count / metrics.totalTrades) * 100;
      content += `| ${side} | ${count} | ${pct.toFixed(1)}% |\n`;
    }

    if (metrics.alerts.length > 0) {
      content += `\n## 🚨 ALERTS\n`;
      metrics.alerts.forEach(a => content += `- ${a}\n`);
    }

    fs.writeFileSync(reportPath, content);
    return reportPath;
  }

  private static async calculateMetrics(trades: any[]): Promise<PaperMonitorMetrics> {
    if (trades.length === 0) {
      return {
        totalTrades: 0, winRate: 0, profitFactor: 1.0, expectancy: 0,
        sharpeRatio: 0, maxDrawdown: 0, tradeDistribution: {},
        drift: { pfDelta: 0, wrDelta: 0 },
        alerts: ["No trades recorded for today"]
      };
    }

    const wins = trades.filter(t => (t.pnl || 0) > 0);
    const losses = trades.filter(t => (t.pnl || 0) < 0);
    
    const winRate = (wins.length / trades.length) * 100;
    
    const grossProfit = wins.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((acc, t) => acc + (t.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99 : 1);

    const returns = trades.map(t => (t.pnl || 0));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / returns.length);
    const sharpe = std > 0 ? (mean / std) * Math.sqrt(365) : 0;

    const dist: Record<string, number> = { BUY: 0, SELL: 0 };
    trades.forEach(t => {
      if (dist[t.side] !== undefined) dist[t.side]++;
    });

    // Alert Logic
    const alerts: string[] = [];
    if (profitFactor < 1.20) alerts.push(`CRITICAL: Profit Factor ${profitFactor.toFixed(2)} < 1.20`);
    if (winRate < 50) alerts.push(`WARNING: Win Rate ${winRate.toFixed(1)}% < 50%`);
    // Max Drawdown alert would require historical equity tracking

    return {
      totalTrades: trades.length,
      winRate,
      profitFactor,
      expectancy: mean,
      sharpeRatio: sharpe,
      maxDrawdown: 0, // Placeholder
      tradeDistribution: dist,
      drift: {
        pfDelta: profitFactor - this.BENCHMARK.PF,
        wrDelta: winRate - this.BENCHMARK.WR
      },
      alerts
    };
  }
}
