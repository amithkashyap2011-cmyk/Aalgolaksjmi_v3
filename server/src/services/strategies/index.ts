/*
 * ─── Strategy Index ────────────────────────────────────
 *
 * Central barrel export for all named strategies.
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
