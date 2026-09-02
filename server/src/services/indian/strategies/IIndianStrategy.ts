/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Standardized Indian Strategy Interface
 * ═══════════════════════════════════════════════════════════════════
 */

import { IndianTradeSignal, IndianTradeObject, IndianStrategyType, IndianStrategyLeg } from "../types.js";

export interface StrategyEvaluationContext {
  underlying: string;
  spotPrice: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi14?: number;
  adx14?: number;
  vwap?: number;
  atr14?: number;
  supertrend?: "BULL" | "BEAR" | "NEUTRAL";
  pcr?: number;
  iv?: number;
  regime?: "TRENDING_BULL" | "TRENDING_BEAR" | "RANGING" | "HIGH_VOLATILITY";
}

export interface IIndianStrategy {
  strategyName: IndianStrategyType;
  description: string;
  isMultiLeg: boolean;
  evaluate(context: StrategyEvaluationContext): IndianTradeSignal | null;
  constructLegs(signal: IndianTradeSignal, spotPrice: number, quantity: number): IndianStrategyLeg[];
}
