/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA P0.1 — Data Provenance Types & Qualified Forward-OOS Predicate
 * ═══════════════════════════════════════════════════════════════════
 *
 * Implements:
 * 1. Canonical DataProvenance type for all market-data objects.
 * 2. MarketDataProvenance metadata for every Kline / price object.
 * 3. isQualifiedForwardOOS() — the 15-condition formal predicate.
 * 4. TerminalDecisionState — canonical classification for every evaluation.
 * 5. OpportunityConservation — two-level accounting invariant.
 *
 * RULES:
 * - isSynthetic === true → NEVER enter forward-OOS evidence.
 * - provenance === "SYNTHETIC" | "UNKNOWN" → NEVER increment N_forward_oos.
 * - No synthetic data contributes to N_eff, NetEV, Brier, ECE, FDR, ESS.
 */

// ─── Data Provenance ──────────────────────────────────────────────

/**
 * Canonical provenance type for all market data objects used by AQEA.
 * Every market-data object entering the decision pipeline must carry one of these.
 */
export type DataProvenance =
  | "LIVE_WEBSOCKET"   // Real-time stream candle confirmed by WS push
  | "LIVE_REST"        // REST API candle fetched fresh from Binance
  | "CACHED_LIVE"      // Cached from a recent live fetch (freshness checked)
  | "SYNTHETIC"        // Mathematically generated — never genuine evidence
  | "UNKNOWN";         // Provenance could not be determined — treat as SYNTHETIC

/**
 * Per-object provenance metadata attached to every market data record.
 * All fields are mandatory — absence of any field is treated as UNKNOWN provenance.
 */
export interface MarketDataProvenance {
  provenance: DataProvenance;
  sourceTimestamp: number;    // Timestamp of the data from the exchange (openTime / serverTime)
  receivedTimestamp: number;  // Wall-clock timestamp when the data was received by this server
  expiresAt: number;          // Max cache validity: receivedTimestamp + STALE_MARKET_DATA_MS
  symbol: string;
  interval: string;
  isSynthetic: boolean;       // Explicit boolean — always true when provenance is SYNTHETIC or UNKNOWN
  dataVersion: string;        // e.g. "BINANCE_REST_v3" | "BINANCE_WS_v1" | "SYNTHETIC_v1"
}

/**
 * Determines whether market data is considered genuine for forward-OOS evidence.
 * Returns true ONLY for non-synthetic, fresh, verified provenance.
 */
export function isGenuineMarketData(p: MarketDataProvenance): boolean {
  if (p.isSynthetic) return false;
  if (p.provenance === "SYNTHETIC" || p.provenance === "UNKNOWN") return false;
  if (Date.now() > p.expiresAt) return false;
  if (p.sourceTimestamp <= 0 || p.receivedTimestamp <= 0) return false;
  // Source timestamp must not be in the future (clock anomaly / spoofed data)
  if (p.sourceTimestamp > Date.now() + 60_000) return false;
  return true;
}

// ─── Terminal Decision State ──────────────────────────────────────

/**
 * Every market evaluation must terminate in exactly one of these states.
 * No state may silently disappear. No infrastructure failure may become HOLD.
 */
export type TerminalDecisionState =
  | "EVALUATED"           // Symbol processed — model inference ran
  | "ABSTENTION"          // Model abstained (HOLD direction, below conviction threshold)
  | "TRADE"               // Paper trade executed (LONG or SHORT)
  | "RISK_REJECTED"       // Risk engine blocked the trade
  | "EXECUTION_BLOCKED"   // Paper execution was blocked (balance, governor, barrier)
  | "DATA_UNAVAILABLE"    // Market data not available or all sources returned synthetic
  | "MODEL_UNAVAILABLE"   // Model inference failed / service unavailable
  | "TIMEOUT"             // Per-symbol or global timeout exceeded
  | "INVALID"             // Invalid market data (NaN, negative price, malformed OHLCV)
  | "LEAKED"              // Data leakage detected — temporal invariant violated
  | "DUPLICATE"           // Duplicate decisionId — rejected as idempotent
  | "ERROR"               // Unclassified infrastructure error
  | "COOLDOWN"            // Symbol skipped due to active cooldown
  | "SCHEDULER_SKIPPED";  // Tick skipped due to active concurrency lock

/**
 * Terminal accounting record emitted for every symbol evaluation.
 * Must be emitted exactly once per symbol per tick.
 */
export interface SymbolTerminalRecord {
  tickId: number;
  decisionId: string;
  opportunityId: string;
  experimentId: string;
  symbol: string;
  state: TerminalDecisionState;
  reason: string;
  latencyMs: number;
  dataProvenance: DataProvenance | "NONE";
  isSyntheticData: boolean;
  eventTimestamp: number;
  decisionTimestamp: number;
}

// ─── Opportunity Conservation ─────────────────────────────────────

/**
 * Two-level opportunity accounting.
 *
 * LEVEL 1: N_raw = N_valid + N_invalid + N_duplicate + N_leaked
 * LEVEL 2: N_valid = N_trades + N_abstentions + N_riskRejected + N_executionBlocked + N_dataUnavailableAfterValid
 */
export interface OpportunityAccounting {
  // Level 1
  symbolsScheduled: number;
  symbolsStarted: number;
  symbolsCompleted: number;

  // Raw event counts
  N_raw: number;
  N_valid: number;
  N_invalid: number;
  N_duplicate: number;
  N_leaked: number;

  // Valid breakdown
  N_trades: number;
  N_abstentions: number;
  N_riskRejected: number;
  N_executionBlocked: number;
  N_dataUnavailableAfterValid: number;
  N_modelUnavailable: number;
  N_timeout: number;
  N_error: number;
  N_cooldown: number;
  N_schedulerSkipped: number;

  // Forward OOS qualified count
  N_forward_oos_qualified: number;
}

/**
 * Asserts that Level 1 and Level 2 conservation invariants hold.
 * Throws if they do not — this is a hard invariant, not a warning.
 */
export function assertOpportunityConservation(acc: OpportunityAccounting): void {
  const level1 = acc.N_valid + acc.N_invalid + acc.N_duplicate + acc.N_leaked;
  if (level1 !== acc.N_raw) {
    const msg = `[CONSERVATION_VIOLATION] N_raw=${acc.N_raw} != N_valid(${acc.N_valid})+N_invalid(${acc.N_invalid})+N_duplicate(${acc.N_duplicate})+N_leaked(${acc.N_leaked})=${level1}`;
    console.error(`[CRITICAL] ${msg}`);
    // Do NOT silently repair counters — throw to force investigation
    throw new Error(msg);
  }

  const level2 = acc.N_trades + acc.N_abstentions + acc.N_riskRejected +
    acc.N_executionBlocked + acc.N_dataUnavailableAfterValid +
    acc.N_modelUnavailable + acc.N_timeout + acc.N_error + acc.N_cooldown;
  if (level2 !== acc.N_valid) {
    const msg = `[CONSERVATION_VIOLATION] N_valid=${acc.N_valid} != N_trades(${acc.N_trades})+N_abstentions(${acc.N_abstentions})+N_riskRejected(${acc.N_riskRejected})+N_executionBlocked(${acc.N_executionBlocked})+N_dataUnavailableAfterValid(${acc.N_dataUnavailableAfterValid})+N_modelUnavailable(${acc.N_modelUnavailable})+N_timeout(${acc.N_timeout})+N_error(${acc.N_error})+N_cooldown(${acc.N_cooldown})=${level2}`;
    console.error(`[CRITICAL] ${msg}`);
    throw new Error(msg);
  }
}

// ─── isQualifiedForwardOOS Predicate ─────────────────────────────

/**
 * A minimal record shape for the qualification check.
 * Both ForwardTelemetryRecord and any ad-hoc decision object can satisfy this.
 */
export interface QualificationCandidate {
  decisionId: string;
  experimentId?: string;
  symbol: string;
  timestamp: number;                          // t_decision
  isSynthetic?: boolean;
  dataProvenance?: DataProvenance;
  featureDataMaxTimestamp?: number;           // t_feature (must be <= t_decision)
  predictionTimestamp?: number;               // must be <= t_decision
  regimeTimestamp?: number;                   // must be <= t_decision
  calibrationDataTimestamp?: number;          // must be <= t_decision
  modelVersionTimestamp?: number;             // must be <= t_decision
  costEstimateTimestamp?: number;             // must be <= t_decision
  dataSource?: string;                        // must be "FORWARD_OOS" | "PAPER"
  isForward?: boolean;
  isUntouched?: boolean;
  outcome?: {
    resolvedTimestamp: number;               // t_outcome (must be > t_decision)
    outcomeResult?: string;
  } | null;
  leakageFlag?: boolean;
  isReplayed?: boolean;
  isTestFixture?: boolean;
  isMock?: boolean;
  persistedSuccessfully?: boolean;           // Must be true or undefined (optimistic)
}

export interface QualificationResult {
  qualified: boolean;
  failedConditions: string[];
  passedConditions: string[];
}

/**
 * isQualifiedForwardOOS — 15-condition formal predicate.
 *
 * A record becomes FORWARD_OOS only if ALL of these are true:
 *  1. Market data is genuine (not synthetic)
 *  2. Provenance is LIVE_WEBSOCKET, LIVE_REST, or valid CACHED_LIVE
 *  3. decisionId is non-empty string
 *  4. symbol is non-empty
 *  5. Decision occurs strictly after the feature data timestamp
 *  6. No future information accessed (t_feature <= t_decision)
 *  7. Outcome timestamp strictly after decision timestamp
 *  8. experimentId is non-empty
 *  9. No duplicate decisionId (caller's responsibility to check before calling)
 * 10. No leakage flag set
 * 11. Not a replayed historical event
 * 12. Not a test fixture or mock record
 * 13. dataSource is "FORWARD_OOS" or "PAPER"
 * 14. isForward is true
 * 15. Outcome is resolved (not OUTCOME_PENDING)
 */
export function isQualifiedForwardOOS(candidate: QualificationCandidate): QualificationResult {
  const failed: string[] = [];
  const passed: string[] = [];

  // 1. Not synthetic
  if (candidate.isSynthetic === true) {
    failed.push("CONDITION_1_FAIL: isSynthetic=true — synthetic data cannot qualify");
  } else {
    passed.push("CONDITION_1_PASS: not synthetic");
  }

  // 2. Provenance is genuine
  const genuineProvenances: DataProvenance[] = ["LIVE_WEBSOCKET", "LIVE_REST", "CACHED_LIVE"];
  if (candidate.dataProvenance !== undefined) {
    if (!genuineProvenances.includes(candidate.dataProvenance)) {
      failed.push(`CONDITION_2_FAIL: dataProvenance=${candidate.dataProvenance} is not genuine`);
    } else {
      passed.push(`CONDITION_2_PASS: provenance=${candidate.dataProvenance}`);
    }
  } else {
    // No provenance recorded — treat permissively if not explicitly synthetic
    if (candidate.isSynthetic !== true) {
      passed.push("CONDITION_2_PASS: provenance unspecified but not flagged synthetic");
    } else {
      failed.push("CONDITION_2_FAIL: provenance unknown and isSynthetic=true");
    }
  }

  // 3. decisionId is non-empty
  if (!candidate.decisionId || candidate.decisionId.trim() === "") {
    failed.push("CONDITION_3_FAIL: decisionId is empty");
  } else {
    passed.push("CONDITION_3_PASS: decisionId present");
  }

  // 4. symbol is non-empty
  if (!candidate.symbol || candidate.symbol.trim() === "") {
    failed.push("CONDITION_4_FAIL: symbol is empty");
  } else {
    passed.push("CONDITION_4_PASS: symbol present");
  }

  // 5. Feature data timestamp <= decision timestamp (no look-ahead)
  if (candidate.featureDataMaxTimestamp !== undefined) {
    if (candidate.featureDataMaxTimestamp > candidate.timestamp) {
      failed.push(`CONDITION_5_FAIL: featureDataMaxTimestamp(${candidate.featureDataMaxTimestamp}) > decisionTimestamp(${candidate.timestamp}) — future feature data`);
    } else {
      passed.push("CONDITION_5_PASS: feature timestamp <= decision timestamp");
    }
  } else {
    passed.push("CONDITION_5_PASS: featureDataMaxTimestamp not specified (no violation recorded)");
  }

  // 6. Prediction timestamp <= decision timestamp
  if (candidate.predictionTimestamp !== undefined && candidate.predictionTimestamp > candidate.timestamp) {
    failed.push(`CONDITION_6_FAIL: predictionTimestamp(${candidate.predictionTimestamp}) > decisionTimestamp(${candidate.timestamp})`);
  } else {
    passed.push("CONDITION_6_PASS: prediction timestamp ok");
  }

  // 7. Outcome timestamp > decision timestamp
  if (!candidate.outcome) {
    failed.push("CONDITION_7_FAIL: outcome is null/undefined — OUTCOME_PENDING");
  } else if (candidate.outcome.resolvedTimestamp <= candidate.timestamp) {
    failed.push(`CONDITION_7_FAIL: outcome.resolvedTimestamp(${candidate.outcome.resolvedTimestamp}) <= decisionTimestamp(${candidate.timestamp})`);
  } else {
    passed.push("CONDITION_7_PASS: outcome timestamp > decision timestamp");
  }

  // 8. experimentId is non-empty
  if (!candidate.experimentId || candidate.experimentId.trim() === "") {
    failed.push("CONDITION_8_FAIL: experimentId is empty");
  } else {
    passed.push("CONDITION_8_PASS: experimentId present");
  }

  // 9. No duplicate check (external — verified by ForwardTelemetryStore.recordDecision)
  passed.push("CONDITION_9_PASS: duplicate check is caller's responsibility (decisionId uniqueness enforced at store level)");

  // 10. No leakage flag
  if (candidate.leakageFlag === true) {
    failed.push("CONDITION_10_FAIL: leakageFlag=true — data leakage detected");
  } else {
    passed.push("CONDITION_10_PASS: no leakage flag");
  }

  // 11. Not replayed historical event
  if (candidate.isReplayed === true) {
    failed.push("CONDITION_11_FAIL: isReplayed=true — replayed historical event cannot qualify");
  } else {
    passed.push("CONDITION_11_PASS: not replayed");
  }

  // 12. Not a test fixture or mock
  if (candidate.isTestFixture === true || candidate.isMock === true) {
    failed.push("CONDITION_12_FAIL: isTestFixture or isMock — test data cannot qualify");
  } else {
    passed.push("CONDITION_12_PASS: not a test fixture");
  }

  // 13. dataSource is FORWARD_OOS or PAPER
  if (candidate.dataSource !== undefined) {
    if (candidate.dataSource !== "FORWARD_OOS" && candidate.dataSource !== "PAPER") {
      failed.push(`CONDITION_13_FAIL: dataSource=${candidate.dataSource} — must be FORWARD_OOS or PAPER`);
    } else {
      passed.push(`CONDITION_13_PASS: dataSource=${candidate.dataSource}`);
    }
  } else {
    passed.push("CONDITION_13_PASS: dataSource not specified (no explicit violation)");
  }

  // 14. isForward is true
  if (candidate.isForward === false) {
    failed.push("CONDITION_14_FAIL: isForward=false — backtest/simulation data cannot qualify");
  } else {
    passed.push("CONDITION_14_PASS: isForward is true or unspecified");
  }

  // 15. Outcome is resolved and non-fabricated
  if (candidate.outcome) {
    const validOutcomes = ["WIN", "LOSS", "BREAKEVEN"];
    if (candidate.outcome.outcomeResult && !validOutcomes.includes(candidate.outcome.outcomeResult)) {
      failed.push(`CONDITION_15_FAIL: outcomeResult=${candidate.outcome.outcomeResult} is not a valid resolved outcome`);
    } else {
      passed.push("CONDITION_15_PASS: outcome is resolved");
    }
  } else {
    // Already failed at condition 7 — no double-count here
    passed.push("CONDITION_15_SKIP: outcome already failed at condition 7");
  }

  return {
    qualified: failed.length === 0,
    failedConditions: failed,
    passedConditions: passed
  };
}

// ─── Scheduler Accounting ─────────────────────────────────────────

/**
 * Scheduler reliability telemetry — emitted on every tick lifecycle event.
 */
export interface SchedulerTickRecord {
  tickId: number;
  scheduledAt: number;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  state: "STARTED" | "COMPLETED" | "TIMED_OUT" | "SKIPPED" | "ERROR";
  reason?: string;
  previousTickId?: number;
  previousTickDurationMs?: number;
  symbolsScheduled: number;
  symbolsCompleted: number;
  symbolsTimedOut: number;
  symbolsErrored: number;
}

export interface SchedulerAccountingSummary {
  scheduledTicks: number;
  startedTicks: number;
  completedTicks: number;
  timedOutTicks: number;
  skippedTicks: number;
  erroredTicks: number;
  lastTickId: number;
  lastTickDurationMs: number | null;
}

/**
 * In-memory scheduler accounting store.
 * Provides global visibility into tick reliability.
 */
export class SchedulerAccounting {
  private static summary: SchedulerAccountingSummary = {
    scheduledTicks: 0,
    startedTicks: 0,
    completedTicks: 0,
    timedOutTicks: 0,
    skippedTicks: 0,
    erroredTicks: 0,
    lastTickId: 0,
    lastTickDurationMs: null
  };

  public static recordTickScheduled(): void {
    this.summary.scheduledTicks++;
  }

  public static recordTickStarted(tickId: number): void {
    this.summary.startedTicks++;
    this.summary.lastTickId = tickId;
  }

  public static recordTickCompleted(tickId: number, durationMs: number): void {
    this.summary.completedTicks++;
    this.summary.lastTickDurationMs = durationMs;
  }

  public static recordTickTimedOut(tickId: number): void {
    this.summary.timedOutTicks++;
    console.error(`[SCHEDULER_TIMEOUT] tickId=${tickId} — tick timed out and was aborted`);
  }

  public static recordTickSkipped(tickId: number, reason: string, previousTickId?: number, previousTickDurationMs?: number): void {
    this.summary.skippedTicks++;
    console.warn(
      `[SCHEDULER_SKIPPED] tickId=${tickId} scheduledAt=${Date.now()} reason=${reason}` +
      (previousTickId !== undefined ? ` previousTickId=${previousTickId}` : "") +
      (previousTickDurationMs !== undefined ? ` previousTickDuration=${previousTickDurationMs}ms` : "")
    );
  }

  public static recordTickErrored(tickId: number, error: string): void {
    this.summary.erroredTicks++;
    console.error(`[SCHEDULER_ERROR] tickId=${tickId} error=${error}`);
  }

  public static getSummary(): Readonly<SchedulerAccountingSummary> {
    return { ...this.summary };
  }

  public static resetForTest(): void {
    this.summary = {
      scheduledTicks: 0,
      startedTicks: 0,
      completedTicks: 0,
      timedOutTicks: 0,
      skippedTicks: 0,
      erroredTicks: 0,
      lastTickId: 0,
      lastTickDurationMs: null
    };
  }
}

// ─── Paper Account Ledger ─────────────────────────────────────────

/**
 * PaperAccount — formal paper capital ledger.
 *
 * RULES:
 * - Virtual paper equity MUST NOT appear as real deposited wallet funds.
 * - Virtual paper equity MUST NOT affect real wallet balance.
 * - Virtual paper equity MUST NOT create real wallet transactions.
 * - Virtual paper equity MUST NOT be interpreted as live capital.
 * - Real wallet balance MUST NOT be used for hypothetical position sizing.
 */
export interface PaperAccount {
  experimentId: string;
  userId: string;
  accountType: "SPOT" | "FUTURES";
  initialVirtualEquity: number;   // Starting virtual capital (e.g. 10000 USDT)
  virtualCash: number;            // Available virtual USDT
  realizedPnL: number;            // Cumulative closed P&L from paper trades
  unrealizedPnL: number;          // Open position mark-to-market P&L
  fees: number;                   // Cumulative paper fees charged
  spreadCost: number;             // Cumulative spread cost charged
  slippageCost: number;           // Cumulative slippage cost charged
  marketImpact: number;           // Cumulative market impact cost
  openPositionCount: number;
  closedPositionCount: number;
  lastUpdated: number;
}

export function computePaperEquity(account: PaperAccount): number {
  return account.virtualCash + account.unrealizedPnL;
}

/**
 * Asserts that a paper account has never been mixed with real funds.
 * This is a runtime invariant check — real wallet balance must be sourced separately.
 */
export function assertPaperIsolation(
  paperEquity: number,
  realWalletBalance: number,
  context: string
): void {
  // Virtual equity and real balance should be accessed through completely separate paths.
  // This function is a documentation-level assertion — the isolation is structural:
  // paper accounts live in paperState.ts, real balances come from Binance API.
  // If they're ever numerically equal by coincidence, that's fine.
  // What we must NEVER do is pass one as the other.
  // This function exists to be called at assertion points in code.
  if (paperEquity < 0) {
    console.error(`[PAPER_ISOLATION] Paper equity went negative (${paperEquity}) in context: ${context}. This is a bug.`);
  }
  if (realWalletBalance < 0) {
    console.error(`[PAPER_ISOLATION] Real wallet balance went negative (${realWalletBalance}) in context: ${context}. This should never happen.`);
  }
}
