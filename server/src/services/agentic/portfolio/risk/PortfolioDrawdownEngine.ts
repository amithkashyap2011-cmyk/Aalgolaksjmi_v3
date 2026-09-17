/**
 * ═══════════════════════════════════════════════════════════════════
 *  PORTFOLIO DRAWDOWN & DYNAMIC RISK SCALING ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *  Monitors multi-horizon drawdowns and executes deterministic state transitions:
 *   NORMAL -> CAUTION -> REDUCE_RISK -> STOP_NEW_ENTRIES -> EMERGENCY
 *  Scales capital risk budgets dynamically as drawdown approaches limits.
 */

import { PortfolioDrawdownState, VolatilityRegime } from "../types.js";
import { roundTo2 } from "../capital/AuthoritativeCapitalManager.js";

export interface IDrawdownMetrics {
  peakEquity: number;
  currentEquity: number;
  currentDrawdownInr: number;
  currentDrawdownPct: number;
  dailyDrawdownPct: number;
  weeklyDrawdownPct: number;
  monthlyDrawdownPct: number;
  state: PortfolioDrawdownState;
  riskScaleMultiplier: number;
  canOpenNewPositions: boolean;
  warnings: string[];
}

export class PortfolioDrawdownEngine {
  private static peakEquity: number = 0.0;
  private static dayStartEquity: number = 0.0;
  private static weekStartEquity: number = 0.0;
  private static monthStartEquity: number = 0.0;
  private static initialized: boolean = false;

  // Drawdown state thresholds (% of peak/period equity)
  private static readonly CAUTION_THRESHOLD_PCT = 2.0;       // 2.0% drawdown
  private static readonly REDUCE_RISK_THRESHOLD_PCT = 4.0;   // 4.0% drawdown
  private static readonly STOP_ENTRIES_THRESHOLD_PCT = 6.0;  // 6.0% drawdown
  private static readonly EMERGENCY_THRESHOLD_PCT = 10.0;    // 10.0% drawdown

  /**
   * Evaluates portfolio drawdown and updates state machine.
   */
  public static evaluateDrawdown(currentEquity: number): IDrawdownMetrics {
    if (!this.initialized || this.peakEquity <= 0) {
      if (currentEquity > 0) {
        this.peakEquity = currentEquity;
        this.dayStartEquity = currentEquity;
        this.weekStartEquity = currentEquity;
        this.monthStartEquity = currentEquity;
        this.initialized = true;
      }
    } else if (currentEquity > this.peakEquity) {
      this.peakEquity = currentEquity;
    }

    const currentDrawdownInr = roundTo2(Math.max(0, this.peakEquity - currentEquity));
    const currentDrawdownPct = this.peakEquity > 0 ? roundTo2((currentDrawdownInr / this.peakEquity) * 100) : 0;

    const dailyDrawdownPct = this.dayStartEquity > 0
      ? roundTo2(Math.max(0, (this.dayStartEquity - currentEquity) / this.dayStartEquity) * 100)
      : 0;

    const weeklyDrawdownPct = this.weekStartEquity > 0
      ? roundTo2(Math.max(0, (this.weekStartEquity - currentEquity) / this.weekStartEquity) * 100)
      : 0;

    const monthlyDrawdownPct = this.monthStartEquity > 0
      ? roundTo2(Math.max(0, (this.monthStartEquity - currentEquity) / this.monthStartEquity) * 100)
      : 0;

    const warnings: string[] = [];
    let state: PortfolioDrawdownState = "NORMAL";
    let riskScaleMultiplier = 1.0;
    let canOpenNewPositions = true;

    if (currentDrawdownPct >= this.EMERGENCY_THRESHOLD_PCT || dailyDrawdownPct >= 7.0) {
      state = "EMERGENCY";
      riskScaleMultiplier = 0.0;
      canOpenNewPositions = false;
      warnings.push(
        `CRITICAL_PORTFOLIO_DRAWDOWN: Drawdown (${currentDrawdownPct}%) breached EMERGENCY limit (${this.EMERGENCY_THRESHOLD_PCT}%). All new autonomous entries HALTED.`
      );
    } else if (currentDrawdownPct >= this.STOP_ENTRIES_THRESHOLD_PCT || dailyDrawdownPct >= 5.0) {
      state = "STOP_NEW_ENTRIES";
      riskScaleMultiplier = 0.0;
      canOpenNewPositions = false;
      warnings.push(
        `DRAWDOWN_STOP_NEW_ENTRIES: Drawdown (${currentDrawdownPct}%) breached ${this.STOP_ENTRIES_THRESHOLD_PCT}%. Preserving existing positions only.`
      );
    } else if (currentDrawdownPct >= this.REDUCE_RISK_THRESHOLD_PCT || dailyDrawdownPct >= 3.5) {
      state = "REDUCE_RISK";
      riskScaleMultiplier = 0.5; // Cut position sizing by 50%
      warnings.push(
        `DRAWDOWN_REDUCE_RISK: Drawdown (${currentDrawdownPct}%) in REDUCE_RISK zone. Sizing scaled down to 50%.`
      );
    } else if (currentDrawdownPct >= this.CAUTION_THRESHOLD_PCT || dailyDrawdownPct >= 2.0) {
      state = "CAUTION";
      riskScaleMultiplier = 0.75; // Cut position sizing by 25%
      warnings.push(`DRAWDOWN_CAUTION: Drawdown (${currentDrawdownPct}%) in CAUTION zone. Sizing scaled down to 75%.`);
    }

    return {
      peakEquity: this.peakEquity,
      currentEquity,
      currentDrawdownInr,
      currentDrawdownPct,
      dailyDrawdownPct,
      weeklyDrawdownPct,
      monthlyDrawdownPct,
      state,
      riskScaleMultiplier,
      canOpenNewPositions,
      warnings,
    };
  }

  /**
   * Combines drawdown state with current Volatility Regime to compute final risk multiplier.
   */
  public static getCombinedRiskScaling(drawdownState: PortfolioDrawdownState, regime: VolatilityRegime): number {
    let baseMultiplier = 1.0;
    switch (drawdownState) {
      case "NORMAL":
        baseMultiplier = 1.0;
        break;
      case "CAUTION":
        baseMultiplier = 0.75;
        break;
      case "REDUCE_RISK":
        baseMultiplier = 0.5;
        break;
      case "STOP_NEW_ENTRIES":
      case "EMERGENCY":
        return 0.0;
    }

    // Volatility Regime Scaling
    let volMultiplier = 1.0;
    switch (regime) {
      case "LOW":
        volMultiplier = 1.0;
        break;
      case "NORMAL":
        volMultiplier = 1.0;
        break;
      case "HIGH":
        volMultiplier = 0.7; // Reduce exposure in high volatility
        break;
      case "EXTREME":
        volMultiplier = 0.4; // Heavily scale back during extreme volatility shocks
        break;
    }

    return roundTo2(baseMultiplier * volMultiplier);
  }

  /**
   * Resets period equity baselines.
   */
  public static resetBaseline(equity: number): void {
    this.peakEquity = equity;
    this.dayStartEquity = equity;
    this.weekStartEquity = equity;
    this.monthStartEquity = equity;
    this.initialized = equity > 0;
  }
}
