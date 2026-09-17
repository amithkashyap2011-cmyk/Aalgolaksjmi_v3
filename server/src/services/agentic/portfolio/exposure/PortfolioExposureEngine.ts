/**
 * ═══════════════════════════════════════════════════════════════════
 *  PORTFOLIO EXPOSURE & GREEKS ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *  Computes multi-dimensional Gross, Net, and Greek Exposures:
 *   - Asset Class (Equity, Futures, Options, Cash)
 *   - Underlying (NIFTY, BANKNIFTY, FINNIFTY, Stocks)
 *   - Directional (Long, Short, Delta Neutral)
 *   - Strategy & Originating Agent Lineage
 *   - Options Greeks: Delta, Gamma, Theta, Vega (via Black-Scholes)
 *  Strictly avoids confusing Premium Paid, Notional Value, Margin, and Risk.
 */

import {
  IPortfolioPositionItem,
  IPortfolioExposure,
  IPortfolioGreeks,
  AssetClass,
  ExposureDirection,
} from "../types.js";
import { OptionChainService } from "../../../indianMarket/optionChainService.js";
import { roundTo2 } from "../capital/AuthoritativeCapitalManager.js";

export class PortfolioExposureEngine {
  /**
   * Calculates exhaustive portfolio exposure metrics from active positions.
   */
  public static calculateExposure(
    positions: IPortfolioPositionItem[],
    totalEquity: number
  ): IPortfolioExposure {
    let grossExposure = 0;
    let longExposure = 0;
    let shortExposure = 0;

    const exposureByAssetClass: Record<AssetClass, number> = {
      EQUITY: 0,
      FUTURES: 0,
      OPTIONS: 0,
      CASH: 0,
    };

    const exposureByUnderlying: Record<string, number> = {};
    const exposureByStrategy: Record<string, number> = {};
    const exposureByAgent: Record<string, number> = {};

    let portfolioDelta = 0;
    let portfolioGamma = 0;
    let portfolioTheta = 0;
    let portfolioVega = 0;

    const deltaByUnderlying: Record<string, number> = {};
    const deltaByStrategy: Record<string, number> = {};
    const thetaByUnderlying: Record<string, number> = {};
    const vegaByUnderlying: Record<string, number> = {};

    for (const pos of positions) {
      const notional = Math.abs(pos.notionalValue || pos.currentLtp * pos.quantity);
      grossExposure += notional;

      // 1. Directional Exposure
      const isLong = pos.side === "BUY";
      if (isLong) {
        longExposure += notional;
      } else {
        shortExposure += notional;
      }

      // 2. Asset Class Exposure
      exposureByAssetClass[pos.assetClass] = (exposureByAssetClass[pos.assetClass] || 0) + notional;

      // 3. Underlying Exposure
      const normUnderlying = pos.underlying.toUpperCase();
      exposureByUnderlying[normUnderlying] = (exposureByUnderlying[normUnderlying] || 0) + notional;

      // 4. Strategy & Agent Exposure
      const stratKey = pos.strategyId || "UNKNOWN_STRATEGY";
      exposureByStrategy[stratKey] = (exposureByStrategy[stratKey] || 0) + notional;

      const agentKey = pos.agentId || "SYSTEM";
      exposureByAgent[agentKey] = (exposureByAgent[agentKey] || 0) + notional;

      // 5. Greek Calculations
      const greeks = this.resolvePositionGreeks(pos);
      pos.greeks = greeks;

      // Dollar/Rupee Delta contribution: Delta * Quantity
      const posDelta = greeks.delta * pos.quantity;
      const posGamma = greeks.gamma * pos.quantity;
      const posTheta = greeks.theta * pos.quantity;
      const posVega = greeks.vega * pos.quantity;

      portfolioDelta += posDelta;
      portfolioGamma += posGamma;
      portfolioTheta += posTheta;
      portfolioVega += posVega;

      deltaByUnderlying[normUnderlying] = (deltaByUnderlying[normUnderlying] || 0) + posDelta;
      deltaByStrategy[stratKey] = (deltaByStrategy[stratKey] || 0) + posDelta;
      thetaByUnderlying[normUnderlying] = (thetaByUnderlying[normUnderlying] || 0) + posTheta;
      vegaByUnderlying[normUnderlying] = (vegaByUnderlying[normUnderlying] || 0) + posVega;
    }

    const netExposure = longExposure - shortExposure;

    let exposureByDirection: Record<ExposureDirection, number> = {
      LONG: longExposure,
      SHORT: shortExposure,
      DELTA_NEUTRAL: Math.max(0, grossExposure - Math.abs(netExposure)),
    };

    const leverageRatio = totalEquity > 0 ? roundTo2(grossExposure / totalEquity) : 0;

    const greeksSummary: IPortfolioGreeks = {
      portfolioDelta: roundTo2(portfolioDelta),
      portfolioGamma: Number(portfolioGamma.toFixed(6)),
      portfolioTheta: roundTo2(portfolioTheta),
      portfolioVega: roundTo2(portfolioVega),
      deltaByUnderlying: this.roundRecord(deltaByUnderlying),
      deltaByStrategy: this.roundRecord(deltaByStrategy),
      thetaByUnderlying: this.roundRecord(thetaByUnderlying),
      vegaByUnderlying: this.roundRecord(vegaByUnderlying),
    };

    return {
      grossExposure: roundTo2(grossExposure),
      netExposure: roundTo2(netExposure),
      longExposure: roundTo2(longExposure),
      shortExposure: roundTo2(shortExposure),
      exposureByAssetClass: this.roundRecord(exposureByAssetClass),
      exposureByUnderlying: this.roundRecord(exposureByUnderlying),
      exposureByDirection,
      exposureByStrategy: this.roundRecord(exposureByStrategy),
      exposureByAgent: this.roundRecord(exposureByAgent),
      leverageRatio,
      greeks: greeksSummary,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Resolves Greeks for an individual position.
   * For Options: evaluates Black-Scholes model.
   * For Futures/Equity: delta is exactly +1.0 for BUY and -1.0 for SELL.
   */
  public static resolvePositionGreeks(pos: IPortfolioPositionItem): {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  } {
    if (pos.assetClass === "EQUITY" || pos.assetClass === "FUTURES") {
      const sign = pos.side === "BUY" ? 1.0 : -1.0;
      return {
        delta: sign,
        gamma: 0.0,
        theta: 0.0,
        vega: 0.0,
      };
    }

    if (pos.assetClass === "OPTIONS") {
      const isCall = pos.instrumentType === "CE";
      const strike = pos.strike || pos.currentLtp;
      // For option premium, currentLtp is the premium (e.g. 180), so spot is strike or underlyingSpot
      const spot = (pos as any).underlyingSpot || (pos.strike && pos.currentLtp < pos.strike * 0.5 ? pos.strike : pos.currentLtp);
      const dte = Math.max(0.5, pos.dte || 3);
      const timeToExpiryYears = dte / 365.0;
      const iv = (pos.iv || 15.0) / 100.0; // convert % to decimal

      const bsGreeks = OptionChainService.calculateBlackScholesGreeks(
        spot,
        strike,
        timeToExpiryYears,
        iv,
        isCall
      );

      // Adjust for short option positions
      const sign = pos.side === "BUY" ? 1.0 : -1.0;
      return {
        delta: roundTo2(bsGreeks.delta * sign),
        gamma: Number((bsGreeks.gamma * sign).toFixed(6)),
        theta: roundTo2(bsGreeks.theta * sign),
        vega: roundTo2(bsGreeks.vega * sign),
      };
    }

    return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  }

  private static roundRecord<T extends string>(rec: Record<T, number>): Record<T, number> {
    const out: Record<string, number> = {};
    for (const k of Object.keys(rec) as T[]) {
      out[k] = roundTo2(rec[k]);
    }
    return out as Record<T, number>;
  }
}
