/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.1A — Analytics Cache Service
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Provides high-performance in-memory caching for performance metrics
 * to reduce database query load during the high-frequency trade loop.
 */

import { PerformanceMonitorService } from "./aqea/performanceMonitor.js";
import { PlatformTelemetry } from "./platformTelemetry.js";

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

export class AnalyticsCache {
  private static cache = new Map<string, CacheEntry<any>>();
  private static DEFAULT_TTL = 300_000; // 5 minutes

  /**
   * Retrieves cached performance metrics or fetches and caches them.
   */
  public static async getPerformanceMetrics(userId: string, symbol: string): Promise<any> {
    const key = `perf:${userId}:${symbol}`;
    const cached = this.cache.get(key);
    
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    // Cache miss - use PerformanceMonitorService to calculate (which will query DB)
    const start = Date.now();
    const metrics = await (PerformanceMonitorService as any).calculateRollingMetrics(userId, symbol);
    PlatformTelemetry.recordLatency("dbLatencyMs", Date.now() - start);
    
    this.cache.set(key, {
      data: metrics,
      expiry: Date.now() + this.DEFAULT_TTL
    });

    return metrics;
  }

  /**
   * Invalidates cache for a specific user/symbol.
   */
  public static invalidate(userId: string, symbol?: string): void {
    if (symbol) {
      this.cache.delete(`perf:${userId}:${symbol}`);
    } else {
      const prefix = `perf:${userId}:`;
      for (const k of this.cache.keys()) {
        if (k.startsWith(prefix)) this.cache.delete(k);
      }
    }
  }

  /**
   * Force update the cache with new data.
   */
  public static update(userId: string, symbol: string, data: any): void {
    const key = `perf:${userId}:${symbol}`;
    this.cache.set(key, {
      data,
      expiry: Date.now() + this.DEFAULT_TTL
    });
  }
}
