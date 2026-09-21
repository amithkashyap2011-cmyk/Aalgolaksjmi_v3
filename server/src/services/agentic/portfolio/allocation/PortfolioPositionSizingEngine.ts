/**
 * ═══════════════════════════════════════════════════════════════════
 *  PORTFOLIO POSITION SIZING ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *  Calculates deterministic, risk-governed position sizes across multiple models:
 *   - Fixed Risk, Fixed Capital, Fixed Quantity
 *   - Volatility Adjusted (ATR)
 *   - Fractional Kelly (Half Kelly, Quarter Kelly)
 *  Strictly enforces Indian lot-size quantization (NIFTY: 25, BANKNIFTY: 15)
 *  and caps sizing by strategy capital and single-trade risk thresholds.
 */

import {
  IPositionSizingRequest,
  IPositionSizingResult,
} from "../types.js";
import { roundTo2 } from "../capital/AuthoritativeCapitalManager.js";

export class PortfolioPositionSizingEngine {
  private static readonly MAX_SINGLE_TRADE_EQUITY_PCT = 5.0; // Max 5% of equity notional per position
  private static readonly MAX_TRADE_RISK_EQUITY_PCT = 1.0;    // Max 1% risk per position

  /**
   * Computes optimal, exchange-compliant position size.
   */
  public static calculateSize(
    req: IPositionSizingRequest,
    totalEquity: number,
    strategyAvailableCapital: number
  ): IPositionSizingResult {
    const lotSize = Math.max(1, req.lotSize || 1);
    const entryPrice = Math.max(0.05, req.entryPrice);
    let slDistance = req.stopLossPrice ? Math.abs(entryPrice - req.stopLossPrice) : entryPrice * 0.02;
    if (slDistance <= 0) slDistance = entryPrice * 0.02;

    // Hard single trade risk ceiling (1% of equity)
    const maxRiskCapInr = roundTo2(totalEquity * ((req.maxTradeRiskPct || this.MAX_TRADE_RISK_EQUITY_PCT) / 100));

    // Hard capital limit for this strategy
    const maxCapitalLimit = Math.min(
      strategyAvailableCapital,
      roundTo2(totalEquity * (this.MAX_SINGLE_TRADE_EQUITY_PCT / 100))
    );

    let rawQuantity = 0;
    let kellyFraction: number | undefined;
    let cappedBy: "NONE" | "MARGIN" | "LOT_SIZE" | "RISK_BUDGET" | "STRATEGY_CAP" | "MAX_SINGLE_TRADE" = "NONE";

    switch (req.model) {
      case "FIXED_QUANTITY":
        rawQuantity = lotSize;
        break;

      case "FIXED_CAPITAL": {
        const capitalToDeploy = maxCapitalLimit;
        rawQuantity = entryPrice > 0 ? capitalToDeploy / entryPrice : 0;
        break;
      }

      case "FIXED_RISK": {
        // Quantity = Risk Budget / SL Distance
        const riskTarget = Math.min(maxRiskCapInr, 5000.0);
        rawQuantity = riskTarget / slDistance;
        break;
      }

      case "VOLATILITY_ADJUSTED": {
        // ATR-based sizing: Risk Target / (2 * ATR)
        const atrVal = Math.max(entryPrice * 0.005, req.atr || slDistance);
        const atrRisk = atrVal * 2.0;
        rawQuantity = maxRiskCapInr / atrRisk;
        break;
      }

      case "HALF_KELLY":
      case "QUARTER_KELLY": {
        const p = req.winRate || 0.55;
        const q = 1.0 - p;
        const b = req.payoffRatio || 1.5;

        // Full Kelly: K = (p * b - q) / b
        const fullKelly = Math.max(0.0, (p * b - q) / b);
        const multiplier = req.model === "HALF_KELLY" ? 0.5 : 0.25;
        kellyFraction = roundTo2(fullKelly * multiplier);

        // Deploy Kelly fraction of strategy available capital
        const kellyCapital = Math.min(maxCapitalLimit, strategyAvailableCapital * kellyFraction);
        rawQuantity = kellyCapital / entryPrice;
        break;
      }

      case "PORTFOLIO_OPTIMIZED":
      default: {
        rawQuantity = maxRiskCapInr / slDistance;
        break;
      }
    }

    // 1. Quantize strictly to integer lot size multiples (rounded down)
    const oneLotCapital = roundTo2(lotSize * entryPrice);
    const canCoverOneLot = oneLotCapital <= totalEquity * 0.50;

    let lots = Math.floor(rawQuantity / lotSize);
    if (lots < 1 && canCoverOneLot) {
      // Indivisible contract floor: allow 1 minimum lot if total equity can safely cover it
      lots = 1;
    }

    let quantity = lots * lotSize;
    let capitalRequiredInr = roundTo2(quantity * entryPrice);
    let riskAmountInr = roundTo2(quantity * slDistance);

    // 2. Enforce Max Capital Constraint
    if (capitalRequiredInr > maxCapitalLimit) {
      lots = Math.floor(maxCapitalLimit / (lotSize * entryPrice));
      if (lots < 1 && canCoverOneLot) {
        lots = 1;
        cappedBy = "NONE";
      } else {
        cappedBy = "STRATEGY_CAP";
      }
      quantity = lots * lotSize;
      capitalRequiredInr = roundTo2(quantity * entryPrice);
      riskAmountInr = roundTo2(quantity * slDistance);
    }

    // 3. Enforce Max Risk Constraint
    if (riskAmountInr > maxRiskCapInr) {
      lots = Math.floor(maxRiskCapInr / (lotSize * slDistance));
      if (lots < 1 && canCoverOneLot) {
        lots = 1;
        cappedBy = "NONE";
      } else {
        cappedBy = "RISK_BUDGET";
      }
      quantity = lots * lotSize;
      capitalRequiredInr = roundTo2(quantity * entryPrice);
      riskAmountInr = roundTo2(quantity * slDistance);
    }

    // Final safety checks
    if (quantity === 0) {
      cappedBy = "MARGIN";
    }

    const rationale = `Sized ${lots} lots (${quantity} units) via ${req.model}. Capital: ₹${capitalRequiredInr}, Risk: ₹${riskAmountInr}. Capped by: ${cappedBy}.`;

    return {
      suggestedQuantity: quantity,
      suggestedLots: lots,
      capitalRequiredInr,
      riskAmountInr,
      sizingModelUsed: req.model,
      kellyFraction,
      cappedBy,
      rationale,
    };
  }
}
