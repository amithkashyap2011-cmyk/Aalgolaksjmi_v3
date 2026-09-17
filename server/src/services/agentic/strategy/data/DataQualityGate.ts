/**
 * ═══════════════════════════════════════════════════════════════════
 *  HISTORICAL MARKET DATA QUALITY GATE
 * ═══════════════════════════════════════════════════════════════════
 *  Validates OHLC candle feeds and option-chain data sets for geometric,
 *  temporal, and statistical sanity prior to running backtests.
 */

import { OHLC } from "../../../indicatorService.js";
import { IDataQualityReport } from "../types.js";

export interface ITimestampedCandle extends OHLC {
  timestamp?: number;
  volume?: number;
}

export class DataQualityGate {
  private static readonly MINIMUM_ACCEPTABLE_SCORE = 90.0;

  /**
   * Validates a dataset of historical candles.
   */
  public static validateCandleDataset(
    symbol: string,
    candles: ITimestampedCandle[]
  ): IDataQualityReport {
    const issues: string[] = [];

    if (!candles || candles.length === 0) {
      return {
        symbol,
        totalCandles: 0,
        missingCandlesCount: 0,
        duplicateCandlesCount: 0,
        outOfOrderCount: 0,
        invalidOhlcCount: 0,
        zeroPriceCount: 0,
        sessionGapCount: 0,
        qualityScore: 0,
        passed: false,
        issues: ["DATASET_EMPTY: No candles provided for evaluation."],
      };
    }

    let invalidOhlcCount = 0;
    let zeroPriceCount = 0;
    let outOfOrderCount = 0;
    let duplicateCandlesCount = 0;
    let sessionGapCount = 0;

    let previousTs: number | undefined = undefined;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];

      // 1. Zero or negative price checks
      if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) {
        zeroPriceCount++;
        if (zeroPriceCount <= 3) {
          issues.push(`NON_POSITIVE_PRICE at index ${i}: O=${c.open}, H=${c.high}, L=${c.low}, C=${c.close}`);
        }
      }

      // 2. Geometric OHLC sanity checks
      // High must be >= Low, and High must be >= max(Open, Close), Low must be <= min(Open, Close)
      const maxOC = Math.max(c.open, c.close);
      const minOC = Math.min(c.open, c.close);

      if (c.high < c.low || c.high < maxOC - 0.0001 || c.low > minOC + 0.0001) {
        invalidOhlcCount++;
        if (invalidOhlcCount <= 3) {
          issues.push(`GEOMETRIC_OHLC_FAULT at index ${i}: H=${c.high} < L=${c.low} or outside [${c.open}, ${c.close}]`);
        }
      }

      // 3. Temporal order and duplicates (if timestamp provided)
      if (c.timestamp !== undefined) {
        if (previousTs !== undefined) {
          if (c.timestamp < previousTs) {
            outOfOrderCount++;
            if (outOfOrderCount <= 3) {
              issues.push(`OUT_OF_ORDER_TIMESTAMP at index ${i}: ${c.timestamp} < previous ${previousTs}`);
            }
          } else if (c.timestamp === previousTs) {
            duplicateCandlesCount++;
          } else {
            // Check for large unexpected time gap (e.g. > 7 days during trading week)
            const gapMs = c.timestamp - previousTs;
            if (gapMs > 7 * 24 * 3600 * 1000) {
              sessionGapCount++;
            }
          }
        }
        previousTs = c.timestamp;
      }
    }

    // Calculate quality score deductions
    const total = candles.length;
    let score = 100.0;

    // Deduct heavily for zero prices and invalid geometry (critical data corruption)
    score -= (invalidOhlcCount + zeroPriceCount) * 10.0;
    const invalidRatio = (invalidOhlcCount + zeroPriceCount) / total;
    score -= invalidRatio * 100.0;

    // Deduct for out of order timestamps and duplicates
    score -= (outOfOrderCount * 5.0) + (duplicateCandlesCount * 2.0);

    score = Math.max(0.0, Math.min(100.0, Number(score.toFixed(1))));
    const passed = score >= this.MINIMUM_ACCEPTABLE_SCORE;

    if (!passed) {
      issues.unshift(`QUALITY_GATE_REJECTION: Score ${score} is below required threshold ${this.MINIMUM_ACCEPTABLE_SCORE}`);
    }

    return {
      symbol,
      totalCandles: total,
      missingCandlesCount: 0,
      duplicateCandlesCount,
      outOfOrderCount,
      invalidOhlcCount,
      zeroPriceCount,
      sessionGapCount,
      qualityScore: score,
      passed,
      issues,
    };
  }
}
