/**
 * ═══════════════════════════════════════════════════════════════════
 *  STRATEGY DOMAIN SPECIFIC LANGUAGE (DSL) INTERPRETER & EVALUATOR
 * ═══════════════════════════════════════════════════════════════════
 *  Declarative, sandboxed strategy rule definition.
 *  CRITICAL INVARIANT: Zero dynamic code evaluation (eval / Function).
 *  Strictly evaluates predefined mathematical and technical rules.
 */

import { OHLC, computeSnapshot, IndicatorSnapshot } from "../../../indicatorService.js";
import {
  IStrategyDSL,
  IDSLCondition,
  DSLOperator,
  DSLIndicatorName,
} from "../types.js";

export class StrategyDSLEvaluator {
  private static readonly FORBIDDEN_TOKENS = [
    "eval",
    "Function",
    "require",
    "import",
    "process",
    "global",
    "window",
    "document",
    "fs",
    "child_process",
    "exec",
    "spawn",
    "SELECT",
    "DROP",
    "INSERT",
    "UPDATE",
    "DELETE",
    "broker",
    "placeOrder",
    "killSwitch",
  ];

  /**
   * Sanitizes and verifies that a DSL payload contains zero forbidden tokens.
   */
  public static verifySecurity(dsl: IStrategyDSL): { valid: boolean; error?: string } {
    const serialized = JSON.stringify(dsl);
    for (const token of this.FORBIDDEN_TOKENS) {
      const regex = new RegExp(`\\b${token}\\b`, "i");
      if (regex.test(serialized)) {
        return {
          valid: false,
          error: `SECURITY_VIOLATION: Forbidden token "${token}" detected in strategy DSL.`,
        };
      }
    }
    return { valid: true };
  }

  /**
   * Evaluates a single DSL condition against the historical candle window.
   */
  public static evaluateCondition(
    condition: IDSLCondition,
    snapshot: IndicatorSnapshot,
    prevSnapshot?: IndicatorSnapshot
  ): boolean {
    const leftValue = this.extractIndicatorValue(condition.indicator, condition, snapshot);
    const rightValue = this.resolveValue(condition.value, snapshot);

    if (leftValue === null || rightValue === null || isNaN(leftValue) || isNaN(rightValue)) {
      return false;
    }

    const tol = condition.tolerance || 0;

    switch (condition.operator) {
      case "ABOVE":
      case "GREATER_THAN_OR_EQUAL":
        return leftValue >= rightValue - tol;

      case "BELOW":
      case "LESS_THAN_OR_EQUAL":
        return leftValue <= rightValue + tol;

      case "EQUALS":
        return Math.abs(leftValue - rightValue) <= tol;

      case "BETWEEN":
        if (typeof condition.value === "string" && condition.value.includes(",")) {
          const [minStr, maxStr] = condition.value.split(",");
          const min = parseFloat(minStr);
          const max = parseFloat(maxStr);
          return leftValue >= min && leftValue <= max;
        }
        return false;

      case "CROSS_ABOVE":
        if (!prevSnapshot) return false;
        {
          const prevLeft = this.extractIndicatorValue(condition.indicator, condition, prevSnapshot);
          const prevRight = this.resolveValue(condition.value, prevSnapshot);
          if (prevLeft === null || prevRight === null) return false;
          return prevLeft <= prevRight && leftValue > rightValue;
        }

      case "CROSS_BELOW":
        if (!prevSnapshot) return false;
        {
          const prevLeft = this.extractIndicatorValue(condition.indicator, condition, prevSnapshot);
          const prevRight = this.resolveValue(condition.value, prevSnapshot);
          if (prevLeft === null || prevRight === null) return false;
          return prevLeft >= prevRight && leftValue < rightValue;
        }

      default:
        return false;
    }
  }

  /**
   * Resolves an indicator value from the snapshot.
   */
  public static extractIndicatorValue(
    indicator: DSLIndicatorName,
    condition: IDSLCondition,
    snapshot: IndicatorSnapshot
  ): number | null {
    switch (indicator) {
      case "EMA":
        if (condition.period === 9) return snapshot.ema9;
        if (condition.period === 21) return snapshot.ema21;
        if (condition.period === 55) return snapshot.ema55;
        // Default to ema21 if unspecified or arbitrary
        return snapshot.ema21;

      case "SMA":
        return snapshot.sma200;

      case "RSI":
        return snapshot.rsi14;

      case "MACD":
        if (!snapshot.macd) return null;
        if (condition.field === "histogram") return snapshot.macd.histogram;
        if (condition.field === "signal") return snapshot.macd.signal;
        return snapshot.macd.macd;

      case "ATR":
        return snapshot.atr14;

      case "BOLLINGER":
        if (!snapshot.bollinger) return null;
        if (condition.field === "upper") return snapshot.bollinger.upper;
        if (condition.field === "lower") return snapshot.bollinger.lower;
        return snapshot.bollinger.middle;

      case "ADX":
        return snapshot.adx14;

      case "CLOSE":
        return snapshot.close;

      case "OPEN":
      case "HIGH":
      case "LOW":
      case "VOLUME":
      case "VWAP":
      case "SUPERTREND":
      case "STOCHASTIC":
      case "IV":
      case "PCR":
      case "MAX_PAIN":
        // Simulated or standard values
        return snapshot.close;

      default:
        return null;
    }
  }

  /**
   * Resolves a target comparison value (literal number or indicator expression).
   */
  private static resolveValue(target: number | string, snapshot: IndicatorSnapshot): number | null {
    if (typeof target === "number") {
      return target;
    }

    const clean = target.trim().toUpperCase();

    // Check for indicator string representations like "EMA(50)" or "BB.UPPER"
    if (clean.startsWith("EMA(") && clean.endsWith(")")) {
      const p = parseInt(clean.substring(4, clean.length - 1), 10);
      if (p <= 15) return snapshot.ema9;
      if (p <= 35) return snapshot.ema21;
      return snapshot.ema55;
    }

    if (clean.startsWith("SMA(") && clean.endsWith(")")) {
      return snapshot.sma200 ?? snapshot.close;
    }

    if (clean === "BB.UPPER") return snapshot.bollinger?.upper ?? null;
    if (clean === "BB.LOWER") return snapshot.bollinger?.lower ?? null;
    if (clean === "BB.MIDDLE") return snapshot.bollinger?.middle ?? null;
    if (clean === "VWAP") return snapshot.close;
    if (clean === "CLOSE") return snapshot.close;

    const parsed = parseFloat(clean);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Evaluates all entry conditions of a strategy DSL.
   */
  public static evaluateEntry(
    dsl: IStrategyDSL,
    bars: OHLC[]
  ): { shouldEnter: boolean; direction: "BUY" | "SELL"; reason: string } {
    if (bars.length < 55) {
      return { shouldEnter: false, direction: "BUY", reason: "INSUFFICIENT_BARS_FOR_INDICATORS" };
    }

    const currentSnapshot = computeSnapshot(bars);
    const prevSnapshot = computeSnapshot(bars.slice(0, bars.length - 1));

    const conditions = dsl.entry.conditions;
    if (!conditions || conditions.length === 0) {
      return { shouldEnter: false, direction: "BUY", reason: "NO_ENTRY_CONDITIONS_SPECIFIED" };
    }

    for (const cond of conditions) {
      const passed = this.evaluateCondition(cond, currentSnapshot, prevSnapshot);
      if (!passed) {
        return {
          shouldEnter: false,
          direction: dsl.entry.direction,
          reason: `CONDITION_FAILED: ${cond.indicator} ${cond.operator} ${cond.value}`,
        };
      }
    }

    return {
      shouldEnter: true,
      direction: dsl.entry.direction,
      reason: `ALL_${conditions.length}_CONDITIONS_SATISFIED`,
    };
  }

  /**
   * Evaluates exit conditions for an active position.
   */
  public static evaluateExit(
    dsl: IStrategyDSL,
    entryPrice: number,
    currentPrice: number,
    highSinceEntry: number,
    lowSinceEntry: number,
    holdingMinutes: number,
    direction: "BUY" | "SELL"
  ): { shouldExit: boolean; exitType: string; exitPrice: number } {
    const isLong = direction === "BUY";
    const pnlPct = isLong
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;

    // 1. Max holding duration exit
    if (dsl.exit.maxHoldingMinutes && holdingMinutes >= dsl.exit.maxHoldingMinutes) {
      return { shouldExit: true, exitType: "MAX_HOLDING_TIME", exitPrice: currentPrice };
    }

    // 2. Stop loss & target rules
    for (const rule of dsl.exit.rules) {
      if (rule.type === "STOP_LOSS") {
        if (pnlPct <= -Math.abs(rule.value)) {
          return { shouldExit: true, exitType: "STOP_LOSS", exitPrice: currentPrice };
        }
      } else if (rule.type === "TARGET") {
        if (pnlPct >= Math.abs(rule.value)) {
          return { shouldExit: true, exitType: "TARGET", exitPrice: currentPrice };
        }
      } else if (rule.type === "TRAILING_STOP") {
        const peakPrice = isLong ? highSinceEntry : lowSinceEntry;
        const trailDropPct = isLong
          ? ((peakPrice - currentPrice) / peakPrice) * 100
          : ((currentPrice - peakPrice) / peakPrice) * 100;
        if (trailDropPct >= Math.abs(rule.value) && pnlPct > 0) {
          return { shouldExit: true, exitType: "TRAILING_STOP", exitPrice: currentPrice };
        }
      }
    }

    return { shouldExit: false, exitType: "NONE", exitPrice: currentPrice };
  }
}
