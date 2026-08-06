/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Order Book Intelligence Engine
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  OrderBookSnapshot,
  OrderBookIntelligence,
  SpoofingEvent,
  LiquidityWall,
  StopHuntZone,
  IcebergDetection,
} from "./types.js";

interface HistoricalSnapshot {
  timestamp: number;
  bids: Map<number, number>;
  asks: Map<number, number>;
}

export class OrderBookIntelligenceEngine {
  private static instance: OrderBookIntelligenceEngine;
  private snapshotHistory: Map<string, HistoricalSnapshot[]> = new Map();
  private maxHistoryLength = 50; // 50 snapshots (~5-10s at current rates)

  private constructor() {}

  public static getInstance(): OrderBookIntelligenceEngine {
    if (!OrderBookIntelligenceEngine.instance) {
      OrderBookIntelligenceEngine.instance = new OrderBookIntelligenceEngine();
    }
    return OrderBookIntelligenceEngine.instance;
  }

  /**
   * Performs deep analysis of an order book snapshot
   */
  public analyze(snapshot: OrderBookSnapshot): OrderBookIntelligence {
    const symbol = snapshot.symbol;
    const timestamp = snapshot.timestamp;

    if (snapshot.bids.length === 0 || snapshot.asks.length === 0) {
      return this.emptyResult(symbol, timestamp);
    }

    const bestBid = snapshot.bids[0].price;
    const bestAsk = snapshot.asks[0].price;
    const midPrice = (bestBid + bestAsk) / 2;
    const spreadBps = ((bestAsk - bestBid) / midPrice) * 10000;

    // Convert arrays to Maps for fast lookup in historical comparisons
    const currentBidsMap = new Map<number, number>();
    snapshot.bids.forEach(b => currentBidsMap.set(b.price, b.quantity));
    
    const currentAsksMap = new Map<number, number>();
    snapshot.asks.forEach(a => currentAsksMap.set(a.price, a.quantity));

    // Get historical snapshots
    let history = this.snapshotHistory.get(symbol) || [];

    // Run algorithms
    const bidAskImbalance = this.calculateImbalance(snapshot);
    const liquidityWalls = this.detectLiquidityWalls(snapshot, midPrice);
    const spoofingDetails = this.detectSpoofing(symbol, currentBidsMap, currentAsksMap, history);
    const icebergOrders = this.detectIcebergs(symbol, currentBidsMap, currentAsksMap, history);
    const stopHuntZones = this.detectStopHunts(snapshot, midPrice);
    
    // Determine absorption
    const absorptionSide = this.detectAbsorption(snapshot, history);
    const absorptionDetected = absorptionSide !== "NONE";

    // Market pressure: combines imbalance and walls
    let marketPressure = bidAskImbalance;
    const bidWallsVol = liquidityWalls.filter(w => w.side === "BID").reduce((acc, w) => acc + w.quantity, 0);
    const askWallsVol = liquidityWalls.filter(w => w.side === "ASK").reduce((acc, w) => acc + w.quantity, 0);
    if (bidWallsVol + askWallsVol > 0) {
      const wallRatio = (bidWallsVol - askWallsVol) / (bidWallsVol + askWallsVol);
      marketPressure = marketPressure * 0.6 + wallRatio * 0.4;
    }

    // Depth score (0-100) based on spread and aggregate volume compared to historical norms
    const depthScore = Math.max(0, Math.min(100, 100 - spreadBps * 5));

    // Save snapshot to history
    history.push({
      timestamp,
      bids: currentBidsMap,
      asks: currentAsksMap
    });
    if (history.length > this.maxHistoryLength) {
      history.shift();
    }
    this.snapshotHistory.set(symbol, history);

    return {
      symbol,
      timestamp,
      bidAskImbalance,
      spreadBps,
      spoofingDetected: spoofingDetails.length > 0,
      spoofingDetails,
      liquidityWalls,
      stopHuntZones,
      absorptionDetected,
      absorptionSide,
      icebergOrders,
      marketPressure,
      depthScore,
    };
  }

  private calculateImbalance(snapshot: OrderBookSnapshot): number {
    // Look at top 10 levels
    const levelsToCompare = Math.min(10, snapshot.bids.length, snapshot.asks.length);
    let bidVol = 0;
    let askVol = 0;

    for (let i = 0; i < levelsToCompare; i++) {
      bidVol += snapshot.bids[i].quantity;
      askVol += snapshot.asks[i].quantity;
    }

    if (bidVol + askVol === 0) return 0;
    return (bidVol - askVol) / (bidVol + askVol);
  }

  private detectLiquidityWalls(snapshot: OrderBookSnapshot, midPrice: number): LiquidityWall[] {
    const walls: LiquidityWall[] = [];
    
    // Bid Walls
    const bidQuantities = snapshot.bids.map(b => b.quantity);
    const bidMean = this.mean(bidQuantities);
    const bidStd = this.stdDev(bidQuantities, bidMean);

    snapshot.bids.forEach(b => {
      const sigma = bidStd > 0 ? (b.quantity - bidMean) / bidStd : 0;
      if (sigma > 3.0) { // 3 standard deviations above mean
        walls.push({
          side: "BID",
          priceLevel: b.price,
          quantity: b.quantity,
          sigmaAboveMean: sigma,
          distanceFromMidPct: Math.abs(b.price - midPrice) / midPrice,
        });
      }
    });

    // Ask Walls
    const askQuantities = snapshot.asks.map(a => a.quantity);
    const askMean = this.mean(askQuantities);
    const askStd = this.stdDev(askQuantities, askMean);

    snapshot.asks.forEach(a => {
      const sigma = askStd > 0 ? (a.quantity - askMean) / askStd : 0;
      if (sigma > 3.0) {
        walls.push({
          side: "ASK",
          priceLevel: a.price,
          quantity: a.quantity,
          sigmaAboveMean: sigma,
          distanceFromMidPct: Math.abs(a.price - midPrice) / midPrice,
        });
      }
    });

    return walls;
  }

  private detectSpoofing(
    symbol: string,
    currentBids: Map<number, number>,
    currentAsks: Map<number, number>,
    history: HistoricalSnapshot[]
  ): SpoofingEvent[] {
    if (history.length < 5) return [];

    const spoofingEvents: SpoofingEvent[] = [];
    const latestSnapshot = history[history.length - 1];

    // Helper: detect rapid cancellation at a price level
    // A large order is placed, and then canceled quickly without being filled
    const checkSpoofingSide = (
      currentMap: Map<number, number>,
      histMap: Map<number, number>,
      side: "BID" | "ASK"
    ) => {
      // Find levels in history that had large volume but have disappeared or shrunk by >80% now
      histMap.forEach((qty, price) => {
        const currentQty = currentMap.get(price) || 0;
        // If it was a large order in history (we can check if it was above mean, but let's assume we look at significant decreases)
        if (qty > 10 && currentQty < qty * 0.1) {
          // Check how long it was active
          // Trace back in history to see when it appeared
          let appearances = 0;
          let totalDuration = 0;
          for (let i = history.length - 1; i >= 0; i--) {
            const hSnapshot = history[i];
            const hMap = side === "BID" ? hSnapshot.bids : hSnapshot.asks;
            if (hMap.has(price)) {
              appearances++;
              totalDuration += (latestSnapshot.timestamp - hSnapshot.timestamp);
            } else {
              break;
            }
          }

          // If it appeared and disappeared within a short timeframe (e.g., < 2 seconds, represented by a few snapshots)
          if (appearances > 0 && appearances < 15) {
            spoofingEvents.push({
              side,
              priceLevel: price,
              quantity: qty,
              appearances,
              avgDurationMs: appearances > 0 ? totalDuration / appearances : 0,
            });
          }
        }
      });
    };

    // Check last snapshot's books against current
    checkSpoofingSide(currentBids, latestSnapshot.bids, "BID");
    checkSpoofingSide(currentAsks, latestSnapshot.asks, "ASK");

    return spoofingEvents;
  }

  private detectIcebergs(
    symbol: string,
    currentBids: Map<number, number>,
    currentAsks: Map<number, number>,
    history: HistoricalSnapshot[]
  ): IcebergDetection[] {
    if (history.length < 10) return [];
    
    const icebergs: IcebergDetection[] = [];

    // Iceberg detection heuristic:
    // A level keeps having trades filled (represented by a decrease in quantity or trades in history),
    // but the level price maintains or replenishes its quantity instead of being eaten through.
    // In our simplified level-depth history (since we don't have direct trade feeds in this mock layer),
    // we look for levels that maintain a very constant, significant size despite time elapsed and nearby market activity.
    const checkIcebergSide = (
      currentMap: Map<number, number>,
      side: "BID" | "ASK"
    ) => {
      currentMap.forEach((qty, price) => {
        // If it's a large order, check history
        if (qty > 5) {
          let holdsVolume = true;
          let fillCount = 0;
          let variance = 0;
          const volumes: number[] = [];

          for (let i = Math.max(0, history.length - 15); i < history.length; i++) {
            const hSnapshot = history[i];
            const hMap = side === "BID" ? hSnapshot.bids : hSnapshot.asks;
            const hQty = hMap.get(price);
            if (hQty !== undefined) {
              volumes.push(hQty);
            } else {
              holdsVolume = false;
              break;
            }
          }

          if (holdsVolume && volumes.length >= 10) {
            const meanVolume = this.mean(volumes);
            const std = this.stdDev(volumes, meanVolume);
            // If standard deviation is extremely low, it's just a static order wall.
            // If it fluctuates but repeatedly pops back to the same quantity, it could be an iceberg.
            // Let's check if the quantity was replenished (went up without being cancelled completely)
            for (let j = 1; j < volumes.length; j++) {
              if (volumes[j] > volumes[j - 1]) {
                fillCount++; // replenished
              }
            }

            if (fillCount >= 2 && std > 0.1 * meanVolume) {
              icebergs.push({
                side,
                priceLevel: price,
                visibleQuantity: qty,
                estimatedTotalQuantity: qty * (fillCount + 1),
                fillCount,
              });
            }
          }
        }
      });
    };

    checkIcebergSide(currentBids, "BID");
    checkIcebergSide(currentAsks, "ASK");

    return icebergs;
  }

  private detectAbsorption(snapshot: OrderBookSnapshot, history: HistoricalSnapshot[]): "BID" | "ASK" | "NONE" {
    if (history.length < 5) return "NONE";

    // Heuristic: Bid side absorption occurs when price declines, meets a bid level, 
    // and remains there with massive volume, but doesn't break lower.
    // Ask side absorption is the inverse.
    // Let's check volume on the best bid vs best ask
    const bestBidQty = snapshot.bids[0].quantity;
    const bestAskQty = snapshot.asks[0].quantity;

    const bidMean = this.mean(snapshot.bids.map(b => b.quantity));
    const askMean = this.mean(snapshot.asks.map(a => a.quantity));

    if (bestBidQty > bidMean * 4) {
      return "BID"; // Buyers absorbing sell orders
    } else if (bestAskQty > askMean * 4) {
      return "ASK"; // Sellers absorbing buy orders
    }

    return "NONE";
  }

  private detectStopHunts(snapshot: OrderBookSnapshot, midPrice: number): StopHuntZone[] {
    const zones: StopHuntZone[] = [];
    const bestBid = snapshot.bids[0].price;
    const bestAsk = snapshot.asks[0].price;

    // Heuristic: Stop hunts are generally clusters of resting orders 
    // just below support levels (1-2% below current bid) or just above resistance (1-2% above current ask).
    // Or round numbers like 50000, 60000, etc.
    const roundNumberInterval = midPrice > 1000 ? 500 : midPrice > 100 ? 50 : 5;

    // Check bid side for support stop hunts
    snapshot.bids.forEach(b => {
      const distPct = (bestBid - b.price) / bestBid;
      const isRound = b.price % roundNumberInterval === 0 || Math.round(b.price) % roundNumberInterval === 0;
      
      if (distPct > 0.005 && distPct < 0.02) { // 0.5% to 2% away
        if (isRound || b.quantity > this.mean(snapshot.bids.map(x => x.quantity)) * 2) {
          zones.push({
            priceLevel: b.price,
            estimatedStopVolume: b.quantity * 1.5, // estimate stop density
            keyLevel: isRound ? "ROUND_NUMBER" : "SUPPORT",
            distanceFromCurrentPct: distPct,
          });
        }
      }
    });

    // Check ask side for resistance stop hunts
    snapshot.asks.forEach(a => {
      const distPct = (a.price - bestAsk) / bestAsk;
      const isRound = a.price % roundNumberInterval === 0 || Math.round(a.price) % roundNumberInterval === 0;

      if (distPct > 0.005 && distPct < 0.02) {
        if (isRound || a.quantity > this.mean(snapshot.asks.map(x => x.quantity)) * 2) {
          zones.push({
            priceLevel: a.price,
            estimatedStopVolume: a.quantity * 1.5,
            keyLevel: isRound ? "ROUND_NUMBER" : "RESISTANCE",
            distanceFromCurrentPct: distPct,
          });
        }
      }
    });

    // Sort by distance and return top 5
    return zones.sort((a, b) => a.distanceFromCurrentPct - b.distanceFromCurrentPct).slice(0, 5);
  }

  private mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private stdDev(arr: number[], meanVal?: number): number {
    if (arr.length <= 1) return 0;
    const m = meanVal !== undefined ? meanVal : this.mean(arr);
    const variance = arr.reduce((acc, val) => acc + Math.pow(val - m, 2), 0) / (arr.length - 1);
    return Math.sqrt(variance);
  }

  private emptyResult(symbol: string, timestamp: number): OrderBookIntelligence {
    return {
      symbol,
      timestamp,
      bidAskImbalance: 0,
      spreadBps: 0,
      spoofingDetected: false,
      spoofingDetails: [],
      liquidityWalls: [],
      stopHuntZones: [],
      absorptionDetected: false,
      absorptionSide: "NONE",
      icebergOrders: [],
      marketPressure: 0,
      depthScore: 0,
    };
  }
}
