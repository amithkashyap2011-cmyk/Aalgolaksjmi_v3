/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.1A — Platform Telemetry & Observability
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Tracks system performance, latency, and resource utilization across
 * all platform layers.
 */

export interface TelemetryMetrics {
  tickLatencyMs: number;
  dbLatencyMs: number;
  inferenceLatencyMs: number;
  exchangeLatencyMs: number;
  cacheHitRate: number;
  queueDepth: number;
  memoryUsageMb: number;
  cpuLoadPct: number;
}

export class PlatformTelemetry {
  private static metrics: TelemetryMetrics = {
    tickLatencyMs: 0,
    dbLatencyMs: 0,
    inferenceLatencyMs: 0,
    exchangeLatencyMs: 0,
    cacheHitRate: 0.95,
    queueDepth: 0,
    memoryUsageMb: 0,
    cpuLoadPct: 0
  };

  /**
   * Records a latency metric.
   */
  public static recordLatency(component: keyof TelemetryMetrics, ms: number): void {
    (this.metrics as any)[component] = ms;
  }

  /**
   * Retrieves full telemetry snapshot.
   */
  public static async getSnapshot(): Promise<TelemetryMetrics> {
    const memory = process.memoryUsage();
    this.metrics.memoryUsageMb = Math.round(memory.heapUsed / 1024 / 1024);
    
    return { ...this.metrics };
  }

  /**
   * Informs about health status based on telemetry.
   */
  public static getSystemStatus(): "OPTIMAL" | "DEGRADED" | "CRITICAL" {
    if (this.metrics.tickLatencyMs > 5000) return "CRITICAL";
    if (this.metrics.dbLatencyMs > 500) return "DEGRADED";
    return "OPTIMAL";
  }
}
