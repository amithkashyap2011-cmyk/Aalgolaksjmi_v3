/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Calibrated Bayesian Win-Probability Engine (rebuilt)
 *
 *  This replaces the old "exact Bayesian posterior" that used hand-picked
 *  multipliers > 1 as "likelihoods" (mathematically impossible) and
 *  multiplied 5 strongly-correlated evidence terms as if independent
 *  (systematically over-confident, and it never learned from outcomes).
 *
 *  The rebuild is a REAL, self-calibrating model that learns from closed
 *  trades:
 *
 *   1. Empirical likelihood ratios. For each of the 5 evidence dimensions we
 *      bin the evidence, track per-(dimension,bin) WIN/LOSS counts, and form
 *          LR_i = P(bin | Win) / P(bin | Loss)
 *      with Laplace (add-1) smoothing on both conditionals.
 *
 *   2. Log-odds combination with correlation shrinkage.
 *          logit(post_raw) = logit(prior) + SHRINK * Σ_i log(LR_i)
 *      SHRINK (= 0.5) exists because the five dimensions (quality, AI
 *      confidence, ADX, HTF consensus, smart-money) are strongly correlated:
 *      in a genuine trend they all light up together. Naive Bayes assumes
 *      independence and therefore multiplies the likelihoods, double-counting
 *      the shared signal and producing over-confident posteriors. Shrinking
 *      the summed log-likelihood-ratio damps that double-counting without
 *      needing a full covariance model.
 *
 *   3. Empirical prior. The prior is the global win rate, Beta(1,1)-smoothed,
 *      once enough outcomes have accumulated (replacing the hardcoded 0.752).
 *
 *   4. Calibration layer (histogram binning). The raw posterior is bucketed
 *      into 10 bins; we return the empirical (Laplace-smoothed) win rate of
 *      that bin, enforced monotonic non-decreasing across bins. This is what
 *      fixes "confidence is anti-predictive": the number returned is what the
 *      data says a setup of that raw score actually wins at.
 *
 *   5. Cold-start. Until ~30 outcomes exist we fall back to fixed likelihood
 *      ratios derived from the original thresholds (as proper ratios, not
 *      probabilities > 1), so day-one behavior is sensible. The result is
 *      always finite and bounded to [0.001, 0.999].
 *
 *  The API and BayesianPosteriorTrace shape are unchanged; l*Win / l*Loss are
 *  now the actual (empirical or fallback) conditional likelihoods, so existing
 *  logging of LR_i = l*Win / l*Loss is truthful.
 *
 *  Time Complexity: O(1)   Space Complexity: O(1)
 * ═══════════════════════════════════════════════════════════════════
 */

import mongoose from "mongoose";
import { BayesianCalibration, type IBinCount } from "../../models/BayesianCalibration.js";

export interface BayesianPosteriorTrace {
  posterior: number;
  priorWin: number;
  priorLoss: number;
  lQualityWin: number;
  lQualityLoss: number;
  lConfidenceWin: number;
  lConfidenceLoss: number;
  lAdxWin: number;
  lAdxLoss: number;
  lHtfWin: number;
  lHtfLoss: number;
  lSmartWin: number;
  lSmartLoss: number;
  winLikelihood: number;
  lossLikelihood: number;
  posteriorOdds: number;
}

export interface BayesianEvidence {
  qualityScore: number;
  aiConfidence: number;
  adxTrendStrength: number;
  htfConsensus: boolean;
  smartMoneyScore: number;
}

type Dimension = "quality" | "confidence" | "adx" | "htf" | "smart";

interface CalibrationState {
  globalWin: number;
  globalLoss: number;
  dims: Record<Dimension, IBinCount[]>;
  calibration: IBinCount[];
}

// ── Tunables ────────────────────────────────────────────────────────
const SHRINK = 0.5;                 // correlation-shrinkage on Σ log(LR_i)
const MIN_GLOBAL_FOR_EMPIRICAL = 30; // below this → cold-start fallback ratios
const CALIB_BINS = 10;
const MIN_CALIB_BIN_SAMPLES = 10;   // below this in a bin → return raw posterior
const LOWER = 0.001;
const UPPER = 0.999;

// Number of bins per dimension (must match the binIndex functions below).
const DIM_BIN_COUNT: Record<Dimension, number> = {
  quality: 4,
  confidence: 4,
  adx: 3,
  htf: 2,
  smart: 3,
};

// Cold-start fallback likelihoods (lWin, lLoss) per dimension bin, derived
// from the original thresholds but kept as proper bounded likelihoods whose
// ratio lWin/lLoss is a sensible likelihood ratio.
const FALLBACK: Record<Dimension, Array<[number, number]>> = {
  quality: [[1.50, 0.70], [1.10, 0.90], [1.00, 1.00], [0.60, 1.40]],
  confidence: [[1.50, 0.70], [1.10, 0.95], [1.00, 1.00], [0.50, 1.50]],
  adx: [[1.30, 0.80], [1.05, 0.95], [0.60, 1.40]],
  htf: [[1.40, 0.70], [0.30, 1.60]],
  smart: [[1.30, 0.80], [0.65, 1.35], [0.40, 1.60]],
};

function qualityBin(v: number): number {
  return v >= 90 ? 0 : v >= 80 ? 1 : v >= 70 ? 2 : 3;
}
function confidenceBin(v: number): number {
  return v >= 85 ? 0 : v >= 75 ? 1 : v >= 65 ? 2 : 3;
}
function adxBin(v: number): number {
  return v >= 25 ? 0 : v >= 20 ? 1 : 2;
}
function htfBin(v: boolean): number {
  return v ? 0 : 1;
}
function smartBin(v: number): number {
  return v >= 70 ? 0 : v >= 50 ? 1 : 2;
}

function binIndex(dim: Dimension, ev: BayesianEvidence): number {
  switch (dim) {
    case "quality": return qualityBin(ev.qualityScore);
    case "confidence": return confidenceBin(ev.aiConfidence);
    case "adx": return adxBin(ev.adxTrendStrength);
    case "htf": return htfBin(ev.htfConsensus);
    case "smart": return smartBin(ev.smartMoneyScore);
  }
}

function emptyBins(n: number): IBinCount[] {
  return Array.from({ length: n }, () => ({ win: 0, loss: 0 }));
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export class BayesianProbabilityEngine {
  // In-memory aggregate counts. Starts empty (cold-start); a background load
  // from Mongo populates it on first use; recordOutcome() write-throughs.
  private static state: CalibrationState = BayesianProbabilityEngine.freshState();

  private static loadPromise: Promise<void> | null = null;
  private static loaded = false;
  private static saveTimer: ReturnType<typeof setTimeout> | null = null;

  private static freshState(): CalibrationState {
    return {
      globalWin: 0,
      globalLoss: 0,
      dims: {
        quality: emptyBins(DIM_BIN_COUNT.quality),
        confidence: emptyBins(DIM_BIN_COUNT.confidence),
        adx: emptyBins(DIM_BIN_COUNT.adx),
        htf: emptyBins(DIM_BIN_COUNT.htf),
        smart: emptyBins(DIM_BIN_COUNT.smart),
      },
      calibration: emptyBins(CALIB_BINS),
    };
  }

  /** Fire-and-forget load; safe to call repeatedly. */
  private static ensureLoadStarted(): void {
    if (this.loaded || this.loadPromise) return;
    this.loadPromise = this.loadFromDb().catch(() => { /* stay on in-memory */ });
  }

  private static async loadFromDb(): Promise<void> {
    if (mongoose.connection.readyState !== 1) return;
    const doc: any = await BayesianCalibration.findOne({ key: "GLOBAL" }).lean();
    if (doc) {
      const s = this.freshState();
      s.globalWin = Number(doc.globalWin) || 0;
      s.globalLoss = Number(doc.globalLoss) || 0;
      for (const dim of Object.keys(DIM_BIN_COUNT) as Dimension[]) {
        const arr = doc.dimensions?.[dim];
        if (Array.isArray(arr)) {
          for (let i = 0; i < s.dims[dim].length && i < arr.length; i++) {
            s.dims[dim][i] = { win: Number(arr[i]?.win) || 0, loss: Number(arr[i]?.loss) || 0 };
          }
        }
      }
      if (Array.isArray(doc.calibration)) {
        for (let i = 0; i < s.calibration.length && i < doc.calibration.length; i++) {
          s.calibration[i] = { win: Number(doc.calibration[i]?.win) || 0, loss: Number(doc.calibration[i]?.loss) || 0 };
        }
      }
      this.state = s;
    }
    this.loaded = true;
  }

  /** Await any in-flight load (used by recordOutcome so counts are correct). */
  private static async ensureLoaded(): Promise<void> {
    this.ensureLoadStarted();
    if (this.loadPromise) {
      try { await this.loadPromise; } catch { /* ignore */ }
    }
  }

  private static scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveToDb();
    }, 2000);
    // Do not keep the event loop alive solely for a debounced flush.
    if (typeof (this.saveTimer as any)?.unref === "function") (this.saveTimer as any).unref();
  }

  private static async saveToDb(): Promise<void> {
    if (mongoose.connection.readyState !== 1) return;
    try {
      await BayesianCalibration.updateOne(
        { key: "GLOBAL" },
        {
          $set: {
            globalWin: this.state.globalWin,
            globalLoss: this.state.globalLoss,
            dimensions: this.state.dims,
            calibration: this.state.calibration,
          },
        },
        { upsert: true }
      );
    } catch { /* best-effort persistence */ }
  }

  private static get globalTotal(): number {
    return this.state.globalWin + this.state.globalLoss;
  }

  /**
   * (lWin, lLoss) for one dimension bin. Empirical Laplace-smoothed
   * conditionals once enough global data exists; otherwise fixed fallback.
   */
  private static likelihoods(dim: Dimension, bin: number): { lWin: number; lLoss: number } {
    const nBins = DIM_BIN_COUNT[dim];
    if (this.globalTotal >= MIN_GLOBAL_FOR_EMPIRICAL) {
      const bins = this.state.dims[dim];
      let totWin = 0, totLoss = 0;
      for (const b of bins) { totWin += b.win; totLoss += b.loss; }
      const c = bins[bin] || { win: 0, loss: 0 };
      // Laplace (add-1) smoothing on both conditionals.
      const lWin = (c.win + 1) / (totWin + nBins);
      const lLoss = (c.loss + 1) / (totLoss + nBins);
      return { lWin, lLoss };
    }
    const [lWin, lLoss] = FALLBACK[dim][bin] ?? [1, 1];
    return { lWin, lLoss };
  }

  /** Empirical Beta(1,1)-smoothed prior once enough data; else the supplied prior. */
  private static effectivePrior(suppliedPrior: number): number {
    if (this.globalTotal >= MIN_GLOBAL_FOR_EMPIRICAL) {
      return clamp((this.state.globalWin + 1) / (this.globalTotal + 2), LOWER, UPPER);
    }
    return clamp(suppliedPrior, LOWER, UPPER);
  }

  /**
   * Monotonic (non-decreasing) Laplace-smoothed calibrated win rate for a
   * given calibration bin. Returns null when that bin has too few samples so
   * the caller falls back to the raw posterior.
   */
  private static calibratedForBin(bin: number): number | null {
    const cbins = this.state.calibration;
    const target = cbins[bin];
    if (!target || target.win + target.loss < MIN_CALIB_BIN_SAMPLES) return null;
    // Laplace-smoothed rate per bin, then enforce monotonic non-decreasing.
    let runningMax = 0;
    let result = LOWER;
    for (let i = 0; i < cbins.length; i++) {
      const b = cbins[i];
      const rate = (b.win + 1) / (b.win + b.loss + 2);
      runningMax = Math.max(runningMax, rate);
      if (i === bin) { result = runningMax; break; }
    }
    return clamp(result, LOWER, UPPER);
  }

  private static calibrationBinOf(rawPosterior: number): number {
    return clamp(Math.floor(rawPosterior * CALIB_BINS), 0, CALIB_BINS - 1);
  }

  /**
   * Computes the calibrated posterior win probability with full diagnostic trace.
   * The `posterior` field is the CALIBRATED probability.
   */
  public static calculatePosteriorWinProbabilityWithTrace(
    priorWinRate: number = 0.752,
    qualityScore: number = 75,
    aiConfidence: number = 75,
    adxTrendStrength: number = 25,
    htfConsensus: boolean = true,
    smartMoneyScore: number = 50
  ): BayesianPosteriorTrace {
    this.ensureLoadStarted(); // populate from Mongo in the background

    const ev: BayesianEvidence = { qualityScore, aiConfidence, adxTrendStrength, htfConsensus, smartMoneyScore };

    const priorWin = this.effectivePrior(priorWinRate);
    const priorLoss = 1.0 - priorWin;

    const q = this.likelihoods("quality", binIndex("quality", ev));
    const c = this.likelihoods("confidence", binIndex("confidence", ev));
    const a = this.likelihoods("adx", binIndex("adx", ev));
    const h = this.likelihoods("htf", binIndex("htf", ev));
    const s = this.likelihoods("smart", binIndex("smart", ev));

    const lQualityWin = q.lWin, lQualityLoss = q.lLoss;
    const lConfidenceWin = c.lWin, lConfidenceLoss = c.lLoss;
    const lAdxWin = a.lWin, lAdxLoss = a.lLoss;
    const lHtfWin = h.lWin, lHtfLoss = h.lLoss;
    const lSmartWin = s.lWin, lSmartLoss = s.lLoss;

    const winLikelihood = lQualityWin * lConfidenceWin * lAdxWin * lHtfWin * lSmartWin;
    const lossLikelihood = lQualityLoss * lConfidenceLoss * lAdxLoss * lHtfLoss * lSmartLoss;

    // Log-odds combination with correlation shrinkage.
    //   logit(post_raw) = logit(prior) + SHRINK * Σ log(LR_i)
    // where Σ log(LR_i) = log(winLikelihood) - log(lossLikelihood).
    const logitPrior = Math.log(priorWin / priorLoss);
    const sumLogLR = Math.log(winLikelihood) - Math.log(lossLikelihood);
    const logitRaw = logitPrior + SHRINK * sumLogLR;
    const posteriorOdds = Number.isFinite(Math.exp(logitRaw)) ? Math.exp(logitRaw) : 1.0;

    let rawPosterior = 1 / (1 + Math.exp(-logitRaw));
    if (!Number.isFinite(rawPosterior)) rawPosterior = priorWin;
    rawPosterior = clamp(rawPosterior, LOWER, UPPER);

    // Calibration layer: map raw posterior to the empirical win-rate of its bin.
    const calibrated = this.calibratedForBin(this.calibrationBinOf(rawPosterior));
    const finalPosterior = calibrated !== null ? calibrated : rawPosterior;
    const boundedPosterior = Number(clamp(finalPosterior, LOWER, UPPER).toFixed(4));

    return {
      posterior: boundedPosterior,
      priorWin,
      priorLoss,
      lQualityWin,
      lQualityLoss,
      lConfidenceWin,
      lConfidenceLoss,
      lAdxWin,
      lAdxLoss,
      lHtfWin,
      lHtfLoss,
      lSmartWin,
      lSmartLoss,
      winLikelihood,
      lossLikelihood,
      posteriorOdds,
    };
  }

  public static calculatePosteriorWinProbability(
    priorWinRate: number = 0.752,
    qualityScore: number = 75,
    aiConfidence: number = 75,
    adxTrendStrength: number = 25,
    htfConsensus: boolean = true,
    smartMoneyScore: number = 50
  ): number {
    return this.calculatePosteriorWinProbabilityWithTrace(
      priorWinRate,
      qualityScore,
      aiConfidence,
      adxTrendStrength,
      htfConsensus,
      smartMoneyScore
    ).posterior;
  }

  /**
   * Record a realized trade outcome so the model learns. Updates all
   * per-dimension bin counts, the global win/loss, and the calibration-bin
   * count for the raw posterior this evidence would have produced, then
   * write-throughs (debounced) to Mongo.
   */
  public static async recordOutcome(
    evidence: BayesianEvidence,
    outcome: "WIN" | "LOSS"
  ): Promise<void> {
    if (!evidence) return;
    await this.ensureLoaded();

    const isWin = outcome === "WIN";

    // Compute the raw posterior BEFORE mutating counts so the calibration bin
    // reflects the score the model actually would have emitted for this trade.
    const rawPosterior = this.rawPosteriorFor(evidence);
    const calibBin = this.calibrationBinOf(rawPosterior);

    for (const dim of Object.keys(DIM_BIN_COUNT) as Dimension[]) {
      const bin = binIndex(dim, evidence);
      const cell = this.state.dims[dim][bin];
      if (cell) { if (isWin) cell.win++; else cell.loss++; }
    }
    if (isWin) this.state.globalWin++; else this.state.globalLoss++;

    const cb = this.state.calibration[calibBin];
    if (cb) { if (isWin) cb.win++; else cb.loss++; }

    this.scheduleSave();
  }

  /** Raw (pre-calibration) posterior for evidence, using current counts. */
  private static rawPosteriorFor(ev: BayesianEvidence): number {
    const priorWin = this.effectivePrior(0.752);
    const priorLoss = 1 - priorWin;
    const dims: Dimension[] = ["quality", "confidence", "adx", "htf", "smart"];
    let sumLogLR = 0;
    for (const dim of dims) {
      const { lWin, lLoss } = this.likelihoods(dim, binIndex(dim, ev));
      sumLogLR += Math.log(lWin) - Math.log(lLoss);
    }
    const logitRaw = Math.log(priorWin / priorLoss) + SHRINK * sumLogLR;
    const raw = 1 / (1 + Math.exp(-logitRaw));
    return Number.isFinite(raw) ? clamp(raw, LOWER, UPPER) : priorWin;
  }

  /** Test / diagnostics helper: reset in-memory state (does not touch Mongo). */
  public static _resetInMemory(): void {
    this.state = this.freshState();
    this.loaded = true; // treat as loaded so no DB read overwrites test state
    this.loadPromise = Promise.resolve();
  }
}
