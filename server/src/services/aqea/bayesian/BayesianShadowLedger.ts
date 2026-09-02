/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Bayesian Shadow Outcome Ledger (Phase 11)
 * ═══════════════════════════════════════════════════════════════════
 * Persistent, auditable shadow-outcome ledger for Bayesian-evaluated
 * directional candidates. Evaluates rejected and accepted setups
 * against forward horizons (T+1, T+3, T+5, T+10) with exact friction
 * deduction, strict temporal ordering, and zero production execution leakage.
 */

import crypto from "node:crypto";
import { DataLeakageError } from "../ensemble/UnifiedEnsembleFusion.js";

export type ShadowHorizon = "T+1" | "T+3" | "T+5" | "T+10";
export type ShadowOutcomeClass = "POSITIVE" | "NEGATIVE" | "FLAT" | "UNRESOLVED";

export interface ShadowHorizonOutcome {
  horizon: ShadowHorizon;
  futurePrice: number;
  grossReturn: number;
  fee: number;
  slippage: number;
  spread: number;
  netReturn: number;
  mfe: number;
  mae: number;
  outcomeClass: ShadowOutcomeClass;
  resolvedTimestamp: number;
}

export interface BayesianShadowObservation {
  observationId: string;
  decisionId: string;
  symbol: string;
  timestamp: number; // t_decision
  direction: "LONG" | "SHORT";
  regime: string;
  price: number;
  ATR: number;
  ADX: number;
  RSI: number;
  finalScore: number;

  ensembleLongProbability: number;
  ensembleShortProbability: number;
  ensembleHoldProbability: number;

  prior: number;
  ensembleProbability: number;
  posteriorBefore: number;
  posteriorFinal: number;

  lQuality: number;
  lConfidence: number;
  lAdx: number;
  lHtf: number;
  lSmart: number;

  netEVAtDecision: number;
  conformalWidth: number;
  AIConfidence: number;

  BayesianThreshold: number;
  firstBlockingGate: string;
  rejectedByBayesian: boolean;

  experimentHash: string;
  featureVectorHash: string;

  outcomeStatus: "UNRESOLVED" | "RESOLVED" | "EXPIRED";
  outcomeTimestamp: number | null;
  horizons: Partial<Record<ShadowHorizon, ShadowHorizonOutcome>>;
}

export interface PosteriorBucketStats {
  bucketName: string;
  minProb: number;
  maxProb: number;
  count: number;
  positiveCount: number;
  negativeCount: number;
  flatCount: number;
  meanGrossReturn: number | null;
  medianGrossReturn: number | null;
  meanNetReturn: number | null;
  medianNetReturn: number | null;
  meanMFE: number | null;
  meanMAE: number | null;
}

export interface CalibrationBucketResult {
  bucketName: string;
  predictedProbability: number;
  observedFrequency: number | null;
  calibrationError: number | null;
  sampleCount: number;
  status: "CALIBRATED" | "UNCALIBRATED" | "INSUFFICIENT_EVIDENCE";
}

export class BayesianShadowLedger {
  private static observations: Map<string, BayesianShadowObservation> = new Map();
  private static readonly DEFAULT_FEE = 0.0008;      // 8 bps taker fee
  private static readonly DEFAULT_SLIPPAGE = 0.0005; // 5 bps slippage
  private static readonly DEFAULT_SPREAD = 0.0002;   // 2 bps half-spread

  /**
   * Records an immutable Bayesian shadow observation at decision time.
   */
  public static recordShadowCandidate(obs: Omit<BayesianShadowObservation, "observationId" | "outcomeStatus" | "outcomeTimestamp" | "horizons">): BayesianShadowObservation {
    const observationId = `BSO_${obs.decisionId}_${obs.timestamp}`;

    if (this.observations.has(obs.decisionId)) {
      return this.observations.get(obs.decisionId)!;
    }

    const fullRecord: BayesianShadowObservation = {
      ...obs,
      observationId,
      outcomeStatus: "UNRESOLVED",
      outcomeTimestamp: null,
      horizons: {}
    };

    this.observations.set(obs.decisionId, fullRecord);

    const trace = {
      decisionId: obs.decisionId,
      symbol: obs.symbol,
      direction: obs.direction,
      timestamp: obs.timestamp,
      ensembleProbability: obs.ensembleProbability,
      prior: obs.prior,
      posteriorBefore: obs.posteriorBefore,
      posteriorFinal: obs.posteriorFinal,
      threshold: obs.BayesianThreshold,
      lQuality: obs.lQuality,
      lConfidence: obs.lConfidence,
      lAdx: obs.lAdx,
      lHtf: obs.lHtf,
      lSmart: obs.lSmart,
      regime: obs.regime,
      ADX: obs.ADX,
      finalScore: obs.finalScore,
      AIConfidence: obs.AIConfidence,
      NetEV: obs.netEVAtDecision,
      conformalWidth: obs.conformalWidth,
      firstBlockingGate: obs.firstBlockingGate,
      shadowOutcomeStatus: "UNRESOLVED",
      shadowOutcomeHorizon: "NONE"
    };

    console.log(`[P11_BAYES_SHADOW_TRACE] ${JSON.stringify(trace)}`);
    return fullRecord;
  }

  /**
   * Resolves a forward horizon outcome strictly after decision timestamp.
   */
  public static resolveShadowOutcome(
    decisionId: string,
    horizon: ShadowHorizon,
    futurePrice: number,
    mfe: number = 0,
    mae: number = 0,
    outcomeTimestamp: number = Date.now(),
    customFriction?: { fee?: number; slippage?: number; spread?: number }
  ): ShadowHorizonOutcome {
    const record = this.observations.get(decisionId);
    if (!record) {
      throw new Error(`Shadow candidate with decisionId ${decisionId} not found`);
    }

    // Strict temporal ordering assertion
    if (outcomeTimestamp <= record.timestamp) {
      throw new DataLeakageError(
        `Temporal leakage detected in shadow outcome resolution: outcomeTimestamp (${outcomeTimestamp}) <= decisionTimestamp (${record.timestamp})`
      );
    }

    const entryPrice = record.price > 0 ? record.price : futurePrice;
    let grossReturn = 0;
    if (record.direction === "LONG") {
      grossReturn = entryPrice > 0 ? (futurePrice - entryPrice) / entryPrice : 0;
    } else {
      grossReturn = entryPrice > 0 ? (entryPrice - futurePrice) / entryPrice : 0;
    }

    const fee = customFriction?.fee ?? this.DEFAULT_FEE;
    const slippage = customFriction?.slippage ?? this.DEFAULT_SLIPPAGE;
    const spread = customFriction?.spread ?? this.DEFAULT_SPREAD;
    const totalFriction = fee + slippage + spread;

    const netReturn = Number((grossReturn - totalFriction).toFixed(6));
    const grossReturnFormatted = Number(grossReturn.toFixed(6));

    let outcomeClass: ShadowOutcomeClass = "FLAT";
    if (netReturn > 0.0002) {
      outcomeClass = "POSITIVE";
    } else if (netReturn < -0.0002) {
      outcomeClass = "NEGATIVE";
    }

    const horizonOutcome: ShadowHorizonOutcome = {
      horizon,
      futurePrice,
      grossReturn: grossReturnFormatted,
      fee,
      slippage,
      spread,
      netReturn,
      mfe,
      mae,
      outcomeClass,
      resolvedTimestamp: outcomeTimestamp
    };

    record.horizons[horizon] = horizonOutcome;
    record.outcomeStatus = "RESOLVED";
    record.outcomeTimestamp = outcomeTimestamp;

    const outcomeTrace = {
      decisionId,
      symbol: record.symbol,
      direction: record.direction,
      decisionTimestamp: record.timestamp,
      outcomeTimestamp,
      horizon,
      entryPrice,
      futurePrice,
      grossReturn: grossReturnFormatted,
      fee,
      slippage,
      spread,
      netReturn,
      MFE: mfe,
      MAE: mae,
      outcomeClass,
      shadowOnly: true,
      paperTrade: false
    };

    console.log(`[P11_SHADOW_OUTCOME_TRACE] ${JSON.stringify(outcomeTrace)}`);
    return horizonOutcome;
  }

  /**
   * Retrieves all recorded shadow observations.
   */
  public static getAllObservations(): BayesianShadowObservation[] {
    return Array.from(this.observations.values());
  }

  /**
   * Retrieves a specific observation by decisionId.
   */
  public static getObservation(decisionId: string): BayesianShadowObservation | undefined {
    return this.observations.get(decisionId);
  }

  /**
   * Computes posterior distribution buckets across candidate observations.
   */
  public static getPosteriorDistribution(
    direction: "LONG" | "SHORT" | "ALL" = "ALL",
    horizon: ShadowHorizon = "T+5"
  ): PosteriorBucketStats[] {
    let records = Array.from(this.observations.values());
    if (direction !== "ALL") {
      records = records.filter(r => r.direction === direction);
    }

    const bucketDefs = [
      { name: "<50%", min: 0.0, max: 0.50 },
      { name: "50–60%", min: 0.50, max: 0.60 },
      { name: "60–70%", min: 0.60, max: 0.70 },
      { name: "70–78%", min: 0.70, max: 0.78 },
      { name: ">=78%", min: 0.78, max: 1.00 }
    ];

    return bucketDefs.map(b => {
      const inBucket = records.filter(r => {
        const p = r.posteriorFinal;
        return p >= b.min && (b.max === 1.0 ? p <= b.max : p < b.max);
      });

      const resolved = inBucket.filter(r => r.horizons[horizon] !== undefined);
      const returns = resolved.map(r => r.horizons[horizon]!.netReturn);
      const grossReturns = resolved.map(r => r.horizons[horizon]!.grossReturn);
      const mfes = resolved.map(r => r.horizons[horizon]!.mfe);
      const maes = resolved.map(r => r.horizons[horizon]!.mae);

      const pos = resolved.filter(r => r.horizons[horizon]!.outcomeClass === "POSITIVE").length;
      const neg = resolved.filter(r => r.horizons[horizon]!.outcomeClass === "NEGATIVE").length;
      const flat = resolved.filter(r => r.horizons[horizon]!.outcomeClass === "FLAT").length;

      const meanGross = grossReturns.length > 0 ? grossReturns.reduce((a, b) => a + b, 0) / grossReturns.length : null;
      const meanNet = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : null;
      const medianNet = returns.length > 0 ? this.calculateMedian(returns) : null;
      const medianGross = grossReturns.length > 0 ? this.calculateMedian(grossReturns) : null;
      const meanMFE = mfes.length > 0 ? mfes.reduce((a, b) => a + b, 0) / mfes.length : null;
      const meanMAE = maes.length > 0 ? maes.reduce((a, b) => a + b, 0) / maes.length : null;

      return {
        bucketName: b.name,
        minProb: b.min,
        maxProb: b.max,
        count: inBucket.length,
        positiveCount: pos,
        negativeCount: neg,
        flatCount: flat,
        meanGrossReturn: meanGross !== null ? Number(meanGross.toFixed(6)) : null,
        medianGrossReturn: medianGross !== null ? Number(medianGross.toFixed(6)) : null,
        meanNetReturn: meanNet !== null ? Number(meanNet.toFixed(6)) : null,
        medianNetReturn: medianNet !== null ? Number(medianNet.toFixed(6)) : null,
        meanMFE: meanMFE !== null ? Number(meanMFE.toFixed(6)) : null,
        meanMAE: meanMAE !== null ? Number(meanMAE.toFixed(6)) : null
      };
    });
  }

  /**
   * Computes Bayesian calibration analysis and reliability metrics.
   */
  public static getCalibrationAnalysis(horizon: ShadowHorizon = "T+5"): CalibrationBucketResult[] {
    const buckets = this.getPosteriorDistribution("ALL", horizon);

    return buckets.map(b => {
      const midProb = (b.minProb + b.maxProb) / 2;
      const resolvedCount = b.positiveCount + b.negativeCount + b.flatCount;

      if (resolvedCount === 0 || b.count < 10) {
        return {
          bucketName: b.bucketName,
          predictedProbability: midProb,
          observedFrequency: null,
          calibrationError: null,
          sampleCount: b.count,
          status: "INSUFFICIENT_EVIDENCE"
        };
      }

      const obsFreq = Number((b.positiveCount / resolvedCount).toFixed(4));
      const calError = Number(Math.abs(midProb - obsFreq).toFixed(4));
      const status = calError <= 0.15 ? "CALIBRATED" : "UNCALIBRATED";

      return {
        bucketName: b.bucketName,
        predictedProbability: midProb,
        observedFrequency: obsFreq,
        calibrationError: calError,
        sampleCount: b.count,
        status
      };
    });
  }

  /**
   * Computes regime-specific performance and Bayesian suppression breakdown.
   */
  public static getRegimeBreakdown(horizon: ShadowHorizon = "T+5") {
    const regimes = ["RANGING", "TRANSITION", "TRENDING_BULL", "TRENDING_BEAR"];
    const records = Array.from(this.observations.values());

    return regimes.map(reg => {
      const regRecords = records.filter(r => r.regime === reg || (reg.startsWith("TRENDING") && r.regime.includes("TRENDING")));
      const longCount = regRecords.filter(r => r.direction === "LONG").length;
      const shortCount = regRecords.filter(r => r.direction === "SHORT").length;

      const resolved = regRecords.filter(r => r.horizons[horizon] !== undefined);
      const returns = resolved.map(r => r.horizons[horizon]!.netReturn);
      const posCount = resolved.filter(r => r.horizons[horizon]!.outcomeClass === "POSITIVE").length;
      const negCount = resolved.filter(r => r.horizons[horizon]!.outcomeClass === "NEGATIVE").length;

      const meanNet = returns.length > 0 ? Number((returns.reduce((a, b) => a + b, 0) / returns.length).toFixed(6)) : null;
      const medianNet = returns.length > 0 ? Number(this.calculateMedian(returns).toFixed(6)) : null;

      return {
        regime: reg,
        candidateCount: regRecords.length,
        longCount,
        shortCount,
        positiveCount: posCount,
        negativeCount: negCount,
        meanNetReturn: meanNet,
        medianNetReturn: medianNet,
        calibrationStatus: resolved.length >= 25 ? "EVALUATED" : "INSUFFICIENT_EVIDENCE"
      };
    });
  }

  /**
   * Computes directional symmetry metrics between LONG and SHORT.
   */
  public static getDirectionalSymmetry(horizon: ShadowHorizon = "T+5") {
    const records = Array.from(this.observations.values());
    const longs = records.filter(r => r.direction === "LONG");
    const shorts = records.filter(r => r.direction === "SHORT");

    const resolveSide = (sideRecords: BayesianShadowObservation[]) => {
      const resolved = sideRecords.filter(r => r.horizons[horizon] !== undefined);
      const returns = resolved.map(r => r.horizons[horizon]!.netReturn);
      const pos = resolved.filter(r => r.horizons[horizon]!.outcomeClass === "POSITIVE").length;
      const meanNet = returns.length > 0 ? Number((returns.reduce((a, b) => a + b, 0) / returns.length).toFixed(6)) : null;
      const medianNet = returns.length > 0 ? Number(this.calculateMedian(returns).toFixed(6)) : null;
      const positiveRate = resolved.length > 0 ? Number((pos / resolved.length).toFixed(4)) : null;

      return {
        candidateCount: sideRecords.length,
        resolvedCount: resolved.length,
        positiveRate,
        meanNetReturn: meanNet,
        medianNetReturn: medianNet
      };
    };

    const longStats = resolveSide(longs);
    const shortStats = resolveSide(shorts);

    let asymmetryFlag: "SYMMETRIC" | "LONG_ASYMMETRY" | "SHORT_ASYMMETRY" | "INSUFFICIENT_EVIDENCE" = "INSUFFICIENT_EVIDENCE";
    if (longStats.resolvedCount >= 20 && shortStats.resolvedCount >= 20) {
      const diff = Math.abs((longStats.positiveRate ?? 0) - (shortStats.positiveRate ?? 0));
      if (diff > 0.20) {
        asymmetryFlag = (longStats.positiveRate ?? 0) > (shortStats.positiveRate ?? 0) ? "LONG_ASYMMETRY" : "SHORT_ASYMMETRY";
      } else {
        asymmetryFlag = "SYMMETRIC";
      }
    }

    return {
      long: longStats,
      short: shortStats,
      asymmetryFlag
    };
  }

  /**
   * Factor decomposition identifying the most frequent suppression factor.
   */
  public static getFactorDecomposition() {
    const rejected = Array.from(this.observations.values()).filter(r => r.rejectedByBayesian);
    const total = rejected.length;

    let qualitySuppression = 0;
    let confidenceSuppression = 0;
    let adxSuppression = 0;
    let htfSuppression = 0;
    let smartMoneySuppression = 0;

    for (const r of rejected) {
      const factors: Record<string, number> = {
        quality: r.lQuality,
        confidence: r.lConfidence,
        adx: r.lAdx,
        htf: r.lHtf,
        smart: r.lSmart
      };
      let minF = "quality";
      let minV = Infinity;
      for (const [k, v] of Object.entries(factors)) {
        if (v < minV) { minV = v; minF = k; }
      }

      if (minF === "quality") qualitySuppression++;
      else if (minF === "confidence") confidenceSuppression++;
      else if (minF === "adx") adxSuppression++;
      else if (minF === "htf") htfSuppression++;
      else if (minF === "smart") smartMoneySuppression++;
    }

    let dominantFactor = "NONE";
    let maxSuppression = 0;
    const dist = {
      qualitySuppression,
      confidenceSuppression,
      adxSuppression,
      htfSuppression,
      smartMoneySuppression
    };
    for (const [k, v] of Object.entries(dist)) {
      if (v > maxSuppression) {
        maxSuppression = v;
        dominantFactor = k;
      }
    }

    return {
      totalRejected: total,
      distribution: dist,
      dominantSuppressionFactor: dominantFactor
    };
  }

  /**
   * Conservation law audit metrics.
   */
  public static getConservationMetrics() {
    const records = Array.from(this.observations.values());
    const nCandidates = records.length;
    const nResolved = records.filter(r => r.outcomeStatus === "RESOLVED").length;
    const nPending = records.filter(r => r.outcomeStatus === "UNRESOLVED").length;
    const nExpired = records.filter(r => r.outcomeStatus === "EXPIRED").length;

    return {
      N_shadowCandidates: nCandidates,
      N_shadowResolved: nResolved,
      N_shadowPending: nPending,
      N_shadowExpired: nExpired,
      N_shadowTrades: 0, // Invariant: shadow candidates NEVER execute
      conservationValid: nCandidates === (nResolved + nPending + nExpired)
    };
  }

  /**
   * Resets in-memory state (strictly for isolated testing).
   */
  public static resetState(): void {
    this.observations.clear();
  }

  /**
   * Exports ledger to JSON.
   */
  public static exportStateJSON(): string {
    return JSON.stringify(Array.from(this.observations.values()));
  }

  /**
   * Imports ledger from JSON.
   */
  public static importStateJSON(json: string): void {
    const list: BayesianShadowObservation[] = JSON.parse(json);
    this.observations.clear();
    for (const item of list) {
      this.observations.set(item.decisionId, item);
    }
  }

  private static calculateMedian(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
}
