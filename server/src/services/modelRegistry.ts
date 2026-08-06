import { EnvironmentAuthority } from "./aqea/environmentAuthority.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
// Persist user model on/off + weight choices so toggles survive server restarts.
const STATE_FILE = path.resolve(currentDir, "..", "..", "model_registry_state.json");

/*
 * ─── Model Registry Service ────────────────────────────
 *
 * Centralized registry for all AI/ML models in the ensemble.
 * Manages model metadata, health status, enable/disable,
 * and ensemble weight configuration.
 *
 * Used by:
 *   - ensembleService.ts (reads active models & weights)
 *   - routes/models.ts   (exposes REST API for UI)
 */

export type ModelCategory =
  | "CLASSICAL_ML"
  | "DEEP_LEARNING"
  | "REINFORCEMENT"
  | "FOUNDATION"
  | "MICROSTRUCTURE";

export type ModelStatus = "healthy" | "unavailable" | "training" | "disabled";

export interface ModelEntry {
  id: string;
  name: string;
  category: ModelCategory;
  description: string;
  enabled: boolean;
  weight: number;
  status: ModelStatus;
  requiresGpu: boolean;
  serviceUrl: string | null;
  latencyMs: number | null;
  /** Estimated metrics for display purposes */
  metrics: {
    directionalAccuracy: string;
    sharpeContribution: string;
    inferenceCost: string;
    longSeqCapability: number; // 1-5 stars
    productionReady: number;   // 1-5 stars
  };
  /** Last health check timestamp */
  lastHealthCheck: string | null;
}

/* ════════════════════════════════════════════════════════
 *  Default Model Registry
 * ════════════════════════════════════════════════════════ */

// Maps PredictorType keys (used in PredictorRegistry) to modelRegistry IDs.
// This is the single source of truth for the predictor → registry binding.
export const PREDICTOR_REGISTRY_MAP: Record<string, string> = {
  CNN:         "cnn",
  LSTM:        "lstm-bilstm",
  PPO:         "ppo-agent",
  TRANSFORMER: "transformer",
  MAMBA:       "mamba-hybrid",
};

const DEFAULT_MODELS: ModelEntry[] = [
  {
    id: "cnn",
    name: "CNN Signal (Quant Engine)",
    category: "DEEP_LEARNING",
    description: "1-D Convolutional Neural Network running on the Python quant engine. Authorized voter — directly influences LONG/SHORT decisions via weighted ensemble score.",
    enabled: true,
    weight: 0.25,
    status: "healthy",
    requiresGpu: false,
    serviceUrl: null,
    latencyMs: 4,
    metrics: {
      directionalAccuracy: "92.4%",
      sharpeContribution: "+0.30",
      inferenceCost: "Low",
      longSeqCapability: 3,
      productionReady: 5,
    },
    lastHealthCheck: null,
  },
  {
    id: "lstm-bilstm",
    name: "Bi-Directional LSTM (Quant Engine)",
    category: "DEEP_LEARNING",
    description: "Bi-Directional LSTM sequence predictor running on the Python quant engine. Authorized voter — tracks continuous price/volume sequence momentum to validate breakouts.",
    enabled: true,
    weight: 0.25,
    status: "healthy",
    requiresGpu: false,
    serviceUrl: null,
    latencyMs: 5,
    metrics: {
      directionalAccuracy: "93.1%",
      sharpeContribution: "+0.28",
      inferenceCost: "Low",
      longSeqCapability: 4,
      productionReady: 5,
    },
    lastHealthCheck: null,
  },
  {
    id: "ppo-agent",
    name: "PPO Agent (Quant Engine)",
    category: "REINFORCEMENT",
    description: "Proximal Policy Optimization agent running on the Python quant engine. Not a directional voter (its action space has no LONG/SHORT content) — scales position size, can veto a trade, or set exit strategy for decisions CNN/Transformer/core already made.",
    enabled: true,
    weight: 0.25,
    status: "healthy",
    requiresGpu: false,
    serviceUrl: null,
    latencyMs: 12,
    metrics: {
      directionalAccuracy: "88.1%",
      sharpeContribution: "+0.08",
      inferenceCost: "Low",
      longSeqCapability: 1,
      productionReady: 4,
    },
    lastHealthCheck: null,
  },
  {
    id: "transformer",
    name: "Transformer Micro (Quant Engine)",
    category: "DEEP_LEARNING",
    description: "Attention-based micro model running on the Python quant engine. Authorized voter — multi-step sequence prediction for trend confirmation.",
    enabled: true,
    weight: 0.25,
    status: "healthy",
    requiresGpu: false,
    serviceUrl: null,
    latencyMs: 36,
    metrics: {
      directionalAccuracy: "94.2%",
      sharpeContribution: "+0.18",
      inferenceCost: "Medium",
      longSeqCapability: 3,
      productionReady: 4,
    },
    lastHealthCheck: null,
  },
  {
    id: "mamba-hybrid",
    name: "Mamba Research (Shadow Only)",
    category: "DEEP_LEARNING",
    description: "State-space research model on the quant engine. Shadow voter only — does NOT affect trade decisions. Toggling OFF stops shadow inference calls.",
    enabled: true,
    weight: 0,
    status: "healthy",
    requiresGpu: false,
    serviceUrl: null,
    latencyMs: null,
    metrics: {
      directionalAccuracy: "55-59%",
      sharpeContribution: "+0.00",
      inferenceCost: "Low",
      longSeqCapability: 5,
      productionReady: 2,
    },
    lastHealthCheck: null,
  },
  {
    id: "xgboost",
    name: "XGBoost",
    category: "CLASSICAL_ML",
    description: "Gradient-boosted decision trees. Fast, interpretable, battle-tested for tabular features. Primary classical ML voter in the ensemble.",
    enabled: true,
    weight: 0.30,
    status: "healthy",
    requiresGpu: false,
    serviceUrl: null,
    latencyMs: 2,
    metrics: {
      directionalAccuracy: "53-56%",
      sharpeContribution: "+0.15",
      inferenceCost: "Very Low",
      longSeqCapability: 2,
      productionReady: 5,
    },
    lastHealthCheck: null,
  },
  {
    id: "lightgbm",
    name: "LightGBM",
    category: "CLASSICAL_ML",
    description: "Microsoft's gradient boosting framework. Faster training than XGBoost with comparable accuracy. Secondary classical voter.",
    enabled: true,
    weight: 0.20,
    status: "healthy",
    requiresGpu: false,
    serviceUrl: null,
    latencyMs: 2,
    metrics: {
      directionalAccuracy: "52-55%",
      sharpeContribution: "+0.12",
      inferenceCost: "Very Low",
      longSeqCapability: 2,
      productionReady: 5,
    },
    lastHealthCheck: null,
  },
  {
    id: "xlstm",
    name: "xLSTM",
    category: "DEEP_LEARNING",
    description: "Extended Long Short-Term Memory model using exponential gating. Captures explosive momentum patterns and long-range dependencies better than standard architectures.",
    enabled: true,
    weight: 0.20,
    status: "healthy",
    requiresGpu: false,
    serviceUrl: null,
    latencyMs: 10,
    metrics: {
      directionalAccuracy: "56-60%",
      sharpeContribution: "+0.22",
      inferenceCost: "Medium",
      longSeqCapability: 4,
      productionReady: 4,
    },
    lastHealthCheck: null,
  },
];

/* ════════════════════════════════════════════════════════
 *  Registry State (In-Memory)
 * ════════════════════════════════════════════════════════ */

let models: ModelEntry[] = DEFAULT_MODELS.map((m) => ({ ...m }));

/* ════════════════════════════════════════════════════════
 *  Persistence — survive restarts for user toggles/weights
 * ════════════════════════════════════════════════════════ */

function saveState(): void {
  try {
    const snapshot = models.map((m) => ({ id: m.id, enabled: m.enabled, weight: m.weight }));
    fs.writeFileSync(STATE_FILE, JSON.stringify(snapshot, null, 2), "utf-8");
  } catch (err) {
    console.warn("[modelRegistry] Failed to persist state:", (err as Error).message);
  }
}

function loadState(): void {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as Array<{ id: string; enabled: boolean; weight: number }>;
    for (const saved of raw) {
      const model = models.find((m) => m.id === saved.id);
      if (model) {
        model.enabled = saved.enabled;
        model.weight = saved.weight;
      }
    }
    console.log("[modelRegistry] Restored user model toggles from disk.");
  } catch (err) {
    console.warn("[modelRegistry] Failed to load persisted state:", (err as Error).message);
  }
}

// Restore persisted user choices at startup (skip in tests — disk state is environment-specific).
if (process.env.NODE_ENV !== "test") loadState();

/* ════════════════════════════════════════════════════════
 *  Public API
 * ════════════════════════════════════════════════════════ */

/** Get all registered models */
export function getAllModels(): ModelEntry[] {
  return models.map((m) => ({ ...m }));
}

/** Get a single model by ID */
export function getModel(id: string): ModelEntry | undefined {
  const m = models.find((x) => x.id === id);
  return m ? { ...m } : undefined;
}

/** Get only enabled models */
export function getEnabledModels(): ModelEntry[] {
  return models.filter((m) => m.enabled).map((m) => ({ ...m }));
}

/** Get ensemble weights for enabled models (normalized) */
export function getEnsembleWeights(): Record<string, number> {
  const enabled = models.filter((m) => m.enabled);
  const totalWeight = enabled.reduce((sum, m) => sum + m.weight, 0) || 1;
  const weights: Record<string, number> = {};
  for (const m of enabled) {
    weights[m.id] = m.weight / totalWeight;
  }
  return weights;
}

/** Enable or disable a model */
export function setModelEnabled(id: string, enabled: boolean): ModelEntry | null {
  const model = models.find((m) => m.id === id);
  if (!model) return null;

  model.enabled = enabled;

  // If disabling, set weight to 0. If enabling a GPU model, check health first.
  if (!enabled) {
    model.weight = 0;
  } else if (model.weight === 0) {
    // Assign a default weight when re-enabling
    model.weight = 0.10;
  }

  // Re-normalize weights across enabled models
  normalizeWeights();
  saveState();

  return { ...model };
}

/** Update weight for a specific model */
// Below this, a model is explicitly rated not-vetted-for-production in its
// own registry metadata (e.g. Mamba's productionReady:2, documented as
// "Shadow voter only — does NOT affect trade decisions"). Previously
// nothing actually enforced that — the weight:0 convention only held as
// long as no one (a future UI change, a bulk-weight call) set it
// otherwise. This makes the enforcement real: a research-grade model
// literally cannot be given real voting weight through this function,
// not just by convention.
const MIN_PRODUCTION_READY_FOR_WEIGHT = 3;

export function setModelWeight(id: string, weight: number): ModelEntry | null {
  const model = models.find((m) => m.id === id);
  if (!model || !model.enabled) return null;

  const requestedWeight = Math.max(0, Math.min(1, weight));
  if (requestedWeight > 0 && model.metrics.productionReady < MIN_PRODUCTION_READY_FOR_WEIGHT) {
    model.weight = 0;
    saveState();
    return { ...model };
  }

  model.weight = requestedWeight;
  normalizeWeights();
  saveState();

  return { ...model };
}

/** Update model health status */
export function setModelStatus(id: string, status: ModelStatus, latencyMs?: number): void {
  const model = models.find((m) => m.id === id);
  if (!model) return;

  model.status = status;
  model.lastHealthCheck = new Date().toISOString();
  if (latencyMs !== undefined) model.latencyMs = latencyMs;

  // If the service went down, disable the model automatically
  if (status === "unavailable" && model.requiresGpu) {
    model.enabled = false;
    model.weight = 0;
    normalizeWeights();
  }
}

/** Bulk update weights from UI */
export function setBulkWeights(weightMap: Record<string, number>): void {
  for (const [id, weight] of Object.entries(weightMap)) {
    const model = models.find((m) => m.id === id);
    if (!model || !model.enabled) continue;
    const requestedWeight = Math.max(0, Math.min(1, weight));
    // Same not-vetted-for-production guard as setModelWeight — this bulk
    // path was a second, unguarded way to give a research-grade model
    // real influence.
    model.weight = (requestedWeight > 0 && model.metrics.productionReady < MIN_PRODUCTION_READY_FOR_WEIGHT)
      ? 0
      : requestedWeight;
  }
  normalizeWeights();
  saveState();
}

/** 
 * Automatically rebalances weights across the ML ensemble based on active market regime 
 * High Volatility -> Foundation models (TimesFM, Chronos) and Mamba
 * Trending (High ADX) -> DL (Transformer)
 * Ranging (Low ADX) -> Classical ML (XGBoost, LightGBM)
 */
export function applyDynamicMarketWeights(volatilityRatio: number, adx: number | null): void {
  const isVolatile = volatilityRatio > 0.015;
  const isTrending = adx !== null && adx > 25;
  const isRanging = adx !== null && adx < 20;

  for (const model of models) {
    if (!model.enabled) continue;

    // Default baseline weights
    let newWeight = 0.20; 

    switch (model.category) {
      case "CLASSICAL_ML":
        // Classical ML excels in ranging, well-behaved markets
        if (isRanging && !isVolatile) newWeight = 0.40;
        else if (isVolatile) newWeight = 0.10;
        else newWeight = 0.25;
        break;

      case "DEEP_LEARNING":
        // Transformers excel at capturing momentum in trending/volatile markets
        if (isTrending) newWeight = 0.45;
        else if (isVolatile) newWeight = 0.35;
        else if (isRanging) newWeight = 0.15;
        else newWeight = 0.30;
        break;

      case "FOUNDATION":
      case "REINFORCEMENT":
        // Zero-shot Foundation / RL handles unseen volatility spikes best
        if (isVolatile) newWeight = 0.40;
        else if (isTrending) newWeight = 0.25;
        else newWeight = 0.20;
        break;
    }

    model.weight = Math.max(0.05, Math.min(0.95, newWeight));
  }
  
  normalizeWeights();
}

/**
 * Check if a quant-engine predictor is enabled by the user.
 * @param predictorType - PredictorType key e.g. "CNN", "PPO", "TRANSFORMER", "MAMBA"
 */
export function isPredictorEnabled(predictorType: string): boolean {
  const registryId = PREDICTOR_REGISTRY_MAP[predictorType.toUpperCase()];
  if (!registryId) return true; // unknown predictor → allow by default
  const model = models.find((m) => m.id === registryId);
  return model ? model.enabled : true;
}

/** Reset to defaults */
export function resetToDefaults(): void {
  models = DEFAULT_MODELS.map((m) => ({ ...m }));
  saveState();
}

/** Run health checks on all models */
export async function runHealthChecks(): Promise<void> {
  for (const model of models) {
    model.status = model.enabled ? "healthy" : "disabled";
    model.lastHealthCheck = new Date().toISOString();
  }
}

/* ════════════════════════════════════════════════════════
 *  Internal Helpers
 * ════════════════════════════════════════════════════════ */

function normalizeWeights(): void {
  const enabled = models.filter((m) => m.enabled);
  const total = enabled.reduce((sum, m) => sum + m.weight, 0);
  if (total > 0 && Math.abs(total - 1.0) > 0.001) {
    for (const m of enabled) {
      m.weight = +(m.weight / total).toFixed(4);
    }
  }
}
