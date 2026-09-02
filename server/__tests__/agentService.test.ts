/*
 * ─── Agent Service Tests — buildContext ────────────────
 *
 * agentService.ts previously exported a rule-based scoring layer
 * (scoreLong/scoreExit/scoreNoTrade/decideAction) that this file used to
 * unit-test as pure functions. That layer has been removed entirely —
 * decisions are now made by AQEAEngine's weighted-vote ensemble (see
 * __tests__/aqea/engine.integration.test.ts and friends for its coverage).
 * agentService.ts's only remaining public API is `buildContext`, which
 * assembles the AgentContext consumed by AQEAEngine.decide(). This file
 * tests that assembly instead of the removed scoring functions.
 */
import { jest } from '@jest/globals';

const chainMock = {
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: (jest.fn() as any).mockResolvedValue([]),
};

const klineBars = Array.from({ length: 200 }, (_, i) => ({
  open: String(100 + i * 0.01), high: String(100 + i * 0.01 + 1),
  low: String(100 + i * 0.01 - 1), close: String(100 + i * 0.01), volume: "1000",
}));

class MockObjectId {
  id: any;
  constructor(id: any) { this.id = id; }
  toString() { return this.id; }
  static isValid() { return true; }
}

const mockConn = { readyState: 1 };

jest.unstable_mockModule("mongoose", () => ({
  default: {
    connection: mockConn,
    Types: { ObjectId: MockObjectId },
    Schema: class { static Types: any = { ObjectId: "ObjectId" }; index() {} },
    model: jest.fn()
  },
  connection: mockConn,
  Types: { ObjectId: MockObjectId }
}));

const mockGetKlines = jest.fn() as any;
const mockGetLatestFundingRate = jest.fn() as any;

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getKlines: mockGetKlines,
  getLatestFundingRate: mockGetLatestFundingRate,
  generateSyntheticKlines: (jest.fn() as any).mockReturnValue(klineBars),
  getKlinesWithProvenance: (jest.fn() as any).mockResolvedValue({ klines: klineBars, provenance: "LIVE_REST", isSynthetic: false }),
  getTickerPriceSync: (jest.fn() as any).mockReturnValue(100),
  subscribeTicker: jest.fn(),
  unsubscribeTicker: jest.fn(),
  getActiveSocketsInfo: (jest.fn() as any).mockReturnValue([]),
  placeFuturesOrder: jest.fn(),
  placeOrder: jest.fn(),
  genClientOrderId: (jest.fn() as any).mockReturnValue("test_order_id")
}));

const mockSettingsFindOne = jest.fn() as any;
jest.unstable_mockModule("../src/models/Settings.js", () => ({
  Settings: { findOne: mockSettingsFindOne },
  default: { findOne: mockSettingsFindOne }
}));

const mockTradeFind = jest.fn().mockReturnValue(chainMock) as any;
const mockTradeFindOne = jest.fn().mockReturnValue(chainMock) as any;
jest.unstable_mockModule("../src/models/Trade.js", () => ({
  Trade: { find: mockTradeFind, findOne: mockTradeFindOne },
  default: { find: mockTradeFind, findOne: mockTradeFindOne }
}));

const mockGetOpenPositions = jest.fn().mockReturnValue([]) as any;
jest.unstable_mockModule("../src/services/paperState.js", () => ({
  getOpenPositions: mockGetOpenPositions,
}));

jest.unstable_mockModule("../src/services/mlModelService.js", () => ({
  predict: (jest.fn() as any).mockResolvedValue({ profitProbability: 0.5, expectedReturn: 0, confidence: 0, modelName: "stub-ml-v0" }),
  buildMLFeatures: jest.fn().mockReturnValue({}),
}));

jest.unstable_mockModule("../src/services/dlModelService.js", () => ({
  predictSequence: (jest.fn() as any).mockResolvedValue({ directionScore: 0.5, predictedMove: 0, confidence: 0, modelName: "stub-dl-v0" }),
  buildSequenceInput: jest.fn().mockReturnValue({ symbol: "BTCUSDT", timeframe: "5m", window: [] }),
}));

jest.unstable_mockModule("../src/services/modelRegistry.js", () => ({
  applyDynamicMarketWeights: jest.fn(),
}));

let buildContext: any;
beforeAll(async () => {
  ({ buildContext } = await import("../src/services/agentService.js"));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetKlines.mockResolvedValue(klineBars);
  mockGetLatestFundingRate.mockResolvedValue(0.0001);
  mockSettingsFindOne.mockResolvedValue(null);
  mockTradeFind.mockReturnValue(chainMock);
  mockTradeFindOne.mockReturnValue(chainMock);
  mockGetOpenPositions.mockReturnValue([]);
});

describe("buildContext", () => {
  test("assembles bars and indicators from fetched klines", async () => {
    const ctx = await buildContext("BTCUSDT", "PAPER", "user123");
    expect(ctx.symbol).toBe("BTCUSDT");
    expect(ctx.mode).toBe("PAPER");
    expect(ctx.bars.length).toBe(200);
    expect(ctx.ind.close).toBeCloseTo(parseFloat(klineBars[klineBars.length - 1].close), 1);
  });

  test("falls back to default risk config when Settings has no document", async () => {
    mockSettingsFindOne.mockResolvedValue(null);
    const ctx = await buildContext("BTCUSDT", "PAPER", "user123");
    expect(ctx.risk.maxDailyLoss).toBe(100);
    expect(ctx.risk.maxPositionSizePct).toBe(21);
    expect(ctx.risk.capitalPreservationMode).toBe(true);
  });

  test("uses the user's saved risk config when Settings has one", async () => {
    mockSettingsFindOne.mockResolvedValue({
      riskConfig: { maxDailyLoss: 250, maxPositionSizePct: 10, defaultSL: 1, defaultTP: 2, trailingSL: 0.5, defaultLeverage: 3, maxConcurrentPositions: 5, maxPortfolioHeat: 30, capitalPreservationMode: false, riskEngineEnabled: true, autoCloseEnabled: true, dynamicSLTP: false, multiStageTP: false },
    });
    const ctx = await buildContext("BTCUSDT", "PAPER", "user123");
    expect(ctx.risk.maxDailyLoss).toBe(250);
    expect(ctx.risk.maxPositionSizePct).toBe(10);
  });

  test("dailyPnl and tradesToday are computed only from today's trades", async () => {
    mockTradeFind.mockReturnValue({
      ...chainMock,
      lean: (jest.fn() as any).mockResolvedValue([{ pnl: 5 }, { pnl: -2 }, { pnl: 3 }]),
    });
    const ctx = await buildContext("BTCUSDT", "PAPER", "user123");
    expect(ctx.dailyPnl).toBe(6);
    expect(ctx.tradesToday).toBe(3);
    // The query must scope by today's start, not return all-time trades —
    // verify the find() call included a date filter, not an unfiltered query.
    expect(mockTradeFind).toHaveBeenCalledWith(
      expect.objectContaining({ openedAt: expect.any(Object) }),
    );
  });

  test("openPositionCount reflects paperState, not the trade history query", async () => {
    mockGetOpenPositions.mockReturnValue([{}, {}, {}]);
    const ctx = await buildContext("BTCUSDT", "PAPER", "user123");
    expect(ctx.openPositionCount).toBe(3);
  });

  test("animalBlend is always the neutral stub — the 10-animal model no longer feeds any decision", async () => {
    const ctx = await buildContext("BTCUSDT", "PAPER", "user123");
    expect(ctx.animalBlend.score).toBe(0);
    expect(ctx.animalBlend.contributions).toEqual({});
  });

  test("htfTrendBullish defaults true and is skipped when bypassHtfTrendGate is set", async () => {
    mockSettingsFindOne.mockResolvedValue({ bypassHtfTrendGate: true });
    const ctx = await buildContext("BTCUSDT", "PAPER", "user123");
    expect(ctx.htfTrendBullish).toBe(true);
    expect(ctx.bypassHtfTrendGate).toBe(true);
    // Only the 200-bar 5m fetch should happen — the 1h HTF fetch is skipped.
    expect(mockGetKlines).toHaveBeenCalledTimes(1);
  });

  test("fundingRate defaults to 0 on Binance failure rather than a fabricated value", async () => {
    mockGetLatestFundingRate.mockRejectedValue(new Error("network error"));
    const ctx = await buildContext("BTCUSDT", "PAPER", "user123");
    expect(ctx.fundingRate).toBe(0);
  });

  test("lastTradeMinutesAgo is 9999 (effectively 'never') when there is no trade history", async () => {
    mockTradeFindOne.mockReturnValue({ ...chainMock, lean: (jest.fn() as any).mockResolvedValue(null) });
    const ctx = await buildContext("BTCUSDT", "PAPER", "user123");
    expect(ctx.lastTradeMinutesAgo).toBe(9999);
  });

  test("isOverdrive and noLossMode reflect Settings flags, defaulting false", async () => {
    const ctxDefault = await buildContext("BTCUSDT", "PAPER", "user123");
    expect(ctxDefault.isOverdrive).toBe(false);
    expect(ctxDefault.noLossMode).toBe(false);

    mockSettingsFindOne.mockResolvedValue({ overdrive: true, noLossMode: true });
    const ctxSet = await buildContext("BTCUSDT", "PAPER", "user123");
    expect(ctxSet.isOverdrive).toBe(true);
    expect(ctxSet.noLossMode).toBe(true);
  });
});
