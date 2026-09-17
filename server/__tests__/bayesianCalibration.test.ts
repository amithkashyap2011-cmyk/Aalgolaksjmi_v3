/*
 * ─── Calibrated Bayesian win-probability engine ───────────────────────
 *
 * Exercises the PURE in-memory math of BayesianProbabilityEngine — no DB.
 * _resetInMemory() marks state as loaded, so no Mongo read/write occurs.
 */
import {
  BayesianProbabilityEngine,
  type BayesianEvidence,
} from "../src/services/aqea/bayesianPredictor";

const HIGH: BayesianEvidence = {
  qualityScore: 95,
  aiConfidence: 90,
  adxTrendStrength: 30,
  htfConsensus: true,
  smartMoneyScore: 80,
};
const LOW: BayesianEvidence = {
  qualityScore: 50,
  aiConfidence: 50,
  adxTrendStrength: 10,
  htfConsensus: false,
  smartMoneyScore: 30,
};

function trace(ev: BayesianEvidence) {
  return BayesianProbabilityEngine.calculatePosteriorWinProbabilityWithTrace(
    0.752,
    ev.qualityScore,
    ev.aiConfidence,
    ev.adxTrendStrength,
    ev.htfConsensus,
    ev.smartMoneyScore
  );
}

async function record(ev: BayesianEvidence, outcome: "WIN" | "LOSS", n: number) {
  for (let i = 0; i < n; i++) {
    await BayesianProbabilityEngine.recordOutcome(ev, outcome);
  }
}

beforeEach(() => {
  BayesianProbabilityEngine._resetInMemory();
});

describe("cold-start", () => {
  it("returns a finite probability bounded to [0.001, 0.999]", () => {
    const cases: BayesianEvidence[] = [
      HIGH,
      LOW,
      { qualityScore: 100, aiConfidence: 100, adxTrendStrength: 100, htfConsensus: true, smartMoneyScore: 100 },
      { qualityScore: 0, aiConfidence: 0, adxTrendStrength: 0, htfConsensus: false, smartMoneyScore: 0 },
      { qualityScore: NaN, aiConfidence: NaN, adxTrendStrength: NaN, htfConsensus: false, smartMoneyScore: NaN },
    ];
    for (const ev of cases) {
      const p = trace(ev).posterior;
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0.001);
      expect(p).toBeLessThanOrEqual(0.999);
    }
  });

  it("ranks a strong setup above a weak setup on day one", () => {
    expect(trace(HIGH).posterior).toBeGreaterThan(trace(LOW).posterior);
  });
});

describe("learning from outcomes", () => {
  it("raises the likelihood ratio and posterior for a repeatedly-winning high-evidence bin", async () => {
    const before = trace(HIGH);
    const lrBefore = before.lQualityWin / before.lQualityLoss;

    // 40 wins on high evidence, 40 losses on low evidence → crosses the
    // MIN_GLOBAL_FOR_EMPIRICAL threshold and learns the mapping.
    await record(HIGH, "WIN", 40);
    await record(LOW, "LOSS", 40);

    const after = trace(HIGH);
    const lrAfter = after.lQualityWin / after.lQualityLoss;

    expect(lrAfter).toBeGreaterThan(1);
    expect(lrAfter).toBeGreaterThan(lrBefore);
    expect(after.posterior).toBeGreaterThan(before.posterior);
    // And the losing low-evidence setup is now scored below the winner.
    expect(trace(LOW).posterior).toBeLessThan(after.posterior);
  });

  it("keeps counts in memory across calls (empirical prior shifts)", async () => {
    const priorBefore = trace(HIGH).priorWin; // supplied 0.752 while cold
    await record(HIGH, "WIN", 30);
    const priorAfter = trace(HIGH).priorWin; // now empirical Beta(1,1): 31/32
    expect(priorAfter).toBeGreaterThan(0.9);
    expect(priorAfter).not.toBe(priorBefore);
  });
});

describe("calibration monotonicity", () => {
  it("returns non-decreasing posteriors across an increasing-evidence sweep", async () => {
    // Train so that better quality wins more often.
    await record(HIGH, "WIN", 50);
    await record(LOW, "LOSS", 50);
    await record({ ...HIGH, qualityScore: 82 }, "WIN", 20);
    await record({ ...HIGH, qualityScore: 82 }, "LOSS", 20);

    const qualities = [40, 55, 65, 72, 82, 90, 95];
    let prev = -Infinity;
    for (const q of qualities) {
      const p = trace({ ...HIGH, qualityScore: q }).posterior;
      expect(p).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = p;
    }
  });
});

describe("never NaN", () => {
  it("recordOutcome ignores missing evidence and posterior stays valid", async () => {
    await expect(
      BayesianProbabilityEngine.recordOutcome(undefined as any, "WIN")
    ).resolves.toBeUndefined();
    const p = BayesianProbabilityEngine.calculatePosteriorWinProbability();
    expect(Number.isFinite(p)).toBe(true);
  });
});
