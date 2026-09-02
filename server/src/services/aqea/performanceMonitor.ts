/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Performance Monitor & Benchmarking Service
 * ═══════════════════════════════════════════════════════════════════
 */

import { AqeaPerformance } from "../../models/AqeaPerformance.js";
import { AqeaTradeAnalytics } from "../../models/AqeaTradeAnalytics.js";
import { AqeaOrderFlowPerformance } from "../../models/AqeaOrderFlowPerformance.js";
import { AqeaSmartMoneyPerformance } from "../../models/AqeaSmartMoneyPerformance.js";
import mongoose from "mongoose";
import { toValidObjectId } from "../../utils/mongoUtils.js";

export interface PerformanceSnapshot {
  userId: string;
  symbol: string;
  legacySignal: string;
  aqeaSignal: string;
  legacyResult?: number;
  aqeaResult?: number;
}

export class PerformanceMonitorService {
  /**
   * Tracks agreement between Legacy and AQEA engines and updates promotion metrics.
   */
  public static async trackComparison(data: PerformanceSnapshot): Promise<void> {
    try {
      if (mongoose.connection.readyState !== 1) return;

      const agreement = data.legacySignal === data.aqeaSignal;
      
      // Fetch recent history to calculate rolling metrics
      const metrics = await this.calculateRollingMetrics(data.userId, data.symbol);

      await AqeaPerformance.create({
        ...data,
        userId: toValidObjectId(data.userId),
        agreement,
        metrics,
        timestamp: new Date()
      });
    } catch (err) {
      console.error("[AQEA_PERFORMANCE_ERROR]", err);
    }
  }

  /**
   * Tracks agreement between Order Flow and AQEA Signal (Phase 2A Shadow).
   */
  public static async trackOrderFlowComparison(
    userId: string,
    symbol: string,
    orderFlowSignal: string,
    aqeaSignal: string,
    diagnostics: any
  ): Promise<void> {
    try {
      if (mongoose.connection.readyState !== 1) return;

      await AqeaOrderFlowPerformance.create({
        userId: toValidObjectId(userId),
        symbol,
        orderFlowSignal,
        aqeaSignal,
        agreement: orderFlowSignal === aqeaSignal,
        diagnostics,
        timestamp: new Date()
      });
    } catch (err) {
      console.error("[AQEA_ORDERFLOW_PERFORMANCE_ERROR]", err);
    }
  }

  /**
   * Tracks agreement between Smart Money and AQEA Signal (Phase 3A Shadow).
   */
  public static async trackSmartMoneyComparison(
    userId: string,
    symbol: string,
    smartMoneySignal: string,
    aqeaSignal: string,
    orderFlowSignal: string,
    diagnostics: any
  ): Promise<void> {
    try {
      if (mongoose.connection.readyState !== 1) return;

      await AqeaSmartMoneyPerformance.create({
        userId: toValidObjectId(userId),
        symbol,
        smartMoneySignal,
        aqeaSignal,
        orderFlowSignal,
        agreement: smartMoneySignal === aqeaSignal,
        diagnostics,
        timestamp: new Date()
      });
    } catch (err) {
      console.error("[AQEA_SMARTMONEY_PERFORMANCE_ERROR]", err);
    }
  }

  private static metricsCache = new Map<string, { metrics: any; timestamp: number }>();

  /**
   * Calculates rolling statistical metrics for the Shadow Mode validation.
   */
  public static async calculateRollingMetrics(userId: string, symbol: string) {
    const defaultMetrics = { profitFactor: 0, sharpe: 0, sortino: 0, drawdown: 0, winRate: 0, expectancy: 0, agreementRate: 0 };
    const cacheKey = `${userId}:${symbol}`;
    const cached = this.metricsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 60_000) {
      return cached.metrics;
    }

    if (mongoose.connection.readyState !== 1) {
      return defaultMetrics;
    }
    const objId = toValidObjectId(userId);
    
    try {
      // 1. Agreement Rate
      const [totalComparisons, agreements, shadowTrades] = await Promise.all([
        AqeaPerformance.countDocuments({ userId: objId, symbol }).maxTimeMS(1000).catch(() => 0),
        AqeaPerformance.countDocuments({ userId: objId, symbol, agreement: true }).maxTimeMS(1000).catch(() => 0),
        AqeaTradeAnalytics.find({ 
          userId: objId, 
          symbol, 
          decision: "EXIT", 
          exitReason: { $ne: "" } 
        }).limit(100).maxTimeMS(1000).lean().catch(() => [])
      ]);

      const agreementRate = totalComparisons > 0 ? (agreements / totalComparisons) : 0;

      if (!shadowTrades || shadowTrades.length < 5) {
        const res = { profitFactor: 0, sharpe: 0, sortino: 0, drawdown: 0, winRate: 0, expectancy: 0, agreementRate };
        this.metricsCache.set(cacheKey, { metrics: res, timestamp: Date.now() });
        return res;
      }

    const pnls = shadowTrades.map(t => (t as any).outcomeFeatures?.profit || 0);
    const wins = pnls.filter(p => p > 0);
    const losses = pnls.filter(p => p < 0);

    const winRate = wins.length / pnls.length;
    const grossProfit = wins.reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 9.99 : 0);

    // Simple Sharpe (Average PnL / StdDev)
    const avgPnl = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const variance = pnls.reduce((a, b) => a + Math.pow(b - avgPnl, 2), 0) / pnls.length;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? (avgPnl / stdDev) * Math.sqrt(252) : 0; // Annualized proxy

    const result = {
      profitFactor: parseFloat(profitFactor.toFixed(2)),
      sharpe: parseFloat(sharpe.toFixed(2)),
      sortino: 0, // Placeholder
      drawdown: 0, // Placeholder
      winRate: parseFloat((winRate * 100).toFixed(2)),
      expectancy: parseFloat(avgPnl.toFixed(4)),
      agreementRate: parseFloat((agreementRate * 100).toFixed(2))
    };

    this.metricsCache.set(cacheKey, { metrics: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    return defaultMetrics;
  }
}
}
