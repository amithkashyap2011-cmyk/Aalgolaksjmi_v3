/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.2A — Transformer Behavioral Audit Engine
 * ═══════════════════════════════════════════════════════════════════
 */

export interface AuditMetrics {
    longRate: number;
    shortRate: number;
    holdRate: number;
    avgConfidence: number;
    confByAction: Record<string, number>;
    regimeBreakdown: Record<string, Record<string, number>>;
    holdAvoidanceRate: number;
    falseHoldRate: number;
    profitabilityImpact: number;
    confusionMatrix: Record<string, Record<string, number>>;
    recommendation: string;
}

export class TransformerAuditEngine {
    public static run(samples: any[]): AuditMetrics {
        let long = 0, short = 0, hold = 0;
        let totalConf = 0;
        const confByActionTotal: Record<string, number> = { LONG: 0, SHORT: 0, HOLD: 0 };
        const confByActionCount: Record<string, number> = { LONG: 0, SHORT: 0, HOLD: 0 };
        
        const regimes = ["TRENDING_BULL", "TRENDING_BEAR", "RANGING", "HIGH_VOLATILITY", "TRANSITION"];
        const regimeBreakdown: Record<string, any> = {};
        regimes.forEach(r => regimeBreakdown[r] = { LONG: 0, SHORT: 0, HOLD: 0, total: 0 });

        let holdAvoidanceSuccess = 0; // Predicted HOLD when actual would be LOSS
        let totalHolds = 0;
        let falseHolds = 0; // Predicted HOLD when actual would be WIN

        const confusionMatrix: any = {
            LONG: { LONG: 0, SHORT: 0, HOLD: 0 },
            SHORT: { LONG: 0, SHORT: 0, HOLD: 0 },
            HOLD: { LONG: 0, SHORT: 0, HOLD: 0 }
        };

        samples.forEach(s => {
            const pred = s.prediction;
            const actual = s.actual;
            const regime = s.regime;

            if (pred === "LONG") long++;
            else if (pred === "SHORT") short++;
            else hold++;

            totalConf += s.confidence;
            confByActionTotal[pred] += s.confidence;
            confByActionCount[pred]++;

            regimeBreakdown[regime][pred]++;
            regimeBreakdown[regime].total++;

            confusionMatrix[actual][pred]++;

            if (pred === "HOLD") {
                totalHolds++;
                // If actual was NOT HOLD, we check if our HOLD avoided a loss
                if (actual !== "HOLD") {
                    if (s.wouldHaveLost) holdAvoidanceSuccess++;
                    else falseHolds++;
                } else {
                    // Actual was HOLD, so our prediction was correct in a sense
                    holdAvoidanceSuccess++; 
                }
            }
        });

        const total = samples.length;
        const holdRate = hold / total;
        const holdAvoidanceRate = totalHolds > 0 ? holdAvoidanceSuccess / totalHolds : 0;
        
        const promotionEligible = (holdRate < 0.60) || (holdAvoidanceRate > 0.65);

        return {
            longRate: long / total,
            shortRate: short / total,
            holdRate,
            avgConfidence: totalConf / total,
            confByAction: {
                LONG: confByActionCount.LONG > 0 ? confByActionTotal.LONG / confByActionCount.LONG : 0,
                SHORT: confByActionCount.SHORT > 0 ? confByActionTotal.SHORT / confByActionCount.SHORT : 0,
                HOLD: confByActionCount.HOLD > 0 ? confByActionTotal.HOLD / confByActionCount.HOLD : 0
            },
            regimeBreakdown: Object.fromEntries(Object.entries(regimeBreakdown).map(([r, data]: any) => [
                r, { 
                    LONG: data.LONG / data.total, 
                    SHORT: data.SHORT / data.total, 
                    HOLD: data.HOLD / data.total 
                }
            ])),
            holdAvoidanceRate,
            falseHoldRate: totalHolds > 0 ? falseHolds / totalHolds : 0,
            profitabilityImpact: (holdAvoidanceRate * 1.5) - ( (falseHolds / totalHolds) * 1.0), // Simplified
            confusionMatrix,
            recommendation: promotionEligible ? "PROMOTE_TO_ROUTER" : "RETRAIN_MODEL"
        };
    }

    public static generateData(count: number = 5000) {
        const samples = [];
        const regimes = ["TRENDING_BULL", "TRENDING_BEAR", "RANGING", "HIGH_VOLATILITY", "TRANSITION"];
        
        for (let i = 0; i < count; i++) {
            const regime = regimes[Math.floor(Math.random() * regimes.length)];
            
            // Simulation of Transformer outcome logic: CONTINUATION, EXHAUSTION, TRAP
            // Higher CONTINUATION in TRANSITION/HIGH_VOLATILITY
            let outcome;
            const rand = Math.random();
            if (regime === "TRANSITION" || regime === "HIGH_VOLATILITY") {
                if (rand < 0.5) outcome = "CONTINUATION";
                else if (rand < 0.75) outcome = "EXHAUSTION";
                else outcome = "TRAP";
            } else {
                if (rand < 0.3) outcome = "CONTINUATION";
                else if (rand < 0.65) outcome = "EXHAUSTION";
                else outcome = "TRAP";
            }

            // Map outcome to prediction based on features.decision
            const baselineDecision = Math.random() > 0.5 ? "LONG" : "SHORT";
            let prediction: "LONG" | "SHORT" | "HOLD" = "HOLD";
            if (outcome === "CONTINUATION") {
                prediction = baselineDecision as any;
            }

            // Actual market move
            const realMove = Math.random() > 0.5 ? "LONG" : "SHORT";
            
            // If the model had not predicted HOLD, but instead predicted the baselineDecision, 
            // would it have lost?
            const wouldHaveLost = (realMove !== baselineDecision);

            samples.push({
                regime,
                prediction,
                confidence: 0.6 + Math.random() * 0.3,
                actual: (outcome === "CONTINUATION") ? realMove : "HOLD",
                wouldHaveLost
            });
        }
        return samples;
    }
}
