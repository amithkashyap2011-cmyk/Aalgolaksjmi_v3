/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Funding Rate Engine
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  FundingRateData,
  OpenInterestData,
  FundingRateAnalysis,
  FundingArbOpportunity,
} from "./types.js";

export class FundingRateEngine {
  private static instance: FundingRateEngine;
  private fundingHistory: Map<string, number[]> = new Map();
  private maxHistoryLength = 90; // Store last 90 funding rate updates (~30 days at 8h intervals)

  private constructor() {}

  public static getInstance(): FundingRateEngine {
    if (!FundingRateEngine.instance) {
      FundingRateEngine.instance = new FundingRateEngine();
    }
    return FundingRateEngine.instance;
  }

  /**
   * Analyzes current funding rate, open interest, and price data to yield positioning metrics
   */
  public analyze(
    fundingData: FundingRateData,
    oiData?: OpenInterestData,
    longShortRatio: number = 1.0 // default balanced
  ): FundingRateAnalysis {
    const symbol = fundingData.symbol;
    const timestamp = Date.now();
    const currentRate = fundingData.fundingRate;

    // Track funding history for percentile calculations
    let history = this.fundingHistory.get(symbol) || [];
    history.push(currentRate);
    if (history.length > this.maxHistoryLength) {
      history.shift();
    }
    this.fundingHistory.set(symbol, history);

    // 1. Predict next funding rate direction
    // If mark price > index price, funding is positive and likely to rise or stay positive.
    // If premium is shrinking, funding will likely decline.
    const pricePremium = (fundingData.markPrice - fundingData.indexPrice) / fundingData.indexPrice;
    let predictedNextRate = currentRate;
    if (pricePremium > 0.0002) {
      predictedNextRate = Math.min(0.003, currentRate + 0.00005); // trend upward
    } else if (pricePremium < -0.0002) {
      predictedNextRate = Math.max(-0.003, currentRate - 0.00005); // trend downward
    }

    // 2. Crowd Positioning Score (-1 to +1)
    // Combines funding rate and long/short ratio.
    // Funding rate has standard neutral value around 0.0001 (0.01%).
    // Long/short ratio neutral is 1.0.
    const rateNormalized = currentRate / 0.003; // Normalize around 0.3% max
    const ratioNormalized = (longShortRatio - 1.0) / 2.0; // Normalize
    let crowdPositioning = rateNormalized * 0.7 + ratioNormalized * 0.3;
    crowdPositioning = Math.max(-1.0, Math.min(1.0, crowdPositioning));

    // 3. Squeeze Probability
    // Rising open interest + extreme funding rates + extreme crowd positioning signals high squeeze risk.
    let longSqueezeProb = 0;
    let shortSqueezeProb = 0;

    const extremePositiveRate = currentRate > 0.0005; // >0.05% per 8h
    const extremeNegativeRate = currentRate < -0.0005; // <-0.05% per 8h

    if (extremePositiveRate) {
      // Long squeeze risk: long positions are paying high fees, if price drops they get squeezed
      longSqueezeProb = 0.4;
      if (crowdPositioning > 0.6) longSqueezeProb += 0.2;
      if (oiData && oiData.openInterest > 0) {
        // If OI is rising, add probability
        longSqueezeProb += 0.2;
      }
    } else if (extremeNegativeRate) {
      // Short squeeze risk: shorts are paying high fees, if price rises they get squeezed
      shortSqueezeProb = 0.4;
      if (crowdPositioning < -0.6) shortSqueezeProb += 0.2;
      if (oiData && oiData.openInterest > 0) {
        shortSqueezeProb += 0.2;
      }
    }

    // Caps
    longSqueezeProb = Math.min(0.95, longSqueezeProb);
    shortSqueezeProb = Math.min(0.95, shortSqueezeProb);

    // 4. Funding Arbitrage Opportunities (spot-perp basis)
    const arbOpportunity = this.checkArbOpportunity(currentRate, fundingData.markPrice, fundingData.indexPrice);

    // 5. Historical percentile
    const historicalPercentile = this.calculatePercentile(history, currentRate);

    return {
      symbol,
      currentRate,
      predictedNextRate,
      crowdPositioning,
      longSqueezeProb,
      shortSqueezeProb,
      arbOpportunity,
      historicalPercentile,
      timestamp,
    };
  }

  private checkArbOpportunity(
    fundingRate: number,
    markPrice: number,
    indexPrice: number
  ): FundingArbOpportunity | null {
    // Standard arbitrage:
    // Cash & Carry: Buy spot, short perp, collect positive funding.
    // Reverse Cash & Carry: Short spot (requires borrow/margin), long perp, collect negative funding.
    const annualizationFactor = 3 * 365; // 8-hour funding rates to yearly (3 times a day)
    
    // Check Cash and Carry (positive funding rate)
    if (fundingRate > 0.0003) { // > 0.03% per 8h
      const expectedAnnualizedReturn = fundingRate * annualizationFactor * 100; // in %
      const basisSpreadPct = ((markPrice - indexPrice) / indexPrice) * 100;
      
      return {
        type: "CASH_AND_CARRY",
        expectedAnnualizedReturn: expectedAnnualizedReturn + basisSpreadPct, // basis convergence adds to yield
        riskLevel: "LOW",
        requiredCapital: 2000, // minimum recommended size to cover gas/fees
        description: `Long Spot + Short Perp. Premium base spread: ${basisSpreadPct.toFixed(3)}%. Annualized carry yield: ${expectedAnnualizedReturn.toFixed(2)}%.`,
      };
    }
    
    // Check Reverse Cash and Carry (negative funding rate)
    if (fundingRate < -0.0003) { // < -0.03% per 8h
      const expectedAnnualizedReturn = Math.abs(fundingRate) * annualizationFactor * 100; // in %
      const basisSpreadPct = ((indexPrice - markPrice) / markPrice) * 100;

      return {
        type: "REVERSE_CASH_AND_CARRY",
        expectedAnnualizedReturn: expectedAnnualizedReturn + basisSpreadPct,
        riskLevel: "MEDIUM", // higher risk due to spot borrow rate & liquidity
        requiredCapital: 5000,
        description: `Short Spot + Long Perp. Premium basis spread: ${basisSpreadPct.toFixed(3)}%. Annualized carry yield: ${expectedAnnualizedReturn.toFixed(2)}%.`,
      };
    }

    return null;
  }

  private calculatePercentile(history: number[], currentVal: number): number {
    if (history.length <= 1) return 50.0;
    const sorted = [...history].sort((a, b) => a - b);
    const index = sorted.indexOf(currentVal);
    if (index === -1) return 50.0;
    return (index / (sorted.length - 1)) * 100;
  }
}
