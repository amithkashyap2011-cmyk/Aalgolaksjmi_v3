import { pickExplorationSide } from "../src/services/paperExplorer.js";

// 2026-09-27: exploration shorts went 7-21 (-$0.81) and price rose after 17 of
// 28 SELL signals, so the explorer is LONG-only unless explicitly re-enabled.
describe("pickExplorationSide", () => {
  test("strong BUY lead → BUY", () => {
    expect(pickExplorationSide(0.52, 0.2, false)).toBe("BUY");
  });

  test("strong SELL lead is skipped when shorts are disabled (default)", () => {
    expect(pickExplorationSide(0.2, 0.52, false)).toBeNull();
  });

  test("strong SELL lead → SELL only when shorts are re-enabled", () => {
    expect(pickExplorationSide(0.2, 0.52, true)).toBe("SELL");
  });

  test("below 45% or without a 10-point lead → no trade", () => {
    expect(pickExplorationSide(0.44, 0.1, true)).toBeNull();
    expect(pickExplorationSide(0.5, 0.45, true)).toBeNull();
  });
});
