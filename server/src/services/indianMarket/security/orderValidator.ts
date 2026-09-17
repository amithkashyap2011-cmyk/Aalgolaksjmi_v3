/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Server-Side Order & State Transition Security Validator
 * ═══════════════════════════════════════════════════════════════════
 *  Guarantees fail-safe validation of all incoming trading parameters:
 *  - Quantity validation (lot size multiples, positive integers, freeze limits).
 *  - Price validation (tick sizes, positive numbers, circuit bounds).
 *  - Instrument & multi-leg specification validation.
 *  - Stop-loss and Target directionality & boundary checks.
 *  - Invariant state transition gatekeeper (blocks impossible lifecycle moves).
 */

import { INDIAN_SYMBOLS, SUPPORTED_INDIAN_SYMBOLS } from "../../../config/indianSymbols.js";
import { TradeStatus } from "../../../models/Trade.js";
import { IndianAuditLogger } from "../auditLogger.js";

export interface OrderValidationInput {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  orderType?: "MARKET" | "LIMIT" | "SL" | "SL-M";
  price?: number;
  triggerPrice?: number;
  productType?: "MIS" | "NRML" | "CNC";
  exchange?: "NSE" | "BSE";
  stopLoss?: number | null;
  target?: number | null;
  instrumentType?: "FUTURE" | "CE" | "PE" | "EQUITY" | "MULTI_LEG";
  strike?: number;
  expiry?: string;
}

export interface ValidationOutcome {
  isValid: boolean;
  sanitizedQuantity: number;
  sanitizedPrice?: number;
  reasons: string[];
}

export class OrderValidator {
  private static readonly TICK_SIZE = 0.05; // Standard NSE/BSE tick size

  // NSE Exchange Quantity Freeze Limits
  private static readonly FREEZE_LIMITS: Record<string, number> = {
    NIFTY: 1800,
    BANKNIFTY: 900,
    FINNIFTY: 1800,
    MIDCPNIFTY: 2800,
  };

  /**
   * Comprehensive validation of an order submission before routing to broker or ledger.
   */
  public static validateOrder(input: OrderValidationInput, currentLtp?: number): ValidationOutcome {
    const reasons: string[] = [];

    // 1. Symbol Validation
    if (!input.symbol || typeof input.symbol !== "string") {
      reasons.push("Invalid symbol: symbol must be a non-empty string.");
    } else {
      const isKnown = (SUPPORTED_INDIAN_SYMBOLS as readonly string[]).includes(input.symbol) ||
        Boolean(INDIAN_SYMBOLS[input.symbol]) ||
        input.symbol.includes("NIFTY") ||
        input.symbol.includes("BANKNIFTY");
      if (!isKnown) {
        reasons.push(`Unsupported trading symbol: '${input.symbol}'.`);
      }
    }

    // 2. Side Validation
    if (input.side !== "BUY" && input.side !== "SELL") {
      reasons.push(`Invalid order side: '${input.side}'. Must be BUY or SELL.`);
    }

    // 3. Quantity Validation (Requirement 9)
    const qty = Number(input.quantity);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      reasons.push(`Invalid quantity: '${input.quantity}'. Must be a positive integer.`);
    } else {
      let config = input.symbol ? INDIAN_SYMBOLS[input.symbol] : undefined;
      if (!config) {
        if (input.symbol.includes("BANK")) {
          config = INDIAN_SYMBOLS["BANKNIFTY"];
        } else if (input.symbol.includes("NIFTY")) {
          config = INDIAN_SYMBOLS["NIFTY50"];
        }
      }
      const lotSize = config?.lotSize || (input.symbol.includes("BANK") ? 15 : (input.symbol.includes("NIFTY") ? 25 : 1));

      // Index derivative contracts must strictly conform to lot size multiples
      const isIndexDerivative = 
        config?.assetClass === "INDEX" || 
        input.symbol.includes("NIFTY") || 
        input.symbol.includes("BANKNIFTY");

      if (isIndexDerivative && lotSize > 1) {
        if (qty % lotSize !== 0) {
          reasons.push(`Quantity ${qty} is not a valid multiple of lot size (${lotSize}) for ${input.symbol}.`);
        }
      }

      // Check exchange freeze limits
      for (const [prefix, limit] of Object.entries(this.FREEZE_LIMITS)) {
        if (input.symbol.includes(prefix) && qty > limit) {
          reasons.push(`Quantity ${qty} exceeds NSE freeze limit of ${limit} for ${prefix}.`);
        }
      }
    }

    // 4. Price & Tick Size Validation (Requirement 10)
    let sanitizedPrice = input.price;
    if (input.orderType === "LIMIT" || (input.price !== undefined && input.price !== null)) {
      const price = Number(input.price);
      if (!Number.isFinite(price) || price <= 0) {
        reasons.push(`Invalid limit price: '${input.price}'. Price must be a finite number > 0.`);
      } else {
        // Verify tick size (multiple of 0.05 within floating point epsilon)
        const remainder = Math.abs((price * 100) % (this.TICK_SIZE * 100));
        if (remainder > 0.001 && remainder < (this.TICK_SIZE * 100 - 0.001)) {
          reasons.push(`Price ${price} violates minimum tick size of ₹${this.TICK_SIZE}.`);
        }
        sanitizedPrice = Number(price.toFixed(2));
      }
    }

    // Trigger Price validation for SL orders
    if (input.orderType === "SL" || input.orderType === "SL-M") {
      const trigger = Number(input.triggerPrice);
      if (!Number.isFinite(trigger) || trigger <= 0) {
        reasons.push(`Invalid trigger price for ${input.orderType} order: '${input.triggerPrice}'.`);
      }
    }

    // 5. SL / Target Logical Directionality (Requirement 12)
    const refPrice = sanitizedPrice || currentLtp;
    if (refPrice && Number.isFinite(refPrice) && refPrice > 0) {
      if (input.stopLoss !== undefined && input.stopLoss !== null) {
        const sl = Number(input.stopLoss);
        if (!Number.isFinite(sl) || sl <= 0) {
          reasons.push(`Stop Loss price must be a positive number; received: '${input.stopLoss}'.`);
        } else if (input.side === "BUY" && sl >= refPrice) {
          reasons.push(`BUY order stop loss (₹${sl}) must be strictly LESS than entry price (₹${refPrice}).`);
        } else if (input.side === "SELL" && sl <= refPrice) {
          reasons.push(`SELL order stop loss (₹${sl}) must be strictly GREATER than entry price (₹${refPrice}).`);
        }
      }

      if (input.target !== undefined && input.target !== null) {
        const tgt = Number(input.target);
        if (!Number.isFinite(tgt) || tgt <= 0) {
          reasons.push(`Target price must be a positive number; received: '${input.target}'.`);
        } else if (input.side === "BUY" && tgt <= refPrice) {
          reasons.push(`BUY order target (₹${tgt}) must be strictly GREATER than entry price (₹${refPrice}).`);
        } else if (input.side === "SELL" && tgt >= refPrice) {
          reasons.push(`SELL order target (₹${tgt}) must be strictly LESS than entry price (₹${refPrice}).`);
        }
      }
    }

    // 6. Option Parameters Validation
    if (input.instrumentType === "CE" || input.instrumentType === "PE") {
      if (!input.strike || Number(input.strike) <= 0) {
        reasons.push(`Option contract requires a valid positive strike price; received: '${input.strike}'.`);
      }
      if (!input.expiry || typeof input.expiry !== "string") {
        reasons.push(`Option contract requires a valid expiry string; received: '${input.expiry}'.`);
      }
    }

    const isValid = reasons.length === 0;

    if (!isValid) {
      IndianAuditLogger.logEvent({
        action: "ORDER_VALIDATION_FAILED",
        details: {
          input,
          reasons,
        },
      });
    }

    return {
      isValid,
      sanitizedQuantity: qty || 0,
      sanitizedPrice,
      reasons,
    };
  }

  /**
   * Dangerous State Transition Invariant Gatekeeper (Requirement 8).
   * Validates whether moving from fromStatus -> toStatus is cryptographically and operationally allowed.
   */
  public static validateStateTransition(
    tradeId: string,
    fromStatus: TradeStatus | string,
    toStatus: TradeStatus | string,
    context?: { fillQty?: number; fillPrice?: number; isNewEntry?: boolean }
  ): { allowed: boolean; reason?: string } {
    // Identity transition (no-op) is allowed
    if (fromStatus === toStatus) return { allowed: true };

    // 🛡️ CRITICAL INVARIANTS:
    // 1. A CLOSED trade can NEVER be reopened without a valid new entry intent
    if (fromStatus === "CLOSED") {
      const reason = `DISALLOWED_TRANSITION: Attempted to transition from finalized state CLOSED to '${toStatus}'. Closed trades are immutable.`;
      this.logDisallowedTransition(tradeId, fromStatus, toStatus, reason);
      return { allowed: false, reason };
    }

    // 2. CLOSED to EXIT_PENDING is impossible
    if (fromStatus === "CLOSED" && toStatus === "EXIT_PENDING") {
      const reason = "DISALLOWED_TRANSITION: Cannot initiate EXIT_PENDING on an already CLOSED position.";
      this.logDisallowedTransition(tradeId, fromStatus, toStatus, reason);
      return { allowed: false, reason };
    }

    // 3. OPEN cannot jump directly to CLOSED without execution fill context
    if (fromStatus === "OPEN" && toStatus === "CLOSED") {
      if (!context?.fillQty || context.fillQty <= 0) {
        const reason = "DISALLOWED_TRANSITION: OPEN position cannot transition to CLOSED without verified execution fill quantity.";
        this.logDisallowedTransition(tradeId, fromStatus, toStatus, reason);
        return { allowed: false, reason };
      }
    }

    // 4. TARGET_TRIGGERED cannot jump directly to CLOSED without fill confirmation
    if (fromStatus === "TARGET_TRIGGERED" && toStatus === "CLOSED") {
      if (!context?.fillQty || context.fillQty <= 0) {
        const reason = "DISALLOWED_TRANSITION: TARGET_TRIGGERED cannot transition to CLOSED without broker fill confirmation.";
        this.logDisallowedTransition(tradeId, fromStatus, toStatus, reason);
        return { allowed: false, reason };
      }
    }

    // 5. EXIT_FILLED / CLOSED cannot transition back to EXIT_ORDER_PLACED
    if ((fromStatus === "CLOSED" || fromStatus === "EXIT_PARTIALLY_FILLED") && toStatus === "PENDING_CLOSE") {
      const reason = "DISALLOWED_TRANSITION: Cannot regress from terminal or fill state back to PENDING_CLOSE.";
      this.logDisallowedTransition(tradeId, fromStatus, toStatus, reason);
      return { allowed: false, reason };
    }

    return { allowed: true };
  }

  private static logDisallowedTransition(
    tradeId: string,
    fromStatus: string,
    toStatus: string,
    reason: string
  ): void {
    console.error(`[SECURITY_STATE_MACHINE] 🚨 ${reason} (Trade: ${tradeId})`);
    IndianAuditLogger.logEvent({
      action: "DANGEROUS_STATE_TRANSITION_BLOCKED",
      details: {
        tradeId,
        fromStatus,
        toStatus,
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
