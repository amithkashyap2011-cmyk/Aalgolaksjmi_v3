/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Liquidation Engine
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  LiquidationEvent,
  LiquidationIntelligence,
  LiquidationCluster,
} from "./types.js";

export class LiquidationEngine {
  private static instance: LiquidationEngine;
  private liquidationHistory: Map<string, LiquidationEvent[]> = new Map();
  private maxHistoryLength = 500; // Store last 500 liquidation events per symbol
  private cascadeTimeWindowMs = 300000; // 5 minutes to detect cascades

  private constructor() {}

  public static getInstance(): LiquidationEngine {
    if (!LiquidationEngine.instance) {
      LiquidationEngine.instance = new LiquidationEngine();
    }
    return LiquidationEngine.instance;
  }

  /**
   * Tracks a new liquidation event
   */
  public recordEvent(event: LiquidationEvent): void {
    const symbol = event.symbol;
    let events = this.liquidationHistory.get(symbol) || [];
    events.push(event);
    
    // Clean up events older than 24 hours to prevent memory leaks
    const cutoff = Date.now() - 86400000;
    events = events.filter(e => e.timestamp > cutoff);

    if (events.length > this.maxHistoryLength) {
      events.shift();
    }
    this.liquidationHistory.set(symbol, events);
  }

  /**
   * Evaluates liquidation density and cascade risks for a symbol
   */
  public analyze(
    symbol: string,
    currentPrice: number,
    recentEventsExternal?: LiquidationEvent[]
  ): LiquidationIntelligence {
    const timestamp = Date.now();
    
    // Merge internally tracked events and external adapter feeds
    let events = this.liquidationHistory.get(symbol) || [];
    if (recentEventsExternal && recentEventsExternal.length > 0) {
      const existingIds = new Set(events.map(e => `${e.timestamp}_${e.price}_${e.quantity}`));
      recentEventsExternal.forEach(e => {
        const id = `${e.timestamp}_${e.price}_${e.quantity}`;
        if (!existingIds.has(id)) {
          events.push(e);
        }
      });
      // Sort and truncate
      events.sort((a, b) => a.timestamp - b.timestamp);
      if (events.length > this.maxHistoryLength) {
        events = events.slice(events.length - this.maxHistoryLength);
      }
      this.liquidationHistory.set(symbol, events);
    }

    // Filter events in the last 5 minutes for pressure calculations
    const fiveMinutesAgo = timestamp - this.cascadeTimeWindowMs;
    const recentEvents = events.filter(e => e.timestamp >= fiveMinutesAgo);

    // Calculate forced selling and buying pressure from recent liquidations
    // Forced sell pressure comes from LONG liquidations (exchange sells their collateral)
    // Forced buy pressure comes from SHORT liquidations (exchange buys back their short)
    let totalLongLiqQty = 0;
    let totalShortLiqQty = 0;
    let totalLongLiqVal = 0;
    let totalShortLiqVal = 0;

    recentEvents.forEach(e => {
      if (e.side === "SELL") { // Exchange is selling (Long Liquidation)
        totalLongLiqQty += e.quantity;
        totalLongLiqVal += e.quantity * e.price;
      } else { // Exchange is buying (Short Liquidation)
        totalShortLiqQty += e.quantity;
        totalShortLiqVal += e.quantity * e.price;
      }
    });

    // Scale pressure scores between 0 and 1
    // Benchmark: $500,000 liquidation volume in 5 mins represents high pressure (1.0)
    const benchmarkVolume = 500000;
    const forcedSellingPressure = Math.min(1.0, totalLongLiqVal / benchmarkVolume);
    const forcedBuyingPressure = Math.min(1.0, totalShortLiqVal / benchmarkVolume);

    // Cascade Risk Score (0-100)
    // High risk when price is moving fast and we have high pressure or cluster density close by
    let cascadeRiskScore = 0;
    if (forcedSellingPressure > 0.4 || forcedBuyingPressure > 0.4) {
      cascadeRiskScore += Math.max(forcedSellingPressure, forcedBuyingPressure) * 60;
    }

    // Detect if a cascade is currently occurring (e.g. multiple large liquidations in rapid succession)
    // If we have > 5 liquidations in the last 60 seconds
    const oneMinuteAgo = timestamp - 60000;
    const veryRecentEvents = recentEvents.filter(e => e.timestamp >= oneMinuteAgo);
    const recentCascadeDetected = veryRecentEvents.length >= 5;
    if (recentCascadeDetected) {
      cascadeRiskScore += 30;
    }

    cascadeRiskScore = Math.min(100, Math.round(cascadeRiskScore));

    // Determine if we are in a recovery phase (cascade finished, buying/selling exhausted, price stabilizing/reversing)
    // If we had high liquidations in the last 5 mins, but none in the last 60 seconds, and volume is drying up
    const recoveryPhase = recentEvents.length > 0 && veryRecentEvents.length === 0 && cascadeRiskScore < 40;

    // Generate Liquidation Clusters (Heatmap)
    // Estimate price points where stop-losses or liquidations are clustered
    // Since we don't have an order flow database directly, we project clusters based on:
    // Support/Resistance levels (at intervals of 0.5%, 1%, 2% from current price)
    // Weighted by typical leverage profiles (10x, 20x, 50x, 100x)
    const nearestLongLiquidations = this.projectClusters(currentPrice, "LONG");
    const nearestShortLiquidations = this.projectClusters(currentPrice, "SHORT");

    return {
      symbol,
      timestamp,
      cascadeRiskScore,
      nearestLongLiquidations,
      nearestShortLiquidations,
      recentCascadeDetected,
      forcedSellingPressure,
      forcedBuyingPressure,
      recoveryPhase,
    };
  }

  private projectClusters(currentPrice: number, side: "LONG" | "SHORT"): LiquidationCluster[] {
    const clusters: LiquidationCluster[] = [];
    
    // Leverage profile points: 100x (1% move), 50x (2% move), 20x (5% move), 10x (10% move)
    const leverageProfiles = [
      { leverage: 100, movePct: 0.008 }, // liquidation hits slightly before bankruptcy price
      { leverage: 50, movePct: 0.018 },
      { leverage: 20, movePct: 0.045 },
      { leverage: 10, movePct: 0.09 },
    ];

    leverageProfiles.forEach(profile => {
      let priceLevel = 0;
      if (side === "LONG") {
        // Long liquidation levels lie BELOW current price
        priceLevel = currentPrice * (1 - profile.movePct);
      } else {
        // Short liquidation levels lie ABOVE current price
        priceLevel = currentPrice * (1 + profile.movePct);
      }

      // Estimate liquidation volume at these profiles based on historical norms
      // Higher leverage levels tend to have smaller volumes but happen more frequently
      const estimatedVolume = 1000000 / profile.leverage;

      clusters.push({
        priceLevel,
        estimatedVolume,
        distanceFromCurrentPct: profile.movePct,
        leverage: profile.leverage,
      });
    });

    return clusters;
  }
}
