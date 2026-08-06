/*
 * ─── Centralized Feature Store Service ───────────────────────
 *
 * Feature registry, creation metadata, importance scores, correlation with returns,
 * and feature drift tracking.
 */

import { FeatureStore } from "../../models/FeatureStore.js";

export const DEFAULT_FEATURES = [
  { featureName: "VolumeDeltaImbalance", category: "MICROSTRUCTURE", importanceScore: 0.28, correlationWithReturn: 0.42 },
  { featureName: "OrderBookImbalance", category: "MICROSTRUCTURE", importanceScore: 0.24, correlationWithReturn: 0.38 },
  { featureName: "ADX_TrendStrength", category: "TECHNICAL", importanceScore: 0.20, correlationWithReturn: 0.31 },
  { featureName: "RSI_Divergence", category: "MOMENTUM", importanceScore: 0.16, correlationWithReturn: 0.25 },
  { featureName: "VWAP_Deviation", category: "STATISTICAL", importanceScore: 0.12, correlationWithReturn: 0.20 },
];

export class FeatureStoreService {
  public static async ensureFeaturesInitialized(): Promise<any[]> {
    const list = [];
    for (const f of DEFAULT_FEATURES) {
      let doc = await FeatureStore.findOne({ featureName: f.featureName });
      if (!doc) {
        doc = await FeatureStore.create({
          featureName: f.featureName,
          category: f.category,
          importanceScore: f.importanceScore,
          correlationWithReturn: f.correlationWithReturn,
        });
      }
      list.push(doc);
    }
    return list;
  }
}
