/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Order Flow Engine (Phase 2A Foundation)
 * ═══════════════════════════════════════════════════════════════════
 */

import { BinanceAdapter } from "../quantum/exchanges/binanceAdapter.js";
import { AqeaAuditService } from "./AqeaAudit.js";

export interface OrderFlowResult {
  score: number;        // Global score for monitoring
  votingScore: number;  // Restricted score for voting
  pressure: "BUY" | "SELL" | "NEUTRAL";
  confidence: number;
  diagnostics: {
    cvd: number;
    delta: number;
    oiExpansion: number;
    fundingRate: number;
    liqLongs: number;
    liqShorts: number;
    liquidationScore: number;
    bookImbalance: number;
    votingBreakdown: {
       liquidationImpact: number;
       oiExpansionImpact: number;
    }
  };
}

/**
 * Institutional-grade Order Flow analysis layer.
 * Tracks micro-structure signals to detect smart money positioning.
 */
export class OrderFlowEngine {
  private static adapter = new BinanceAdapter();
  
  // Persistent metrics for CVD tracking
  private static cvdMap = new Map<string, number>();
  private static lastOiMap = new Map<string, number>();

  /**
   * Performs deep order flow analysis.
   */
  public static async analyze(symbol: string): Promise<OrderFlowResult> {
    try {
      // 1. Concurrent Data Fetching with individual error handling for robustness
      const results = await Promise.allSettled([
        this.adapter.getOpenInterest(symbol),
        this.adapter.getFundingRate(symbol),
        this.adapter.getLiquidations(symbol, 100),
        this.adapter.getOrderBook(symbol, 50)
      ]);

      const oiData = results[0].status === "fulfilled" ? results[0].value : { openInterest: 0 };
      const fundingData = results[1].status === "fulfilled" ? results[1].value : { fundingRate: 0 };
      const liqs = results[2].status === "fulfilled" ? results[2].value : [];
      const book = results[3].status === "fulfilled" ? results[3].value : { bids: [], asks: [] };

      if (results.some(r => r.status === "rejected")) {
         const failed = results.filter(r => r.status === "rejected").map((r: any) => r.reason?.message || "Unknown error").join(", ");
         console.warn(`[AQEA_ORDERFLOW_PARTIAL_FAILURE] ${symbol}: ${failed}`);
      }

      // 2. Calculate Delta & CVD
      const bidVol = book.bids.reduce((sum, b) => sum + b.quantity, 0);
      const askVol = book.asks.reduce((sum, a) => sum + a.quantity, 0);
      const totalVol = bidVol + askVol;
      const bookImbalance = totalVol > 0 ? (bidVol - askVol) / totalVol : 0;

      const delta = bidVol - askVol;
      const prevCvd = this.cvdMap.get(symbol) || 0;
      const currentCvd = prevCvd + delta;
      this.cvdMap.set(symbol, currentCvd);

      // 3. Open Interest Expansion/Contraction
      const prevOi = this.lastOiMap.get(symbol) || oiData.openInterest;
      const oiExpansion = (oiData.openInterest - prevOi) / (prevOi || 1);
      this.lastOiMap.set(symbol, oiData.openInterest);

      // 4. Liquidation Clusters (Last 5 mins proxy)
      const now = Date.now();
      const recentLiqs = liqs.filter(l => now - l.timestamp < 300000);
      const liqLongs = recentLiqs.filter(l => l.side === "SELL").reduce((sum, l) => sum + l.quantity, 0);
      const liqShorts = recentLiqs.filter(l => l.side === "BUY").reduce((sum, l) => sum + l.quantity, 0);

      // 5. VOTING SIGNAL CALCULATION (Phase 2A Recalibration)
      // Base Imbalance Signal (-50 to 50)
      const imbalanceImpact = bookImbalance * 50; 

      // Liquidation Pressure (-30 to 30)
      let liquidationImpact = 0;
      if (liqLongs > liqShorts * 2 && liqLongs > 0) liquidationImpact = 30; // Reversal up
      if (liqShorts > liqLongs * 2 && liqShorts > 0) liquidationImpact = -30; // Reversal down

      // CVD Momentum (-20 to 20)
      const cvdImpact = totalVol > 0 ? Math.min(20, Math.max(-20, (delta / totalVol) * 100)) : 0;

      const votingScore = 50 + imbalanceImpact + liquidationImpact + cvdImpact;

      // 6. MONITORING ONLY SIGNALS
      let fundingImpact = 0;
      if (fundingData.fundingRate > 0.0005) fundingImpact = -10;
      if (fundingData.fundingRate < -0.0005) fundingImpact = 10;

      const score = Math.min(100, Math.max(0, votingScore + fundingImpact));

      let pressure: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
      if (score > 65) pressure = "BUY";
      else if (score < 35) pressure = "SELL";

      const result: OrderFlowResult = {
        score,
        votingScore: Math.min(100, Math.max(0, votingScore)),
        pressure,
        confidence: Math.min(100, Math.abs(bookImbalance * 100) + 30),
        diagnostics: {
          cvd: currentCvd,
          delta,
          oiExpansion,
          fundingRate: fundingData.fundingRate,
          liqLongs,
          liqShorts,
          liquidationScore: liquidationImpact,
          bookImbalance,
          votingBreakdown: {
             liquidationImpact,
             oiExpansionImpact: imbalanceImpact + cvdImpact
          }
        }
      };

      return result;

    } catch (err: any) {
      // v2.8 Fix: Use valid ObjectId fallback in AuditService
      AqeaAuditService.error("000000000000000000000000", symbol, "orderFlowEngine", `Analysis failed: ${err.message}`);
      return {
        score: 50,
        votingScore: 50,
        pressure: "NEUTRAL",
        confidence: 0,
        diagnostics: { 
          cvd: 0, delta: 0, oiExpansion: 0, fundingRate: 0, liqLongs: 0, liqShorts: 0, liquidationScore: 0, bookImbalance: 0,
          votingBreakdown: { liquidationImpact: 0, oiExpansionImpact: 0 }
        }
      };
    }
  }
}
