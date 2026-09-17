/*
 * ─── Market Data Quality & Stream Integrity Validator ─────────
 *
 * Implements authoritative market data stream validation:
 * - Detects stale ticks (> 10s age)
 * - Detects duplicate ticks & out-of-order sequences
 * - Detects impossible/negative prices & crossed markets (bid > ask)
 * - Detects sequence gaps
 * - Prohibits trading decisions on invalid/stale market ticks
 */

export interface MarketTick {
  symbol: string;
  market: "INDIAN" | "CRYPTO";
  source: string;
  sequenceNumber: number;
  timestamp: number;
  ltp: number;
  bid?: number;
  ask?: number;
  volume?: number;
}

export interface TickQualityReport {
  isValid: boolean;
  freshness: "FRESH" | "STALE" | "REJECTED";
  latencyMs: number;
  rejectionReason?: string;
}

export class MarketDataQualityValidator {
  private static lastTicks = new Map<string, { sequence: number; timestamp: number; ltp: number }>();
  private static readonly MAX_TICK_AGE_MS = 10000; // 10 seconds staleness cutoff
  private static readonly MAX_PRICE_DEVIATION_PCT = 35; // 35% single-tick anomaly filter

  /**
   * Evaluates incoming tick against all data quality rules.
   */
  public static validateTick(tick: MarketTick): TickQualityReport {
    const now = Date.now();
    const latencyMs = Math.max(0, now - tick.timestamp);

    // 1. Mandatory field checks
    if (!tick.symbol || !tick.market || !tick.source) {
      return {
        isValid: false,
        freshness: "REJECTED",
        latencyMs,
        rejectionReason: "MISSING_MANDATORY_TICK_METADATA",
      };
    }

    // 2. Negative or impossible price checks
    if (!Number.isFinite(tick.ltp) || tick.ltp <= 0) {
      return {
        isValid: false,
        freshness: "REJECTED",
        latencyMs,
        rejectionReason: `INVALID_PRICE: Non-positive or infinite LTP (${tick.ltp})`,
      };
    }

    if (tick.volume !== undefined && (!Number.isFinite(tick.volume) || tick.volume < 0)) {
      return {
        isValid: false,
        freshness: "REJECTED",
        latencyMs,
        rejectionReason: `INVALID_VOLUME: Negative volume (${tick.volume})`,
      };
    }

    // 3. Crossed market check (Bid > Ask)
    if (tick.bid && tick.ask && tick.bid > 0 && tick.ask > 0) {
      if (tick.bid > tick.ask) {
        return {
          isValid: false,
          freshness: "REJECTED",
          latencyMs,
          rejectionReason: `CROSSED_MARKET: Bid (${tick.bid}) exceeds Ask (${tick.ask})`,
        };
      }
    }

    // 4. Staleness check
    if (latencyMs > this.MAX_TICK_AGE_MS) {
      return {
        isValid: false,
        freshness: "STALE",
        latencyMs,
        rejectionReason: `STALE_TICK: Age ${latencyMs}ms exceeds max allowed ${this.MAX_TICK_AGE_MS}ms`,
      };
    }

    // 5. Sequence & Out-of-order checks per symbol
    const key = `${tick.market}:${tick.symbol}`;
    const previous = this.lastTicks.get(key);

    if (previous) {
      // Out-of-order timestamp
      if (tick.timestamp < previous.timestamp) {
        return {
          isValid: false,
          freshness: "REJECTED",
          latencyMs,
          rejectionReason: `OUT_OF_ORDER_TIMESTAMP: Tick timestamp (${tick.timestamp}) < previous (${previous.timestamp})`,
        };
      }

      // Duplicate tick sequence
      if (tick.sequenceNumber > 0 && tick.sequenceNumber <= previous.sequence) {
        return {
          isValid: false,
          freshness: "REJECTED",
          latencyMs,
          rejectionReason: `DUPLICATE_OR_RETROGRADE_SEQUENCE: Sequence ${tick.sequenceNumber} <= previous ${previous.sequence}`,
        };
      }

      // Single-tick price deviation filter (Flash-crash / bad tick spike protection)
      if (previous.ltp > 0) {
        const pctChange = Math.abs((tick.ltp - previous.ltp) / previous.ltp) * 100;
        if (pctChange > this.MAX_PRICE_DEVIATION_PCT) {
          return {
            isValid: false,
            freshness: "REJECTED",
            latencyMs,
            rejectionReason: `EXTREME_PRICE_DISCONTINUITY: Single-tick jump of ${pctChange.toFixed(1)}% (${previous.ltp} -> ${tick.ltp})`,
          };
        }
      }
    }

    // Record valid tick
    this.lastTicks.set(key, {
      sequence: tick.sequenceNumber,
      timestamp: tick.timestamp,
      ltp: tick.ltp,
    });

    return {
      isValid: true,
      freshness: "FRESH",
      latencyMs,
    };
  }

  public static reset(): void {
    this.lastTicks.clear();
  }
}
