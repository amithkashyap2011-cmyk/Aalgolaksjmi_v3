/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.3A — Regime Forecast Predictor
 *
 *  NOT PRODUCTION-READY. The Python endpoint this calls
 *  (quant_engine/regimeForecaster.py) is hand-written threshold logic
 *  labeled as a trained model, not a real one. Additionally, as of a
 *  production-readiness audit, this class has zero callers anywhere in
 *  the real trading pipeline (agentService/autoTradeEngine/checklist/
 *  aqea-engine) — its only callers (TransitionForecastEngine,
 *  ForecastRouterSimulation) are themselves unreferenced from anywhere
 *  live. Also note: the payload this sends (`features`/`horizon`) does
 *  not match what the Python endpoint's Pydantic model actually requires
 *  (`returns`/`volatility`) — every real call 422s and falls through to
 *  the confidence:0 fallback below, which is an accident of a schema
 *  mismatch, not a deliberate safety design. Do not wire this into a live
 *  decision path without fixing both issues and replacing the Python
 *  logic with a real trained model.
 * ═══════════════════════════════════════════════════════════════════
 */

import { FeatureVector } from "../featureStore.js";
import { RegimeState } from "../regimeEngine.js";
import { AI_ENDPOINTS, buildEndpointUrl } from "../../../config/aiEndpointRegistry.js";

export interface ForecastResponse {
  forecastedRegime: RegimeState;
  confidence: number;
  probabilities: Record<RegimeState, number>;
  horizon: number; // in bars
}

export class RegimeForecastPredictor {

  /**
   * Predicts the next market regime using expanded predictive features.
   */
  public static async forecast(features: FeatureVector, horizon: 5 | 10 | 20 = 10): Promise<ForecastResponse> {
    try {
      const payload = {
        features: this.mapPredictiveFeatures(features),
        horizon
      };

      const url = await buildEndpointUrl(AI_ENDPOINTS.REGIME_FORECAST);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`Regime Forecaster service error: ${res.status}`);

      const data = await res.json() as { 
        forecasted_regime: string; 
        confidence: number; 
        transition_probabilities: Record<RegimeState, number>; 
      };

      return {
        forecastedRegime: this.mapPythonRegime(data.forecasted_regime),
        confidence: data.confidence,
        probabilities: data.transition_probabilities,
        horizon
      };
    } catch (err) {
      console.warn("[RegimeForecastPredictor] Forecast failed, falling back to current regime.", err);
      return {
        forecastedRegime: features.regime.state as RegimeState,
        confidence: 0,
        probabilities: {} as any,
        horizon
      };
    }
  }

  /**
   * Phase 2: Feature Expansion for Regime Forecasting
   */
  private static mapPredictiveFeatures(fv: FeatureVector): any {
    return {
      // 1. Volatility Expansion
      atrExpansion: fv.market.atr / (fv.meta?.atrAvg || fv.market.atr), 
      
      // 2. Trend Exhaustion
      adxSlope: fv.meta?.adxSlope || 0,
      
      // 3. Volume Acceleration
      volumeAcceleration: fv.market.volume / (fv.meta?.volumeAvg || fv.market.volume),

      // 4. Microstructure Shifts
      fundingDelta: fv.meta?.fundingDelta || 0,
      cvdSlope: fv.meta?.cvdSlope || 0,
      oiExpansion: fv.orderFlow.oiExpansion,
      liquidationIntensity: fv.orderFlow.liquidationScore,

      // 5. Smart Money Context
      bosFrequency: fv.meta?.bosFreq || 0,
      sweepFrequency: fv.meta?.sweepFreq || 0,
      
      // 6. Mean Reversion Depth
      vwapDeviation: (fv.market.close - fv.market.vwap) / fv.market.vwap
    };
  }

  private static mapPythonRegime(pythonRegime: string): RegimeState {
    const map: Record<string, RegimeState> = {
      "STABLE_TREND": "TRENDING_BULL", // Simplified
      "VOLATILITY_EXPANSION": "HIGH_VOLATILITY",
      "MEAN_REVERSION": "RANGING",
      "CRASH_RISK": "TRENDING_BEAR",
      "TRANSITION": "TRANSITION"
    };
    return map[pythonRegime] || "TRANSITION";
  }
}
