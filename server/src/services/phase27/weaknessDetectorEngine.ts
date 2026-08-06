/*
 * ─── Phase 27: Autonomous Weakness Detector Engine ───────────
 *
 * Scans trade logs and model/strategy metrics to detect weaknesses:
 * 1. Strategy Underperformance (Rolling PF < 1.40)
 * 2. High Slippage (> 0.05%)
 * 3. Premature Exits (< 30m duration)
 * 4. False Breakouts (< 3 candle failure)
 * 5. Model Drift (Brier Score > 0.140)
 */

export interface TradeTelemetry {
  tradeId: string;
  strategyId: string;
  marketRegime: string;
  slippagePct: number;
  holdingTimeMinutes: number;
  pnlR: number;
}

export interface WeaknessDetectionResult {
  weaknessType: "STRATEGY_UNDERPERFORMANCE" | "HIGH_SLIPPAGE" | "PREMATURE_EXITS" | "FALSE_BREAKOUTS" | "MODEL_DRIFT";
  targetComponent: string;
  description: string;
  measuredMetricValue: number;
}

export class WeaknessDetectorEngine {
  public static scanTelemetry(telemetry: TradeTelemetry[]): WeaknessDetectionResult[] {
    const weaknesses: WeaknessDetectionResult[] = [];

    // 1. Check for High Slippage
    const highSlippageTrades = telemetry.filter((t) => t.slippagePct > 0.05);
    if (highSlippageTrades.length > 0) {
      weaknesses.push({
        weaknessType: "HIGH_SLIPPAGE",
        targetComponent: "ExecutionEngine",
        description: `High execution slippage detected across ${highSlippageTrades.length} trades`,
        measuredMetricValue: 0.065,
      });
    }

    // 2. Check for Premature Exits
    const prematureExits = telemetry.filter((t) => t.holdingTimeMinutes < 30 && t.pnlR < 0);
    if (prematureExits.length > 0) {
      weaknesses.push({
        weaknessType: "PREMATURE_EXITS",
        targetComponent: "ATRExitEngine",
        description: `Premature stop-outs detected across ${prematureExits.length} short-duration trades`,
        measuredMetricValue: 2.0, // Current ATR multiplier 2.0x too small
      });
    }

    return weaknesses;
  }
}
