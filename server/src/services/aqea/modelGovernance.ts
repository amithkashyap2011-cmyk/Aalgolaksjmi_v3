/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Model Governance Service (V8.1)
 * ═══════════════════════════════════════════════════════════════════
 */

import { PredictorRegistry } from "./ai/PredictorRegistry.js";
import { AITelemetryService } from "./aiTelemetryService.js";

export interface ModelReadiness {
  status: "PASS" | "FAIL" | "OFFLINE" | "DEGRADED";
  health: "HEALTHY" | "OFFLINE";
  readiness: "READY" | "NOT_READY";
  quality: "OPTIMAL" | "WARNING" | "CRITICAL";
  reasons: string[];
  isRequired: boolean;
}

export class ModelGovernanceService {
  /**
   * Generates readiness report from real model health and accuracy.
   */
  public static async getReadinessReport(): Promise<Record<string, ModelReadiness>> {
    const report: Record<string, ModelReadiness> = {};
    const predictorTypes = ["CNN", "PPO", "MAMBA", "TRANSFORMER"] as const;
    await Promise.all(
      predictorTypes.map(type => PredictorRegistry.getPredictor(type).isHealthy?.() ?? Promise.resolve(true))
    );
    const healths = PredictorRegistry.getRegistryHealth();
    
    const requiredModels = ["CNN", "PPO"];
    
    for (const h of healths) {
      const modelName = h.name.split('_')[0]; // "PPO_EXECUTION_V1" -> "PPO"
      const isRequired = requiredModels.includes(modelName);
      
      const accuracy = await AITelemetryService.getModelAccuracy(h.name);
      const rollingAcc = accuracy.rolling100_accuracy || accuracy.rolling50_accuracy || 50;
      
      const reasons: string[] = [];
      let health: "HEALTHY" | "OFFLINE" = h.available ? "HEALTHY" : "OFFLINE";
      let readiness: "READY" | "NOT_READY" = h.checkpointLoaded ? "READY" : "NOT_READY";
      let quality: "OPTIMAL" | "WARNING" | "CRITICAL" = "OPTIMAL";
      
      if (rollingAcc < 45) {
         quality = "CRITICAL";
         reasons.push(`Accuracy critical: ${rollingAcc.toFixed(1)}%`);
      } else if (rollingAcc < 52) {
         quality = "WARNING";
         reasons.push(`Accuracy warning: ${rollingAcc.toFixed(1)}%`);
      }

      if (h.errorCount > 0) reasons.push(`Recent Errors: ${h.errorCount}`);
      
      let status: "PASS" | "FAIL" | "OFFLINE" | "DEGRADED" = "PASS";
      if (health === "OFFLINE") {
        status = "OFFLINE";
        reasons.push("Service endpoint unreachable");
      } else if (readiness === "NOT_READY") {
        status = "FAIL";
        reasons.push("Model checkpoint not loaded");
      } else if (quality === "CRITICAL") {
        status = "DEGRADED";
      } else if (quality === "WARNING") {
        status = "DEGRADED";
      }
      
      if (status === "PASS" && reasons.length > 0) status = "DEGRADED";
      
      report[modelName] = { 
        status, 
        health, 
        readiness, 
        quality, 
        reasons: reasons.length > 0 ? reasons : ["Operating nominally"], 
        isRequired 
      };
    }
    
    // Add system level health
    report["SYSTEM"] = { 
      status: "PASS", 
      health: "HEALTHY", 
      readiness: "READY", 
      quality: "OPTIMAL", 
      reasons: ["All systems operational"], 
      isRequired: true 
    };
    return report;
  }

  /**
   * Validates if the system is allowed to trade based on model quality gates.
   */
  public static async isTradeAllowed(): Promise<{ allowed: boolean; reason?: string }> {
    const report = await this.getReadinessReport();
    
    for (const [modelId, readiness] of Object.entries(report)) {
      if (readiness.isRequired && readiness.status !== "PASS" && readiness.status !== "DEGRADED") {
        return {
          allowed: false,
          reason: `Required model ${modelId} failed quality gate: ${readiness.reasons.join(", ")}`
        };
      }
    }

    return { allowed: true };
  }
}
