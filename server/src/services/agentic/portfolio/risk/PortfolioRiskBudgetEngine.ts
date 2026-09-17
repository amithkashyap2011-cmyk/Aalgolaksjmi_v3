/**
 * ═══════════════════════════════════════════════════════════════════
 *  PORTFOLIO RISK BUDGET ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *  Manages multi-tier risk budgets across Portfolio, Strategy, Underlying,
 *  Options Delta, and Overnight exposure in both absolute INR & % Equity.
 */

import { IRiskBudget } from "../types.js";
import { roundTo2 } from "../capital/AuthoritativeCapitalManager.js";

export class PortfolioRiskBudgetEngine {
  private static defaultBudget: IRiskBudget = {
    portfolioDailyRiskInr: 25000.0,  // Max ₹25,000 daily loss budget for ₹10L base
    portfolioDailyRiskPct: 2.5,      // 2.5% of equity
    strategyRiskInr: {
      DEFAULT: 7500.0,               // Max ₹7,500 per strategy
    },
    underlyingRiskInr: {
      NIFTY: 15000.0,
      BANKNIFTY: 12000.0,
      FINNIFTY: 8000.0,
      EQUITY: 10000.0,
    },
    maxSinglePositionRiskPct: 1.0,   // Max 1.0% equity per trade
    maxOptionsDeltaInr: 50000.0,     // Max ₹50,000 equivalent delta
    maxOvernightExposurePct: 30.0,   // Max 30% overnight exposure
    remainingDailyRiskInr: 25000.0,
  };

  /**
   * Retrieves active risk budget scaled to current account equity.
   */
  public static getRiskBudget(currentEquity: number): IRiskBudget {
    const dailyRiskInr = roundTo2(currentEquity * (this.defaultBudget.portfolioDailyRiskPct / 100));
    
    return {
      ...this.defaultBudget,
      portfolioDailyRiskInr: dailyRiskInr,
      remainingDailyRiskInr: dailyRiskInr,
    };
  }

  /**
   * Evaluates if a trade's proposed risk amount fits within remaining risk budgets.
   */
  public static evaluateRiskBudget(
    tradeRiskInr: number,
    strategyId: string,
    underlying: string,
    currentDailyLossInr: number,
    totalEquity: number
  ): {
    approved: boolean;
    remainingDailyBudget: number;
    rejectionReason?: string;
  } {
    const budget = this.getRiskBudget(totalEquity);
    const remainingDailyBudget = roundTo2(Math.max(0, budget.portfolioDailyRiskInr - currentDailyLossInr));

    // 1. Check Portfolio Daily Risk Limit
    if (currentDailyLossInr + tradeRiskInr > budget.portfolioDailyRiskInr) {
      return {
        approved: false,
        remainingDailyBudget,
        rejectionReason: `PORTFOLIO_DAILY_RISK_BREACH: Trade risk ₹${tradeRiskInr} exceeds remaining daily risk budget ₹${remainingDailyBudget}.`,
      };
    }

    // 2. Check Single Position Max Risk Cap
    const maxSinglePositionCap = roundTo2(totalEquity * (budget.maxSinglePositionRiskPct / 100));
    if (tradeRiskInr > maxSinglePositionCap) {
      return {
        approved: false,
        remainingDailyBudget,
        rejectionReason: `SINGLE_TRADE_RISK_LIMIT: Proposed trade risk ₹${tradeRiskInr} exceeds max single position cap of ₹${maxSinglePositionCap} (${budget.maxSinglePositionRiskPct}% of equity).`,
      };
    }

    // 3. Check Underlying Risk Cap
    const norm = underlying.toUpperCase();
    const underlyingCap = budget.underlyingRiskInr[norm] || budget.underlyingRiskInr["EQUITY"] || 10000;
    if (tradeRiskInr > underlyingCap) {
      return {
        approved: false,
        remainingDailyBudget,
        rejectionReason: `UNDERLYING_RISK_CAP_BREACH: Trade risk ₹${tradeRiskInr} exceeds underlying cap for ${norm} (₹${underlyingCap}).`,
      };
    }

    return {
      approved: true,
      remainingDailyBudget: roundTo2(remainingDailyBudget - tradeRiskInr),
    };
  }

  /**
   * Updates custom risk budget parameters.
   */
  public static updateBudget(updates: Partial<IRiskBudget>): void {
    this.defaultBudget = { ...this.defaultBudget, ...updates };
  }
}
