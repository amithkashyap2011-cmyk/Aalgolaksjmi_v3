/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Smart Money Engine (Phase 3A Shadow Layer)
 * ═══════════════════════════════════════════════════════════════════
 */

import { type OHLCVol } from "../indicatorService.js";
import { type OrderFlowResult } from "./orderFlowEngine.js";

export interface SmartMoneyResult {
  score: number;
  votingScore: number;
  signal: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  diagnostics: {
    liquiditySweeps: string[];
    orderBlocks: string[];
    fvgs: string[];
    marketStructure: string;
    liquiditySweep: boolean;
    bos: boolean;
    orderBlock: boolean;
    fvg: boolean;
    poc: number;
    volumeProfile: {
      poc: number;
      vah: number;
      val: number;
    };
    votingBreakdown: {
      sweepImpact: number;
      bosImpact: number;
      obImpact: number;
    }
  };
}

/**
 * Institutional Smart Money Concept (SMC) Engine.
 * Detects structural institutional footprints.
 */
export class SmartMoneyEngine {
  
  /**
   * Main entry point for Smart Money analysis.
   */
  public static analyze(bars: OHLCVol[], ofSignal?: OrderFlowResult): SmartMoneyResult {
    if (!bars || bars.length < 50) {
      return this.emptyResult();
    }

    // 1. Identify Market Structure (Swing Highs/Lows)
    const swings = this.detectSwings(bars, 20);
    const ms = this.determineMarketStructure(bars, swings);

    // 2. Detect Liquidity Sweeps
    const sweeps = this.detectLiquiditySweeps(bars, swings);

    // 3. Detect Order Blocks (OB) & Breakers
    const obs = this.detectOrderBlocks(bars, swings);

    // 4. Detect Fair Value Gaps (FVG)
    const fvgs = this.detectFVGs(bars);

    // 5. Volume Profile (Simple)
    const vp = this.calculateVolumeProfile(bars);

    // 6. VOTING SIGNAL CALCULATION (Promoted Signals)
    let sweepImpact = 0;
    let bosImpact = 0;
    let obImpact = 0;

    // PROMOTE: Liquidity Sweeps (High conviction reversals)
    if (sweeps.includes("BULLISH_SWEEP")) sweepImpact = 40;
    if (sweeps.includes("BEARISH_SWEEP")) sweepImpact = -40;

    // PROMOTE: Break of Structure (Institutional trend)
    if (ms === "BOS_UP") bosImpact = 10;
    if (ms === "BOS_DOWN") bosImpact = -10;

    // PROMOTE: Order Blocks (Institutional entries)
    if (obs.includes("BULLISH_OB")) obImpact = 25;
    if (obs.includes("BEARISH_OB")) obImpact = -25;

    const votingScore = 50 + sweepImpact + bosImpact + obImpact;

    // 7. MONITORING ONLY SIGNALS
    let monitorImpact = 0;
    
    // FVG Magnet effect (Secondary confirmation)
    if (fvgs.includes("BULLISH_FVG")) monitorImpact += 5;
    if (fvgs.includes("BEARISH_FVG")) monitorImpact -= 5;

    // Confluence with Order Flow (Secondary confirmation)
    if (ofSignal) {
      if (ofSignal.pressure === "BUY") monitorImpact += 15;
      if (ofSignal.pressure === "SELL") monitorImpact -= 15;
    }

    const score = Math.min(100, Math.max(0, votingScore + monitorImpact));

    let signal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    // Optimized thresholds for higher signal purity
    if (score > 75) signal = "BULLISH";
    else if (score < 25) signal = "BEARISH";

    return {
      score,
      votingScore: Math.min(100, Math.max(0, votingScore)),
      signal,
      confidence: Math.min(100, Math.max(Math.abs(sweepImpact), Math.abs(obImpact)) + 45),
      diagnostics: {
        liquiditySweeps: sweeps,
        orderBlocks: obs,
        fvgs,
        marketStructure: ms,
        liquiditySweep: sweeps.length > 0,
        bos: ms.startsWith("BOS"),
        orderBlock: obs.length > 0,
        fvg: fvgs.length > 0,
        poc: vp.poc,
        volumeProfile: vp,
        votingBreakdown: {
          sweepImpact,
          bosImpact,
          obImpact
        }
      }
    };
  }

  private static detectSwings(bars: OHLCVol[], lookback: number) {
    const high = Math.max(...bars.slice(-lookback, -1).map(b => b.high));
    const low = Math.min(...bars.slice(-lookback, -1).map(b => b.low));
    return { high, low };
  }

  private static determineMarketStructure(bars: OHLCVol[], swings: any): string {
    const last = bars[bars.length - 1];
    if (last.close > swings.high) return "BOS_UP"; // Break of Structure
    if (last.close < swings.low) return "BOS_DOWN";
    return "CHoCH_PENDING"; // Change of Character or Ranging
  }

  private static detectLiquiditySweeps(bars: OHLCVol[], swings: any): string[] {
    const last = bars[bars.length - 1];
    const results: string[] = [];

    // Bullish Sweep: Wick below Low, Close above Low
    if (last.low < swings.low && last.close > swings.low) {
      results.push("BULLISH_SWEEP");
    }
    // Bearish Sweep: Wick above High, Close below High
    if (last.high > swings.high && last.close < swings.high) {
      results.push("BEARISH_SWEEP");
    }

    return results;
  }

  private static detectOrderBlocks(bars: OHLCVol[], swings: any): string[] {
    const results: string[] = [];
    // Simplified OB: High volume candle at structure break
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    
    const avgVol = bars.slice(-20).reduce((a, b) => a + b.volume, 0) / 20;
    
    if (last.close > swings.high && prev.volume > avgVol * 1.5) {
      results.push("BULLISH_OB");
    }
    if (last.close < swings.low && prev.volume > avgVol * 1.5) {
      results.push("BEARISH_OB");
    }

    return results;
  }

  private static detectFVGs(bars: OHLCVol[]): string[] {
    const results: string[] = [];
    if (bars.length < 3) return results;

    const c1 = bars[bars.length - 3];
    const c2 = bars[bars.length - 2];
    const c3 = bars[bars.length - 1];

    // Bullish FVG: C1 High < C3 Low
    if (c1.high < c3.low) {
      results.push("BULLISH_FVG");
    }
    // Bearish FVG: C1 Low > C3 High
    if (c1.low > c3.high) {
      results.push("BEARISH_FVG");
    }

    return results;
  }

  private static calculateVolumeProfile(bars: OHLCVol[]) {
    const prices = bars.map(b => b.close);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min;
    const bins = 10;
    const binSize = range / bins;
    
    const profile = new Array(bins).fill(0);
    bars.forEach(b => {
      const binIdx = Math.min(bins - 1, Math.floor((b.close - min) / binSize));
      profile[binIdx] += b.volume;
    });

    const maxVolIdx = profile.indexOf(Math.max(...profile));
    const poc = min + (maxVolIdx * binSize) + (binSize / 2);
    
    return {
      poc,
      vah: max - (range * 0.3), // Simple 70% value area proxy
      val: min + (range * 0.3)
    };
  }

  private static emptyResult(): SmartMoneyResult {
    return {
      score: 50,
      votingScore: 50,
      signal: "NEUTRAL",
      confidence: 0,
      diagnostics: {
        liquiditySweeps: [],
        orderBlocks: [],
        fvgs: [],
        marketStructure: "UNKNOWN",
        liquiditySweep: false,
        bos: false,
        orderBlock: false,
        fvg: false,
        poc: 0,
        volumeProfile: { poc: 0, vah: 0, val: 0 },
        votingBreakdown: { sweepImpact: 0, bosImpact: 0, obImpact: 0 }
      }
    };
  }
}
