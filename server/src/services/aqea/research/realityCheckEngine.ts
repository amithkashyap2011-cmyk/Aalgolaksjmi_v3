/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.4B — Meta Alpha Reality Check Engine
 * ═══════════════════════════════════════════════════════════════════
 */

import { MetaAlphaEngine, AlphaSignal } from "./MetaAlphaEngine.js";
import { RegimeState } from "../regimeEngine.js";

export interface RealityCheckMetrics {
    pf: number;
    sharpe: number;
    drawdown: number;
    stabilityIndex: number;
    monteCarloLowerBound: number;
    leakageStatus: string;
    contributionRanking: string[];
}

export class MetaAlphaRealityCheckEngine {
    /**
     * Phase 2: Walk-Forward Test
     */
    public static runWalkForward(data: any[], windows: number = 10): { avgPF: number, stability: number, pfs: number[] } {
        const windowSize = Math.floor(data.length / windows);
        const pfs: number[] = [];

        for (let i = 0; i < windows; i++) {
            const windowData = data.slice(i * windowSize, (i + 1) * windowSize);
            const wins = windowData.filter(s => s.metaCorrect).length;
            const losses = windowData.length - wins;
            const pf = losses > 0 ? (wins * 1.5) / losses : wins; 
            pfs.push(pf);
        }

        const avgPF = pfs.reduce((a, b) => a + b, 0) / pfs.length;
        const stability = Math.min(...pfs) / Math.max(...pfs); 

        return { avgPF, stability, pfs };
    }

    /**
     * Phase 3: Monte Carlo Simulation
     */
    public static runMonteCarlo(data: any[], iterations: number = 1000): { meanPF: number, lowerBound: number, upperBound: number } {
        const pfs: number[] = [];

        for (let i = 0; i < iterations; i++) {
            // Randomly sample with replacement (Bootstrap)
            const sample = Array.from({ length: data.length }, () => data[Math.floor(Math.random() * data.length)]);
            const wins = sample.filter(s => s.metaCorrect).length;
            const losses = sample.length - wins;
            const pf = losses > 0 ? (wins * 1.5) / losses : wins;
            pfs.push(pf);
        }

        pfs.sort((a, b) => a - b);
        return {
            meanPF: pfs.reduce((a, b) => a + b, 0) / iterations,
            lowerBound: pfs[Math.floor(iterations * 0.025)], // 2.5th percentile
            upperBound: pfs[Math.floor(iterations * 0.975)]  // 97.5th percentile
        };
    }

    /**
     * Phase 5: Stress Test (Injecting noise and missing signals)
     */
    public static runStressTest(data: any[]): any {
        const scenarios = [
            { name: "30% Noise", noise: 0.3, missing: [] },
            { name: "No OrderFlow", noise: 0, missing: ["ORDER_FLOW"] },
            { name: "No SmartMoney", noise: 0, missing: ["SMART_MONEY"] },
            { name: "Only Core", noise: 0, missing: ["CNN", "MAMBA", "TRANSFORMER", "ORDER_FLOW", "SMART_MONEY"] }
        ];

        return scenarios.map(scenario => {
            let wins = 0;
            let trades = 0;

            data.forEach(s => {
                const signals = s.signals.filter((sig: any) => !scenario.missing.includes(sig.source));
                
                // Inject noise by flipping random signals
                const noisySignals = signals.map((sig: any) => {
                    if (Math.random() < scenario.noise) {
                        return { ...sig, direction: sig.direction === "LONG" ? "SHORT" : "LONG" };
                    }
                    return sig;
                });

                const weighted = MetaAlphaEngine.calculateWeights(noisySignals, s.regime, s.perf, s.drift);
                const meta = MetaAlphaEngine.blend(weighted);

                if (meta.decision !== "HOLD") {
                    trades++;
                    if (meta.decision === s.actualMove) wins++;
                }
            });

            const pf = (wins * 1.5) / (trades - wins);
            return { name: scenario.name, pf, trades };
        });
    }

    /**
     * Phase 6: Attribution Audit
     */
    public static runAttribution(data: any[]): string[] {
        const sources = ["CORE", "ORDER_FLOW", "SMART_MONEY", "CNN", "MAMBA", "TRANSFORMER"];
        const contributions = sources.map(source => {
            let wins = 0;
            let trades = 0;
            
            data.forEach(s => {
                const signals = s.signals.filter((sig: any) => sig.source === source);
                const weighted = MetaAlphaEngine.calculateWeights(signals, s.regime, s.perf, s.drift);
                const meta = MetaAlphaEngine.blend(weighted);
                if (meta.decision !== "HOLD") {
                    trades++;
                    if (meta.decision === s.actualMove) wins++;
                }
            });
            return { source, pf: (wins * 1.5) / (trades - wins || 1) };
        });

        return contributions.sort((a, b) => b.pf - a.pf).map(c => c.source);
    }
}
