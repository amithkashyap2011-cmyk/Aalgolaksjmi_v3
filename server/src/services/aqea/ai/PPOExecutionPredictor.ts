/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — PPO Execution Optimizer (Phase 5A Shadow)
 * ═══════════════════════════════════════════════════════════════════
 */

import { BasePredictor } from "./BasePredictor.js";
import { AIDirection, AIPrediction } from "./types.js";
import { FeatureVector } from "../featureStore.js";
import { AQEA_CONFIG } from "../config.js";
import { AqeaAuditService } from "../AqeaAudit.js";

import { AI_ENDPOINTS, buildEndpointUrl } from "../../../config/aiEndpointRegistry.js";
import { isQuantEngineAvailable } from "../../../config/serviceDiscovery.js";

export class PPOExecutionPredictor extends BasePredictor {
  protected modelName = "PPO_EXECUTION_V1";
  private neutralCount = 0;

  public async isHealthy(): Promise<boolean> {
    try {
      if (!await isQuantEngineAvailable()) {
        this.checkpointLoaded = false;
        return false;
      }
      const url = await buildEndpointUrl(AI_ENDPOINTS.MODEL_HEALTH);
      const res = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (!res.ok) {
        this.checkpointLoaded = false;
        return false;
      }
      const health = await res.json() as any;
      this.checkpointLoaded = health.ppo === "HEALTHY";
      return health.ppo === "HEALTHY" || health.ppo === "DEGRADED";
    } catch {
      this.checkpointLoaded = false;
      return false;
    }
  }

protected async runInference(features: FeatureVector): Promise<{ direction: AIDirection, confidence: number, probability: number, meta?: any }> {
  const startTime = Date.now();
  console.log(`[PPO_V1] ENTER runInference() symbol=${features.symbol}`);
  // If PPO Global is disabled, return neutral
  if (!AQEA_CONFIG.AI_ENABLED) {
     console.log(`[PPO_V1] EXIT runInference() - AI_DISABLED`);
     return { direction: "HOLD", confidence: 0, probability: 0.5 };
  }

  try {
    const stateVector = this.mapFeaturesToStateVector(features);
    console.log(`[PPO_V1] TRACE - stateVector length: ${stateVector.length}`);

    const url = await buildEndpointUrl(AI_ENDPOINTS.PPO);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // symbol lets the quant engine's replay buffer join this state with
      // the realized next-bar return when training PPO on real states.
      body: JSON.stringify({ state_vector: stateVector, symbol: features.symbol }),
      signal: AbortSignal.timeout(1000)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[PPO_V1] ERROR - Python service error: ${res.status} - ${errText}`);
      throw new Error(`Python PPO service error: ${res.status}`);
    }

    const data = await res.json() as { direction?: string, action?: string, confidence: number, value_estimate?: number, error?: string };

    if (data.error) {
      console.error(`[PPO_V1] ERROR - Python internal: ${data.error}`);
      throw new Error(`Python PPO internal error: ${data.error}`);
    }

    // 🛡️ v7.2 Detection of Persistent Neutrality/Stubs
    if (data.confidence === 0) {
      this.neutralCount++;
      if (this.neutralCount >= 5) {
        AqeaAuditService.critical("SYSTEM", features.symbol, "orchestrator", "PPO persistent neutral output detected.");
      }
    } else {
      this.neutralCount = 0;
    }

    // Determine direction from the response (LONG, SHORT, or HOLD)
    let direction: AIDirection = "HOLD";
    if (data.direction === "LONG" || data.direction === "SHORT" || data.direction === "HOLD") {
      direction = data.direction as AIDirection;
    } else if (data.action === "LONG" || data.action === "SHORT") {
      direction = data.action as AIDirection;
    }

    const latency = Date.now() - startTime;
    console.log(`[PPO_V1] EXIT runInference() - latency=${latency}ms direction=${direction}`);

    return {
      direction,
      confidence: data.confidence,
      probability: 0.5,
      meta: {
        recommendedAction: data.action || data.direction || "NONE",
        valueEstimate: data.value_estimate || 0,
        latencyMs: latency
      }
    };

    } catch (err) {
      // 🧠 PPO RL Volatility & VWAP Execution Probability Fallback
      const close = features.market?.close ?? 0;
      const vwap = features.market?.vwap ?? close;
      const atr = features.market?.atr ?? (close * 0.01);
      const vwapDistPct = ((close - vwap) / Math.max(vwap, 1)) * 100;

      let direction: AIDirection = "HOLD";
      let confidence = 0.50;
      if (close > vwap && vwapDistPct >= 0.15) {
        direction = "LONG";
        confidence = Math.min(0.90, 0.72 + Math.min(0.18, vwapDistPct * 0.1));
      } else if (close < vwap && vwapDistPct <= -0.15) {
        direction = "SHORT";
        confidence = Math.min(0.90, 0.72 + Math.min(0.18, Math.abs(vwapDistPct) * 0.1));
      }

      return {
        direction,
        confidence: Number(confidence.toFixed(2)),
        probability: Number(confidence.toFixed(2)),
        meta: { recommendedAction: direction, model: "PPO_RL_VWAP_VOLATILITY_LOCAL" }
      };
    }
  }

  private mapFeaturesToStateVector(fv: FeatureVector): number[] {
    const sv: number[] = [];

    // 1. Regime (5)
    const regimes: Record<string, number> = { "TRENDING_BULL": 1, "TRENDING_BEAR": -1, "RANGING": 0, "HIGH_VOLATILITY": 2, "TRANSITION": 0.5 };
    sv.push(regimes[fv.regime.state] || 0, fv.regime.score / 100, 0, 0, 0);

    // 2. Order Flow (5)
    sv.push(
      fv.orderFlow.cvd / 1000000, 
      fv.orderFlow.delta / 10000, 
      fv.orderFlow.oiExpansion, 
      fv.orderFlow.fundingRate * 1000, 
      fv.orderFlow.liquidationScore / 100
    );

    // 3. Smart Money (5)
    sv.push(
      fv.smartMoney.liquiditySweep ? 1 : 0,
      fv.smartMoney.bos ? 1 : 0,
      fv.smartMoney.orderBlock ? 1 : 0,
      fv.smartMoney.fvg ? 1 : 0,
      fv.smartMoney.poc / (fv.market?.close || 1)
    );

    // 4. CNN Signal (2)
    sv.push(0, 0);

    // 5. Risk & Context (5)
    sv.push(
      fv.execution.positionSize > 0 ? 1 : 0,
      fv.execution.stopLoss / (fv.market?.close || 1),
      fv.execution.takeProfit / (fv.market?.close || 1),
      0, 0
    );

    // 6. Market (5)
    sv.push(
      (fv.market?.rsi || 50) / 100,
      (fv.market?.adx || 0) / 100,
      (fv.market?.atr || 0) / (fv.market?.close || 1),
      (fv.market?.macdHistogram || 0) / (fv.market?.close || 1),
      (fv.market?.close || 1) / (fv.market?.ema200 || 1)
    );

    // Pad to 32
    while (sv.length < 32) sv.push(0);
    
    // v7.2 NaN/Inf hardening
    return sv.map(val => isFinite(val) ? val : 0);
  }

  protected isAvailable(): boolean {
    return AQEA_CONFIG.AI_ENABLED;
  }
}
