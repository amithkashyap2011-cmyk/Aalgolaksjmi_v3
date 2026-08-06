/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Voting Authority Registry (Governance)
 * ═══════════════════════════════════════════════════════════════════
 */

import { PredictorType, AIPrediction } from "./ai/types.js";

export enum PredictorRole {
  AUTHORIZED = "AUTHORIZED",
  SHADOW = "SHADOW",
  EXPERIMENTAL = "EXPERIMENTAL"
}

export interface PredictorGovernance {
  type: PredictorType;
  role: PredictorRole;
  affectsTrading: boolean;
  persisted: boolean;
}

export class FatalGovernanceError extends Error {
  constructor(message: string) {
    super(`[FATAL_GOVERNANCE_ERROR] ${message}`);
    this.name = "FatalGovernanceError";
  }
}

export class VotingRegistry {
  private static governanceMap: Map<PredictorType, PredictorGovernance> = new Map([
    ["CNN", { type: "CNN", role: PredictorRole.AUTHORIZED, affectsTrading: true, persisted: true }],
    ["LSTM", { type: "LSTM", role: PredictorRole.AUTHORIZED, affectsTrading: true, persisted: true }],
    // PPO_EXECUTION_V1's action space (SKIP_TRADE/NORMAL_SIZE/REDUCE_SIZE/
    // INCREASE_SIZE/CONSERVATIVE_EXIT/STANDARD_EXIT/AGGRESSIVE_EXIT) has no
    // directional (LONG/SHORT) content — it answers "how much"/"exit or
    // not", not "which way". Demoted from AUTHORIZED: it was structurally
    // incapable of voting anything but HOLD here (PPOExecutionPredictor.ts
    // only maps data.action to LONG/SHORT, which the Python service never
    // returns), silently diluting every consensus check. Its real output
    // now drives position sizing/exit strategy directly via
    // AQEA_CONFIG.PPO_EXECUTION_AUTHORITY in engine.ts instead.
    ["PPO", { type: "PPO", role: PredictorRole.SHADOW, affectsTrading: false, persisted: true }],
    ["TRANSFORMER", { type: "TRANSFORMER", role: PredictorRole.AUTHORIZED, affectsTrading: true, persisted: true }],
    ["MAMBA", { type: "MAMBA", role: PredictorRole.SHADOW, affectsTrading: false, persisted: true }],
    ["LNN", { type: "LNN", role: PredictorRole.AUTHORIZED, affectsTrading: true, persisted: true }],
    ["NOT_AVAILABLE", { type: "NOT_AVAILABLE", role: PredictorRole.EXPERIMENTAL, affectsTrading: false, persisted: false }]
  ]);

  public static getGovernance(type: PredictorType): PredictorGovernance {
    const key = Array.from(this.governanceMap.keys()).find(k => type.startsWith(k)) || "NOT_AVAILABLE";
    return this.governanceMap.get(key as PredictorType)!;
  }

  public static getAuthorizedVoters(): PredictorType[] {
    return Array.from(this.governanceMap.values())
      .filter(g => g.role === PredictorRole.AUTHORIZED)
      .map(g => g.type);
  }

  /**
   * 🛡️ Runtime Governance Assertion
   */
  public static assertGovernance(prediction: AIPrediction): void {
    if (prediction.role !== PredictorRole.AUTHORIZED && (prediction as any).usedForConsensus === true) {
      throw new FatalGovernanceError(`Unauthorized model ${prediction.predictor} (role=${prediction.role}) attempted to participate in consensus.`);
    }
  }
}
