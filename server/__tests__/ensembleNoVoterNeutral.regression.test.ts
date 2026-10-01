import { describe, it, expect } from "@jest/globals";
import { aggregateContributions } from "../src/services/ensembleService.js";

const m = (name: string, category: string, weight: number, pLong: number, conf = 0.6): any => ({
  modelName: name, category, weight, longProbability: pLong, shortProbability: 1 - pLong, confidence: conf,
  expectedReturn: 0.01, expectedDrawdown: 0.05, notes: "",
});

describe("ensemble aggregation with no weighted voter", () => {
  it("is neutral (0.5/0.5, confidence 0) when every voter has weight 0 — not 0/0 and not a heuristic-driven signal", () => {
    const r = aggregateContributions([m("heuristic-tabular", "HEURISTIC", 0, 0.75), m("cnn-1d", "DEEP_LEARNING", 0, 0.5, 0)], 0.5);
    expect(r.longProbability).toBe(0.5);
    expect(r.shortProbability).toBe(0.5);
    expect(r.confidence).toBe(0);
  });

  it("ignores REINFORCEMENT weight (PPO is a sizing agent, not a directional voter)", () => {
    const r = aggregateContributions([m("ppo", "REINFORCEMENT", 0.4, 0.5), m("cnn-1d", "DEEP_LEARNING", 0, 0.5, 0)], 0.5);
    expect(r.longProbability).toBe(0.5);
    expect(r.confidence).toBe(0);
  });

  it("still averages by weight when a real voter has weight", () => {
    const r = aggregateContributions([m("cnn-1d", "DEEP_LEARNING", 0.3, 0.8), m("lstm", "DEEP_LEARNING", 0.1, 0.4)], 0.5);
    expect(r.longProbability).toBeCloseTo((0.8 * 0.3 + 0.4 * 0.1) / 0.4, 5);
  });
});
