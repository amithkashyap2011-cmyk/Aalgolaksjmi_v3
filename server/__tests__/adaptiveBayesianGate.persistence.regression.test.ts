import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * Regression 2026-09-30: AdaptiveBayesianGate's empirical calibration was
 * in-memory only, so every restart reverted the live entry gate to the strict
 * analytical prior until 25 same-regime closes re-accumulated.
 */
process.env.BAYESIAN_GATE_PERSIST_IN_TEST = "1";
import mongoose from "mongoose";
import { AdaptiveBayesianGate } from "../src/services/aqea/bayesian/AdaptiveBayesianGate.js";
import { BayesianGateRecord } from "../src/models/BayesianGateRecord.js";

const REGIME = "TEST_PERSIST_REGIME";
const features: any = {};
beforeAll(async () => { await connectIfAvailable(); });
afterAll(async () => {
  if (mongoose.connection.readyState === 1) await BayesianGateRecord.deleteMany({ regime: REGIME });
  await disconnectMongo();
});

test("outcomes are persisted and restored after a simulated restart", async () => {
  if (skipIfNoMongo()) return;
  await BayesianGateRecord.deleteMany({ regime: REGIME });
  for (let i = 0; i < 30; i++) {
    AdaptiveBayesianGate.recordOutcome({ regime: REGIME, realizedOutcome: i % 2 ? "WIN" : "LOSS", priorOdds: 0.5, posteriorProbability: 0.8, timestamp: Date.now() + i });
  }
  await new Promise((r) => setTimeout(r, 500)); // let write-through finish
  expect(await BayesianGateRecord.countDocuments({ regime: REGIME })).toBe(30);

  // Simulate a restart: wipe in-memory state, then trigger the lazy load.
  (AdaptiveBayesianGate as any).calibrationRecords = [];
  (AdaptiveBayesianGate as any).loadStarted = false;
  AdaptiveBayesianGate.evaluate(0.7, 0.1, features, REGIME as any, "LONG");
  await new Promise((r) => setTimeout(r, 500));

  const res = AdaptiveBayesianGate.evaluate(0.7, 0.1, features, REGIME as any, "LONG");
  expect(res.calibrationMethod).toBe("EMPIRICAL_BASE_RATE");
  expect(res.sampleCount).toBeGreaterThanOrEqual(30);
});
