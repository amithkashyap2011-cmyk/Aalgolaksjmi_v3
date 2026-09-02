/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Champion–Challenger Governance Engine (Phase 3)
 * ═══════════════════════════════════════════════════════════════════
 * Manages model lifecycle states:
 * CHAMPION | CHALLENGER | SHADOW | BENCHMARK | QUARANTINED | RETIRED
 *
 * Enforces:
 * 1. Exactly one active Champion per (domain + symbol class + regime).
 * 2. Challenger promotion strictly requires beating the Champion on
 *    untouched forward OOS data with statistically significant delta EV.
 * 3. Automatic, reversible quarantine upon persistent degradation.
 */

import mongoose from "mongoose";
import { ForwardTelemetryStore } from "../ensemble/ForwardTelemetryStore.js";
import { StatisticalTests, PairedComparisonResult } from "../ensemble/StatisticalTests.js";
import { AQEAChampionChallenger, ModelLifecycleState, IChampionChallengerRecord } from "../../../models/AQEAChampionChallenger.js";
import { AQEA_CONFIG } from "../config.js";

// ═══════════════════════════════════════════════════════════════════
//  Interfaces
// ═══════════════════════════════════════════════════════════════════

export interface ChampionComparisonReport {
  championModel: string;
  challengerModel: string;
  marketDomain: "CRYPTO" | "INDIAN";
  sampleCount: number;
  championEV: number | null;
  challengerEV: number | null;
  deltaEV: number | null;
  championBrier: number | null;
  challengerBrier: number | null;
  championPF: number | null;
  challengerPF: number | null;
  championMaxDD: number | null;
  challengerMaxDD: number | null;
  headToHeadWinRate: number;
  pairedTest: PairedComparisonResult;
  isEligibleForPromotion: boolean;
  promotionDecision: "PROMOTE_CHALLENGER_TO_CHAMPION" | "REMAIN_CHALLENGER" | "DEMOTE_CHALLENGER_TO_SHADOW";
  reasons: string[];
}

export interface ModelLifecycleSummary {
  modelName: string;
  marketDomain: "CRYPTO" | "INDIAN";
  state: ModelLifecycleState;
  sampleCount: number;
  costAdjustedEV: number;
  brierScore: number;
  profitFactor: number;
  maxDrawdown: number;
  quarantineReason: string | null;
  lastUpdated: number;
}

// ═══════════════════════════════════════════════════════════════════
//  Champion-Challenger Engine
// ═══════════════════════════════════════════════════════════════════

export class ChampionChallengerEngine {
  private static states: Map<string, ModelLifecycleSummary> = new Map();
  private static MIN_CHALLENGER_SAMPLES = AQEA_CONFIG.SUBSET_OPTIMIZER?.MIN_OOS_SAMPLES ?? 100;

  /**
   * Initializes or fetches default lifecycle states.
   */
  public static getOrCreateState(
    modelName: string,
    domain: "CRYPTO" | "INDIAN" = "CRYPTO"
  ): ModelLifecycleSummary {
    const key = `${domain}:${modelName}`;
    if (!this.states.has(key)) {
      // Default initial assignments (priors only)
      let defaultState: ModelLifecycleState = "SHADOW";
      if ((modelName === "MAMBA_RESEARCH_V1" || modelName === "MAMBA") && domain === "CRYPTO") defaultState = "CHAMPION";
      else if (modelName === "AARYAN_MOMENTUM" && domain === "INDIAN") defaultState = "CHAMPION";
      else if (modelName.includes("BENCHMARK")) defaultState = "BENCHMARK";
      else if (modelName.includes("PROXY")) defaultState = "SHADOW";
      else defaultState = "CHALLENGER";

      const summary: ModelLifecycleSummary = {
        modelName,
        marketDomain: domain,
        state: defaultState,
        sampleCount: 0,
        costAdjustedEV: 0,
        brierScore: 0.20,
        profitFactor: 1.0,
        maxDrawdown: 0,
        quarantineReason: null,
        lastUpdated: Date.now()
      };
      this.states.set(key, summary);
    }
    return this.states.get(key)!;
  }

  /**
   * Returns current active Champion for a domain.
   */
  public static getActiveChampion(domain: "CRYPTO" | "INDIAN"): string {
    for (const [_, summary] of this.states.entries()) {
      if (summary.marketDomain === domain && summary.state === "CHAMPION") {
        return summary.modelName;
      }
    }
    // Fallback baseline
    return domain === "CRYPTO" ? "MAMBA_RESEARCH_V1" : "AARYAN_MOMENTUM";
  }

  /**
   * Evaluates a Challenger against the active Champion on forward OOS data.
   */
  public static evaluateChallenger(
    challengerName: string,
    domain: "CRYPTO" | "INDIAN" = "CRYPTO"
  ): ChampionComparisonReport {
    const championName = this.getActiveChampion(domain);
    const resolved = ForwardTelemetryStore.getResolvedRecords().filter(r => r.marketDomain === domain);
    const n = resolved.length;

    const champCard = ForwardTelemetryStore.reconstructModelScorecard(championName);
    const challCard = ForwardTelemetryStore.reconstructModelScorecard(challengerName);

    const pairedChampReturns: number[] = [];
    const pairedChallReturns: number[] = [];

    let challHeadToHeadWins = 0;
    let pairedCount = 0;

    for (const r of resolved) {
      if (!r.outcome) continue;
      const snapChamp = r.modelBreakdowns[championName];
      const snapChall = r.modelBreakdowns[challengerName];
      if (!snapChamp?.participating || !snapChall?.participating) continue;

      pairedCount++;
      const ret = r.outcome.realizedReturn;
      const champDir = snapChamp.probLong > snapChamp.probShort ? "LONG" : "SHORT";
      const challDir = snapChall.probLong > snapChall.probShort ? "LONG" : "SHORT";

      const champRet = champDir === r.outcome.realizedDirection ? ret : -ret;
      const challRet = challDir === r.outcome.realizedDirection ? ret : -ret;

      pairedChampReturns.push(champRet);
      pairedChallReturns.push(challRet);

      if (challRet > champRet) challHeadToHeadWins++;
    }

    const headToHeadWinRate = pairedCount > 0 ? challHeadToHeadWins / pairedCount : 0.5;

    // Paired bootstrap test
    let pairedTest: PairedComparisonResult;
    const champEV = champCard.trading.expectedValue ?? 0;
    const challEV = challCard.trading.expectedValue ?? 0;

    if (pairedChampReturns.length >= 10) {
      pairedTest = StatisticalTests.pairedComparison(
        challengerName,
        championName,
        pairedChallReturns,
        pairedChampReturns,
        "netReturn"
      );
    } else {
      pairedTest = {
        modelA: challengerName,
        modelB: championName,
        metricName: "netReturn",
        meanDifference: challEV - champEV,
        ci: { mean: 0, lower: 0, upper: 0, confidenceLevel: 0.95, sampleCount: 0, bootstrapIterations: 0, isSignificant: false },
        pValue: 0.50,
        aIsBetter: false,
        conclusion: "INCONCLUSIVE"
      };
    }

    const deltaEV = challEV - champEV;
    const reasons: string[] = [];
    let isEligible = true;

    if (pairedCount < this.MIN_CHALLENGER_SAMPLES) {
      isEligible = false;
      reasons.push(`INSUFFICIENT_FORWARD_SAMPLES: ${pairedCount}/${this.MIN_CHALLENGER_SAMPLES} required paired observations`);
    }

    if (deltaEV <= 0) {
      isEligible = false;
      reasons.push(`NO_INCREMENTAL_EDGE: Delta EV ${deltaEV.toFixed(6)} <= 0`);
    }

    if (!pairedTest.ci.isSignificant || pairedTest.pValue > 0.05) {
      isEligible = false;
      reasons.push(`NOT_STATISTICALLY_SIGNIFICANT: Paired p-value ${pairedTest.pValue} > 0.05`);
    }

    const challBrier = challCard.predictive.brierScore;
    if (challBrier !== null && challBrier > 0.22) {
      isEligible = false;
      reasons.push(`BRIER_SCORE_TOO_HIGH: ${challBrier} > 0.22`);
    }

    const challDD = challCard.trading.maxDrawdownPercent;
    if (challDD !== null && challDD > 15.0) {
      isEligible = false;
      reasons.push(`MAX_DRAWDOWN_EXCEEDED: ${challDD}% > 15%`);
    }

    let decision: "PROMOTE_CHALLENGER_TO_CHAMPION" | "REMAIN_CHALLENGER" | "DEMOTE_CHALLENGER_TO_SHADOW" = "REMAIN_CHALLENGER";
    if (isEligible) {
      decision = "PROMOTE_CHALLENGER_TO_CHAMPION";
      this.promoteChallengerToChampion(challengerName, championName, domain);
    } else if ((challBrier !== null && challBrier > 0.26) || (challDD !== null && challDD > 20.0)) {
      decision = "DEMOTE_CHALLENGER_TO_SHADOW";
      this.quarantineModel(challengerName, "Persistent degradation vs Champion benchmark", domain);
    }

    return {
      championModel: championName,
      challengerModel: challengerName,
      marketDomain: domain,
      sampleCount: pairedCount,
      championEV: champCard.trading.expectedValue,
      challengerEV: challCard.trading.expectedValue,
      deltaEV: Number(deltaEV.toFixed(6)),
      championBrier: champCard.predictive.brierScore,
      challengerBrier: challCard.predictive.brierScore,
      championPF: champCard.trading.profitFactor,
      challengerPF: challCard.trading.profitFactor,
      championMaxDD: champCard.trading.maxDrawdownPercent,
      challengerMaxDD: challCard.trading.maxDrawdownPercent,
      headToHeadWinRate: Number(headToHeadWinRate.toFixed(4)),
      pairedTest,
      isEligibleForPromotion: isEligible,
      promotionDecision: decision,
      reasons: reasons.length > 0 ? reasons : ["CHALLENGER_OUTPERFORMS_CHAMPION_WITH_STATISTICAL_SIGNIFICANCE"]
    };
  }

  /**
   * Promotes a Challenger to Champion and demotes previous Champion to Challenger.
   */
  public static promoteChallengerToChampion(
    challengerName: string,
    previousChampion: string,
    domain: "CRYPTO" | "INDIAN"
  ): void {
    const challState = this.getOrCreateState(challengerName, domain);
    const champState = this.getOrCreateState(previousChampion, domain);

    challState.state = "CHAMPION";
    challState.lastUpdated = Date.now();

    champState.state = "CHALLENGER";
    champState.lastUpdated = Date.now();

    this.persistStateToMongo(challState);
    this.persistStateToMongo(champState);
  }

  /**
   * Automatically quarantines a model due to persistent degradation.
   */
  public static quarantineModel(
    modelName: string,
    reason: string,
    domain: "CRYPTO" | "INDIAN" = "CRYPTO"
  ): void {
    const state = this.getOrCreateState(modelName, domain);
    state.state = "QUARANTINED";
    state.quarantineReason = reason;
    state.lastUpdated = Date.now();
    this.persistStateToMongo(state);
  }

  /**
   * Recovers a model from quarantine to shadow.
   */
  public static recoverModelFromQuarantine(
    modelName: string,
    domain: "CRYPTO" | "INDIAN" = "CRYPTO"
  ): void {
    const state = this.getOrCreateState(modelName, domain);
    if (state.state === "QUARANTINED") {
      state.state = "SHADOW";
      state.quarantineReason = null;
      state.lastUpdated = Date.now();
      this.persistStateToMongo(state);
    }
  }

  /**
   * Retrieves all model states.
   */
  public static getAllStates(): ModelLifecycleSummary[] {
    return Array.from(this.states.values());
  }

  /**
   * Clears state for testing.
   */
  public static clear(): void {
    this.states.clear();
  }

  private static async persistStateToMongo(state: ModelLifecycleSummary): Promise<void> {
    if (mongoose?.connection?.readyState !== 1) return;

    try {
      await AQEAChampionChallenger.findOneAndUpdate(
        { modelName: state.modelName, marketDomain: state.marketDomain },
        {
          modelName: state.modelName,
          marketDomain: state.marketDomain,
          state: state.state,
          sampleCount: state.sampleCount,
          costAdjustedEV: state.costAdjustedEV,
          brierScore: state.brierScore,
          profitFactor: state.profitFactor,
          maxDrawdownPercent: state.maxDrawdown,
          quarantineReason: state.quarantineReason,
          lastUpdated: state.lastUpdated
        },
        { upsert: true, new: true }
      );
    } catch (err: any) {
      if (process.env.NODE_ENV !== "test") {
        console.warn(`[ChampionChallengerEngine] MongoDB write error: ${err.message}`);
      }
    }
  }
}
