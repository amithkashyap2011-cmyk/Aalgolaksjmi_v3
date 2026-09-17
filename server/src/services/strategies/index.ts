/*
 * ─── Strategy Index ────────────────────────────────────
 *
 * Central barrel export for all named strategies.
 *
 * ⚠️  SCOPE: these implementations run ONLY in the backtester
 * (routes/backtest.ts) and the manual quantum recommendation endpoint —
 * they are NOT the live auto-trade path. The live bot decides through
 * AQEAEngine.decide → LakshmiMasterRouter → aqea/quant/QuantStrategyRegistry,
 * which is a SEPARATE reimplementation of Aaryan/Aayush/Gayatri/Ohmkara/Lakshmi
 * on a 15-feature tensor with different logic, thresholds, and outputs. A
 * backtest here does NOT validate the live behaviour of the same-named strategy.
 *
 *  AARYAN   — "The Disciplined Warrior" (momentum + breakout)
 *  AAYUSH   — "The Patient Accumulator" (mean-reversion)
 *  GAYATRI  — "24-Signal Mantra Frequency" (harmonic composite)
 *  LAKSHMI  — "The Hybrid Goddess" (best-of-all, no-loss)
 *  OHMKARA  — "The Primordial Sound" (5-gate ultra-precision filter)
 *
 * Each strategy exports:
 *   evaluate<Name>(ind: IndicatorSnapshot) → StrategyResult
 */

export {
  evaluateAaryan,
  type StrategyResult as AaryanResult,
} from "./aaryanStrategy.js";

export {
  evaluateAayush,
  type StrategyResult as AayushResult,
} from "./aayushStrategy.js";

export {
  evaluateGayatri,
  type StrategyResult as GayatriResult,
  type GayatriSignalItem,
} from "./gayatriStrategy.js";

export {
  evaluateLakshmi,
  type StrategyResult as LakshmiResult,
  type LakshmiSubResults,
} from "./lakshmiStrategy.js";

export {
  evaluateOhmkara,
  type StrategyResult as OhmkaraResult,
  type OhmkaraGate,
} from "./ohmkaraStrategy.js";

/** All strategy names the bot knows */
export const STRATEGY_NAMES = [
  "LAKSHMI",
  "AARYAN",
  "AAYUSH",
  "GAYATRI",
  "OHMKARA",
] as const;

export type StrategyName = (typeof STRATEGY_NAMES)[number];
