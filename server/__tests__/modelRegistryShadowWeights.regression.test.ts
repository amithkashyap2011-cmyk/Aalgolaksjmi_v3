import { describe, it, expect } from "@jest/globals";
import { applyDynamicMarketWeights, getModel } from "../src/services/modelRegistry.js";

describe("shadow-only models keep weight 0 through dynamic re-weighting", () => {
  it("transformer (collapsed checkpoint) and mamba stay at 0 for every regime; real models still get weight", () => {
    for (const [vol, adx] of [[0.02, 30], [0.005, 30], [0.005, 15], [0.005, 22], [0.02, null]] as const) {
      applyDynamicMarketWeights(vol, adx as any);
      expect(getModel("transformer")?.weight).toBe(0);
      expect(getModel("mamba-hybrid")?.weight).toBe(0);
      expect(getModel("cnn")?.weight).toBeGreaterThanOrEqual(0.05);
    }
  });
});
