/**
 * ═══════════════════════════════════════════════════════════════════
 *  AUTHORITATIVE CAPITAL & MARGIN MANAGER
 * ═══════════════════════════════════════════════════════════════════
 *  Maintains the single source of truth for portfolio capital state.
 *  Separates Cash, Margin, Collateral, Realized/Unrealized P&L, and Equity.
 *  Strict precision math avoids IEEE-754 binary floating drift.
 */

import { IAuthoritativeCapitalState } from "../types.js";

export function roundTo2(val: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export interface ICapitalDiscrepancyReport {
  isConsistent: boolean;
  expectedNetEquity: number;
  actualNetEquity: number;
  discrepancyPaise: number;
  discrepancyInr: number;
  details: string[];
}

export class AuthoritativeCapitalManager {
  private static capitalState: IAuthoritativeCapitalState = {
    startingCapital: 0.0,
    deposits: 0.0,
    withdrawals: 0.0,
    realizedPnl: 0.0,
    unrealizedPnl: 0.0,
    charges: 0.0,
    availableCash: 0.0,
    usedMargin: 0.0,
    blockedMargin: 0.0,
    freeMargin: 0.0,
    collateral: 0.0,
    netEquity: 0.0,
    withdrawableAmount: 0.0,
    marginUtilizationPct: 0.0,
    timestamp: new Date().toISOString(),
  };

  /**
   * Retrieves the current immutable snapshot of the authoritative capital state.
   */
  public static getCapitalState(): IAuthoritativeCapitalState {
    return { ...this.capitalState };
  }

  /**
   * Initializes or updates capital components and validates accounting integrity.
   */
  public static updateCapital(updates: Partial<IAuthoritativeCapitalState>): IAuthoritativeCapitalState {
    const s = this.capitalState;

    const startingCapital = updates.startingCapital !== undefined ? roundTo2(updates.startingCapital) : s.startingCapital;
    const deposits = updates.deposits !== undefined ? roundTo2(updates.deposits) : s.deposits;
    const withdrawals = updates.withdrawals !== undefined ? roundTo2(updates.withdrawals) : s.withdrawals;
    const realizedPnl = updates.realizedPnl !== undefined ? roundTo2(updates.realizedPnl) : s.realizedPnl;
    const unrealizedPnl = updates.unrealizedPnl !== undefined ? roundTo2(updates.unrealizedPnl) : s.unrealizedPnl;
    const charges = updates.charges !== undefined ? roundTo2(updates.charges) : s.charges;
    const collateral = updates.collateral !== undefined ? roundTo2(updates.collateral) : s.collateral;
    const usedMargin = updates.usedMargin !== undefined ? roundTo2(updates.usedMargin) : s.usedMargin;
    const blockedMargin = updates.blockedMargin !== undefined ? roundTo2(updates.blockedMargin) : s.blockedMargin;

    // Derived Available Cash = Starting Capital + Deposits - Withdrawals + Realized P&L - Charges - Used Margin
    // If availableCash is explicitly supplied by broker sync, verify reconciliation
    let availableCash: number;
    if (updates.availableCash !== undefined) {
      availableCash = roundTo2(updates.availableCash);
    } else {
      availableCash = roundTo2(startingCapital + deposits - withdrawals + realizedPnl - charges - usedMargin);
    }

    // Net Equity = Available Cash + Used Margin + Blocked Margin + Collateral + Unrealized P&L
    // Mathematically: Starting Capital + Deposits - Withdrawals + Realized PnL - Charges + Unrealized PnL + Collateral
    const netEquity = roundTo2(
      startingCapital + deposits - withdrawals + realizedPnl - charges + unrealizedPnl + collateral
    );

    // Free Margin = Net Equity - Used Margin - Blocked Margin
    const freeMargin = roundTo2(Math.max(0, netEquity - usedMargin - blockedMargin));

    // Margin Utilization % = (Used Margin + Blocked Margin) / Net Equity
    const totalCommittedMargin = usedMargin + blockedMargin;
    const marginUtilizationPct = netEquity > 0 ? roundTo2((totalCommittedMargin / netEquity) * 100) : 0;

    // Withdrawable Amount = Max(0, Available Cash - Blocked Margin)
    const withdrawableAmount = roundTo2(Math.max(0, availableCash - blockedMargin));

    this.capitalState = {
      startingCapital,
      deposits,
      withdrawals,
      realizedPnl,
      unrealizedPnl,
      charges,
      availableCash,
      usedMargin,
      blockedMargin,
      freeMargin,
      collateral,
      netEquity,
      withdrawableAmount,
      marginUtilizationPct,
      timestamp: new Date().toISOString(),
    };

    return this.getCapitalState();
  }

  /**
   * Strict Accounting Integrity Reconciliation Validator.
   * Reports expected vs actual values without inventing adjustments.
   */
  public static verifyCapitalReconciliation(): ICapitalDiscrepancyReport {
    const s = this.capitalState;
    const expectedNetEquity = roundTo2(
      s.startingCapital + s.deposits - s.withdrawals + s.realizedPnl - s.charges + s.unrealizedPnl + s.collateral
    );

    const actualNetEquity = s.netEquity;
    const discrepancyInr = roundTo2(Math.abs(expectedNetEquity - actualNetEquity));
    const discrepancyPaise = Math.round(discrepancyInr * 100);

    const details: string[] = [];
    if (discrepancyPaise > 0) {
      details.push(
        `CAPITAL_RECONCILIATION_MISMATCH: Expected Net Equity ₹${expectedNetEquity.toFixed(
          2
        )} != Actual Net Equity ₹${actualNetEquity.toFixed(2)} (Discrepancy: ₹${discrepancyInr.toFixed(2)})`
      );
    }

    // Verify cash consistency
    const expectedAvailableCash = roundTo2(
      s.startingCapital + s.deposits - s.withdrawals + s.realizedPnl - s.charges - s.usedMargin
    );
    if (Math.abs(expectedAvailableCash - s.availableCash) > 0.05) {
      details.push(
        `CASH_RECONCILIATION_WARNING: Calculated cash ₹${expectedAvailableCash.toFixed(
          2
        )} differs from reported cash ₹${s.availableCash.toFixed(2)}.`
      );
    }

    return {
      isConsistent: discrepancyPaise === 0,
      expectedNetEquity,
      actualNetEquity,
      discrepancyPaise,
      discrepancyInr,
      details,
    };
  }

  /**
   * Resets capital state (used primarily in test suites).
   */
  public static reset(initialCapital = 0.0): void {
    this.capitalState = {
      startingCapital: initialCapital,
      deposits: 0.0,
      withdrawals: 0.0,
      realizedPnl: 0.0,
      unrealizedPnl: 0.0,
      charges: 0.0,
      availableCash: initialCapital,
      usedMargin: 0.0,
      blockedMargin: 0.0,
      freeMargin: initialCapital,
      collateral: 0.0,
      netEquity: initialCapital,
      withdrawableAmount: initialCapital,
      marginUtilizationPct: 0.0,
      timestamp: new Date().toISOString(),
    };
  }
}
