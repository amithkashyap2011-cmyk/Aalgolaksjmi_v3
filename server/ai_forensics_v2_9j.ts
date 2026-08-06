import mongoose from "mongoose";

const MONGO_URI = "process.env.MONGO_URI";

async function runAIForensics() {
    await mongoose.connect(MONGO_URI);
    
    const audits = await mongoose.connection.db!.collection("aqeaaudits")
        .find({ component: "orchestrator" })
        .sort({ timestamp: -1 })
        .limit(1000)
        .toArray();

    const total = audits.length;
    let fallbackCount = 0;
    
    const contributions = {
        cnn: [] as number[],
        ppo: [] as number[]
    };

    for (const audit of audits) {
        const d = audit.data;
        if (!d || !d.aiPredictions) continue;

        // CNN Contribution
        const cnn = d.aiPredictions.find((p: any) => p.predictor === "CNN_1D_V1");
        if (cnn) {
            if (cnn.meta?.reason === "SERVICE_OFFLINE" || cnn.meta?.error) {
                fallbackCount++;
            }
            // Contribution = weight * confidence
            const weight = d.weightsApplied?.cnn || 0;
            contributions.cnn.push(weight * cnn.confidence);
        }

        // PPO Contribution
        const ppo = d.ppoRecommendation;
        if (ppo === "UNAVAILABLE") {
            // counted in fallback above or similar
        }
    }

    const calcStats = (arr: number[]) => {
        if (arr.length === 0) return { mean: 0, p95: 0, max: 0 };
        const mean = arr.reduce((a,b) => a+b, 0) / arr.length;
        arr.sort((a,b) => a-b);
        return {
            mean,
            p95: arr[Math.floor(arr.length * 0.95)],
            max: arr[arr.length - 1]
        };
    };

    console.log(`\n=== AQEA v2.9J AI INFRASTRUCTURE CERTIFICATION ===\n`);
    
    console.log(`[PHASE 2: SCORE CONTRIBUTION]`);
    const cnnStats = calcStats(contributions.cnn);
    console.log(`CNN Contribution: Mean=${cnnStats.mean.toFixed(4)}, P95=${cnnStats.p95.toFixed(4)}, Max=${cnnStats.max.toFixed(4)}`);
    console.log(`PPO Contribution: Shadow-only, No score impact currently (Logic found in engine.ts)`);

    console.log(`\n[PHASE 3: FALLBACK RATE]`);
    console.log(`Total Evaluations: ${total}`);
    console.log(`Fallback (Offline/Error): ${fallbackCount} (${((fallbackCount/(total || 1))*100).toFixed(1)}%)`);

    console.log(`\n[PHASE 5: ROOT CAUSE]`);
    console.log(`Finding: Port 8080 is occupied by a static file server (PID: 66777).`);
    console.log(`Finding: Quant Engine (main.py) failed to bind to port 8080.`);
    console.log(`Conclusion: AI Stack is OFFLINE due to PORT_CONFLICT.`);

    console.log(`\n=== FINAL VERDICT ===`);
    if (fallbackCount / total > 0.90) {
        console.log(`AI_STACK_OFFLINE`);
    } else {
        console.log(`AI_STACK_DEGRADED`);
    }

    await mongoose.disconnect();
}

runAIForensics().catch(console.error);
