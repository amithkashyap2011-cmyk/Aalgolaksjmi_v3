/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.1E — Ensemble Competition & Weight Optimization
 * ═══════════════════════════════════════════════════════════════════
 */

import { AlphaAttributionEngine } from "./alphaAttribution.js";
import { SignificanceAnalyzer } from "./significanceAnalyzer.js";
import { RedundancyMonitor } from "./redundancyMonitor.js";

export interface CompetitionResult {
    ensembleName: string;
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    expectancy: number;
    latencyMs: number;
}

export interface EnsembleData {
    predictions: Record<string, any[]>; // modelName -> predictions
    outcomes: any[];
    regimes: string[];
}

export class EnsembleCompetitionEngine {
    /**
     * Phase 1: Model Competition Matrix
     */
    public static async runCompetition(data: EnsembleData): Promise<CompetitionResult[]> {
        const models = ["CNN", "MAMBA", "TRANSFORMER"];
        const combinations = [
            ["CNN"],
            ["MAMBA"],
            ["TRANSFORMER"],
            ["CNN", "MAMBA"],
            ["CNN", "TRANSFORMER"],
            ["MAMBA", "TRANSFORMER"],
            ["CNN", "MAMBA", "TRANSFORMER"]
        ];

        const results: CompetitionResult[] = [];

        for (const combo of combinations) {
            results.push(this.evaluateEnsemble(combo, data));
        }

        return results.sort((a, b) => b.profitFactor - a.profitFactor);
    }

    private static evaluateEnsemble(models: string[], data: EnsembleData): CompetitionResult {
        const { predictions, outcomes } = data;
        let totalReturn = 0;
        let wins = 0;
        let losses = 0;
        const equityCurve: number[] = [10000];
        let peak = 10000;
        let maxDD = 0;
        let totalLatency = 0;

        // Simplified Ensemble Logic: Weighted Average of confidences/directions
        for (let i = 0; i < outcomes.length; i++) {
            let combinedScore = 0;
            let activeModels = 0;

            for (const model of models) {
                const pred = predictions[model][i];
                if (pred.direction !== "HOLD") {
                    combinedScore += pred.direction === "LONG" ? pred.confidence : -pred.confidence;
                    activeModels++;
                }
                totalLatency += pred.latencyMs || 0;
            }

            const ensembleDirection = combinedScore > 0 ? "LONG" : (combinedScore < 0 ? "SHORT" : "HOLD");
            const outcome = outcomes[i];
            
            if (ensembleDirection !== "HOLD") {
                const isCorrect = (ensembleDirection === "LONG" && outcome.realDirection === "UP") ||
                                  (ensembleDirection === "SHORT" && outcome.realDirection === "DOWN");
                
                const ret = isCorrect ? outcome.profit : -Math.abs(outcome.loss);
                totalReturn += ret;
                equityCurve.push(equityCurve[equityCurve.length - 1] + ret);
                
                const currentEquity = equityCurve[equityCurve.length - 1];
                if (currentEquity > peak) peak = currentEquity;
                const dd = (peak - currentEquity) / peak;
                if (dd > maxDD) maxDD = dd;

                if (isCorrect) wins++;
                else losses++;
            }
        }

        const winRate = wins / (wins + losses);
        const totalGains = wins * outcomes[0].profit; // Simplified
        const totalLosses = losses * outcomes[0].loss; // Simplified
        const pf = Math.abs(totalGains / totalLosses);

        return {
            ensembleName: models.join(" + "),
            winRate,
            profitFactor: pf,
            sharpeRatio: pf * 0.8, // Stubbed
            sortinoRatio: pf * 1.1, // Stubbed
            maxDrawdown: maxDD,
            expectancy: totalReturn / (wins + losses),
            latencyMs: totalLatency / outcomes.length
        };
    }

    /**
     * Phase 2: Unique Alpha Decomposition
     */
    public static async decomposeAlpha(data: EnsembleData) {
        const models = ["CNN", "MAMBA", "TRANSFORMER"];
        const matrix: any = {};

        for (const model of models) {
            const attribution = await AlphaAttributionEngine.evaluate(model, data.predictions[model], data.outcomes);
            matrix[model] = {
                uniqueAlpha: attribution.uniqueAlphaRate,
                pfContribution: attribution.profitFactorContribution
            };
        }
        return matrix;
    }

    /**
     * Phase 3: Regime Specialization
     */
    public static analyzeRegimes(data: EnsembleData) {
        const regimes = [...new Set(data.regimes)];
        const models = ["CNN", "MAMBA", "TRANSFORMER"];
        const report: any = {};

        for (const regime of regimes) {
            let bestModel = "";
            let bestPF = 0;

            for (const model of models) {
                const rPreds = data.predictions[model].filter((_, i) => data.regimes[i] === regime);
                const rOutcomes = data.outcomes.filter((_, i) => data.regimes[i] === regime);
                
                // Calculate PF for this model in this regime
                const wins = rPreds.filter((p, i) => {
                    const dir = p.direction;
                    const out = rOutcomes[i];
                    return (dir === "LONG" && out.realDirection === "UP") || (dir === "SHORT" && out.realDirection === "DOWN");
                }).length;
                const losses = rPreds.length - wins;
                const pf = losses > 0 ? (wins * 1.5) / (losses) : wins; // Simplified

                if (pf > bestPF) {
                    bestPF = pf;
                    bestModel = model;
                }
            }
            report[regime] = { bestModel, pf: bestPF };
        }
        return report;
    }

    /**
     * Phase 4: Dynamic Model Router Simulation
     */
    public static simulateDynamicRouter(data: EnsembleData, regimeBestModels: any) {
        let totalReturn = 0;
        let wins = 0;
        let losses = 0;

        for (let i = 0; i < data.outcomes.length; i++) {
            const regime = data.regimes[i];
            const bestModel = regimeBestModels[regime].bestModel;
            const pred = data.predictions[bestModel][i];
            const outcome = data.outcomes[i];

            if (pred.direction !== "HOLD") {
                const isCorrect = (pred.direction === "LONG" && outcome.realDirection === "UP") ||
                                  (pred.direction === "SHORT" && outcome.realDirection === "DOWN");
                if (isCorrect) {
                    wins++;
                    totalReturn += outcome.profit;
                } else {
                    losses++;
                    totalReturn -= outcome.loss;
                }
            }
        }

        const pf = (wins * 1.5) / losses;
        return { name: "Dynamic Router", pf, winRate: wins / (wins + losses) };
    }

    /**
     * Synthetic Data Generator for Ensemble Competition
     */
    public static generateData(count: number = 5000): EnsembleData {
        const regimes = ["TRENDING_BULL", "TRENDING_BEAR", "RANGING", "HIGH_VOLATILITY", "TRANSITION"];
        const dataRegimes = [];
        const outcomes = [];
        const predictions: Record<string, any[]> = {
            CNN: [],
            MAMBA: [],
            TRANSFORMER: []
        };

        for (let i = 0; i < count; i++) {
            const regime = regimes[Math.floor(Math.random() * regimes.length)];
            dataRegimes.push(regime);
            
            const realDirection = Math.random() > 0.5 ? "UP" : "DOWN";
            outcomes.push({
                realDirection,
                profit: 150,
                loss: 100
            });

            // Model Characteristics
            // CNN: Good at TRENDING
            const cnnCorrect = regime.includes("TRENDING") ? Math.random() > 0.40 : Math.random() > 0.52;
            predictions.CNN.push({
                direction: cnnCorrect ? (realDirection === "UP" ? "LONG" : "SHORT") : (realDirection === "UP" ? "SHORT" : "LONG"),
                confidence: 0.7,
                latencyMs: 15
            });

            // MAMBA: Good at TRENDING and RANGING (Long Context)
            const mambaCorrect = (regime.includes("TRENDING") || regime === "RANGING") ? Math.random() > 0.42 : Math.random() > 0.55;
            predictions.MAMBA.push({
                direction: mambaCorrect ? (realDirection === "UP" ? "LONG" : "SHORT") : (realDirection === "UP" ? "SHORT" : "LONG"),
                confidence: 0.75,
                latencyMs: 25
            });

            // TRANSFORMER: Good at TRANSITION and HIGH_VOLATILITY
            const transCorrect = (regime === "TRANSITION" || regime === "HIGH_VOLATILITY") ? Math.random() > 0.35 : Math.random() > 0.50;
            predictions.TRANSFORMER.push({
                direction: transCorrect ? (realDirection === "UP" ? "LONG" : "SHORT") : (realDirection === "UP" ? "SHORT" : "LONG"),
                confidence: 0.8,
                latencyMs: 45
            });
        }

        return { predictions, outcomes, regimes: dataRegimes };
    }
}
