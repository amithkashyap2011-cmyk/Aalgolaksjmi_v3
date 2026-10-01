import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  ModelEdgeGate,
  bucketOf,
  computeEdgeBuckets,
  decideEdge,
  EDGE_GATE_MIN_SAMPLES,
  type EdgeRow,
} from "../src/services/aqea/ai/ModelEdgeGate.js";
import { BasePredictor } from "../src/services/aqea/ai/BasePredictor.js";

/** n calls at `confidence`; `winFrac` of them move 0.5% in the called direction, the rest 0.5% against. */
function rows(n: number, confidence: number, winFrac: number, direction: "LONG" | "SHORT" = "LONG"): EdgeRow[] {
  const out: EdgeRow[] = [];
  for (let i = 0; i < n; i++) {
    const win = i < Math.round(n * winFrac);
    const up = direction === "LONG" ? win : !win;
    out.push({ direction, confidence, priceAtPrediction: 100, price25m: up ? 100.5 : 99.5 });
  }
  return out;
}

class FakePredictor extends BasePredictor {
  protected modelName = "FAKE_MODEL_V1";
  constructor(private dir: "LONG" | "SHORT" | "HOLD", private conf: number) { super(); }
  protected async runInference() {
    return { direction: this.dir, confidence: this.conf, probability: this.conf };
  }
}

describe("ModelEdgeGate (measured calibration veto)", () => {
  beforeEach(() => ModelEdgeGate.clear());

  it("buckets confidence in 0.1 steps and clamps the top end", () => {
    expect(bucketOf(0.5)).toBe(0.5);
    expect(bucketOf(0.69)).toBe(0.6);
    expect(bucketOf(0.8)).toBe(0.8);
    expect(bucketOf(1)).toBe(0.9);
    expect(bucketOf(0.9999)).toBe(0.9);
  });

  it("computes direction-adjusted hit rate and bps (SHORT wins when price falls)", () => {
    const b = computeEdgeBuckets(rows(200, 0.65, 0.75, "SHORT")).get(0.6)!;
    expect(b.n).toBe(200);
    expect(b.hitRate).toBeCloseTo(0.75, 5);
    expect(b.meanBps).toBeGreaterThan(0);
  });

  it("blocks a bucket with enough evidence of losing (CNN conf>=0.8 pattern: 28% hit)", () => {
    const buckets = computeEdgeBuckets(rows(EDGE_GATE_MIN_SAMPLES + 50, 0.85, 0.28));
    const d = decideEdge(buckets, 0.85);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/EDGE_GATE/);
  });

  it("allows a bucket that wins (CNN conf 0.5-0.7 pattern: 55% hit)", () => {
    const buckets = computeEdgeBuckets(rows(EDGE_GATE_MIN_SAMPLES + 50, 0.62, 0.55));
    expect(decideEdge(buckets, 0.62).allowed).toBe(true);
  });

  it("fails OPEN when the bucket has too little evidence or no data", () => {
    expect(decideEdge(computeEdgeBuckets(rows(EDGE_GATE_MIN_SAMPLES - 1, 0.85, 0.1)), 0.85).allowed).toBe(true);
    expect(decideEdge(new Map(), 0.85).allowed).toBe(true);
    expect(decideEdge(undefined, 0.85).allowed).toBe(true);
  });

  it("is always open under test with no seeded data (existing predictor tests unaffected)", async () => {
    const p = await new FakePredictor("LONG", 0.9).predict({ symbol: "BTCUSDT", market: { close: 100 } } as any);
    expect(p.direction).toBe("LONG");
  });

  it("BasePredictor neutralises a measured-losing bucket to HOLD/0 and keeps the raw call in meta", async () => {
    ModelEdgeGate.seedForTest("FAKE_MODEL_V1", rows(300, 0.85, 0.25));
    const p = await new FakePredictor("LONG", 0.85).predict({ symbol: "BTCUSDT", market: { close: 100 } } as any);
    expect(p.direction).toBe("HOLD");
    expect(p.confidence).toBe(0);
    expect((p.meta as any).edgeGated).toBe(true);
    expect((p.meta as any).rawDirection).toBe("LONG");
    expect((p.meta as any).rawConfidence).toBe(0.85);
  });

  it("BasePredictor passes a call whose bucket has a measured edge, and never gates HOLD", async () => {
    ModelEdgeGate.seedForTest("FAKE_MODEL_V1", [...rows(300, 0.85, 0.25), ...rows(300, 0.62, 0.56)]);
    const ok = await new FakePredictor("LONG", 0.62).predict({ symbol: "BTCUSDT", market: { close: 100 } } as any);
    expect(ok.direction).toBe("LONG");
    const hold = await new FakePredictor("HOLD", 0.85).predict({ symbol: "BTCUSDT", market: { close: 100 } } as any);
    expect(hold.direction).toBe("HOLD");
    expect((hold.meta as any)?.edgeGated).toBeUndefined();
  });

  it("can be switched off with AQEA_EDGE_GATE=false", async () => {
    ModelEdgeGate.seedForTest("FAKE_MODEL_V1", rows(300, 0.85, 0.25));
    process.env.AQEA_EDGE_GATE = "false";
    try {
      const p = await new FakePredictor("LONG", 0.85).predict({ symbol: "BTCUSDT", market: { close: 100 } } as any);
      expect(p.direction).toBe("LONG");
    } finally {
      delete process.env.AQEA_EDGE_GATE;
    }
  });
});
