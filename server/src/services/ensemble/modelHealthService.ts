/*
 * ─── Institutional Model Health Service ───────────────────────
 *
 * Computes 7-factor institutional health score (0–100):
 * Health = 0.20*Acc + 0.20*PF + 0.15*Sharpe + 0.15*Contrib + 0.10*Cal + 0.10*Stab + 0.10*(1-Drift)
 */

import { ModelHealth } from "../../models/ModelHealth.js";
import { AI_ENDPOINTS, buildEndpointUrl } from "../../config/aiEndpointRegistry.js";

/* ════════════════════════════════════════════════════════
 *  Live quant-engine model-health gate
 *
 *  The Python quant engine reports, per model, whether its backing
 *  checkpoint is real+loaded ("HEALTHY"), a stub/degraded checkpoint
 *  ("DEGRADED") or missing ("NOT_LOADED"). The ensemble uses this to
 *  decide which models are allowed to vote — a DEGRADED/stub/missing
 *  model gets weight 0 instead of silently contributing a JS heuristic
 *  wearing that model's name.
 * ════════════════════════════════════════════════════════ */

export type QuantModelStatus = "HEALTHY" | "DEGRADED" | "NOT_LOADED";
export type QuantModelKey = "cnn" | "lstm" | "ppo" | "transformer" | "mamba";
export type QuantModelHealthMap = Partial<Record<QuantModelKey, QuantModelStatus>>;

const QUANT_MODEL_KEYS: QuantModelKey[] = ["cnn", "lstm", "ppo", "transformer", "mamba"];
const HEALTH_CACHE_TTL_MS = 30_000;

let healthCache: { map: QuantModelHealthMap | null; expiresAt: number } = { map: null, expiresAt: 0 };

/**
 * Fetch (and cache ~30s) the quant-engine /health/models status map.
 * Returns `null` when the health endpoint cannot be reached — callers must
 * treat a null map as "unknown" and fail safe (allow real trained models,
 * still refuse KNOWN-stub models), never as "everything degraded".
 */
export async function getQuantModelHealth(force = false): Promise<QuantModelHealthMap | null> {
  const now = Date.now();
  if (!force && healthCache.expiresAt > now) return healthCache.map;

  // In unit tests there is no live quant engine; report "unknown" so callers
  // fall back deterministically rather than hanging on a network call.
  if (process.env.NODE_ENV === "test") {
    healthCache = { map: null, expiresAt: now + HEALTH_CACHE_TTL_MS };
    return null;
  }

  try {
    const url = await buildEndpointUrl(AI_ENDPOINTS.MODEL_HEALTH);
    const res = await fetch(url, { signal: AbortSignal.timeout(800) });
    if (!res.ok) {
      healthCache = { map: null, expiresAt: now + HEALTH_CACHE_TTL_MS };
      return null;
    }
    const data = (await res.json()) as Record<string, unknown>;
    const map: QuantModelHealthMap = {};
    for (const key of QUANT_MODEL_KEYS) {
      const v = data[key];
      if (v === "HEALTHY" || v === "DEGRADED" || v === "NOT_LOADED") map[key] = v;
    }
    healthCache = { map, expiresAt: now + HEALTH_CACHE_TTL_MS };
    return map;
  } catch {
    healthCache = { map: null, expiresAt: now + HEALTH_CACHE_TTL_MS };
    return null;
  }
}

/** Models whose checkpoints are known (per prior forensic audits) to be
 *  0-byte/stub → never allowed to vote even when the health probe fails. */
export const KNOWN_STUB_QUANT_KEYS: ReadonlySet<QuantModelKey> = new Set<QuantModelKey>(["transformer", "mamba"]);

/**
 * Decide whether a quant-engine-backed model may cast a real vote.
 *  - health map available  → only "HEALTHY" votes; DEGRADED/NOT_LOADED = no.
 *  - health map null (probe failed) → fail safe: real trained models may
 *    vote, but KNOWN-stub models stay gated to 0.
 */
export function quantModelMayVote(key: QuantModelKey, healthMap: QuantModelHealthMap | null): boolean {
  if (healthMap && typeof healthMap[key] === "string") {
    return healthMap[key] === "HEALTHY";
  }
  return !KNOWN_STUB_QUANT_KEYS.has(key);
}

export interface RawModelPerformance {
  winRatePct: number;
  profitFactor: number;
  sharpeRatio: number;
  contributionR: number;
  brierScore: number;
  predictionVariance: number;
  conceptDriftScore: number;
}

export class ModelHealthService {
  /**
   * Calculates 7-factor health score normalized between 0 and 100.
   */
  public static calculateHealth(perf: RawModelPerformance): any {
    const accuracyScore = Math.max(0, Math.min(100, perf.winRatePct));
    const profitFactorScore = Math.max(0, Math.min(100, (perf.profitFactor / 2.0) * 100));
    const sharpeScore = Math.max(0, Math.min(100, (perf.sharpeRatio / 2.5) * 100));
    const contributionScore = Math.max(0, Math.min(100, 50 + perf.contributionR * 20));
    const calibrationScore = Math.max(0, Math.min(100, (1 - perf.brierScore) * 100));
    const stabilityScore = Math.max(0, Math.min(100, 100 - perf.predictionVariance * 500));
    const driftScore = Math.max(0, Math.min(100, (1 - perf.conceptDriftScore) * 100));

    const overallHealthScore = +(
      (0.20 * accuracyScore) +
      (0.20 * profitFactorScore) +
      (0.15 * sharpeScore) +
      (0.15 * contributionScore) +
      (0.10 * calibrationScore) +
      (0.10 * stabilityScore) +
      (0.10 * driftScore)
    ).toFixed(2);

    return {
      accuracyScore: +accuracyScore.toFixed(1),
      profitFactorScore: +profitFactorScore.toFixed(1),
      sharpeScore: +sharpeScore.toFixed(1),
      contributionScore: +contributionScore.toFixed(1),
      calibrationScore: +calibrationScore.toFixed(1),
      stabilityScore: +stabilityScore.toFixed(1),
      driftScore: +driftScore.toFixed(1),
      overallHealthScore,
    };
  }

  public static async recordHealth(modelName: string, perf: RawModelPerformance): Promise<any> {
    const health = this.calculateHealth(perf);
    const record = await ModelHealth.create({
      modelName,
      ...health,
      evaluatedAt: new Date(),
    });
    return record;
  }
}
