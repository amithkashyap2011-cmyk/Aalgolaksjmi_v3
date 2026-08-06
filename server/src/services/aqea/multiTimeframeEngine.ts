/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Multi-Timeframe Alignment Engine
 * ═══════════════════════════════════════════════════════════════════
 */

import { getKlines } from "../binanceService.js";
import { 
  StreamingEMA, 
  StreamingRSI, 
  StreamingMACD, 
  StreamingVWAP, 
  computeSupertrend,
  type OHLCVol
} from "../indicatorService.js";

export interface MultiTFDiagnostics {
  timeframe: string;
  score: number;
  direction: string;
}

export interface MultiTFResult {
  score: number;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  agreement: number;
  diagnostics: MultiTFDiagnostics[];
}

export class MultiTimeframeEngine {
  private static readonly WEIGHTS: Record<string, number> = {
    "1m": 0.10,
    "5m": 0.15,
    "15m": 0.25,
    "1h": 0.25,
    "4h": 0.25
  };

  /**
   * Main entry point to calculate alignment across 5 timeframes.
   */
  public static async calculateAlignment(symbol: string): Promise<MultiTFResult> {
    const isIndian = !symbol.endsWith("USDT") && !symbol.endsWith("BUSD") && !symbol.endsWith("BTC") && !symbol.endsWith("ETH");
    if (isIndian) {
      return { score: 50, direction: "NEUTRAL", agreement: 3, diagnostics: [] };
    }
    const timeframes = ["1m", "5m", "15m", "1h", "4h"];
    const diagnostics: MultiTFDiagnostics[] = [];
    
    let weightedSum = 0;
    
    // Process all timeframes in parallel for performance
    const results = await Promise.all(
      timeframes.map(tf => this.analyzeTimeframe(symbol, tf))
    );

    results.forEach((res, index) => {
      const tf = timeframes[index];
      const weight = this.WEIGHTS[tf];
      
      weightedSum += res.directionScore * weight;
      
      diagnostics.push({
        timeframe: tf,
        score: Math.round(res.confidence * 100),
        direction: res.direction
      });
    });

    // Map weightedSum [-1, 1] to [0, 100]
    const finalScore = Math.round(50 + (weightedSum * 50));
    
    let finalDirection: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    if (finalScore > 60) finalDirection = "BULLISH";
    else if (finalScore < 40) finalDirection = "BEARISH";

    // Agreement: Count how many timeframes agree with the final direction
    const agreement = diagnostics.filter(d => d.direction === finalDirection).length;

    return {
      score: finalScore,
      direction: finalDirection,
      agreement,
      diagnostics
    };
  }

  /**
   * Analyzes a single timeframe using 7 institutional indicators.
   */
  private static async analyzeTimeframe(symbol: string, interval: string) {
    // Fetch enough bars for EMA200 and Supertrend (approx 250 bars)
    const klines = await getKlines(symbol, interval, undefined, undefined, 250);
    if (!klines || klines.length < 200) {
      return { directionScore: 0, direction: "NEUTRAL", confidence: 0 };
    }

    const bars: OHLCVol[] = klines.map(k => ({
      open: parseFloat(k.open),
      high: parseFloat(k.high),
      low: parseFloat(k.low),
      close: parseFloat(k.close),
      volume: parseFloat(k.volume)
    }));

    const last = bars[bars.length - 1];
    
    // Indicators
    const ema20 = new StreamingEMA(20);
    const ema50 = new StreamingEMA(50);
    const ema100 = new StreamingEMA(100);
    const rsi14 = new StreamingRSI(14);
    const macd = new StreamingMACD();
    const vwap = new StreamingVWAP();
    
    bars.forEach(b => {
      ema20.update(b.close);
      ema50.update(b.close);
      ema100.update(b.close);
      rsi14.update(b.close);
      macd.update(b.close);
      vwap.update(b);
    });

    // Scoring Logic
    let bullVotes = 0;
    let bearVotes = 0;

    // 1. EMA 20
    if (last.close > (ema20.value || 0)) bullVotes++; else bearVotes++;
    // 2. EMA 50
    if (last.close > (ema50.value || 0)) bullVotes++; else bearVotes++;
    // 3. EMA 100
    if (last.close > (ema100.value || 0)) bullVotes++; else bearVotes++;
    // 4. RSI 14
    if ((rsi14.value || 50) > 50) bullVotes++; else bearVotes++;
    // 5. MACD
    if ((macd.value?.histogram || 0) > 0) bullVotes++; else bearVotes++;
    // 6. VWAP
    if (last.close > (vwap.value || 0)) bullVotes++; else bearVotes++;
    // 7. Momentum (10-period rate of change)
    const prevPrice = bars.length > 10 ? bars[bars.length - 11].close : bars[0].close;
    if (last.close > prevPrice) bullVotes++; else bearVotes++;

    const totalVotes = bullVotes + bearVotes;
    const directionScore = (bullVotes - bearVotes) / totalVotes; // Range [-1, 1]
    
    let direction: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    if (bullVotes >= 5) direction = "BULLISH";
    else if (bearVotes >= 5) direction = "BEARISH";

    return {
      directionScore,
      direction,
      confidence: Math.abs(directionScore)
    };
  }
}
