/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.4A — Meta Alpha Weighting Engine
 * ═══════════════════════════════════════════════════════════════════
 */

import { PredictorType, AIPrediction } from "../ai/types.js";
import { RegimeState } from "../regimeEngine.js";

export interface AlphaSignal {
    source: PredictorType | "ORDER_FLOW" | "SMART_MONEY" | "CORE";
    direction: "LONG" | "SHORT" | "HOLD";
    confidence: number;
    meta?: any;
}

export interface WeightedSignal {
    source: string;
    weight: number;
    weightedScore: number;
    alphaScore: number;
}

export class MetaAlphaEngine {
    private static previousWeights = new Map<string, number>();
    private static lastRegime: RegimeState | null = null;

    /**
     * Resets engine state for fresh simulation runs.
     */
    public static reset(): void {
        this.previousWeights.clear();
        this.lastRegime = null;
    }

    /**
     * Phase 1 & 2: Calculates dynamic weights and alpha scores with Stability Controls (v2.4D).
     */
    public static calculateWeights(
        signals: AlphaSignal[],
        regime: RegimeState,
        performanceHistory: any, // Expects { source: { longTerm: number, shortTerm: number } }
        driftScores: Record<string, number>
    ): WeightedSignal[] {
        const results: WeightedSignal[] = [];
        const isRegimeChange = this.lastRegime !== null && this.lastRegime !== regime;

        signals.forEach(signal => {
            // C. Confidence Compression (Reduce extreme swings)
            const compressedConf = 0.5 + ((signal.confidence - 0.5) * 0.5);
            const predConfScore = compressedConf * 100;

            // 2. Regime Specialization
            const regimeBoost = this.getRegimeBoost(signal.source, regime);

            // E. Rolling Accuracy Memory (70% long-term, 30% short-term)
            const history = performanceHistory[signal.source] || { longTerm: 50, shortTerm: 50 };
            const historyScore = (history.longTerm * 0.7) + (history.shortTerm * 0.3);

            // D. Drift Penalty Cap (Max 20% impact)
            const rawDriftPenalty = (driftScores[signal.source] || 0) / 2;
            const driftPenalty = Math.min(20, rawDriftPenalty);

            // Phase 2: Generate base alphaScore (0-100)
            const targetAlphaScore = Math.min(100, Math.max(0, 
                (predConfScore * 0.4) + (regimeBoost * 0.3) + (historyScore * 0.3) - driftPenalty
            ));
            const targetWeight = targetAlphaScore / 100;

            // A. Weight Smoothing (80/20 EMA)
            const prevWeight = this.previousWeights.get(signal.source) ?? targetWeight;
            let smoothedWeight = (0.8 * prevWeight) + (0.2 * targetWeight);

            // B. Regime Transition Dampening (Max +/- 15% per cycle on regime change)
            if (isRegimeChange) {
                const diff = smoothedWeight - prevWeight;
                const maxChange = 0.15;
                if (Math.abs(diff) > maxChange) {
                    smoothedWeight = prevWeight + (Math.sign(diff) * maxChange);
                }
            }

            this.previousWeights.set(signal.source, smoothedWeight);

            results.push({
                source: signal.source,
                weight: smoothedWeight,
                weightedScore: (signal.direction === "LONG" ? 1 : (signal.direction === "SHORT" ? -1 : 0)) * smoothedWeight,
                alphaScore: smoothedWeight * 100
            });
        });

        this.lastRegime = regime;
        return results;
    }

    /**
 * Phase 3: Regime Weight Matrix (Optimized v2.4A)
 */
private static getRegimeBoost(source: string, regime: RegimeState): number {
    const matrix: Record<RegimeState, Record<string, number>> = {
        TRENDING_BULL: { CNN: 85, CORE: 10, MAMBA: 40, TRANSFORMER: 95, SMART_MONEY: 90, ORDER_FLOW: 10, WEATHER_STRESS: 50 },
        TRENDING_BEAR: { CNN: 85, CORE: 10, MAMBA: 40, TRANSFORMER: 95, SMART_MONEY: 90, ORDER_FLOW: 10, WEATHER_STRESS: 50 },
        RANGING: { MAMBA: 85, ORDER_FLOW: 10, CORE: 10, CNN: 30, SMART_MONEY: 95, TRANSFORMER: 95, WEATHER_STRESS: 50 },
        TRANSITION: { TRANSFORMER: 100, SMART_MONEY: 100, ORDER_FLOW: 10, CNN: 10, MAMBA: 10, CORE: 10, WEATHER_STRESS: 50 },
        HIGH_VOLATILITY: { TRANSFORMER: 100, SMART_MONEY: 100, ORDER_FLOW: 10, CNN: 10, MAMBA: 10, CORE: 10, WEATHER_STRESS: 50 },
        WEATHER_STRESS: { TRANSFORMER: 50, SMART_MONEY: 50, ORDER_FLOW: 50, CNN: 50, MAMBA: 50, CORE: 50, WEATHER_STRESS: 100 }
    };

    return matrix[regime]?.[source] || 10;
}

    /**
     * Calculates the blended ensemble decision (Threshold 0.50).
     */
    public static blend(weightedSignals: WeightedSignal[]): { decision: string, conviction: number } {
        const totalScore = weightedSignals.reduce((sum, s) => sum + s.weightedScore, 0);
        const totalWeight = weightedSignals.reduce((sum, s) => sum + s.weight, 0);

        const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;
        
        let decision = "HOLD";
        if (normalizedScore > 0.5) decision = "LONG";
        else if (normalizedScore < -0.5) decision = "SHORT";

        return {
            decision,
            conviction: Math.abs(normalizedScore)
        };
    }
}
