/**
 * ═══════════════════════════════════════════════════════════════════
 *  PORTFOLIO SCENARIO & STRESS TESTING ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *  Evaluates portfolio vulnerability under severe macroeconomic, volatility,
 *  and execution shocks:
 *   - NIFTY -1%, -2%, -5%, Crash -10%
 *   - BankNIFTY -2%, -5%
 *   - IV Spike (+20 points) & IV Crush (-10 points)
 *   - Slippage Shock & Margin Expansion
 */

import {
  IPortfolioPositionItem,
  IStressScenarioResult,
  IAuthoritativeCapitalState,
} from "../types.js";
import { PortfolioExposureEngine } from "../exposure/PortfolioExposureEngine.js";
import { roundTo2 } from "../capital/AuthoritativeCapitalManager.js";

export interface IScenarioDefinition {
  name: string;
  description: string;
  niftyShiftPct: number;
  bankNiftyShiftPct: number;
  stockShiftPct: number;
  ivShiftPoints: number; // e.g. +15 for IV spike from 15% to 30%
  marginExpansionFactor: number; // e.g. 1.25x exchange SPAN margin hike
}

export class PortfolioScenarioStressEngine {
  private static readonly STANDARD_SCENARIOS: IScenarioDefinition[] = [
    {
      name: "MILD_PULLBACK",
      description: "NIFTY -1%, BankNIFTY -1.2%, IV +2 pts",
      niftyShiftPct: -1.0,
      bankNiftyShiftPct: -1.2,
      stockShiftPct: -1.5,
      ivShiftPoints: 2.0,
      marginExpansionFactor: 1.0,
    },
    {
      name: "MODERATE_CORRECTION",
      description: "NIFTY -2%, BankNIFTY -2.5%, IV +5 pts",
      niftyShiftPct: -2.0,
      bankNiftyShiftPct: -2.5,
      stockShiftPct: -3.0,
      ivShiftPoints: 5.0,
      marginExpansionFactor: 1.1,
    },
    {
      name: "SEVERE_GAP_DOWN",
      description: "NIFTY -5%, BankNIFTY -6%, IV Spike +15 pts",
      niftyShiftPct: -5.0,
      bankNiftyShiftPct: -6.0,
      stockShiftPct: -7.5,
      ivShiftPoints: 15.0,
      marginExpansionFactor: 1.3,
    },
    {
      name: "FLASH_CRASH",
      description: "Market Crash -10%, BankNIFTY -12%, IV Spike +30 pts, Margin Spike 1.5x",
      niftyShiftPct: -10.0,
      bankNiftyShiftPct: -12.0,
      stockShiftPct: -15.0,
      ivShiftPoints: 30.0,
      marginExpansionFactor: 1.5,
    },
    {
      name: "EXPIRY_IV_CRUSH",
      description: "Index Flat, IV collapses -10 pts (Option Seller Beneficiary / Buyer Decay)",
      niftyShiftPct: 0.0,
      bankNiftyShiftPct: 0.0,
      stockShiftPct: 0.0,
      ivShiftPoints: -10.0,
      marginExpansionFactor: 1.0,
    },
    {
      name: "GAP_UP_RALLY",
      description: "NIFTY +2.5%, BankNIFTY +3.0%, IV -3 pts",
      niftyShiftPct: 2.5,
      bankNiftyShiftPct: 3.0,
      stockShiftPct: 3.5,
      ivShiftPoints: -3.0,
      marginExpansionFactor: 1.0,
    },
  ];

  /**
   * Executes stress tests across all standard institutional market scenarios.
   */
  public static runStressSuite(
    positions: IPortfolioPositionItem[],
    capitalState: IAuthoritativeCapitalState
  ): IStressScenarioResult[] {
    return this.STANDARD_SCENARIOS.map((sc) => this.evaluateScenario(positions, capitalState, sc));
  }

  /**
   * Evaluates a single specific market shock scenario against active positions.
   */
  public static evaluateScenario(
    positions: IPortfolioPositionItem[],
    capitalState: IAuthoritativeCapitalState,
    scenario: IScenarioDefinition
  ): IStressScenarioResult {
    let totalPnlImpact = 0;

    for (const pos of positions) {
      const greeks = PortfolioExposureEngine.resolvePositionGreeks(pos);
      const norm = pos.underlying.toUpperCase();

      // Determine price shock percentage
      let priceShiftPct = scenario.stockShiftPct;
      if (norm.includes("BANK")) {
        priceShiftPct = scenario.bankNiftyShiftPct;
      } else if (norm.includes("NIFTY")) {
        priceShiftPct = scenario.niftyShiftPct;
      }

      const spotShiftPaise = pos.currentLtp * (priceShiftPct / 100);

      // Delta P&L component: Delta * (Price Change) * Quantity
      const deltaPnl = greeks.delta * spotShiftPaise * pos.quantity;

      // Gamma P&L component (second order): 0.5 * Gamma * (Price Change)^2 * Quantity
      const gammaPnl = 0.5 * greeks.gamma * Math.pow(spotShiftPaise, 2) * pos.quantity;

      // Vega P&L component: Vega * (IV Change) * Quantity
      const vegaPnl = greeks.vega * scenario.ivShiftPoints * pos.quantity;

      totalPnlImpact += deltaPnl + gammaPnl + vegaPnl;
    }

    const estimatedPnlImpactInr = roundTo2(totalPnlImpact);
    const estimatedPnlImpactPct = capitalState.netEquity > 0
      ? roundTo2((estimatedPnlImpactInr / capitalState.netEquity) * 100)
      : 0;

    // Projected Margin = Current Used Margin * marginExpansionFactor - (P&L loss if debit)
    const currentMargin = capitalState.usedMargin > 0
      ? capitalState.usedMargin
      : positions.reduce((sum, p) => sum + (p.marginRequired || 0), 0);
    const projectedUsedMargin = roundTo2(currentMargin * scenario.marginExpansionFactor);
    const projectedNetEquity = roundTo2(capitalState.netEquity + estimatedPnlImpactInr);

    const projectedMarginUtilizationPct = projectedNetEquity > 0
      ? roundTo2((projectedUsedMargin / projectedNetEquity) * 100)
      : 150.0;

    const marginCallRisk = projectedMarginUtilizationPct >= 100.0;
    const riskBreach = estimatedPnlImpactPct <= -5.0 || marginCallRisk;

    return {
      scenarioName: scenario.name,
      marketShockDescription: scenario.description,
      niftyShiftPct: scenario.niftyShiftPct,
      bankNiftyShiftPct: scenario.bankNiftyShiftPct,
      ivShiftPoints: scenario.ivShiftPoints,
      estimatedPnlImpactInr,
      estimatedPnlImpactPct,
      projectedUsedMargin,
      projectedMarginUtilizationPct,
      marginCallRisk,
      riskBreach,
    };
  }
}
