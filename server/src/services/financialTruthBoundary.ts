/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI V3 — AUTHORITATIVE FINANCIAL TRUTH BOUNDARY
 * ═══════════════════════════════════════════════════════════════════
 *  Immutable infrastructure enforcing financial classification,
 *  explicit provenance tracking, and fail-closed mutation barriers.
 *
 *  MANDATORY LAWS:
 *   1. AI_ESTIMATE, DISPLAY_ONLY, and UNKNOWN_STALE are strictly forbidden
 *      from mutating balances, ledgers, equity, or margin.
 *   2. Global USD conversions are DISPLAY_ONLY and cannot grant crypto buying power.
 *   3. If authoritative data is unavailable, return UNKNOWN_STALE rather
 *      than fabricating defaults.
 * ═══════════════════════════════════════════════════════════════════
 */

export type FinancialClassification =
  | "AUTHORITATIVE"
  | "DERIVED"
  | "DISPLAY_ONLY"
  | "AI_ESTIMATE"
  | "UNKNOWN_STALE";

export interface FinancialProvenance {
  value: number;
  currency: string;
  market: "INDIA" | "CRYPTO" | "GLOBAL";
  accountType: string;
  mode: "PAPER" | "LIVE" | "BACKTEST";
  source: string;
  sourceTimestamp: string;
  calculatedAt: string;
  provenance: FinancialClassification;
  isAuthoritative: boolean;
  metadata?: Record<string, any>;
}

export class FinancialTruthViolationError extends Error {
  public readonly code = "FINANCIAL_TRUTH_VIOLATION";
  public readonly provenance: FinancialClassification;
  public readonly operation: string;

  constructor(provenance: FinancialClassification, operation: string, message: string) {
    super(`[FINANCIAL_TRUTH_VIOLATION:${provenance}] Cannot execute '${operation}': ${message}`);
    this.name = "FinancialTruthViolationError";
    this.provenance = provenance;
    this.operation = operation;
  }
}

export class FinancialTruthBoundary {
  /**
   * Asserts that a financial value possesses authoritative or strictly derived
   * provenance before allowing any balance, cash, margin, or ledger mutation.
   */
  public static assertAuthoritativeForMutation(
    prov: FinancialProvenance,
    operation: string
  ): void {
    if (
      prov.provenance === "AI_ESTIMATE" ||
      prov.provenance === "DISPLAY_ONLY" ||
      prov.provenance === "UNKNOWN_STALE" ||
      !prov.isAuthoritative
    ) {
      throw new FinancialTruthViolationError(
        prov.provenance,
        operation,
        `Financial value with provenance '${prov.provenance}' (source: ${prov.source}) cannot be used to mutate authoritative financial state.`
      );
    }
  }

  /**
   * Constructs an AUTHORITATIVE provenance record originating directly
   * from verified broker APIs or persistent immutable ledgers.
   */
  public static createAuthoritativeValue(params: {
    value: number;
    currency: string;
    market: "INDIA" | "CRYPTO";
    accountType: string;
    mode: "PAPER" | "LIVE" | "BACKTEST";
    source: string;
    sourceTimestamp?: string;
    metadata?: Record<string, any>;
  }): FinancialProvenance {
    const now = new Date().toISOString();
    return {
      value: params.value,
      currency: params.currency,
      market: params.market,
      accountType: params.accountType,
      mode: params.mode,
      source: params.source,
      sourceTimestamp: params.sourceTimestamp || now,
      calculatedAt: now,
      provenance: "AUTHORITATIVE",
      isAuthoritative: true,
      metadata: params.metadata,
    };
  }

  /**
   * Constructs a DERIVED provenance record computed deterministically
   * from authoritative inputs (e.g. Net Equity = Cash + Margin + Unrealized P&L).
   */
  public static createDerivedValue(params: {
    value: number;
    currency: string;
    market: "INDIA" | "CRYPTO";
    accountType: string;
    mode: "PAPER" | "LIVE" | "BACKTEST";
    source: string;
    inputProvenances: FinancialProvenance[];
    metadata?: Record<string, any>;
  }): FinancialProvenance {
    // Fail-closed: If ANY input is not authoritative/derived, derived output cannot be authoritative
    const allAuthoritative = params.inputProvenances.every(
      (p) => p.isAuthoritative && (p.provenance === "AUTHORITATIVE" || p.provenance === "DERIVED")
    );

    if (!allAuthoritative) {
      throw new FinancialTruthViolationError(
        "DERIVED",
        "calculate_derived_value",
        "Cannot compute authoritative derived value: one or more inputs lack authoritative provenance."
      );
    }

    const now = new Date().toISOString();
    return {
      value: params.value,
      currency: params.currency,
      market: params.market,
      accountType: params.accountType,
      mode: params.mode,
      source: params.source,
      sourceTimestamp: now,
      calculatedAt: now,
      provenance: "DERIVED",
      isAuthoritative: true,
      metadata: params.metadata,
    };
  }

  /**
   * Constructs a DISPLAY_ONLY provenance record (e.g., converting INR paper capital to USD).
   * This value is strictly read-only and can NEVER be used for order execution or wallet credit.
   */
  public static createDisplayConversion(params: {
    convertedValue: number;
    targetCurrency: string;
    sourceProvenance: FinancialProvenance;
    fxRate: number;
    fxSource: string;
  }): FinancialProvenance {
    const now = new Date().toISOString();
    return {
      value: params.convertedValue,
      currency: params.targetCurrency,
      market: "GLOBAL",
      accountType: "GLOBAL_DISPLAY",
      mode: params.sourceProvenance.mode,
      source: `DISPLAY_CONVERSION (${params.fxSource})`,
      sourceTimestamp: params.sourceProvenance.sourceTimestamp,
      calculatedAt: now,
      provenance: "DISPLAY_ONLY",
      isAuthoritative: false,
      metadata: {
        originalValue: params.sourceProvenance.value,
        originalCurrency: params.sourceProvenance.currency,
        fxRate: params.fxRate,
        fxSource: params.fxSource,
      },
    };
  }

  /**
   * Constructs an AI_ESTIMATE record (model expected return, confidence, suggested sizing).
   * AI estimates cannot be treated as account equity or buying power.
   */
  public static createAiEstimate(params: {
    value: number;
    currency: string;
    market: "INDIA" | "CRYPTO";
    agentId: string;
    modelVersion: string;
    confidence: number;
    rationale: string;
  }): FinancialProvenance {
    const now = new Date().toISOString();
    return {
      value: params.value,
      currency: params.currency,
      market: params.market,
      accountType: "AI_SIGNAL_ESTIMATE",
      mode: "PAPER",
      source: `AGENT_${params.agentId}_${params.modelVersion}`,
      sourceTimestamp: now,
      calculatedAt: now,
      provenance: "AI_ESTIMATE",
      isAuthoritative: false,
      metadata: {
        confidence: params.confidence,
        rationale: params.rationale,
      },
    };
  }

  /**
   * Constructs an UNKNOWN_STALE record when live broker feeds or data feeds are offline.
   * Fail-closed: Never substitute fabricated zeros or defaults.
   */
  public static createUnknownStale(params: {
    currency: string;
    market: "INDIA" | "CRYPTO";
    accountType: string;
    mode: "PAPER" | "LIVE";
    reason: string;
    lastKnownValue?: number;
    lastVerifiedTimestamp?: string;
  }): FinancialProvenance {
    const now = new Date().toISOString();
    return {
      value: params.lastKnownValue ?? NaN,
      currency: params.currency,
      market: params.market,
      accountType: params.accountType,
      mode: params.mode,
      source: `DATA_FEED_OFFLINE (${params.reason})`,
      sourceTimestamp: params.lastVerifiedTimestamp || "UNKNOWN",
      calculatedAt: now,
      provenance: "UNKNOWN_STALE",
      isAuthoritative: false,
      metadata: {
        offlineReason: params.reason,
      },
    };
  }
}
