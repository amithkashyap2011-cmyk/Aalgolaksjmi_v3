/*
 * Regression (2026-09-24): Indian evaluation presented rule formulas as AI
 * models ("TRANSFORMER_V8", "MAMBA_HYBRID", "MICROSTRUCTURE_NN") with invented
 * confidences, default RSI 55 / ADX 25, and a made-up 65% on HOLD.
 */
import { IndianMarketService } from "../src/services/indianMarketService.js";

test("votes are named for what they are and only exist with real inputs", async () => {
  const r = await IndianMarketService.evaluateIndianSymbol("RELIANCE", "guest-user", {
    ltp: 1219.2, open: 1248, high: 1250, low: 1215, close: 1219.2, volume: 1_000_000,
    // no rsi14 / adx14 → no trend vote (was defaulted to RSI 55 / ADX 25)
  } as any);
  const names = Object.keys(r.decision.aiModelVotes);
  expect(names.some((n) => /TRANSFORMER|MAMBA|MICROSTRUCTURE|_NN/.test(n))).toBe(false);
  expect(names).not.toContain("RULE_TREND_RSI");
  expect(names).toContain("RULE_PRICE_VS_OPEN"); // −2.3% vs open is a real input
  expect(r.decision.aiModelVotes.RULE_PRICE_VS_OPEN.direction).toBe("SHORT");
  expect(r.decision.reasons.join(" ")).toMatch(/Rule-based consensus/);
});

test("HOLD carries the actual consensus score, not a made-up 65%", async () => {
  const r = await IndianMarketService.evaluateIndianSymbol("TCS", "guest-user", {
    ltp: 2087, open: 2087, high: 2090, low: 2080, close: 2087, volume: 500_000,
  } as any);
  if (r.decision.decision === "HOLD") expect(r.decision.confidence).not.toBe(65);
  expect(r.decision.confidence).toBeLessThanOrEqual(98);
});
