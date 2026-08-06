import { AdaptiveRiskEngine } from "./server/src/services/adaptiveRiskEngine.ts";

const result = AdaptiveRiskEngine.calculate(
  "SELL",
  { rating: "NORMAL", score: 77 } as any,
  { regime: "SIDEWAYS_ACCUMULATION", score: 50 } as any,
  8.4,
  { entry: 606.58, atr: 6.0658 }
);

console.log(result);