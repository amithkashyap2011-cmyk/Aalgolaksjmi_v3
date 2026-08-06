/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Symbol Intelligence Engine (V5.0)
 * ═══════════════════════════════════════════════════════════════════
 */

import { WhaleFlowEngine, WhaleFlowResult } from "./whaleFlowEngine.js";
import { FutureAnalysisEngine, FutureAnalysisResult } from "./futureAnalysisEngine.js";

export interface SymbolIntelligence {
  symbol: string;
  timestamp: Date;
  summary: {
    bias: "BULLISH" | "BEARISH" | "NEUTRAL";
    conviction: number; // 0-100
    regime: string;
  };
  whaleFlow: WhaleFlowResult;
  forecast: FutureAnalysisResult;
  liquidityHeatmap: {
    upperWall: number;
    lowerWall: number;
    densityScore: number;
  };
}

export class SymbolIntelligenceEngine {
  /**
   * Aggregates intelligence from all V5 shadow engines for a single asset.
   */
  public static async getIntelligence(symbol: string, context: any): Promise<SymbolIntelligence> {
    const whale = await WhaleFlowEngine.analyze(symbol);
    const forecast = await FutureAnalysisEngine.forecast(symbol, context);
    
    // Aggregate bias calculation
    let bullWeight = (forecast.h1.bullishProbability + forecast.h4.bullishProbability) / 2;
    let bearWeight = (forecast.h1.bearishProbability + forecast.h4.bearishProbability) / 2;
    
    if (whale.bias === "BULLISH") bullWeight += 10;
    if (whale.bias === "BEARISH") bearWeight += 10;

    const bias = bullWeight > bearWeight + 10 ? "BULLISH" : (bearWeight > bullWeight + 10 ? "BEARISH" : "NEUTRAL");
    const conviction = Math.max(bullWeight, bearWeight);

    return {
      symbol,
      timestamp: new Date(),
      summary: {
        bias,
        conviction: Math.min(100, conviction),
        regime: context.regime || "TRANSITION"
      },
      whaleFlow: whale,
      forecast,
      liquidityHeatmap: {
        upperWall: context.currentPrice * 1.02,
        lowerWall: context.currentPrice * 0.98,
        densityScore: 72 // Mocked depth analysis
      }
    };
  }
}
