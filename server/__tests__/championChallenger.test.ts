import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import mongoose from "mongoose";
import { ChampionChallengerEngine } from "../src/services/championChallenger/championChallengerEngine.js";
import { PromotionEvaluator } from "../src/services/championChallenger/promotionEvaluator.js";
import { RollbackManager } from "../src/services/championChallenger/rollbackManager.js";
import { FeatureStoreService } from "../src/services/championChallenger/featureStoreService.js";
import { ModelVersion } from "../src/models/ModelVersion.js";

describe("Institutional Champion-Challenger & Self-Learning AI Platform", () => {
  beforeAll(async () => {
    const connected = await connectIfAvailable();
    if (!connected) return;
  });

  afterAll(async () => {
    await disconnectMongo();
  });

  it("1. Dual Prediction Engine — should execute simultaneous Champion & Challenger prediction", async () => {
    if (skipIfNoMongo()) return;
    const res = await ChampionChallengerEngine.executeDualPrediction("FinMamba-SSM", {});

    expect(res.champion).toBeDefined();
    expect(res.challenger).toBeDefined();
    expect(res.champion.role).toBe("CHAMPION");
    expect(res.challenger.role).toBe("CHALLENGER");
  });

  it("2 & 3. Promotion Evaluator — should reject promotion if evaluated trades < 1,000 or ΔPF < +0.10", () => {
    const rejection = PromotionEvaluator.evaluatePromotion(
      { profitFactor: 1.84, sharpeRatio: 1.82, maxDrawdownPct: 4.2, brierScore: 0.124, evaluatedTrades: 1200 },
      { profitFactor: 1.85, sharpeRatio: 1.83, maxDrawdownPct: 4.5, brierScore: 0.130, evaluatedTrades: 450 }
    );

    expect(rejection.eligible).toBe(false);
    expect(rejection.reasons.some((r) => r.includes("INSUFFICIENT_TRADES"))).toBe(true);
  });

  it("4. Statistical Promotion — should promote Challenger to Champion when all 5 criteria pass", async () => {
    if (skipIfNoMongo()) return;
    await ModelVersion.create({
      modelName: "TestModel-SSM",
      version: "v1.0-champ",
      role: "CHAMPION",
      liveProfitFactor: 1.60,
      liveSharpe: 1.50,
      totalEvaluatedTrades: 1200,
    });

    await ModelVersion.create({
      modelName: "TestModel-SSM",
      version: "v2.0-chal",
      role: "CHALLENGER",
      liveProfitFactor: 1.85,
      liveSharpe: 1.75,
      totalEvaluatedTrades: 1100,
    });

    const promotion = await PromotionEvaluator.promoteChallenger("TestModel-SSM", "v2.0-chal");

    expect(promotion.success).toBe(true);
    expect(promotion.promotedVersion).toBe("v2.0-chal");

    const newChamp = await ModelVersion.findOne({ modelName: "TestModel-SSM", role: "CHAMPION" });
    expect(newChamp?.version).toBe("v2.0-chal");
  });

  it("5. Instant Rollback — should execute 1-click rollback to previous version snapshot", async () => {
    if (skipIfNoMongo()) return;
    const rollback = await RollbackManager.executeRollback("TestModel-SSM");

    expect(rollback.success).toBe(true);
    expect(rollback.restoredVersion).toBe("v1.0-champ");

    const restoredChamp = await ModelVersion.findOne({ modelName: "TestModel-SSM", role: "CHAMPION" });
    expect(restoredChamp?.version).toBe("v1.0-champ");
  });

  it("6. Centralized Feature Store — should initialize feature registry with importance & correlation metrics", async () => {
    if (skipIfNoMongo()) return;
    const features = await FeatureStoreService.ensureFeaturesInitialized();

    expect(features.length).toBeGreaterThan(0);
    expect(features.some((f) => f.featureName === "VolumeDeltaImbalance")).toBe(true);
  });
});
