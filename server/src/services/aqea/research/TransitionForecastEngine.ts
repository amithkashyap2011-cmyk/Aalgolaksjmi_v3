/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.3A — Transition Forecast Engine
 * ═══════════════════════════════════════════════════════════════════
 */

import { RegimeForecastPredictor } from "./RegimeForecastPredictor.js";
import { FeatureVector } from "../featureStore.js";

export enum TransitionWarning {
    NONE = "NONE",
    EARLY_TRANSITION_WARNING = "EARLY_TRANSITION_WARNING",
    HIGH_CONFIDENCE_TRANSITION = "HIGH_CONFIDENCE_TRANSITION"
}

export interface TransitionStatus {
    transitionProbability: number;
    warning: TransitionWarning;
}

export class TransitionForecastEngine {
    /**
     * Calculates the probability of entering a TRANSITION regime.
     */
    public static async analyze(features: FeatureVector): Promise<TransitionStatus> {
        // Query the forecasting model
        const forecast = await RegimeForecastPredictor.forecast(features, 10);
        
        const transitionProbability = forecast.probabilities["TRANSITION"] || 0;
        
        let warning = TransitionWarning.NONE;
        if (transitionProbability >= 0.85) {
            warning = TransitionWarning.HIGH_CONFIDENCE_TRANSITION;
        } else if (transitionProbability >= 0.70) {
            warning = TransitionWarning.EARLY_TRANSITION_WARNING;
        }

        return {
            transitionProbability,
            warning
        };
    }
}
