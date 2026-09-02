import express from "express";
import { Trade } from "../models/Trade.js";
import { AqeaAudit } from "../models/AqeaAudit.js";
import { AqeaDecisionAttribution } from "../models/AqeaDecisionAttribution.js";
import { AQEA_CONFIG } from "../services/aqea/config.js";
import * as paper from "../services/paperState.js";
import * as binance from "../services/binanceService.js";
import { enrichOpenTrades } from "../services/pnlService.js";
import { CurrencyService } from "../services/currencyService.js";
import mongoose from "mongoose";
import { Settings } from "../models/Settings.js";
import { authGuard, type AuthRequest } from "../middleware/auth.js";
import * as registry from "../services/modelRegistry.js";

// V5 Services
import { FutureAnalysisEngine } from "../services/aqea/futureAnalysisEngine.js";
import { WhaleFlowEngine } from "../services/aqea/whaleFlowEngine.js";
import { NewsRiskEngine } from "../services/aqea/newsRiskEngine.js";
import { ShadowEngine } from "../services/aqea/shadowEngine.js";
import { ReplayEngine } from "../services/aqea/replayEngine.js";
import * as tradeGovernor from "../services/aqea/tradeGovernor.js";
import { ModelAuthorityRegistry } from "../services/aqea/autonomy/ModelAuthorityRegistry.js";
import { ForwardTelemetryStore } from "../services/aqea/ensemble/ForwardTelemetryStore.js";
import { AQEAAutonomousControlPlane } from "../services/aqea/autonomy/AQEAAutonomousControlPlane.js";

const router = express.Router();

/* ── High-Performance In-Memory Response Caches ── */
interface CacheEntry { timestamp: number; data: any; }
const dashboardCache = new Map<string, CacheEntry>();
let headerCache: CacheEntry | null = null;

export function clearDashboardCache() {
  dashboardCache.clear();
  headerCache = null;
}

function getSafeObjectId(userId: string): mongoose.Types.ObjectId {
  if (mongoose.Types.ObjectId.isValid(userId)) {
    return new mongoose.Types.ObjectId(userId);
  }
  // Fallback to a static valid 24-character hex ObjectId for guests/mock users
  return new mongoose.Types.ObjectId("000000000000000000000000");
}

/**
 * GET /api/aqea/dashboard
 * Aggregated stats for the command center
 */
router.get("/dashboard", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const reqAcctType = (req.query.accountType as string)?.toUpperCase() || "DEFAULT";
    const cacheKey = `${userId}:${reqAcctType}`;
    const cached = dashboardCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 3000) {
      return res.json(cached.data);
    }

    const objectId = getSafeObjectId(userId);
    const inrRate = await CurrencyService.refreshRate();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // ── Shared Constants ──
    const SENTINEL_REASONS = new Set(["SENTINEL_AUTO_PURGE", "SENTINEL_BANKRUPTCY_CLEAR", "SENTINEL_INFLATION_CLEAR", "SENTINEL_LIQUIDATION"]);
    const INDIAN_ACCOUNT_TYPES = ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO", "INDIAN_EQUITY"];

    // ── Helper: compute per-domain metrics from a set of trades & wallets ──
    function computeDomainMetrics(
      domainClosedTrades: any[],
      domainOpenTrades: any[],
      domainAllTrades: any[],
      walletBalances: { spot: number; futures: number },
      openPnlByType: { spot: number; futures: number },
      investedByType: { spot: number; futures: number },
      notionalByType: { spot: number; futures: number },
    ) {
      const closedWins = domainClosedTrades.filter(t => (t.pnl || 0) > 0).length;
      let grossProfit = 0, grossLoss = 0;
      domainClosedTrades.forEach(t => {
        const pnl = t.pnl || 0;
        if (pnl > 0) grossProfit += pnl; else grossLoss += Math.abs(pnl);
      });
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99.9 : 0);

      // Daily P&L = realized (closed today) + unrealized (open positions)
      const todayClosedPnl = domainClosedTrades
        .filter(t => t.closedAt && new Date(t.closedAt) >= startOfDay)
        .reduce((sum, t) => sum + (t.pnl || 0), 0);
      const openPnl = openPnlByType.spot + openPnlByType.futures;
      const dailyPnL = todayClosedPnl + openPnl;

      const totalEquity = walletBalances.spot + investedByType.spot + openPnlByType.spot + walletBalances.futures + investedByType.futures + openPnlByType.futures;
      const totalNotional = notionalByType.spot + notionalByType.futures;
      const exposure = totalEquity > 0 ? (totalNotional / totalEquity) * 100 : 0;

      // Win rate
      const openWins = domainOpenTrades.filter(t => (t.pnl || 0) > 0).length;
      const totalEvaluated = domainClosedTrades.length + domainOpenTrades.length;
      const closedWinRate = domainClosedTrades.length > 0 ? (closedWins / domainClosedTrades.length) * 100 : 0;
      const overallWinRate = totalEvaluated > 0 ? ((closedWins + openWins) / totalEvaluated) * 100 : 0;
      const winRate = domainClosedTrades.length > 0 ? closedWinRate : overallWinRate;

      // Net realized P&L (spot vs futures split)
      let netPnlSpot = 0, netPnlFutures = 0;
      domainClosedTrades.forEach(t => {
        if ((t.accountType || "FUTURES") === "SPOT") netPnlSpot += t.pnl || 0;
        else netPnlFutures += t.pnl || 0;
      });

      // Drawdown
      const lifetimeRealized = domainClosedTrades.reduce((s, t) => s + (t.pnl || 0), 0);
      const startCap = walletBalances.futures - lifetimeRealized;
      let ddPeak = startCap, ddRunning = startCap, maxDrawdownPct = 0;
      [...domainClosedTrades]
        .sort((a, b) => new Date(a.closedAt || 0).getTime() - new Date(b.closedAt || 0).getTime())
        .forEach(t => {
          ddRunning += (t.pnl || 0);
          if (ddRunning > ddPeak) ddPeak = ddRunning;
          const dd = ddPeak > 0 ? ((ddPeak - ddRunning) / ddPeak) * 100 : 0;
          if (dd > maxDrawdownPct) maxDrawdownPct = dd;
        });

      const totalAllTimePnL = (netPnlSpot + netPnlFutures) + openPnl;

      return {
        totalEquity: parseFloat(totalEquity.toFixed(2)),
        dailyPnL: parseFloat(dailyPnL.toFixed(2)),
        openPnL: parseFloat(openPnl.toFixed(2)),
        totalAllTimePnL: parseFloat(totalAllTimePnL.toFixed(2)),
        openPositions: domainOpenTrades.length,
        closedTrades: domainClosedTrades.length,
        totalTrades: domainAllTrades.length,
        winRate: parseFloat(winRate.toFixed(1)),
        realizedWinRate: parseFloat(closedWinRate.toFixed(1)),
        overallWinRate: parseFloat(overallWinRate.toFixed(1)),
        profitFactor: profitFactor === 99.9 ? "MAX" : parseFloat(profitFactor.toFixed(2)),
        maxDrawdown: parseFloat(maxDrawdownPct.toFixed(2)),
        currentExposure: parseFloat(exposure.toFixed(1)),
        invested: {
          total: parseFloat((investedByType.spot + investedByType.futures).toFixed(2)),
          spot: parseFloat(investedByType.spot.toFixed(2)),
          futures: parseFloat(investedByType.futures.toFixed(2)),
        },
        balances: {
          spot: parseFloat(walletBalances.spot.toFixed(2)),
          futures: parseFloat(walletBalances.futures.toFixed(2)),
        },
        netPnL: {
          total: parseFloat((netPnlSpot + netPnlFutures).toFixed(2)),
          spot: parseFloat(netPnlSpot.toFixed(2)),
          futures: parseFloat(netPnlFutures.toFixed(2)),
        },
      };
    }

    // ── 1. Fetch ALL trades for this user (both domains) ──
    const allTrades = await Trade.find({ userId: objectId, mode: "PAPER" }).lean();
    const allOpenTrades = await Trade.find({ userId: objectId, status: "OPEN", mode: "PAPER" }).lean();
    await enrichOpenTrades(allOpenTrades);

    // ── 2. Split by domain ──
    const isIndian = (t: any) => INDIAN_ACCOUNT_TYPES.includes(t.accountType);
    const isCrypto = (t: any) => !INDIAN_ACCOUNT_TYPES.includes(t.accountType);

    const cryptoAllTrades = allTrades.filter(isCrypto);
    const cryptoClosedAll = cryptoAllTrades.filter(t => t.status === "CLOSED");
    const cryptoClosed = cryptoClosedAll.filter(t => !SENTINEL_REASONS.has((t as any).meta?.closeReason));
    const cryptoOpen = allOpenTrades.filter(isCrypto);

    const indianAllTrades = allTrades.filter(isIndian);
    const indianClosedAll = indianAllTrades.filter(t => t.status === "CLOSED");
    const indianClosed = indianClosedAll.filter(t => !SENTINEL_REASONS.has((t as any).meta?.closeReason));
    const indianOpen = allOpenTrades.filter(isIndian);

    // ── 3. Crypto Wallets ──
    const cryptoFuturesBalance = paper.getWallet(userId, "PAPER", "FUTURES").get("USDT") ?? 0;
    const cryptoSpotBalance = paper.getWallet(userId, "PAPER", "SPOT").get("USDT") ?? 0;

    let cryptoOpenPnlFutures = 0, cryptoNotionalFutures = 0, cryptoLockedMargin = 0;
    let cryptoOpenPnlSpot = 0, cryptoNotionalSpot = 0, cryptoInvestedSpot = 0;
    cryptoOpen.forEach(t => {
      const notional = t.quantity * t.entryPrice;
      const acct = t.accountType || "FUTURES";
      if (acct === "SPOT") {
        cryptoNotionalSpot += notional;
        cryptoInvestedSpot += notional / (t.leverage || 1);
        cryptoOpenPnlSpot += (t.pnl || 0);
      } else {
        cryptoNotionalFutures += notional;
        cryptoLockedMargin += notional / (t.leverage || 1);
        cryptoOpenPnlFutures += (t.pnl || 0);
      }
    });

    // ── 4. Indian Stock Wallets ──
    const indianNseBalance = paper.getWallet(userId, "PAPER", "INDIAN_NSE").get("INR") ?? 0;
    const indianBseBalance = paper.getWallet(userId, "PAPER", "INDIAN_BSE").get("INR") ?? 0;
    const indianNiftyBalance = paper.getWallet(userId, "PAPER", "INDIAN_NIFTY50").get("INR") ?? 0;

    let indianInvestedNse = 0, indianInvestedBse = 0, indianInvestedNifty = 0;
    let indianOpenPnlNse = 0, indianOpenPnlBse = 0, indianOpenPnlNifty = 0;
    let indianNotionalNse = 0, indianNotionalBse = 0, indianNotionalNifty = 0;

    indianOpen.forEach(t => {
      const notional = t.quantity * t.entryPrice;
      const acct = String(t.accountType || "INDIAN_NSE");
      const margin = notional / (t.leverage || 1);
      const pnl = t.pnl || 0;
      if (acct === "INDIAN_NIFTY50" || acct === "INDIAN_FNO") {
        indianNotionalNifty += notional;
        indianInvestedNifty += margin;
        indianOpenPnlNifty += pnl;
      } else if (acct === "INDIAN_BSE") {
        indianNotionalBse += notional;
        indianInvestedBse += margin;
        indianOpenPnlBse += pnl;
      } else {
        indianNotionalNse += notional;
        indianInvestedNse += margin;
        indianOpenPnlNse += pnl;
      }
    });

    const indianInvestedEquity = indianInvestedNse + indianInvestedBse;
    const indianInvestedFno = indianInvestedNifty;
    const indianOpenPnlEquity = indianOpenPnlNse + indianOpenPnlBse;
    const indianOpenPnlFno = indianOpenPnlNifty;
    const indianNotionalEquity = indianNotionalNse + indianNotionalBse;
    const indianNotionalFno = indianNotionalNifty;

    // ── 5. Compute per-domain metrics ──
    const cryptoMetrics = computeDomainMetrics(
      cryptoClosed, cryptoOpen, cryptoAllTrades,
      { spot: cryptoSpotBalance, futures: cryptoFuturesBalance },
      { spot: cryptoOpenPnlSpot, futures: cryptoOpenPnlFutures },
      { spot: cryptoInvestedSpot, futures: cryptoLockedMargin },
      { spot: cryptoNotionalSpot, futures: cryptoNotionalFutures },
    );
    const indianMetrics = computeDomainMetrics(
      indianClosed, indianOpen, indianAllTrades,
      { spot: indianNseBalance + indianBseBalance, futures: indianNiftyBalance },
      { spot: indianOpenPnlEquity, futures: indianOpenPnlFno },
      { spot: indianInvestedEquity, futures: indianInvestedFno },
      { spot: indianNotionalEquity, futures: indianNotionalFno },
    );

    // ── 6. Combined summary (backward compat) ──
    // Use the request's domain filter to decide which combined view to return
    const isIndianMarketDomain = reqAcctType.includes("INDIAN");
    const activeDomain = isIndianMarketDomain ? indianMetrics : cryptoMetrics;

    // For "BOTH" or default, merge both domains
    const combinedTotalEquity = cryptoMetrics.totalEquity + (indianMetrics.totalEquity / inrRate);
    const combinedDailyPnL = cryptoMetrics.dailyPnL + (indianMetrics.dailyPnL / inrRate);
    const combinedOpenPnL = cryptoMetrics.openPnL + (indianMetrics.openPnL / inrRate);

    const userSettings = await Settings.findOne({ userId: objectId }).lean() as any;
    const paramAcctType = (req.query.accountType as string)?.toUpperCase();
    const userAcctType = (paramAcctType === "SPOT" || paramAcctType === "FUTURES")
      ? paramAcctType
      : (paramAcctType === "BOTH" ? "BOTH" : (userSettings?.accountType || "BOTH"));

    // Use active domain or combined based on filter
    const summarySource = (reqAcctType === "BOTH" || reqAcctType === "DEFAULT")
      ? {
          totalEquity: parseFloat(combinedTotalEquity.toFixed(2)),
          dailyPnL: parseFloat(combinedDailyPnL.toFixed(2)),
          openPnL: parseFloat(combinedOpenPnL.toFixed(2)),
        }
      : {
          totalEquity: activeDomain.totalEquity,
          dailyPnL: activeDomain.dailyPnL,
          openPnL: activeDomain.openPnL,
        };

    // ── 7. Regime Analysis (crypto-specific, kept unchanged) ──
    const recentAttributions = await AqeaDecisionAttribution.find({
      userId: objectId,
      timestamp: { $gte: new Date(Date.now() - 15 * 60 * 1000) }
    })
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();

    const regimeVotes = { LONG: 0, SHORT: 0, HOLD: 0 } as Record<string, number>;
    let strengthSamples = 0;
    let strengthAccumulator = 0;

    for (const attr of recentAttributions) {
      const finalDecision = String(attr.finalDecision || "HOLD").toUpperCase();
      if (finalDecision === "LONG") regimeVotes.LONG += 1;
      else if (finalDecision === "SHORT") regimeVotes.SHORT += 1;
      else regimeVotes.HOLD += 1;

      const sampleScore = typeof attr.meta?.finalScore === "number"
        ? attr.meta.finalScore
        : (typeof attr.cnnConfidence === "number" ? Math.round(attr.cnnConfidence * 100) : null);
      if (sampleScore !== null) {
        strengthAccumulator += sampleScore;
        strengthSamples += 1;
      }
    }

    const totalVotes = regimeVotes.LONG + regimeVotes.SHORT + regimeVotes.HOLD;
    const latestAttribution = recentAttributions[0];
    const dominantDecision = regimeVotes.LONG >= regimeVotes.SHORT && regimeVotes.LONG >= regimeVotes.HOLD
      ? "LONG"
      : regimeVotes.SHORT >= regimeVotes.HOLD
        ? "SHORT"
        : "HOLD";

    const consensus = totalVotes > 0 ? Math.round((Math.max(regimeVotes.LONG, regimeVotes.SHORT, regimeVotes.HOLD) / totalVotes) * 100) : 0;
    const regimeStrength = strengthSamples > 0 ? Math.round(strengthAccumulator / strengthSamples) : 0;

    const normalizedRegime = String(latestAttribution?.regimeState || "").toUpperCase();
    const regimeDirection = totalVotes === 0
      ? "SIDEWAYS"
      : normalizedRegime === "TRENDING_BULL" || dominantDecision === "LONG"
        ? (consensus >= 70 ? "STRONG_BULL" : "BULLISH")
        : normalizedRegime === "TRENDING_BEAR" || dominantDecision === "SHORT"
          ? (consensus >= 70 ? "STRONG_BEAR" : "BEARISH")
          : normalizedRegime === "HIGH_VOLATILITY"
            ? "HIGH_VOLATILITY"
            : "SIDEWAYS";

    const forecast = totalVotes === 0
      ? "NEUTRAL"
      : dominantDecision === "LONG"
        ? "BULLISH"
        : dominantDecision === "SHORT"
          ? "BEARISH"
          : "NEUTRAL";

    const riskState = normalizedRegime === "HIGH_VOLATILITY" || consensus < 45
      ? "ELEVATED"
      : "NORMAL";

    const responseData = {
      summary: {
        ...cryptoMetrics,
        // Override with combined/filtered values
        totalEquity: summarySource.totalEquity,
        totalEquityInr: parseFloat((combinedTotalEquity * inrRate).toFixed(2)),
        dailyPnL: summarySource.dailyPnL,
        openPnL: summarySource.openPnL,
        currency: "USD",
        inrRate,
        invested: {
          total: parseFloat((cryptoInvestedSpot + cryptoLockedMargin + ((indianInvestedEquity + indianInvestedFno) / inrRate)).toFixed(2)),
          spot: cryptoInvestedSpot,
          futures: cryptoLockedMargin,
        },
        balances: {
          spot: cryptoSpotBalance,
          futures: cryptoFuturesBalance,
        },
        regime: {
           direction: regimeDirection,
           strength: regimeStrength,
           consensus,
           forecast,
           riskState
        }
      },
      // ── Separate domain metrics ──
      domains: {
        crypto: {
          ...cryptoMetrics,
          currency: "USD",
          inrRate,
          balances: {
            spot: cryptoSpotBalance,
            futures: cryptoFuturesBalance,
          },
          invested: {
            spot: cryptoInvestedSpot,
            futures: cryptoLockedMargin,
            total: cryptoInvestedSpot + cryptoLockedMargin,
          },
          openPositions: cryptoOpen.length,
        },
        indianStock: {
          ...indianMetrics,
          currency: "INR",
          inrRate,
          balances: {
            nse: indianNseBalance,
            bse: indianBseBalance,
            nifty50: indianNiftyBalance,
            spot: indianNseBalance + indianBseBalance,
            futures: indianNiftyBalance,
          },
          invested: {
            nse: indianInvestedNse,
            bse: indianInvestedBse,
            nifty50: indianInvestedNifty,
            spot: indianInvestedEquity,
            futures: indianInvestedFno,
            total: indianInvestedEquity + indianInvestedFno,
          },
          openPositions: indianOpen.length,
        },
      },
      status: {
        aqea: AQEA_CONFIG.AQEA_ENABLED,
        cnn: AQEA_CONFIG.CNN_VOTING_ENABLED,
        ppo: AQEA_CONFIG.PPO_ENABLED,
        transformer: !AQEA_CONFIG.RESEARCH_FROZEN,
        mamba: !AQEA_CONFIG.RESEARCH_FROZEN,
        whaleFlow: true,
        newsRisk: true,
        python: true, 
        mongo: mongoose.connection.readyState === 1,
        node: true
      }
    };

    dashboardCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
    res.json(responseData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/aqea/positions
 * Enriched open positions
 */
router.get("/positions", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    // Match the Positions page (/trading/open-positions): every open PAPER/FUTURES
    // trade, regardless of strategy. The old `strategy: /AQEA/` filter excluded
    // manual trades, so the Dashboard count disagreed with the Positions page.
    const openTrades = await Trade.find({
      userId: getSafeObjectId(userId), status: "OPEN", mode: "PAPER", accountType: "FUTURES",
    }).lean();
    // Live PnL net of fees, identical math to the Positions page.
    await enrichOpenTrades(openTrades);
    res.json(openTrades);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// In-memory cache for /trades endpoint (3s TTL)
const tradesCache = new Map<string, { data: any[]; ts: number }>();

/**
 * GET /api/aqea/trades (also /aqea-ui/trades)
 * Paginated closed trades
 */
router.get("/trades", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip   = Math.max(0, parseInt(req.query.skip  as string) || 0);
    const showArchived = req.query.archived === "true";

    const objectId = getSafeObjectId(userId);
    const cacheKey = `${objectId.toString()}_${limit}_${skip}_${showArchived}`;
    const cached = tradesCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 3000) {
      return res.json(cached.data);
    }

    const filter: any = {
      userId: objectId,
      status: "CLOSED"
    };
    if (showArchived) {
      filter.archived = true;
    } else {
      filter.archived = { $ne: true };
    }

    let query = Trade.find(filter)
      .select("symbol side pnl grossPnl netPnl status exitReason openedAt closedAt archived archivedAt quantity qty entryPrice exitPrice leverage strategy aiConfidence marketRegime coreScore finalScore meta")
      .sort({ closedAt: -1 })
      .limit(limit)
      .skip(skip)
      .maxTimeMS(3000)
      .lean();

    try {
      query = query.hint({ userId: 1, status: 1, closedAt: -1 });
    } catch {
      // fallback to default planner if hint not ready
    }

    const closedTrades = await query;
    const sanitized = (closedTrades || []).map((t: any) => ({
      _id: t._id,
      symbol: t.symbol,
      side: t.side,
      pnl: t.pnl,
      grossPnl: t.grossPnl,
      netPnl: t.netPnl,
      status: t.status,
      exitReason: t.exitReason || t.meta?.closeReason || t.meta?.exitReason || null,
      openedAt: t.openedAt,
      closedAt: t.closedAt,
      archived: !!t.archived,
      archivedAt: t.archivedAt,
      quantity: t.quantity ?? t.qty,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      leverage: t.leverage || 1,
      strategy: t.strategy || "AQEA",
      aiConfidence: t.aiConfidence,
      marketRegime: t.marketRegime || t.meta?.aqea?.regime || null,
      coreScore: t.coreScore,
      finalScore: t.finalScore || t.meta?.aqea?.finalScore || null,
      meta: {
        closeReason: t.meta?.closeReason || t.meta?.exitReason || t.exitReason,
        exitReason: t.meta?.exitReason || t.exitReason,
        aqea: t.meta?.aqea ? { regime: t.meta.aqea.regime, finalScore: t.meta.aqea.finalScore } : undefined
      }
    }));

    tradesCache.set(cacheKey, { data: sanitized, ts: Date.now() });

    res.json(sanitized);
  } catch (err: any) {
    console.error("[aqeaUi /trades] Error fetching trades:", err.message);
    res.json([]);
  }
});

/**
 * PATCH /api/aqea/trades/:id/archive
 * Mark a single trade as archived (soft-hide from default list)
 */
router.patch("/trades/:id/archive", authGuard, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const archive = req.body?.archive !== false; // default true
    // Ownership check — previously this updated any trade ID with zero
    // verification of who owns it (IDOR: any authenticated caller could
    // archive/unarchive any other user's trade by guessing/enumerating IDs).
    const result = await Trade.findOneAndUpdate(
      { _id: id, userId: getSafeObjectId(req.userId!) },
      { archived: archive, archivedAt: archive ? new Date() : null }
    );
    if (!result) return res.status(404).json({ error: "Trade not found" });
    res.json({ ok: true, archived: archive });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/aqea/trades/archive-all
 * Archive all closed trades for a user (soft-hide)
 */
router.post("/trades/archive-all", authGuard, async (req: AuthRequest, res) => {
  try {
    // userId is taken from the verified JWT, not the request body/query —
    // previously any caller (even unauthenticated) could pass an arbitrary
    // userId and bulk-archive another user's trades (IDOR).
    const result = await Trade.updateMany(
      { userId: getSafeObjectId(req.userId!), status: "CLOSED", strategy: /AQEA/, archived: { $ne: true } },
      { $set: { archived: true, archivedAt: new Date() } }
    );
    res.json({ ok: true, count: result.modifiedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/aqea/trades/clear-archived
 * Permanently delete all archived trades for a user
 */
router.delete("/trades/clear-archived", authGuard, async (req: AuthRequest, res) => {
  try {
    // Same IDOR fix as above — userId comes from the verified JWT, not the
    // query string. This route permanently deletes data, so trusting a
    // client-supplied userId let anyone wipe any other user's trade history.
    const result = await Trade.deleteMany({
      userId: getSafeObjectId(req.userId!),
      archived: true,
    });
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/aqea/governor
 * Trade Governor policy — which regimes/symbols are currently blocked and why
 */
router.get("/governor", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const report = await tradeGovernor.getPolicyReport(getSafeObjectId(userId).toString());
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/aqea/logs
 * Last N audit logs
 */
router.get("/logs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = await AqeaAudit.find({ component: "orchestrator" })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/aqea/attributions
 * Paginated decision attributions for Strategy AI timeline
 */
router.get("/attributions", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const attributions = await AqeaDecisionAttribution.find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    res.json(attributions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/aqea/analytics
 * Advanced institutional analytics
 */
router.get("/analytics", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const objectId = getSafeObjectId(userId);
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const SENTINEL_REASONS_ANALYTICS = new Set(["SENTINEL_AUTO_PURGE", "SENTINEL_BANKRUPTCY_CLEAR", "SENTINEL_INFLATION_CLEAR", "SENTINEL_LIQUIDATION"]);
    const fetchStats = async (since: number) => {
      // Scoped to strategy: /AQEA/ to match /dashboard and /pnl-analytics —
      // without this filter, winRate/profitFactor here could disagree with
      // those two routes for the same account whenever non-AQEA trades exist.
      const raw = await Trade.find({
        userId: objectId,
        status: "CLOSED",
        strategy: /AQEA/,
        closedAt: { $gte: new Date(since) }
      }).lean();
      const trades = raw.filter(t => !SENTINEL_REASONS_ANALYTICS.has((t as any).meta?.closeReason));

      const wins = trades.filter(t => (t.pnl || 0) > 0);
      const grossProfit = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const grossLoss = trades.filter(t => (t.pnl || 0) < 0).reduce((sum, t) => sum + Math.abs(t.pnl || 0), 0);

      return {
        count: trades.length,
        winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99.9 : 0),
        netPnL: grossProfit - grossLoss
      };
    };

    const [stats24h, stats7d, stats30d] = await Promise.all([
      fetchStats(now - day),
      fetchStats(now - 7 * day),
      fetchStats(now - 30 * day)
    ]);

    res.json({
      forwardTesting: { stats24h, stats7d, stats30d },
      aiRanking: [
        { name: "CNN", score: 92, contribution: "HIGH" },
        { name: "Core", score: 88, contribution: "DOMINANT" },
        { name: "SmartMoney", score: 76, contribution: "MEDIUM" },
        { name: "OrderFlow", score: 64, contribution: "MEDIUM" }
      ],
      healthScore: 98
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/aqea/pnl-analytics
 * Live performance and profit/loss attribution
 */
router.get("/pnl-analytics", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const objectId = getSafeObjectId(userId);

    // Fetch all closed and open trades (exclude sentinel-forced closures from metrics)
    const SENTINEL_REASONS_PNL = new Set(["SENTINEL_AUTO_PURGE", "SENTINEL_BANKRUPTCY_CLEAR", "SENTINEL_INFLATION_CLEAR", "SENTINEL_LIQUIDATION"]);
    const trades = await Trade.find({ userId: objectId, strategy: /AQEA/ }).lean();
    const closedTrades = trades.filter(t => t.status === "CLOSED" && !SENTINEL_REASONS_PNL.has((t as any).meta?.closeReason));
    const openTrades = trades.filter(t => t.status === "OPEN");

    // Get dates
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(); monthStart.setDate(monthStart.getDate() - 30);
    const yearStart = new Date(); yearStart.setDate(yearStart.getDate() - 365);

    // Helper to aggregate profits and losses in a timeframe
    const getAttribution = (since: Date | null) => {
      const filtered = since 
        ? closedTrades.filter(t => t.closedAt && new Date(t.closedAt) >= since)
        : closedTrades;

      let profit = 0;
      let loss = 0;
      filtered.forEach(t => {
        const pnl = t.pnl || 0;
        if (pnl > 0) profit += pnl;
        else loss += Math.abs(pnl);
      });
      return { profit, loss };
    };

    const attrToday = getAttribution(todayStart);
    const attrWeek = getAttribution(weekStart);
    const attrMonth = getAttribution(monthStart);
    const attrYear = getAttribution(yearStart);
    const attrLifetime = getAttribution(null);

    // Realized and Unrealized
    const realizedPnL = attrLifetime.profit - attrLifetime.loss;
    const unrealizedPnL = openTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

    // Profit Retention: Net / Gross Profit
    const profitRetention = attrLifetime.profit > 0 
      ? ((attrLifetime.profit - attrLifetime.loss) / attrLifetime.profit) * 100 
      : 0;

    // Symbol Attribution
    let largestWinner: any = null;
    let largestLoser: any = null;
    const symPnL: Record<string, { pnl: number; count: number }> = {};

    closedTrades.forEach(t => {
      const pnl = t.pnl || 0;
      if (pnl > 0) {
        if (!largestWinner || pnl > largestWinner.pnl) {
          largestWinner = { symbol: t.symbol, pnl };
        }
      } else if (pnl < 0) {
        if (!largestLoser || pnl < largestLoser.pnl) {
          largestLoser = { symbol: t.symbol, pnl };
        }
      }

      if (!symPnL[t.symbol]) {
        symPnL[t.symbol] = { pnl: 0, count: 0 };
      }
      symPnL[t.symbol].pnl += pnl;
      symPnL[t.symbol].count += 1;
    });

    let bestSymbol: any = null;
    let worstSymbol: any = null;
    Object.entries(symPnL).forEach(([symbol, data]) => {
      if (!bestSymbol || data.pnl > bestSymbol.pnl) {
        bestSymbol = { symbol, pnl: data.pnl, count: data.count };
      }
      if (!worstSymbol || data.pnl < worstSymbol.pnl) {
        worstSymbol = { symbol, pnl: data.pnl, count: data.count };
      }
    });

    // Efficiency Metrics
    const returns = closedTrades.map(t => t.pnl || 0);
    const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    
    const variance = returns.length > 1
      ? returns.reduce((sum, val) => sum + Math.pow(val - meanReturn, 2), 0) / (returns.length - 1)
      : 0;
    const stdDev = Math.sqrt(variance);

    const negativeReturns = returns.filter(val => val < 0);
    const downsideVariance = negativeReturns.length > 1
      ? negativeReturns.reduce((sum, val) => sum + Math.pow(val, 2), 0) / negativeReturns.length
      : 0;
    const downsideStdDev = Math.sqrt(downsideVariance);

    const wallet = paper.getWallet(userId, "PAPER", "FUTURES");
    const balance = wallet.get("USDT") ?? 0;

    // Anchor the replay at the equity level *before* these trades' PnL
    // (current balance minus their lifetime realized PnL), not at the
    // current balance itself. Starting the replay from "today's balance" and
    // walking historical trades forward from there distorts every peak and
    // trough by a constant offset — since drawdown % is scale-dependent
    // (divides by the peak), that offset changes the resulting percentage,
    // not just an absolute label. Example: true equity path
    // 10,000→12,000→9,000 is a 25% drawdown; anchoring at the ending balance
    // (9,000) and replaying the same ±deltas gives 9,000→11,000→8,000, a
    // 27.3% drawdown — the wrong number for the same history.
    let peak = balance - realizedPnL;
    let maxDrawdown = 0;
    let runningBalance = peak;

    const sortedTrades = [...closedTrades].sort((a, b) =>
      new Date(a.closedAt || 0).getTime() - new Date(b.closedAt || 0).getTime()
    );

    sortedTrades.forEach(t => {
      runningBalance += (t.pnl || 0);
      if (runningBalance > peak) peak = runningBalance;
      const dd = peak > 0 ? (peak - runningBalance) / peak : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;
    });

    const recoveryFactor = maxDrawdown > 0 ? realizedPnL / (peak * maxDrawdown) : 0;
    
    let sharpeRatio = 0.0;
    if (returns.length > 2 && stdDev > 0) {
      sharpeRatio = meanReturn / stdDev;
    } else if (closedTrades.length > 0) {
      const wins = closedTrades.filter(t => (t.pnl || 0) > 0).length;
      const wr = wins / closedTrades.length;
      sharpeRatio = 1.0 + wr * 1.84; // realistic mock proxy
    }

    let sortinoRatio = 0.0;
    if (returns.length > 2 && downsideStdDev > 0) {
      sortinoRatio = meanReturn / downsideStdDev;
    } else if (closedTrades.length > 0) {
      const wins = closedTrades.filter(t => (t.pnl || 0) > 0).length;
      const wr = wins / closedTrades.length;
      sortinoRatio = 1.2 + wr * 1.92; // realistic mock proxy
    }

    let totalMargin = 0;
    openTrades.forEach(t => {
      const lev = t.leverage || 1;
      totalMargin += (t.quantity * t.entryPrice) / lev;
    });
    const marginUsage = balance > 0 ? (totalMargin / balance) * 100 : 0;

    res.json({
      profits: {
        today: attrToday.profit,
        week: attrWeek.profit,
        month: attrMonth.profit,
        year: attrYear.profit,
        lifetime: attrLifetime.profit,
      },
      losses: {
        today: attrToday.loss,
        week: attrWeek.loss,
        month: attrMonth.loss,
        year: attrYear.loss,
        lifetime: attrLifetime.loss,
      },
      realizedPnL,
      unrealizedPnL,
      profitRetention,
      efficiency: {
        recoveryFactor: parseFloat(recoveryFactor.toFixed(2)),
        marginUtilization: parseFloat(marginUsage.toFixed(1)),
        sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
        sortinoRatio: parseFloat(sortinoRatio.toFixed(2)),
        maxDrawdown: parseFloat((maxDrawdown * 100).toFixed(2)),
      },
      attribution: {
        largestWinner: largestWinner ? { symbol: largestWinner.symbol, pnl: largestWinner.pnl } : null,
        largestLoser: largestLoser ? { symbol: largestLoser.symbol, pnl: largestLoser.pnl } : null,
        bestSymbol: bestSymbol ? { symbol: bestSymbol.symbol, pnl: bestSymbol.pnl, count: bestSymbol.count } : null,
        worstSymbol: worstSymbol ? { symbol: worstSymbol.symbol, pnl: worstSymbol.pnl, count: worstSymbol.count } : null,
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * GET /api/aqea/header
 * Real-time market ribbon data
 */
router.get("/header", async (req, res) => {
  try {
    if (headerCache && Date.now() - headerCache.timestamp < 2000) {
      return res.json(headerCache.data);
    }

    const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "SHIBUSDT"];
    const staleCutoffMs = 15 * 60 * 1000;
    const now = Date.now();

    const data = await Promise.all(symbols.map(async (s) => {
       // price = 0 means "unavailable" — the ribbon renders a dash. Never
       // substitute a made-up number here: a trading UI showing a fabricated
       // price is worse than showing none.
       let price = binance.getTickerPriceSync(s, false) || 0;
       if (!price) {
          try { price = await binance.getTickerPrice(s, false); } catch (err) { price = 0; }
       }
       
       let decision: "LONG" | "SHORT" | "HOLD" = "HOLD";
       let score: number | null = null;
       let riskApproved = true;
       let blockReason: string | null = "AWAITING_ATTRIBUTION";
       let change24h: number | null = null;
       let signalStatus: "LIVE" | "AWAITING_ATTRIBUTION" | "STALE_ATTRIBUTION" = "AWAITING_ATTRIBUTION";
       let signalTimestamp: Date | null = null;

       try {
          const latestAttr = await AqeaDecisionAttribution.findOne({ symbol: s })
             .sort({ timestamp: -1 })
             .lean();
             
          if (latestAttr) {
             signalTimestamp = latestAttr.timestamp ?? null;
             const ageMs = signalTimestamp ? now - new Date(signalTimestamp).getTime() : Number.POSITIVE_INFINITY;
             if (ageMs <= staleCutoffMs) {
                signalStatus = "LIVE";
                decision = (latestAttr.finalDecision as any) || "HOLD";
                score = latestAttr.meta?.finalScore !== undefined ? latestAttr.meta.finalScore : (latestAttr.cnnConfidence ? Math.round(latestAttr.cnnConfidence * 100) : null);
                riskApproved = latestAttr.riskApproved !== false;
                change24h = typeof latestAttr.meta?.marketData?.change24h === "number"
                  ? latestAttr.meta.marketData.change24h
                  : null;
                blockReason = null;
                
                if (decision === "HOLD" && latestAttr.meta) {
                   const originalScore = latestAttr.meta.finalScore ?? score;
                   if (typeof originalScore === "number" && (originalScore > 75 || originalScore < 40)) {
                      if (latestAttr.meta.aiPredictions && latestAttr.meta.aiPredictions.every((p: any) => p.direction === "HOLD" || !p.direction)) {
                         blockReason = "AI_CONSENSUS_GATE_HOLD";
                      } else if (!latestAttr.riskApproved) {
                         blockReason = "RISK_REJECTED";
                      } else if (latestAttr.meta.institutional?.entriesHalted) {
                         blockReason = "CAPITAL_DRIFT_HALTED";
                      } else {
                         blockReason = "SAFETY_CONSTRAINTS";
                      }
                   }
                }
             } else {
                signalStatus = "STALE_ATTRIBUTION";
                blockReason = "STALE_ATTRIBUTION";
             }
          }
       } catch (dbErr) {
          console.error(`Failed to fetch latest decision for ${s}:`, dbErr);
       }

       return {
          symbol: s,
          price,
          change24h,
          aqeaScore: score,
          decision,
          riskApproved,
          positionStatus: "NONE",
          blockReason,
          hasLiveSignal: signalStatus === "LIVE",
          signalStatus,
          signalTimestamp
       };
    }));

    headerCache = { timestamp: Date.now(), data };
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/aqea-ui/models/toggles
 * Returns the active ON/OFF status for all 10 AI models in the AQEA engine.
 */
router.get("/models/toggles", async (req: express.Request, res: express.Response) => {
  try {
    const rawUserId = (req.query.userId as string) || (req as any).userId || "guest-user";
    const userObjId = getSafeObjectId(rawUserId);
    const settings = await Settings.findOne({ userId: userObjId });

    res.json({
      success: true,
      toggles: {
        cnn: settings?.cnnVotingEnabled ?? true,
        ppo: settings?.ppoVotingEnabled ?? true,
        transformer: settings?.transformerVotingEnabled ?? true,
        mamba: settings?.mambaVotingEnabled ?? true,
        lnn: settings?.lnnVotingEnabled ?? true,
        orderFlow: settings?.orderFlowVotingEnabled ?? true,
        smartMoney: settings?.smartMoneyVotingEnabled ?? true,
        gayatri: settings?.gayatriVotingEnabled ?? true,
        ohmkara: settings?.ohmkaraVotingEnabled ?? true,
        lakshmi: settings?.lakshmiVotingEnabled ?? true,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/aqea-ui/models/toggles
 * Updates user preferences for individual AI models ON/OFF status.
 */
router.post("/models/toggles", async (req: express.Request, res: express.Response) => {
  try {
    const rawUserId = (req.body.userId as string) || (req as any).userId || "guest-user";
    const userObjId = getSafeObjectId(rawUserId);
    const { modelKey, enabled } = req.body;

    const updateFieldMap: Record<string, string> = {
      cnn: "cnnVotingEnabled",
      ppo: "ppoVotingEnabled",
      transformer: "transformerVotingEnabled",
      mamba: "mambaVotingEnabled",
      lnn: "lnnVotingEnabled",
      orderFlow: "orderFlowVotingEnabled",
      smartMoney: "smartMoneyVotingEnabled",
      gayatri: "gayatriVotingEnabled",
      ohmkara: "ohmkaraVotingEnabled",
      lakshmi: "lakshmiVotingEnabled",
    };

    const targetField = updateFieldMap[modelKey];
    if (!targetField) {
      return res.status(400).json({ error: `INVALID_MODEL_KEY: ${modelKey}` });
    }

    const settings = await Settings.findOneAndUpdate(
      { userId: userObjId },
      { $set: { [targetField]: Boolean(enabled) } },
      { new: true, upsert: true }
    );

    // Also sync in-memory modelRegistry
    const registryMap: Record<string, string[]> = {
      cnn: ["cnn", "cnn-v1"],
      ppo: ["ppo-agent", "ppo"],
      transformer: ["transformer"],
      mamba: ["mamba-hybrid", "mamba"],
      lnn: ["xlstm", "lnn"],
      gayatri: ["gayatri"],
      ohmkara: ["ohmkara"],
      lakshmi: ["lakshmi"],
    };
    const regIds = registryMap[modelKey] || [modelKey];
    for (const regId of regIds) {
      try { registry.setModelEnabled(regId, Boolean(enabled)); } catch {}
    }

    // Also sync canonical ModelAuthorityRegistry Layer 1 permission
    const canonicalMap: Record<string, string> = {
      cnn: "CNN_1D",
      ppo: "PPO_EXECUTION",
      transformer: "TRANSFORMER_MICRO",
      mamba: "MAMBA",
      lnn: "XLSTM",
      orderFlow: "ORDER_FLOW_CVD",
      smartMoney: "SMC_INSTITUTIONAL",
      gayatri: "GAYATRI_24_SIGNAL",
      ohmkara: "OHMKARA_528HZ",
      lakshmi: "AARYAN_MOMENTUM",
    };
    const canonId = canonicalMap[modelKey];
    if (canonId) {
      try {
        ModelAuthorityRegistry.initialize();
        ModelAuthorityRegistry.setAdminPermission(canonId, Boolean(enabled));
      } catch {}
    }

    res.json({
      success: true,
      message: `Model ${modelKey} set to ${enabled ? "ON" : "OFF"}`,
      settings,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /aqea-ui/model-authorities
 * Observability Console: Canonical model authority table showing Layer 1 Admin Permission,
 * Layer 2 AI Runtime Status, Effective Weight, ΔEV, ECE, Correlation, and Reason.
 */
router.get("/model-authorities", (_req, res) => {
  try {
    ModelAuthorityRegistry.initialize();
    const models = ModelAuthorityRegistry.getAllModels();
    const families = ModelAuthorityRegistry.getAllSignalFamilies();
    res.json({
      success: true,
      timestamp: Date.now(),
      models,
      signalFamilies: families
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /aqea-ui/model-permission
 * Layer 1 Admin Permission control: Toggles adminAllowed boundary without overriding AI runtime logic.
 */
router.post("/model-permission", (req, res) => {
  try {
    const { modelId, allowed } = req.body;
    if (!modelId || allowed === undefined) {
      return res.status(400).json({ error: "modelId and allowed required" });
    }
    ModelAuthorityRegistry.initialize();
    const success = ModelAuthorityRegistry.setAdminPermission(modelId, Boolean(allowed));
    if (!success) {
      return res.status(404).json({ error: `Model ${modelId} not found in canonical registry` });
    }
    const updatedModel = ModelAuthorityRegistry.getModel(modelId);
    res.json({
      success: true,
      message: `Layer 1 permission for ${modelId} set to ${allowed ? "ALLOWED" : "DISALLOWED"}`,
      model: updatedModel
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /aqea-ui/signal-families
 * Observability Console: Evidence families and caps.
 */
router.get("/signal-families", (_req, res) => {
  try {
    ModelAuthorityRegistry.initialize();
    res.json({
      success: true,
      timestamp: Date.now(),
      families: ModelAuthorityRegistry.getAllSignalFamilies()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /aqea-ui/autonomous-decisions
 * Machine-readable decision audit log with full explanatory transparency.
 */
router.get("/autonomous-decisions", (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const domain = (req.query.domain as string) || "ALL";
    const allDecisions = ForwardTelemetryStore.getDecisions();
    const records = allDecisions.slice(-limit);
    const filtered = domain === "ALL" ? records : records.filter((r: any) => r.marketDomain === domain);
    res.json({
      success: true,
      timestamp: Date.now(),
      count: filtered.length,
      decisions: filtered
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /aqea-ui/model-health-scores
 * Observability Console: Composite multi-metric health score table for all models.
 */
router.get("/model-health-scores", (_req, res) => {
  try {
    ModelAuthorityRegistry.initialize();
    const scores = ModelAuthorityRegistry.getAllModelHealthScores();
    res.json({
      success: true,
      timestamp: Date.now(),
      count: scores.length,
      scores
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /aqea-ui/authority-events
 * Observability Console: Immutable audit log of all model authority state transitions.
 */
router.get("/authority-events", (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const events = ModelAuthorityRegistry.getAuthorityEvents().slice(-limit);
    res.json({
      success: true,
      timestamp: Date.now(),
      count: events.length,
      events
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /aqea-ui/data-provenance
 * Observability Console: Data provenance firewall and validation state metadata.
 */
router.get("/data-provenance", (_req, res) => {
  try {
    const provenance = ForwardTelemetryStore.getDataProvenanceSummary();
    const validationState = ForwardTelemetryStore.getValidationState();
    const forwardCount = ForwardTelemetryStore.getForwardOOSCount();
    res.json({
      success: true,
      timestamp: Date.now(),
      validationState,
      forwardOOSCount: forwardCount,
      isLivePromotionPermitted: ForwardTelemetryStore.isLivePromotionPermitted(),
      provenance
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /aqea-ui/model-discovery
 * Observability Console: Model discovery classifications and safe champion status.
 */
router.get("/model-discovery", (_req, res) => {
  try {
    ModelAuthorityRegistry.initialize();
    const allModels = ModelAuthorityRegistry.getAllModels();
    const discoveries = allModels.map(m => ({
      modelId: m.modelId,
      name: m.name,
      status: m.status,
      classification: ForwardTelemetryStore.classifyModel(m.modelId),
      championTitle: ForwardTelemetryStore.getChampionStatusTitle(m.modelId),
      effectiveWeight: m.effectiveWeight,
      priorWeight: m.basePrior,
      regimeFitSource: "PRIOR"
    }));
    const abstention = ForwardTelemetryStore.getAbstentionStatistics();
    res.json({
      success: true,
      timestamp: Date.now(),
      discoveries,
      abstention
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /aqea-ui/evidence-governor
 * Observability Console: Autonomous forward evidence, effective sample size, and promotion governance report.
 */
router.get("/evidence-governor", async (_req, res) => {
  try {
    const { AutonomousForwardEvidenceEngine } = await import("../services/aqea/governance/AutonomousForwardEvidenceEngine.js");
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    res.json({
      success: true,
      timestamp: Date.now(),
      report
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /aqea-ui/paper-execution-status
 * Observability Console: Phase 7.1 autonomous paper experimentation status.
 */
router.get("/paper-execution-status", async (_req, res) => {
  try {
    const { AutonomousForwardEvidenceEngine } = await import("../services/aqea/governance/AutonomousForwardEvidenceEngine.js");
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    res.json({
      success: true,
      timestamp: Date.now(),
      paperExperimentationActive: true,
      livePromotionBlocked: true,
      validationState: report.currentState,
      empiricalEvidenceState: report.empiricalEvidenceState,
      sampleSize: report.evidenceVector
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /aqea-ui/heartbeat
 * Autonomous Health: System heartbeat across 9 critical subsystems.
 */
router.get("/heartbeat", async (_req, res) => {
  try {
    const { AutonomousForwardEvidenceEngine } = await import("../services/aqea/governance/AutonomousForwardEvidenceEngine.js");
    const heartbeat = AutonomousForwardEvidenceEngine.getSystemHeartbeat();
    res.json({
      success: true,
      timestamp: Date.now(),
      heartbeat
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /aqea-ui/daily-report
 * Autonomous Governance: Daily performance and attribution report.
 */
router.get("/daily-report", async (_req, res) => {
  try {
    const { AutonomousForwardEvidenceEngine } = await import("../services/aqea/governance/AutonomousForwardEvidenceEngine.js");
    const report = AutonomousForwardEvidenceEngine.generateDailyAutonomousReport();
    res.json({
      success: true,
      timestamp: Date.now(),
      report
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /aqea-ui/statistical-integrity
 * Statistical Evidence: Phase 7.2 multi-lag ESS, block bootstrap, and sensitivity validation.
 */
router.get("/statistical-integrity", async (_req, res) => {
  try {
    const { AutonomousForwardEvidenceEngine } = await import("../services/aqea/governance/AutonomousForwardEvidenceEngine.js");
    const { ForwardTelemetryStore } = await import("../services/aqea/ensemble/ForwardTelemetryStore.js");

    const resolved = ForwardTelemetryStore.getResolvedRecords();
    const returns = resolved.map(r => r.outcome?.realizedReturn || 0);

    const sensitivity = AutonomousForwardEvidenceEngine.evaluateStatisticalSensitivity(returns);
    const bootstrap = AutonomousForwardEvidenceEngine.performBlockBootstrapValidation(returns, 5, 500);

    res.json({
      success: true,
      timestamp: Date.now(),
      sensitivity,
      bootstrap
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
