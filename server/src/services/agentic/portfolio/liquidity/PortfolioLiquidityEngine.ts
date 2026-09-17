/**
 * ═══════════════════════════════════════════════════════════════════
 *  PORTFOLIO LIQUIDITY & EXECUTION CAPACITY ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *  Evaluates market volume, Open Interest (OI), bid-ask spread, and depth.
 *  Prevents market impact and excessive slippage by scaling or rejecting orders.
 */

import { roundTo2 } from "../capital/AuthoritativeCapitalManager.js";

export interface ILiquidityAssessment {
  approved: boolean;
  maxPermittedQuantity: number;
  expectedSlippageBps: number;
  bidAskSpreadBps: number;
  volumeParticipationPct: number;
  oiParticipationPct: number;
  rejectionReason?: string;
  warnings: string[];
}

export interface ILiquidityMarketData {
  symbol: string;
  volume: number;          // Total day or interval volume
  openInterest?: number;   // Relevant for Futures & Options
  bidPrice: number;
  askPrice: number;
  ltp: number;
  averageTradedValue?: number;
}

export class PortfolioLiquidityEngine {
  private static readonly MAX_VOLUME_PARTICIPATION_PCT = 2.5; // Max 2.5% of traded volume
  private static readonly MAX_OI_PARTICIPATION_PCT = 1.0;     // Max 1.0% of Open Interest
  private static readonly MAX_TOLERABLE_SPREAD_BPS = 50.0;     // Max 50 bps spread
  private static readonly MAX_TOLERABLE_SLIPPAGE_BPS = 25.0;   // Max 25 bps slippage

  /**
   * Evaluates trade quantity against market liquidity depth.
   */
  public static assessLiquidity(
    requestedQuantity: number,
    marketData: ILiquidityMarketData
  ): ILiquidityAssessment {
    const warnings: string[] = [];

    // 1. Calculate Bid-Ask Spread
    const midPrice = (marketData.bidPrice + marketData.askPrice) / 2 || marketData.ltp;
    const spreadPaise = Math.max(0, marketData.askPrice - marketData.bidPrice);
    const bidAskSpreadBps = midPrice > 0 ? roundTo2((spreadPaise / midPrice) * 10000) : 0;

    if (bidAskSpreadBps > this.MAX_TOLERABLE_SPREAD_BPS) {
      return {
        approved: false,
        maxPermittedQuantity: 0,
        expectedSlippageBps: bidAskSpreadBps / 2,
        bidAskSpreadBps,
        volumeParticipationPct: 0,
        oiParticipationPct: 0,
        rejectionReason: `ILLIQUID_SPREAD_BREACH: Bid-Ask spread (${bidAskSpreadBps} bps) exceeds limit of ${this.MAX_TOLERABLE_SPREAD_BPS} bps.`,
        warnings,
      };
    }

    // 2. Volume Participation Check
    const vol = Math.max(100, marketData.volume);
    const volumeParticipationPct = roundTo2((requestedQuantity / vol) * 100);

    // 3. Open Interest Participation Check (if derivative)
    let oiParticipationPct = 0;
    if (marketData.openInterest && marketData.openInterest > 0) {
      oiParticipationPct = roundTo2((requestedQuantity / marketData.openInterest) * 100);
    }

    // 4. Expected Slippage model: Base spread/2 + impact factor * sqrt(size / vol)
    const impactFactor = 15.0;
    const sizeRatio = requestedQuantity / vol;
    const expectedSlippageBps = roundTo2(bidAskSpreadBps / 2 + impactFactor * Math.sqrt(sizeRatio) * 100);

    if (expectedSlippageBps > this.MAX_TOLERABLE_SLIPPAGE_BPS) {
      warnings.push(`ELEVATED_SLIPPAGE: Expected slippage (${expectedSlippageBps} bps) is high.`);
    }

    // Determine max capacity permitted
    let maxPermittedQuantity = requestedQuantity;
    if (volumeParticipationPct > this.MAX_VOLUME_PARTICIPATION_PCT) {
      maxPermittedQuantity = Math.floor((this.MAX_VOLUME_PARTICIPATION_PCT / 100) * vol);
      warnings.push(
        `CAPACITY_SCALED_DOWN: Requested quantity (${requestedQuantity}) scaled to ${maxPermittedQuantity} due to ${this.MAX_VOLUME_PARTICIPATION_PCT}% volume cap.`
      );
    }

    if (marketData.openInterest && oiParticipationPct > this.MAX_OI_PARTICIPATION_PCT) {
      const maxOiQty = Math.floor((this.MAX_OI_PARTICIPATION_PCT / 100) * marketData.openInterest);
      maxPermittedQuantity = Math.min(maxPermittedQuantity, maxOiQty);
      warnings.push(
        `OI_CAPACITY_LIMIT: Size constrained to ${maxPermittedQuantity} to remain below 1% of total contract OI.`
      );
    }

    const approved = maxPermittedQuantity > 0;

    return {
      approved,
      maxPermittedQuantity,
      expectedSlippageBps,
      bidAskSpreadBps,
      volumeParticipationPct,
      oiParticipationPct,
      warnings,
      rejectionReason: approved ? undefined : "INSUFFICIENT_MARKET_LIQUIDITY",
    };
  }
}
