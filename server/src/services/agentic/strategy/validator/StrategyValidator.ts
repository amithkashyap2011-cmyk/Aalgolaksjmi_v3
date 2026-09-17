/**
 * ═══════════════════════════════════════════════════════════════════
 *  STRATEGY PRE-FLIGHT VALIDATOR
 * ═══════════════════════════════════════════════════════════════════
 *  Strict validation of strategy specifications prior to backtesting
 *  or lifecycle advancement.
 */

import { IStrategyDSL } from "../types.js";
import { StrategyDSLEvaluator } from "../dsl/StrategyDSL.js";

export interface IValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class StrategyValidator {
  private static readonly SUPPORTED_UNDERLYINGS = [
    "NIFTY",
    "BANKNIFTY",
    "FINNIFTY",
    "MIDCPNIFTY",
    "SENSEX",
    "RELIANCE",
    "HDFCBANK",
    "INFY",
    "TCS",
    "ICICIBANK",
  ];

  private static readonly SUPPORTED_TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "1d"];

  /**
   * Validates a complete Strategy DSL specification.
   */
  public static validateStrategy(dsl: IStrategyDSL): IValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Basic structural checks
    if (!dsl) {
      return { valid: false, errors: ["STRATEGY_NULL: Strategy definition is null or undefined."], warnings: [] };
    }

    if (!dsl.name || dsl.name.trim().length < 3) {
      errors.push("INVALID_NAME: Strategy name must be at least 3 characters.");
    }

    if (!dsl.underlying || !this.SUPPORTED_UNDERLYINGS.includes(dsl.underlying.toUpperCase())) {
      errors.push(
        `UNSUPPORTED_UNDERLYING: Instrument ${dsl.underlying} is not supported. Must be one of: ${this.SUPPORTED_UNDERLYINGS.join(
          ", "
        )}`
      );
    }

    if (!dsl.marketSegment || !["EQUITY", "FUTURES", "OPTIONS"].includes(dsl.marketSegment)) {
      errors.push("INVALID_MARKET_SEGMENT: Market segment must be EQUITY, FUTURES, or OPTIONS.");
    }

    // 2. Security validation (Forbidden tokens / SQL / Code injection)
    const securityCheck = StrategyDSLEvaluator.verifySecurity(dsl);
    if (!securityCheck.valid) {
      errors.push(securityCheck.error || "SECURITY_VIOLATION");
    }

    // 3. Entry rules validation
    if (!dsl.entry) {
      errors.push("MISSING_ENTRY_RULES: Strategy must specify entry rules.");
    } else {
      if (!["BUY", "SELL"].includes(dsl.entry.direction)) {
        errors.push("INVALID_DIRECTION: Entry direction must be BUY or SELL.");
      }

      if (!dsl.entry.timeframe || !this.SUPPORTED_TIMEFRAMES.includes(dsl.entry.timeframe)) {
        errors.push(
          `UNSUPPORTED_TIMEFRAME: Timeframe ${dsl.entry.timeframe} is invalid. Supported: ${this.SUPPORTED_TIMEFRAMES.join(
            ", "
          )}`
        );
      }

      if (!dsl.entry.conditions || dsl.entry.conditions.length === 0) {
        errors.push("NO_ENTRY_CONDITIONS: At least one entry condition must be defined.");
      } else {
        dsl.entry.conditions.forEach((cond, idx) => {
          if (!cond.indicator) {
            errors.push(`CONDITION_${idx}_INVALID: Missing indicator name.`);
          }
          if (!cond.operator) {
            errors.push(`CONDITION_${idx}_INVALID: Missing comparison operator.`);
          }
          if (cond.value === undefined || cond.value === null) {
            errors.push(`CONDITION_${idx}_INVALID: Comparison value is missing.`);
          }
          if (cond.period !== undefined && cond.period <= 0) {
            errors.push(`CONDITION_${idx}_INVALID: Indicator period must be positive.`);
          }
        });
      }

      // Options specific checks
      if (dsl.marketSegment === "OPTIONS") {
        if (!dsl.entry.instrumentType || !["CE", "PE"].includes(dsl.entry.instrumentType)) {
          errors.push("OPTIONS_TYPE_MISSING: Options strategies must specify instrumentType CE or PE.");
        }
        if (!dsl.entry.strikeSelection) {
          warnings.push("OPTIONS_STRIKE_DEFAULT: Strike selection unspecified; defaulting to ATM.");
        }
      }
    }

    // 4. Exit rules validation (COMPULSORY STOP-LOSS AND TARGET)
    if (!dsl.exit || !dsl.exit.rules || dsl.exit.rules.length === 0) {
      errors.push("MISSING_EXIT_RULES: Strategy must have defined exit rules.");
    } else {
      const hasStopLoss = dsl.exit.rules.some(
        (r) => r.type === "STOP_LOSS" && typeof r.value === "number" && r.value > 0
      );
      const hasTarget = dsl.exit.rules.some(
        (r) => r.type === "TARGET" && typeof r.value === "number" && r.value > 0
      );

      if (!hasStopLoss) {
        errors.push("UNBOUNDED_RISK_ERROR: Strategy must include a mandatory STOP_LOSS rule with a positive value.");
      }

      if (!hasTarget) {
        warnings.push("MISSING_TARGET_WARNING: Strategy has no explicit profit target. Trailing stop or EOD exit recommended.");
      }

      for (const rule of dsl.exit.rules) {
        if (rule.type === "STOP_LOSS" && rule.value > 10.0) {
          errors.push(`EXCESSIVE_STOP_LOSS: Stop loss of ${rule.value}% exceeds max permitted threshold of 10.0%.`);
        }
      }
    }

    // 5. Risk and Position Sizing validation
    if (!dsl.risk) {
      errors.push("MISSING_RISK_RULES: Strategy must define risk and sizing rules.");
    } else {
      if (dsl.risk.maxDailyLoss !== undefined && dsl.risk.maxDailyLoss <= 0) {
        errors.push("INVALID_DAILY_LOSS: Max daily loss must be greater than zero.");
      }
      if (dsl.risk.maxDrawdownPct !== undefined && (dsl.risk.maxDrawdownPct <= 0 || dsl.risk.maxDrawdownPct > 30)) {
        errors.push("INVALID_DRAWDOWN_LIMIT: Max drawdown percentage must be between 1% and 30%.");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
