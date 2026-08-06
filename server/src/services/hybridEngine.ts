import { Trade } from "../models/Trade.js";
import { toValidObjectId } from "../utils/mongoUtils.js";
import {
  HybridStrategy,
  Signal,
  BullStrategy,
  BearStrategy,
  WhaleStrategy,
  SnakeStrategy,
  ElephantStrategy,
  EagleStrategy,
  HawkStrategy,
  FalconStrategy,
  OwlStrategy,
  CrowStrategy,
  AKSStrategy,
  HoneybeeStrategy,
  DogStrategy,
  AntEngineStrategy,
  AaryanRubikCubeStrategy,
} from "./hybridStrategies.js";
import { Settings } from "../models/Settings.js";
import fs from "fs";
import * as binance from "./binanceService.js";
import { AI_ENDPOINTS, buildEndpointUrl } from "../config/aiEndpointRegistry.js";

/* ───────── ENGINE STATE & WEIGHTS ───────── */
export interface StrategyWeights {
  animal: number;
  bird: number;
  aks: number;
}

// In-Memory dynamic weights (initialized to starting defaults)
const currentWeights: StrategyWeights = {
  animal: 0.3,
  bird: 0.3,
  aks: 0.4,
};

const allStrategies: HybridStrategy[] = [
  new BullStrategy(), new BearStrategy(), new WhaleStrategy(),
  new SnakeStrategy(), new ElephantStrategy(),
  new EagleStrategy(), new HawkStrategy(), new FalconStrategy(),
  new OwlStrategy(), new CrowStrategy(),
  new AKSStrategy(), new HoneybeeStrategy(), new DogStrategy(),
  new AntEngineStrategy(), new AaryanRubikCubeStrategy()
];

/* ───────── FUSION EVALUATION ───────── */
export async function evaluateHybridSignal(marketData: any, userId: string): Promise<Signal> {
  const activeAnimal: Signal[] = [];
  const activeBird: Signal[] = [];
  let aksSignal: Signal | null = null;
  let quantSignal: Signal | null = null;
  
  // -- AALGOLAKSHMI QUANT ENGINE (PYTHON) INTEGRATION --
  try {
    const btcPrice = await binance.getTickerPrice("BTCUSDT");
    const url = await buildEndpointUrl(AI_ENDPOINTS.ANALYZE_SPREAD);
    const spreadRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol_a: marketData.symbol || "ETHUSDT",
        price_a: marketData.price || 1.0,
        symbol_b: "BTCUSDT",
        price_b: btcPrice || 1.0
      })
    });
    
    if (spreadRes.ok) {
       const spreadData = await spreadRes.json() as any;
       if (spreadData.analysis && spreadData.analysis.status === "BLACK_SWAN") {
          console.warn("[Z-Score Guard] Black Swan 4σ Anomaly Detected! Initiating EMERGENCY HALT.");
          return { direction: "NEUTRAL", confidence: 1.0, meta: { reason: "Z-Score 4σ Deviation Black Swan" } };
       }
    }
  } catch (err) {
    // Silent fallback if Python Quant Engine is not running. 
    // AALGOLAKSHMI safely degrades to the standard Node neural heuristics.
  }
  // -- END INTEGRATION --

  for (const strategy of allStrategies) {
    const sig = strategy.generateSignal(marketData);
    if (sig.confidence > 0.5) {
      if (strategy.type === "animal") activeAnimal.push(sig);
      if (strategy.type === "bird") activeBird.push(sig);
      if (strategy.type === "aks") aksSignal = sig;
      if (strategy.type === "quant") {
        if (!quantSignal || sig.confidence > quantSignal.confidence) {
          quantSignal = sig;
        }
      }
    }
  }

  // If a high-probability Quant execution triggers, bypass standard heuristics and return immediately
  if (quantSignal && quantSignal.confidence >= 0.9) {
    console.log(`[Hybrid Engine] High-probability Quant Strategy Triggered: ${quantSignal.meta?.type || 'UNKNOWN'} (Confidence: ${quantSignal.confidence})`);
    return quantSignal;
  }

  // Calculate composite scores
  const scoreParams = (signals: Signal[]) => {
    let longConf = 0, shortConf = 0;
    signals.forEach((s) => {
      if (s.direction === "LONG") longConf += s.confidence;
      if (s.direction === "SHORT") shortConf += s.confidence;
    });
    return {
      direction: longConf > shortConf ? "LONG" : shortConf > longConf ? "SHORT" : "NEUTRAL",
      confidence: Math.max(longConf, shortConf) / (signals.length || 1),
    };
  };

  const animalComp = scoreParams(activeAnimal);
  const birdComp = scoreParams(activeBird);

  // If AKS blocks, immediately reject
  const aks = aksSignal as Signal | null;
  if (aks && aks.direction === "NEUTRAL") {
    return { direction: "NEUTRAL", confidence: 1.0, meta: { reason: "AKS Blocked" } };
  }

  // FUSION LOGIC:
  const activeWeightsSum = currentWeights.animal + currentWeights.bird;
  const animalWeightNormal = activeWeightsSum > 0 ? currentWeights.animal / activeWeightsSum : 0.5;
  const birdWeightNormal = activeWeightsSum > 0 ? currentWeights.bird / activeWeightsSum : 0.5;

  const fusedLong =
    (animalComp.direction === "LONG" ? animalComp.confidence * animalWeightNormal : 0) +
    (birdComp.direction === "LONG" ? birdComp.confidence * birdWeightNormal : 0);

  const fusedShort =
    (animalComp.direction === "SHORT" ? animalComp.confidence * animalWeightNormal : 0) +
    (birdComp.direction === "SHORT" ? birdComp.confidence * birdWeightNormal : 0);

  if (fusedLong > fusedShort && fusedLong > 0.6) {
    return { direction: "LONG", confidence: fusedLong };
  } else if (fusedShort > fusedLong && fusedShort > 0.6) {
    return { direction: "SHORT", confidence: fusedShort };
  }

  return { direction: "NEUTRAL", confidence: 0 };
}

/* ───────── SELF-LEARNING OPTIMIZER ───────── */
// Runs periodically (e.g. daily, or triggered after N trades)
export async function runSelfLearningLoop(userId: string) {
  try {
    const recentTrades = await Trade.find({ userId: toValidObjectId(userId), status: "CLOSED" })
      .sort({ closedAt: -1 })
      .limit(100)
      .lean();

    if (recentTrades.length < 10) return; // Need sample density

    let totalPnl = 0;
    let winCount = 0;

    recentTrades.forEach((t) => {
      totalPnl += t.pnl || 0;
      if ((t.pnl || 0) > 0) winCount++;
    });

    const winRate = winCount / recentTrades.length;
    
    // Reward / Penalty RL simulation
    // If winRate > 55%, we amplify the strategies that contributed (for simplicity, we track global perf)
    // Dynamic Weight Adjustment logic
    if (winRate > 0.55) {
      // Good performance -> Boost AKS weight slightly for stability
      currentWeights.aks = Math.min(0.6, currentWeights.aks + 0.05);
      const remaining = 1 - currentWeights.aks;
      currentWeights.animal = remaining / 2;
      currentWeights.bird = remaining / 2;
    } else {
      // Poor performance -> Rely more on timing (Bird) and Behavior (Animal)
      currentWeights.bird = Math.min(0.5, currentWeights.bird + 0.05);
      currentWeights.animal = Math.min(0.5, currentWeights.animal + 0.05);
      currentWeights.aks = 1 - currentWeights.bird - currentWeights.animal;
    }

    console.log("[Hybrid Engine] Weights Updated via Self-Learning:", currentWeights);
  } catch (err) {
    console.error("Learning loop failed:", err);
  }
}
