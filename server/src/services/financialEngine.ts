/**
 * ═══════════════════════════════════════════════════════════════════════
 * FinancialCalculationEngine — Single Source of Truth
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ALL financial metric calculations live here. No other file may compute
 * portfolio equity, P&L, win rate, drawdown, or capital figures.
 *
 * Architecture rule:
 *   aqeaUi.ts  → calls buildDashboardPayload()  (data fetching + assembly)
 *   wallet.ts  → calls computeWalletBalance()   (balance for single wallet)
 *   analytics  → calls computeDomainMetrics()   (domain-scoped metrics)
 *
 * Data flows:
 *   MongoDB Trade (PAPER mode only)
 *     → enrichOpenPositions()  (adds markPrice + live pnl via 3-tier fallback)
 *     → computeDomainMetrics() (aggregates into typed DomainMetrics)
 *     → buildDashboardPayload() (assembles full API response)
 *
 * Invariants enforced here:
 *   - All Trade queries use { mode: "PAPER" } — BACKTEST/LIVE never mixed
 *   - openPnL is NEVER silently 0 due to missing price ticks
 *   - Portfolio Equity = spot_balance + spot_openPnl + futures_balance + futures_openPnl
 *   - Win Rate = closed wins / total closed (SENTINEL-filtered, PAPER only)
 *   - All-Time PnL = net realized (SENTINEL-filtered) + current open PnL
 */

import { enrichOpenTrades } from "./pnlService.js";

// ─── Sentinel reasons excluded from performance metrics ─────────────────────
export const SENTINEL_REASONS = new Set([
  "SENTINEL_AUTO_PURGE",
  "SENTINEL_BANKRUPTCY_CLEAR",
  "SENTINEL_INFLATION_CLEAR",
  "SENTINEL_LIQUIDATION",
]);

// ─── Account type domain classification ─────────────────────────────────────
export const INDIAN_ACCOUNT_TYPES = new Set([
  "INDIAN_NSE",
  "INDIAN_BSE",
  "INDIAN_NIFTY50",
  "INDIAN_FNO",
  "INDIAN_EQUITY",
]);

import { SUPPORTED_INDIAN_SYMBOLS } from "../config/indianSymbols.js";

export function isIndianTrade(t: any): boolean {
  if (!t) return false;
  if (t.accountType && INDIAN_ACCOUNT_TYPES.has(t.accountType)) return true;
  if (t.symbol && SUPPORTED_INDIAN_SYMBOLS.includes(t.symbol)) return true;
  return false;
}

export function isCryptoTrade(t: any): boolean {
  return !INDIAN_ACCOUNT_TYPES.has(t.accountType);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletBalances {
  /** Available USDT (crypto) or primary-currency liquid balance */
  spot: number;
  /** Available USDT in futures wallet (or F&O margin buffer) */
  futures: number;
}

export interface DomainInputs {
  closedTrades: any[];   // SENTINEL-filtered closed trades
  openTrades: any[];     // Enriched open trades (with .pnl from enrichOpenTrades)
  allTrades: any[];      // All PAPER trades for this domain (for trade counts)
  walletBalances: WalletBalances;
  openPnlByType: { spot: number; futures: number };
  investedByType: { spot: number; futures: number };
  notionalByType: { spot: number; futures: number };
  startOfDay: Date;
}

export interface DomainMetrics {
  totalEquity: number;
  dailyPnL: number;
  openPnL: number;
  totalAllTimePnL: number;
  openPositions: number;
  closedTrades: number;
  totalTrades: number;
  winRate: number;
  realizedWinRate: number;
  overallWinRate: number;
  profitFactor: number | "MAX";
  maxDrawdown: number;
  currentExposure: number;
  invested: { total: number; spot: number; futures: number };
  balances: { spot: number; futures: number };
  netPnL: { total: number; spot: number; futures: number };
}

// ─── Core Calculation: computeDomainMetrics ──────────────────────────────────

/**
 * Canonical formula for every dashboard metric within one domain (Crypto or Indian).
 *
 * INPUTS:
 *   closedTrades    — SENTINEL-filtered closed PAPER trades for this domain
 *   openTrades      — Open PAPER trades enriched with live pnl via enrichOpenTrades()
 *   walletBalances  — Liquid balances from in-memory paperState wallets
 *   openPnlByType   — Pre-summed open pnl (from enriched trades, split SPOT vs FUTURES)
 *   investedByType  — Margin in use per account type
 *   notionalByType  — Full notional value per account type
 *   startOfDay      — Midnight of current day for Daily P&L filter
 *
 * FORMULAS (canonical):
 *   totalEquity     = spot_balance + spot_openPnl + futures_balance + futures_openPnl
 *   dailyPnL        = Σ(pnl of trades closed TODAY) + openPnL
 *   openPnL         = openPnlByType.spot + openPnlByType.futures
 *   netRealized     = Σ(pnl of all SENTINEL-filtered closed trades)
 *   totalAllTimePnL = netRealized + openPnL
 *   winRate         = count(closed trades with pnl > 0) / count(all closed trades) × 100
 *   overallWinRate  = (closedWins + openWins) / (closedCount + openCount) × 100
 *   profitFactor    = grossProfit / grossLoss  (MAX if no losses)
 *   maxDrawdown     = peak-to-trough drawdown over closed trade equity curve
 */
export function computeDomainMetrics(inputs: DomainInputs): DomainMetrics {
  const {
    closedTrades,
    openTrades,
    allTrades,
    walletBalances,
    openPnlByType,
    investedByType,
    notionalByType,
    startOfDay,
  } = inputs;

  // ── Win / Loss counting ──────────────────────────────────────────────────
  const evaluatedClosedTrades = closedTrades.filter(t => t.exitReason !== "MANUAL_RESET");
  const closedWins   = evaluatedClosedTrades.filter(t => (t.pnl ?? 0) > 0).length;
  const closedLosses = evaluatedClosedTrades.filter(t => (t.pnl ?? 0) < 0).length;
  const closedDecisive = closedWins + closedLosses;
  const openWins     = openTrades.filter(t => (t.pnl ?? 0) > 0).length;

  let grossProfit = 0;
  let grossLoss   = 0;
  evaluatedClosedTrades.forEach(t => {
    const p = t.pnl ?? 0;
    if (p > 0) grossProfit += p;
    else if (p < 0) grossLoss += Math.abs(p);
  });
  const profitFactor: number | "MAX" =
    grossLoss > 0 ? grossProfit / grossLoss
    : grossProfit > 0 ? "MAX"
    : 0;

  // ── Financial Mathematical Invariants ─────────────────────────────────────
  const hasOpenPositions = openTrades.length > 0 || (openPnlByType.spot !== 0 || openPnlByType.futures !== 0) || (investedByType.spot !== 0 || investedByType.futures !== 0);
  const hasClosedTrades  = closedTrades.length > 0;

  const safeOpenPnlSpot    = hasOpenPositions ? openPnlByType.spot : 0;
  const safeOpenPnlFutures = hasOpenPositions ? openPnlByType.futures : 0;
  const openPnl            = safeOpenPnlSpot + safeOpenPnlFutures;

  const safeInvestedSpot    = hasOpenPositions ? investedByType.spot : 0;
  const safeInvestedFutures = hasOpenPositions ? investedByType.futures : 0;
  const totalInvested       = safeInvestedSpot + safeInvestedFutures;

  const safeNotionalSpot    = hasOpenPositions ? notionalByType.spot : 0;
  const safeNotionalFutures = hasOpenPositions ? notionalByType.futures : 0;
  const totalNotional       = safeNotionalSpot + safeNotionalFutures;

  // ── Daily P&L ────────────────────────────────────────────────────────────
  const todayClosedPnl = closedTrades
    .filter(t => t.closedAt && new Date(t.closedAt) >= startOfDay)
    .reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  const dailyPnL = todayClosedPnl + openPnl;


  // ── Portfolio Equity ──────────────────────────────────────────────────────
  // CANONICAL: equity = liquid_balances + invested_capital + unrealized_pnl
  const totalEquity =
    walletBalances.spot    + walletBalances.futures +
    totalInvested          +
    openPnl;

  const exposure = (hasOpenPositions && totalEquity > 0) ? (totalNotional / totalEquity) * 100 : 0;


  // ── Win Rate ──────────────────────────────────────────────────────────────
  const closedCount    = closedTrades.length;
  const openCount      = openTrades.length;
  const totalEvaluated = closedDecisive + openCount;

  const closedWinRate  = closedDecisive > 0 
    ? (closedWins / closedDecisive) * 100 
    : evaluatedClosedTrades.length > 0 
      ? (closedWins / evaluatedClosedTrades.length) * 100 
      : 0;
  const overallWinRate = totalEvaluated > 0
    ? ((closedWins + openWins) / totalEvaluated) * 100 
    : 0;

  // Use realized win rate when we have closed trades; fall back to overall
  const winRate = closedDecisive > 0 ? closedWinRate : (evaluatedClosedTrades.length > 0 ? closedWinRate : overallWinRate);


  // ── Net Realized P&L (SPOT vs FUTURES split) ─────────────────────────────
  let netPnlSpot    = 0;
  let netPnlFutures = 0;
  closedTrades.forEach(t => {
    const acct = t.accountType || "FUTURES";
    if (acct === "SPOT") netPnlSpot    += t.pnl ?? 0;
    else                 netPnlFutures += t.pnl ?? 0;
  });

  const netRealized    = netPnlSpot + netPnlFutures;
  const totalAllTimePnL = netRealized + openPnl;

  // ── Max Drawdown (peak-to-trough over closed trade equity curve) ──────────
  const lifetimeRealized = closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const startCap = walletBalances.futures - lifetimeRealized;
  let ddPeak = startCap;
  let ddRunning = startCap;
  let maxDrawdownPct = 0;

  [...closedTrades]
    .sort((a, b) =>
      new Date(a.closedAt ?? 0).getTime() - new Date(b.closedAt ?? 0).getTime()
    )
    .forEach(t => {
      ddRunning += t.pnl ?? 0;
      if (ddRunning > ddPeak) ddPeak = ddRunning;
      const dd = ddPeak > 0 ? ((ddPeak - ddRunning) / ddPeak) * 100 : 0;
      if (dd > maxDrawdownPct) maxDrawdownPct = dd;
    });

  // ── Return typed DomainMetrics ────────────────────────────────────────────
  const fix2 = (n: number) => parseFloat(n.toFixed(2));
  const fix1 = (n: number) => parseFloat(n.toFixed(1));

  return {
    totalEquity:    fix2(totalEquity),
    dailyPnL:       fix2(dailyPnL),
    openPnL:        fix2(openPnl),
    totalAllTimePnL: fix2(totalAllTimePnL),
    openPositions:  openCount,
    closedTrades:   closedCount,
    totalTrades:    allTrades.length,
    winRate:        fix1(winRate),
    realizedWinRate: fix1(closedWinRate),
    overallWinRate: fix1(overallWinRate),
    profitFactor:   typeof profitFactor === "number" ? fix2(profitFactor) : "MAX",
    maxDrawdown:    fix2(maxDrawdownPct),
    currentExposure: fix1(exposure),
    invested: {
      total:   fix2(investedByType.spot + investedByType.futures),
      spot:    fix2(investedByType.spot),
      futures: fix2(investedByType.futures),
    },
    balances: {
      spot:    fix2(walletBalances.spot),
      futures: fix2(walletBalances.futures),
    },
    netPnL: {
      total:   fix2(netRealized),
      spot:    fix2(netPnlSpot),
      futures: fix2(netPnlFutures),
    },
  };
}

// ─── Helper: build per-account-type open position aggregates ─────────────────

export function aggregateOpenByType(
  openTrades: any[],
  primaryType: string,   // "SPOT" | "INDIAN_NSE" | etc.
  secondaryType: string, // "FUTURES" | "INDIAN_NIFTY50" | etc.
): {
  openPnlByType:   { spot: number; futures: number };
  investedByType:  { spot: number; futures: number };
  notionalByType:  { spot: number; futures: number };
} {
  let openPnlSpot = 0,    openPnlFutures = 0;
  let investedSpot = 0,   investedFutures = 0;
  let notionalSpot = 0,   notionalFutures = 0;

  for (const t of openTrades) {
    const notional = t.quantity * t.entryPrice;
    const margin   = notional / (t.leverage || 1);
    const pnl      = t.pnl ?? 0;
    const acct     = t.accountType || "FUTURES";

    // "spot" slot = primary type (SPOT for crypto, NSE/BSE for Indian)
    const isSpot = (acct === primaryType) ||
      (primaryType === "SPOT" && acct === "SPOT") ||
      (INDIAN_ACCOUNT_TYPES.has(primaryType) && acct !== secondaryType && INDIAN_ACCOUNT_TYPES.has(acct));

    if (isSpot) {
      notionalSpot  += notional;
      investedSpot  += margin;
      openPnlSpot   += pnl;
    } else {
      notionalFutures  += notional;
      investedFutures  += margin;
      openPnlFutures   += pnl;
    }
  }

  return {
    openPnlByType:  { spot: openPnlSpot,    futures: openPnlFutures },
    investedByType: { spot: investedSpot,   futures: investedFutures },
    notionalByType: { spot: notionalSpot,   futures: notionalFutures },
  };
}
