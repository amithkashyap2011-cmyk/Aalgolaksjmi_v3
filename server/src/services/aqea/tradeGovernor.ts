/*
 * ─── Trade Governor (agentic pre-trade gate) ────────────
 *
 * Learns from the user's own recent closed trades and blocks new entries
 * that have historically negative expectancy:
 *
 *   1. Regime gate  — e.g. if TRENDING_BULL entries lose money over the
 *      rolling window, stop opening trades in that regime.
 *   2. Symbol gate  — same logic per symbol (BTC bleeding ≠ ADA earning).
 *   3. Edge gate    — expected gross profit at TP1 must exceed
 *      EDGE_MULT × round-trip cost (taker fees + slippage). This is the
 *      fee-drag killer: gross/fee ratio was ~1:1 before this gate.
 *
 * Blocked buckets are not blocked forever: every PROBE_HOURS one "probe"
 * trade per bucket is allowed through so fresh evidence keeps flowing and
 * a bucket can earn its way back (evidence-based re-entry, not a timer).
 *
 * Env flags (server/.env):
 *   AQEA_GOVERNOR_ENABLED      master switch (default true)
 *   AQEA_GOVERNOR_MIN_SAMPLES  min trades before a bucket can be judged (default 25)
 *   AQEA_GOVERNOR_EDGE_MULT    required edge ÷ cost ratio (default 2)
 *   AQEA_GOVERNOR_PROBE_HOURS  hours between probe trades per blocked bucket (default 6)
 *   AQEA_GOVERNOR_SIGMA       confidence factor: block when mean + SIGMA×stderr < 0.
 *                              Lower = stricter (0 blocks any negative mean at
 *                              sample size; 1 requires one-sigma significance).
 *                              Default 0.5 — SL outliers inflate variance enough
 *                              that 1.0 lets consistently-losing buckets through.
 */
import { Trade } from "../../models/Trade.js";
import { AqeaAudit } from "../../models/AqeaAudit.js";
import { TAKER_FEE } from "../pnlService.js";

const WINDOW_DAYS = 14;
const WINDOW_MAX_TRADES = 400;
const POLICY_TTL_MS = 15 * 60 * 1000;
/** Measured avg slippage on paper fills (~0.01% of notional). */
const SLIPPAGE_EST = 0.0001;
const SENTINEL_REASONS = new Set([
  "SENTINEL_AUTO_PURGE", "SENTINEL_BANKRUPTCY_CLEAR",
  "SENTINEL_INFLATION_CLEAR", "SENTINEL_LIQUIDATION",
]);

function envNum(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
const enabled = () => process.env.AQEA_GOVERNOR_ENABLED !== "false";

interface BucketStats {
  n: number;
  totalPnl: number;
  mean: number;
  /** one standard error of the mean — blocking requires mean + stderr < 0 */
  stderr: number;
  blocked: boolean;
}

export interface GovernorPolicy {
  computedAt: number;
  windowTrades: number;
  regimes: Record<string, BucketStats>;
  symbols: Record<string, BucketStats>;
}

export interface PermitRequest {
  userId: string;
  symbol: string;
  side: "BUY" | "SELL";
  regime?: string;
  entryPrice: number;
  tp?: number;
  notionalUsdt: number;
}

export interface PermitVerdict {
  allowed: boolean;
  probe: boolean;
  reason: string;
}

const policyCache = new Map<string, GovernorPolicy>();
/** bucketKey (`userId:REGIME:x` / `userId:SYMBOL:x`) → last probe timestamp */
const lastProbeAt = new Map<string, number>();

function bucketStats(pnls: number[], minSamples: number): BucketStats {
  const n = pnls.length;
  const totalPnl = pnls.reduce((s, p) => s + p, 0);
  const mean = n > 0 ? totalPnl / n : 0;
  const variance = n > 1 ? pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / (n - 1) : 0;
  const stderr = n > 0 ? Math.sqrt(variance / n) : 0;
  // Block when the bucket is losing with SIGMA-weighted confidence, so a thin
  // negative mean on noisy data doesn't flap the gate but a persistent
  // bleeder (whose SL outliers inflate variance) still gets caught.
  const sigma = Number(process.env.AQEA_GOVERNOR_SIGMA ?? 0.5);
  const blocked = n >= minSamples && mean + (Number.isFinite(sigma) ? sigma : 0.5) * stderr < 0;
  return { n, totalPnl, mean, stderr, blocked };
}

export async function getPolicy(userId: string): Promise<GovernorPolicy> {
  const cached = policyCache.get(userId);
  if (cached && Date.now() - cached.computedAt < POLICY_TTL_MS) return cached;

  const minSamples = envNum("AQEA_GOVERNOR_MIN_SAMPLES", 25);
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const trades = await Trade.find({
    userId, status: "CLOSED", strategy: /AQEA/, closedAt: { $gte: since },
  })
    .sort({ closedAt: -1 })
    .limit(WINDOW_MAX_TRADES)
    .select("symbol pnl marketRegime meta.closeReason")
    .lean();

  const usable = trades.filter(t => !SENTINEL_REASONS.has((t as any).meta?.closeReason));

  const byRegime = new Map<string, number[]>();
  const bySymbol = new Map<string, number[]>();
  for (const t of usable) {
    const pnl = t.pnl || 0;
    const regime = (t as any).marketRegime || "UNKNOWN";
    if (!byRegime.has(regime)) byRegime.set(regime, []);
    byRegime.get(regime)!.push(pnl);
    if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, []);
    bySymbol.get(t.symbol)!.push(pnl);
  }

  const policy: GovernorPolicy = {
    computedAt: Date.now(),
    windowTrades: usable.length,
    regimes: Object.fromEntries([...byRegime].map(([k, v]) => [k, bucketStats(v, minSamples)])),
    symbols: Object.fromEntries([...bySymbol].map(([k, v]) => [k, bucketStats(v, minSamples)])),
  };
  policyCache.set(userId, policy);
  return policy;
}

/** Allow one probe per blocked bucket every AQEA_GOVERNOR_PROBE_HOURS. */
function tryProbe(bucketKey: string): boolean {
  const probeMs = envNum("AQEA_GOVERNOR_PROBE_HOURS", 6) * 60 * 60 * 1000;
  const last = lastProbeAt.get(bucketKey) ?? 0;
  if (Date.now() - last < probeMs) return false;
  lastProbeAt.set(bucketKey, Date.now());
  return true;
}

async function audit(req: PermitRequest, verdict: PermitVerdict): Promise<void> {
  try {
    await AqeaAudit.create({
      userId: req.userId,
      symbol: req.symbol,
      component: "tradeGovernor",
      level: verdict.allowed ? "INFO" : "WARNING",
      message: verdict.allowed
        ? (verdict.probe ? `PROBE ${req.side} permitted: ${verdict.reason}` : `${req.side} permitted`)
        : `${req.side} blocked: ${verdict.reason}`,
      data: { ...req, verdict },
    });
  } catch { /* audit must never block trading */ }
}

export async function permit(req: PermitRequest): Promise<PermitVerdict> {
  if (!enabled()) return { allowed: true, probe: false, reason: "governor disabled" };

  let verdict: PermitVerdict;
  try {
    const policy = await getPolicy(req.userId);

    // 1. Edge gate — expected gross at TP1 vs round-trip cost.
    const edgeMult = envNum("AQEA_GOVERNOR_EDGE_MULT", 2);
    if (req.tp && req.entryPrice > 0 && req.notionalUsdt > 0) {
      const expectedGross = Math.abs(req.tp - req.entryPrice) / req.entryPrice * req.notionalUsdt;
      const roundTripCost = req.notionalUsdt * (2 * TAKER_FEE + SLIPPAGE_EST);
      if (expectedGross < edgeMult * roundTripCost) {
        verdict = {
          allowed: false, probe: false,
          reason: `edge too thin: TP1 gross $${expectedGross.toFixed(4)} < ${edgeMult}× cost $${roundTripCost.toFixed(4)}`,
        };
        await audit(req, verdict);
        return verdict;
      }
    }

    // 2. Regime gate.
    const regime = req.regime || "UNKNOWN";
    const regimeStats = policy.regimes[regime];
    if (regimeStats?.blocked) {
      const key = `${req.userId}:REGIME:${regime}`;
      if (tryProbe(key)) {
        verdict = { allowed: true, probe: true, reason: `probing blocked regime ${regime} (mean $${regimeStats.mean.toFixed(4)}/trade over ${regimeStats.n})` };
      } else {
        verdict = { allowed: false, probe: false, reason: `regime ${regime} losing $${regimeStats.mean.toFixed(4)}/trade over ${regimeStats.n} trades` };
      }
      await audit(req, verdict);
      return verdict;
    }

    // 3. Symbol gate.
    const symbolStats = policy.symbols[req.symbol];
    if (symbolStats?.blocked) {
      const key = `${req.userId}:SYMBOL:${req.symbol}`;
      if (tryProbe(key)) {
        verdict = { allowed: true, probe: true, reason: `probing blocked symbol ${req.symbol} (mean $${symbolStats.mean.toFixed(4)}/trade over ${symbolStats.n})` };
      } else {
        verdict = { allowed: false, probe: false, reason: `symbol ${req.symbol} losing $${symbolStats.mean.toFixed(4)}/trade over ${symbolStats.n} trades` };
      }
      await audit(req, verdict);
      return verdict;
    }

    verdict = { allowed: true, probe: false, reason: "all gates passed" };
  } catch (err: any) {
    // Fail open: a broken governor must not silently halt the whole engine,
    // but it must be loud about it.
    console.error(`[TRADE_GOVERNOR] evaluation failed, allowing trade: ${err.message}`);
    verdict = { allowed: true, probe: false, reason: `governor error (fail-open): ${err.message}` };
  }
  return verdict;
}

/** For the /aqea-ui/governor endpoint — current policy + what's blocked. */
export async function getPolicyReport(userId: string) {
  const policy = await getPolicy(userId);
  return {
    enabled: enabled(),
    config: {
      minSamples: envNum("AQEA_GOVERNOR_MIN_SAMPLES", 25),
      edgeMult: envNum("AQEA_GOVERNOR_EDGE_MULT", 2),
      probeHours: envNum("AQEA_GOVERNOR_PROBE_HOURS", 6),
      windowDays: WINDOW_DAYS,
    },
    windowTrades: policy.windowTrades,
    computedAt: new Date(policy.computedAt).toISOString(),
    blockedRegimes: Object.entries(policy.regimes).filter(([, s]) => s.blocked).map(([k]) => k),
    blockedSymbols: Object.entries(policy.symbols).filter(([, s]) => s.blocked).map(([k]) => k),
    regimes: policy.regimes,
    symbols: policy.symbols,
  };
}
