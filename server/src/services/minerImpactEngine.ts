/**
 * ─── Miner Impact Engine (V1.0) ───────────────────────
 * 
 * Tracks on-chain miner behavior and hash rate health.
 */

export interface MinerContext {
  hashRate: number;      // Current EH/s
  hashRateTrend: number; // -1 to 1 (negative is declining)
  difficulty: number;    // Current difficulty
  difficultyTrend: number;
  minerReserves: number; // Amount held by miners
  minerOutflow: number;  // Amount moving to exchanges
  weatherStress: number; // Input from WeatherIntelligenceEngine
}

export class MinerImpactEngine {
  public static calculateMinerPressure(ctx: MinerContext): number {
    let pressure = 0;

    // 1. Weather Impact (Miners shutting down due to heat/cold/outages)
    pressure += ctx.weatherStress * 0.5;

    // 2. Hash Rate Health
    if (ctx.hashRateTrend < 0) {
      pressure += Math.abs(ctx.hashRateTrend) * 30;
    }

    // 3. Difficulty Adjustment pressure
    if (ctx.difficultyTrend > 0.05) {
      pressure += 10; // Difficulty increasing makes it harder for stressed miners
    }

    // 4. On-chain Outflows (Miner capitulation indicator)
    if (ctx.minerOutflow > ctx.minerReserves * 0.005) {
      pressure += 20;
    }

    return Math.min(100, Math.max(0, pressure));
  }

  public static calculateWeatherAlpha(ctx: MinerContext, minerPressure: number): number {
    // Weather Alpha = 0.4 × Mining Stress + 0.3 × Miner Pressure + 0.2 × Hash Rate Trend + 0.1 × Difficulty Trend
    
    const miningStressPart = 0.4 * ctx.weatherStress;
    const minerPressurePart = 0.3 * minerPressure;
    const hashRateTrendPart = 0.2 * (ctx.hashRateTrend < 0 ? Math.abs(ctx.hashRateTrend) * 100 : 0);
    const difficultyTrendPart = 0.1 * (ctx.difficultyTrend > 0 ? ctx.difficultyTrend * 100 : 0);

    return Math.min(100, Math.max(0, miningStressPart + minerPressurePart + hashRateTrendPart + difficultyTrendPart));
  }
}
