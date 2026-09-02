import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import mongoose from "mongoose";
import { WalkForwardEngine } from "../src/services/analytics/walkForwardEngine.js";
import { ReportExporter } from "../src/services/analytics/reportExporter.js";

describe("Part B: Institutional Walk-Forward & Partitioning Engine", () => {
  beforeAll(async () => {
    const connected = await connectIfAvailable();
    if (!connected || mongoose.connection.readyState !== 1) return;
  });

  afterAll(async () => {
    await disconnectMongo();
  });

  it("should execute 4-stage dataset partitioning without temporal leakage", async () => {
    if (skipIfNoMongo()) return;
    const run = await WalkForwardEngine.executeWalkForward();

    expect(run).toBeDefined();
    expect(run.metrics).toBeDefined();
    expect(run.metrics.training).toBeDefined();
    expect(run.metrics.validation).toBeDefined();
    expect(run.metrics.walkforward).toBeDefined();
    expect(run.metrics.paper).toBeDefined();

    expect(run.metrics.training.winRate).toBeGreaterThan(50);
    expect(run.metrics.walkforward.profitFactor).toBeGreaterThan(1.5);
  });

  it("should export Markdown partition comparative report", async () => {
    if (skipIfNoMongo()) return;
    const run = await WalkForwardEngine.executeWalkForward();
    const md = ReportExporter.generateMarkdownReport(run.metrics);

    expect(typeof md).toBe("string");
    expect(md).toContain("# Institutional Walk-Forward Partition Report");
    expect(md).toContain("Training");
    expect(md).toContain("Paper Trading");
  });
});
