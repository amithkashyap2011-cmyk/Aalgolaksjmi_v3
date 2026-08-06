/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — AI Predictor Registry
 * ═══════════════════════════════════════════════════════════════════
 */

import { IAIPredictor } from "./IAIPredictor.js";
import { NotAvailablePredictor } from "./NotAvailablePredictor.js";
import { CNNPredictor } from "./CNNPredictor.js";
import { PPOExecutionPredictor } from "./PPOExecutionPredictor.js";
import { MambaPredictor } from "./MambaPredictor.js";
import { TransformerPredictor } from "./TransformerPredictor.js";
import { LNNPredictor } from "./LNNPredictor.js";
import { LSTMPredictor } from "./LSTMPredictor.js";
import { PredictorType, AIPrediction } from "./types.js";
import { FeatureVector } from "../featureStore.js";
import { AQEA_CONFIG } from "../config.js";
import { AITelemetryService } from "../aiTelemetryService.js";
import { VotingRegistry, PredictorRole } from "../votingRegistry.js";
import { isPredictorEnabled } from "../../modelRegistry.js";

export class PredictorRegistry {
  private static predictors = new Map<PredictorType, IAIPredictor>();

  /**
   * Initializes the registry with functional models and handles health/readiness/quality separation.
   */
  public static async initialize(): Promise<void> {
    // Functional Models
    this.predictors.set("CNN", new CNNPredictor());
    this.predictors.set("LSTM", new LSTMPredictor());
    this.predictors.set("PPO", new PPOExecutionPredictor());
    this.predictors.set("MAMBA", new MambaPredictor());
    this.predictors.set("TRANSFORMER", new TransformerPredictor());
    this.predictors.set("LNN", new LNNPredictor());

    if (process.env.NODE_ENV === "test") return;

    console.log("[AQEA_AI_GOVERNANCE] Initializing Predictor Governance...");

    for (const [type, predictor] of this.predictors.entries()) {
      try {
        const gov = VotingRegistry.getGovernance(type);
        const health = predictor.getHealth();
        
        // 1. HEALTH & READINESS (Critical for Operation)
        const isHealthy = await (predictor as any).isHealthy?.() ?? true;
        const isReady = health.checkpointLoaded;

        if (!isHealthy) {
          console.error(`[AQEA_GOVERNANCE] ${type} UNHEALTHY: Endpoint unreachable.`);
        } else if (!isReady) {
          console.error(`[AQEA_GOVERNANCE] ${type} NOT_READY: Checkpoint missing.`);
        } else {
          // 2. QUALITY (Non-blocking for Authority, but logged)
          const accuracy = await AITelemetryService.getModelAccuracy(health.name);
          const accValue = accuracy.rolling100_accuracy || 50;

          if (accValue < 45) {
            console.warn(`[AQEA_GOVERNANCE] ${type} LOW_QUALITY: Accuracy ${accValue.toFixed(1)}%.`);
          }
          console.log(`[AQEA_GOVERNANCE] ${type} REGISTERED: role=${gov.role} ready=${isReady}`);
        }
      } catch (err) {
        console.error(`[AQEA_GOVERNANCE] Error initializing ${type}:`, err);
      }
    }
  }

  public static async getAllPredictions(features: FeatureVector): Promise<AIPrediction[]> {
    const activePredictors = Array.from(this.predictors.entries())
      .filter(([type]) => isPredictorEnabled(type))
      .map(([, p]) => p);
    const results = await Promise.allSettled(activePredictors.map(p => p.predict(features)));
    
    const predictions = results
      .map((r, i) => {
        if (r.status === 'rejected') {
           console.warn(`[AQEA_AI] Predictor ${activePredictors[i].constructor.name} failed:`, r.reason);
           return null;
        }
        return r.value;
      })
      .filter((p): p is AIPrediction => p !== null);
    
    return predictions.map(p => {
      p.role = VotingRegistry.getGovernance(p.predictor as any).role;
      return p;
    });
  }

  /**
   * 🛡️ Phase 2: Establish Single Voting Authority
   * Returns predictions ONLY from AUTHORIZED_VOTERS.
   */
  public static async getAuthorizedPredictions(features: FeatureVector): Promise<AIPrediction[]> {
    const authorizedTypes = VotingRegistry.getAuthorizedVoters();
    const authorizedPredictors = authorizedTypes
      .filter(t => isPredictorEnabled(t))
      .map(t => this.predictors.get(t)).filter(Boolean) as IAIPredictor[];
    
    const results = await Promise.allSettled(authorizedPredictors.map(p => p.predict(features)));
    
    const predictions = results
      .map((r, i) => {
        if (r.status === 'rejected') {
           console.warn(`[AQEA_AI] Authorized Predictor ${authorizedPredictors[i].constructor.name} failed:`, r.reason);
           return null;
        }
        return r.value;
      })
      .filter((p): p is AIPrediction => p !== null);

    return predictions.map(p => {
      p.role = VotingRegistry.getGovernance(p.predictor as any).role;
      (p as any).usedForConsensus = true;
      VotingRegistry.assertGovernance(p);
      return p;
    });
  }

  public static getPredictor(type: PredictorType): IAIPredictor {
    if (!isPredictorEnabled(type)) return new NotAvailablePredictor("DISABLED_BY_USER");
    return this.predictors.get(type) || new NotAvailablePredictor("NOT_AVAILABLE");
  }

  public static getRegistryHealth() {
    return Array.from(this.predictors.values()).map(p => p.getHealth());
  }
}

PredictorRegistry.initialize();
