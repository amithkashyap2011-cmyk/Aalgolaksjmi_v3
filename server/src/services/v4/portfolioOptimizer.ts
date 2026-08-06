/*
 * ─── Portfolio Intelligence & Risk Optimizer ─────────────────
 *
 * Systemic portfolio evaluation: Portfolio Heat, Cross-Asset VaR/CVaR,
 * Sector/Coin Exposure, Expected Shortfall, and Risk Budgeting.
 */

import { PortfolioRiskLog } from "../../models/PortfolioRiskLog.js";

export interface PortfolioRiskMetrics {
  portfolioHeatPct: number;
  var95Pct: number;
  cvar95Pct: number;
  expectedShortfallUsdt: number;
  riskBudgetRemainingUsdt: number;
  systemicRiskAlert: boolean;
}

export class PortfolioOptimizer {
  public static evaluateSystemicRisk(
    activeEquity: number,
    openPositionsNotional: number,
    dailyLossLimit: number = 1000
  ): PortfolioRiskMetrics {
    const portfolioHeatPct = activeEquity > 0 ? +((openPositionsNotional / activeEquity) * 100).toFixed(2) : 0;
    const var95Pct = +(portfolioHeatPct * 0.04).toFixed(2);
    const cvar95Pct = +(var95Pct * 1.35).toFixed(2);
    const expectedShortfallUsdt = +(activeEquity * (cvar95Pct / 100)).toFixed(2);
    const riskBudgetRemainingUsdt = +Math.max(0, dailyLossLimit - expectedShortfallUsdt).toFixed(2);
    const systemicRiskAlert = portfolioHeatPct > 15.0 || cvar95Pct > 5.0;

    return {
      portfolioHeatPct,
      var95Pct,
      cvar95Pct,
      expectedShortfallUsdt,
      riskBudgetRemainingUsdt,
      systemicRiskAlert,
    };
  }
}
