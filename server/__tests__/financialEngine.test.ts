/**
 * ─── financialEngine.ts — unit tests ─────────────────────────────────────────
 *
 * Tests every formula in computeDomainMetrics() with mathematical proof
 * for each assertion. These tests are the regression guard for all 8 bugs
 * fixed in the 2026-08 financial architecture refactor.
 */

import { computeDomainMetrics, aggregateOpenByType, SENTINEL_REASONS, isCryptoTrade, isIndianTrade } from "../src/services/financialEngine.js";

// ─── Shared test fixture helpers ──────────────────────────────────────────────

function makeTrade(overrides: Partial<{
  pnl: number; accountType: string; status: string;
  entryPrice: number; quantity: number; leverage: number;
  closedAt: Date | null; side: string; meta: any;
}> = {}) {
  return {
    pnl: 0,
    accountType: "FUTURES",
    status: "CLOSED",
    entryPrice: 100,
    quantity: 1,
    leverage: 1,
    closedAt: new Date(),
    side: "BUY",
    meta: {},
    ...overrides,
  };
}

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const YESTERDAY = new Date(TODAY.getTime() - 24 * 60 * 60 * 1000);

// ─── Suite 1: Portfolio Equity formula ───────────────────────────────────────

describe("computeDomainMetrics — Portfolio Equity", () => {
  test("totalEquity = spotBalance + spotOpenPnL + futuresBalance + futuresOpenPnL", () => {
    // PROOF: 1000 + 50 + 5000 + (-100) = 5950
    const result = computeDomainMetrics({
      closedTrades: [],
      openTrades: [],
      allTrades: [],
      walletBalances: { spot: 1000, futures: 5000 },
      openPnlByType: { spot: 50, futures: -100 },
      investedByType: { spot: 0, futures: 0 },
      notionalByType: { spot: 0, futures: 0 },
      startOfDay: TODAY,
    });
    expect(result.totalEquity).toBe(5950);
  });

  test("totalEquity is 0 when all wallets and positions are zero", () => {
    const result = computeDomainMetrics({
      closedTrades: [],
      openTrades: [],
      allTrades: [],
      walletBalances: { spot: 0, futures: 0 },
      openPnlByType: { spot: 0, futures: 0 },
      investedByType: { spot: 0, futures: 0 },
      notionalByType: { spot: 0, futures: 0 },
      startOfDay: TODAY,
    });
    expect(result.totalEquity).toBe(0);
  });

  test("totalEquity handles negative open PnL (losing positions)", () => {
    // PROOF: 0 + (-500) + 10000 + (-1000) = 8500
    const result = computeDomainMetrics({
      closedTrades: [],
      openTrades: [],
      allTrades: [],
      walletBalances: { spot: 0, futures: 10000 },
      openPnlByType: { spot: -500, futures: -1000 },
      investedByType: { spot: 0, futures: 0 },
      notionalByType: { spot: 0, futures: 0 },
      startOfDay: TODAY,
    });
    expect(result.totalEquity).toBe(8500);
  });
});

// ─── Suite 2: Daily P&L formula ──────────────────────────────────────────────

describe("computeDomainMetrics — Daily P&L", () => {
  test("dailyPnL = today's closed pnl + open pnl", () => {
    // PROOF: 200 (closed today) + 50 (spot open) + (-30) (futures open) = 220
    const closedToday = [
      makeTrade({ pnl: 200, closedAt: new Date() }),  // today
    ];
    const result = computeDomainMetrics({
      closedTrades: closedToday,
      openTrades: [],
      allTrades: closedToday,
      walletBalances: { spot: 1000, futures: 1000 },
      openPnlByType: { spot: 50, futures: -30 },
      investedByType: { spot: 0, futures: 0 },
      notionalByType: { spot: 0, futures: 0 },
      startOfDay: TODAY,
    });
    expect(result.dailyPnL).toBe(220);
  });

  test("dailyPnL excludes trades closed yesterday", () => {
    // PROOF: yesterday trade should NOT count in daily pnl.
    // Only open pnl contributes.
    const closedYesterday = [
      makeTrade({ pnl: 500, closedAt: YESTERDAY }),
    ];
    const result = computeDomainMetrics({
      closedTrades: closedYesterday,
      openTrades: [],
      allTrades: closedYesterday,
      walletBalances: { spot: 1000, futures: 1000 },
      openPnlByType: { spot: 10, futures: 10 },
      investedByType: { spot: 0, futures: 0 },
      notionalByType: { spot: 0, futures: 0 },
      startOfDay: TODAY,
    });
    expect(result.dailyPnL).toBe(20);  // only open pnl (10 + 10)
    expect(result.totalAllTimePnL).toBe(520); // realized 500 + open 20
  });
});

// ─── Suite 3: Win Rate formula ────────────────────────────────────────────────

describe("computeDomainMetrics — Win Rate", () => {
  test("realizedWinRate = winners / total closed × 100", () => {
    // PROOF: 3 wins out of 4 closed = 75%
    const closed = [
      makeTrade({ pnl:  100 }),
      makeTrade({ pnl:  200 }),
      makeTrade({ pnl:  50 }),
      makeTrade({ pnl: -80 }),
    ];
    const result = computeDomainMetrics({
      closedTrades: closed, openTrades: [], allTrades: closed,
      walletBalances: { spot: 0, futures: 10000 },
      openPnlByType: { spot: 0, futures: 0 },
      investedByType: { spot: 0, futures: 0 },
      notionalByType: { spot: 0, futures: 0 },
      startOfDay: TODAY,
    });
    expect(result.realizedWinRate).toBe(75.0);
    expect(result.winRate).toBe(75.0);
  });

  test("winRate falls back to overallWinRate when no closed trades exist", () => {
    // PROOF: 0 closed trades → use overall. 1 open winner / 1 open total = 100%
    const openTrades = [
      { ...makeTrade({ pnl: 50, status: "OPEN" }) },
    ];
    const result = computeDomainMetrics({
      closedTrades: [], openTrades, allTrades: openTrades,
      walletBalances: { spot: 0, futures: 1000 },
      openPnlByType: { spot: 0, futures: 50 },
      investedByType: { spot: 0, futures: 0 },
      notionalByType: { spot: 0, futures: 0 },
      startOfDay: TODAY,
    });
    expect(result.realizedWinRate).toBe(0);       // no closed trades
    expect(result.winRate).toBe(100.0);            // fallback to overall
  });

  test("winRate is 0 when no trades exist at all", () => {
    const result = computeDomainMetrics({
      closedTrades: [], openTrades: [], allTrades: [],
      walletBalances: { spot: 0, futures: 10000 },
      openPnlByType: { spot: 0, futures: 0 },
      investedByType: { spot: 0, futures: 0 },
      notionalByType: { spot: 0, futures: 0 },
      startOfDay: TODAY,
    });
    expect(result.winRate).toBe(0);
    expect(result.realizedWinRate).toBe(0);
  });
});

// ─── Suite 4: All-Time PnL formula ───────────────────────────────────────────

describe("computeDomainMetrics — All-Time PnL", () => {
  test("totalAllTimePnL = netRealized + openPnL", () => {
    // PROOF: (100 - 50) realized + (50 + (-20)) open = 50 + 30 = 80
    const closed = [
      makeTrade({ pnl: 100 }),
      makeTrade({ pnl: -50 }),
    ];
    const result = computeDomainMetrics({
      closedTrades: closed, openTrades: [], allTrades: closed,
      walletBalances: { spot: 0, futures: 10000 },
      openPnlByType: { spot: 50, futures: -20 },
      investedByType: { spot: 0, futures: 0 },
      notionalByType: { spot: 0, futures: 0 },
      startOfDay: TODAY,
    });
    expect(result.netPnL.total).toBe(50);
    expect(result.totalAllTimePnL).toBe(80);
  });

  test("totalAllTimePnL is negative when losses exceed gains", () => {
    // PROOF: (-200 + 50) realized + 0 open = -150
    const closed = [
      makeTrade({ pnl: -200 }),
      makeTrade({ pnl:  50 }),
    ];
    const result = computeDomainMetrics({
      closedTrades: closed, openTrades: [], allTrades: closed,
      walletBalances: { spot: 0, futures: 10000 },
      openPnlByType: { spot: 0, futures: 0 },
      investedByType: { spot: 0, futures: 0 },
      notionalByType: { spot: 0, futures: 0 },
      startOfDay: TODAY,
    });
    expect(result.netPnL.total).toBe(-150);
    expect(result.totalAllTimePnL).toBe(-150);
  });
});

// ─── Suite 5: Net PnL split (SPOT vs FUTURES) ────────────────────────────────

describe("computeDomainMetrics — Net PnL split", () => {
  test("netPnL.spot and netPnL.futures are correctly attributed", () => {
    // SPOT: 100, FUTURES: -40
    const closed = [
      makeTrade({ pnl: 100, accountType: "SPOT" }),
      makeTrade({ pnl: -40, accountType: "FUTURES" }),
    ];
    const result = computeDomainMetrics({
      closedTrades: closed, openTrades: [], allTrades: closed,
      walletBalances: { spot: 0, futures: 10000 },
      openPnlByType: { spot: 0, futures: 0 },
      investedByType: { spot: 0, futures: 0 },
      notionalByType: { spot: 0, futures: 0 },
      startOfDay: TODAY,
    });
    expect(result.netPnL.spot).toBe(100);
    expect(result.netPnL.futures).toBe(-40);
    expect(result.netPnL.total).toBe(60);
  });
});

// ─── Suite 6: Profit Factor ────────────────────────────────────────────────

describe("computeDomainMetrics — Profit Factor", () => {
  test("profitFactor = gross profit / gross loss", () => {
    // PROOF: 300 / 100 = 3.00
    const closed = [
      makeTrade({ pnl: 200 }),
      makeTrade({ pnl: 100 }),
      makeTrade({ pnl: -100 }),
    ];
    const result = computeDomainMetrics({
      closedTrades: closed, openTrades: [], allTrades: closed,
      walletBalances: { spot: 0, futures: 10000 },
      openPnlByType: { spot: 0, futures: 0 },
      investedByType: { spot: 0, futures: 0 },
      notionalByType: { spot: 0, futures: 0 },
      startOfDay: TODAY,
    });
    expect(result.profitFactor).toBe(3);
  });

  test('profitFactor is "MAX" when there are only winning trades', () => {
    const closed = [makeTrade({ pnl: 100 }), makeTrade({ pnl: 200 })];
    const result = computeDomainMetrics({
      closedTrades: closed, openTrades: [], allTrades: closed,
      walletBalances: { spot: 0, futures: 10000 },
      openPnlByType: { spot: 0, futures: 0 },
      investedByType: { spot: 0, futures: 0 },
      notionalByType: { spot: 0, futures: 0 },
      startOfDay: TODAY,
    });
    expect(result.profitFactor).toBe("MAX");
  });
});

// ─── Suite 7: Domain classification helpers ───────────────────────────────────

describe("isCryptoTrade / isIndianTrade (BUG-04 regression)", () => {
  test("SPOT and FUTURES are classified as crypto", () => {
    expect(isCryptoTrade({ accountType: "SPOT" })).toBe(true);
    expect(isCryptoTrade({ accountType: "FUTURES" })).toBe(true);
    expect(isCryptoTrade({ accountType: "INDIAN_NSE" })).toBe(false);
  });

  test("INDIAN_NSE, INDIAN_BSE, INDIAN_NIFTY50 are classified as Indian", () => {
    expect(isIndianTrade({ accountType: "INDIAN_NSE" })).toBe(true);
    expect(isIndianTrade({ accountType: "INDIAN_BSE" })).toBe(true);
    expect(isIndianTrade({ accountType: "INDIAN_NIFTY50" })).toBe(true);
    expect(isIndianTrade({ accountType: "FUTURES" })).toBe(false);
  });

  test("undefined accountType defaults to crypto (FUTURES assumed)", () => {
    expect(isCryptoTrade({ accountType: undefined })).toBe(true);
    expect(isIndianTrade({ accountType: undefined })).toBe(false);
  });
});

// ─── Suite 8: aggregateOpenByType ─────────────────────────────────────────────

describe("aggregateOpenByType", () => {
  test("correctly sums openPnl, notional, invested by slot (SPOT vs FUTURES)", () => {
    const openTrades = [
      { accountType: "SPOT",    quantity: 1, entryPrice: 100, leverage: 1, pnl: 10  },
      { accountType: "FUTURES", quantity: 2, entryPrice: 200, leverage: 10, pnl: -5 },
    ];
    const result = aggregateOpenByType(openTrades, "SPOT", "FUTURES");
    // SPOT: notional = 1×100 = 100, margin = 100/1 = 100, pnl = 10
    expect(result.notionalByType.spot).toBe(100);
    expect(result.investedByType.spot).toBe(100);
    expect(result.openPnlByType.spot).toBe(10);
    // FUTURES: notional = 2×200 = 400, margin = 400/10 = 40, pnl = -5
    expect(result.notionalByType.futures).toBe(400);
    expect(result.investedByType.futures).toBe(40);
    expect(result.openPnlByType.futures).toBe(-5);
  });
});

// ─── Suite 9: Mode isolation (BUG-01 regression) ─────────────────────────────

describe("SENTINEL_REASONS filter (BUG-01 regression guard)", () => {
  test("SENTINEL-closed trades are excluded from win rate and net PnL", () => {
    const allClosed = [
      makeTrade({ pnl: 500, meta: { closeReason: "SENTINEL_AUTO_PURGE" } }),
      makeTrade({ pnl: 100 }),
    ];
    // SENTINEL filter applied before passing to computeDomainMetrics
    const filtered = allClosed.filter(t => !SENTINEL_REASONS.has(t.meta?.closeReason));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].pnl).toBe(100);

    const result = computeDomainMetrics({
      closedTrades: filtered, openTrades: [], allTrades: allClosed,
      walletBalances: { spot: 0, futures: 10000 },
      openPnlByType: { spot: 0, futures: 0 },
      investedByType: { spot: 0, futures: 0 },
      notionalByType: { spot: 0, futures: 0 },
      startOfDay: TODAY,
    });
    expect(result.netPnL.total).toBe(100);    // SENTINEL pnl excluded
    expect(result.realizedWinRate).toBe(100); // 1/1 = 100%
  });
});
