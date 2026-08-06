/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Portfolio Correlation Monitor
 * ═══════════════════════════════════════════════════════════════════
 */

import * as paper from "../paperState.js";
import { Trade } from "../../models/Trade.js";
import mongoose from "mongoose";

export interface ClusterExposure {
  name: string;
  symbols: string[];
  totalNotional: number;
  percentageOfEquity: number;
}

export interface PortfolioRiskReport {
  riskScore: number; // 0-100
  betaConcentration: number;
  maxCorrelation: number;
  clusters: ClusterExposure[];
  simultaneousDirectionalRisk: number; // % of portfolio in same direction
}

export class PortfolioCorrelationMonitor {
  private static readonly CLUSTERS = {
    "L1_MAJORS": ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
    "L1_ALTS": ["SOLUSDT", "ADAUSDT", "XRPUSDT", "LINKUSDT"],
    "MEME": ["DOGEUSDT"]
  };

  /**
   * Generates a real-time portfolio risk and correlation audit.
   */
  public static async generateReport(userId: string, mode: "PAPER" | "LIVE"): Promise<PortfolioRiskReport> {
    const positions = paper.getOpenPositions(userId, mode);
    const wallet = paper.getWallet(userId, mode, "FUTURES");
    const equity = wallet.get("USDT") ?? 1;

    // 1. Calculate Cluster Exposure
    const clusterReports: ClusterExposure[] = Object.entries(this.CLUSTERS).map(([name, symbols]) => {
      const clusterPositions = positions.filter(p => symbols.includes(p.symbol));
      const notional = clusterPositions.reduce((sum, p) => sum + (p.quantity * p.entryPrice), 0);
      return {
        name,
        symbols,
        totalNotional: notional,
        percentageOfEquity: (notional / equity) * 100
      };
    });

    // 2. Beta Concentration (BTC Alignment)
    const btcPos = positions.find(p => p.symbol === "BTCUSDT");
    const sameDirectionAsBtc = positions.filter(p => p.symbol !== "BTCUSDT" && p.side === btcPos?.side).length;
    const betaConcentration = positions.length > 1 ? sameDirectionAsBtc / (positions.length - 1) : 0;

    // 3. Simultaneous Directional Risk
    const longs = positions.filter(p => p.side === "BUY").length;
    const shorts = positions.filter(p => p.side === "SELL").length;
    const directionalSkew = Math.abs(longs - shorts) / (positions.length || 1);

    // 4. Generate Portfolio Risk Score (0-100)
    let riskScore = 20; // Base baseline
    riskScore += (positions.length * 5); // Volume risk
    riskScore += (betaConcentration * 30); // Correlation risk
    riskScore += (directionalSkew * 20); // Directional risk
    
    // Add penalty for cluster overloading (>10% per cluster)
    clusterReports.forEach(c => {
      if (c.percentageOfEquity > 10) riskScore += 15;
    });

    return {
      riskScore: Math.min(100, Math.max(0, riskScore)),
      betaConcentration: parseFloat(betaConcentration.toFixed(2)),
      maxCorrelation: 0.85, // Static proxy for Ph 6D-A
      clusters: clusterReports,
      simultaneousDirectionalRisk: parseFloat((directionalSkew * 100).toFixed(2))
    };
  }
}
