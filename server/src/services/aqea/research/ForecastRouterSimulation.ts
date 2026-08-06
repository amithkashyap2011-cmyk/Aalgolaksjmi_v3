/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.3A — Forecast Router Simulation
 * ═══════════════════════════════════════════════════════════════════
 */

import { RegimeForecastPredictor } from "./RegimeForecastPredictor.js";
import { TransitionForecastEngine, TransitionWarning } from "./TransitionForecastEngine.js";
import { PredictorType } from "../ai/types.js";

export class ForecastRouterSimulation {
    /**
     * Phase 4: Compares Reactive Router vs Forecast Router
     */
    public static async run(samples: any[]) {
        let reactiveWins = 0;
        let forecastWins = 0;
        let specialistWins = 0;

        for (const s of samples) {
            // 1. Reactive Router: Uses current regime
            const reactiveModel = this.getReactiveModel(s.currentRegime);
            if (s.predictions[reactiveModel] === s.actualOutcome) reactiveWins++;

            // 2. Forecast Router: Uses forecasted regime
            const forecast = await RegimeForecastPredictor.forecast(s.features, 10);
            const forecastModel = this.getReactiveModel(forecast.forecastedRegime);
            if (s.predictions[forecastModel] === s.actualOutcome) forecastWins++;

            // 3. Phase 5: Transition Specialist Test
            const transition = await TransitionForecastEngine.analyze(s.features);
            let specialistModel = forecastModel;
            if (transition.transitionProbability > 0.85) {
                specialistModel = "TRANSFORMER"; // Force Transformer in Transition Specialist Test
            }
            if (s.predictions[specialistModel] === s.actualOutcome) specialistWins++;
        }

        return {
            reactivePF: (reactiveWins * 1.5) / (samples.length - reactiveWins),
            forecastPF: (forecastWins * 1.5) / (samples.length - forecastWins),
            specialistPF: (specialistWins * 1.5) / (samples.length - specialistWins),
            totalSamples: samples.length
        };
    }

    private static getReactiveModel(regime: string): PredictorType {
        if (regime.includes("TRENDING")) return "CNN";
        if (regime === "RANGING") return "MAMBA";
        return "TRANSFORMER";
    }

    /**
     * Generates synthetic validation data for v2.3A
     */
    public static generateData(count: number = 5000): any[] {
        const regimes = ["TRENDING_BULL", "TRENDING_BEAR", "RANGING", "TRANSITION", "HIGH_VOLATILITY"];
        const samples = [];

        for (let i = 0; i < count; i++) {
            const currentRegime = regimes[Math.floor(Math.random() * regimes.length)];
            const isActuallyTransition = Math.random() > 0.7; // 30% of samples are transition events
            
            // Simulation of "Regime Lag": currentRegime might still be TRENDING while it's actually TRANSITION
            const actualRegime = isActuallyTransition ? "TRANSITION" : currentRegime;
            const actualOutcome = Math.random() > 0.5 ? "WIN" : "LOSS";

            samples.push({
                currentRegime,
                actualRegime,
                actualOutcome,
                predictions: {
                    CNN: (actualRegime.includes("TRENDING")) ? actualOutcome : (Math.random() > 0.6 ? "WIN" : "LOSS"),
                    MAMBA: (actualRegime === "RANGING") ? actualOutcome : (Math.random() > 0.6 ? "WIN" : "LOSS"),
                    TRANSFORMER: (actualRegime === "TRANSITION" || actualRegime === "HIGH_VOLATILITY") ? actualOutcome : (Math.random() > 0.55 ? "WIN" : "LOSS")
                },
                features: {
                    regime: { state: currentRegime, score: 70 },
                    market: { atr: 1.2, volume: 1000, close: 50000, vwap: 49500 },
                    orderFlow: { oiExpansion: 0.05, liquidationScore: 0.2 },
                    meta: { atrAvg: 1.0, adxSlope: 0.5, volumeAvg: 800 }
                }
            });
        }
        return samples;
    }
}
