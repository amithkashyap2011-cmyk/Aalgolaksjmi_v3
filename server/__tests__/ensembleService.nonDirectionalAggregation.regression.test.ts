/**
 * The dashboard ensemble report must not let the non-directional PPO
 * sizing/exit agent dilute directional probabilities or inflate confidence
 * (2026-09-23: PPO sat at a fixed 0.5/0.5 lean with ~0.997 confidence and up
 * to ~1/3 of the MoE weight).
 */

import { describe, it, expect } from "@jest/globals";
import { aggregateContributions, ModelContribution } from "../src/services/ensembleService";

function contribution(overrides: Partial<ModelContribution> & { modelName: string }): ModelContribution {
  return {
    category: "DEEP_LEARNING",
    weight: 0.25,
    longProbability: 0.5,
    shortProbability: 0.5,
    confidence: 0.5,
    expectedReturn: 0,
    expectedDrawdown: 0.1,
    notes: "",
    ...overrides,
  };
}

const cnnLong = contribution({ modelName: "cnn-1d", longProbability: 0.7, shortProbability: 0.3, confidence: 0.6 });
const ppo = contribution({ modelName: "ppo-execution", category: "REINFORCEMENT", weight: 0.4, confidence: 0.997 });

describe("aggregateContributions", () => {
  it("excludes the REINFORCEMENT agent from the directional average", () => {
    const withPpo = aggregateContributions([cnnLong, ppo], 0);
    const cnnOnly = aggregateContributions([cnnLong], 0);

    expect(withPpo.longProbability).toBeCloseTo(0.7, 6);
    expect(withPpo.longProbability).toBeCloseTo(cnnOnly.longProbability, 6);
    expect(withPpo.shortProbability).toBeCloseTo(0.3, 6);
  });

  it("does not let PPO's exit-style certainty inflate directional confidence", () => {
    const result = aggregateContributions([cnnLong, ppo], 0);
    expect(result.confidence).toBeCloseTo(0.6 * 0.98, 6);
  });

  it("still weights directional contributors against each other", () => {
    const cnnShort = contribution({ modelName: "lstm-bilstm", weight: 0.75, longProbability: 0.2, shortProbability: 0.8 });
    const result = aggregateContributions([cnnLong, cnnShort, ppo], 0);
    expect(result.longProbability).toBeCloseTo(0.25 * 0.7 + 0.75 * 0.2, 6);
  });
});
