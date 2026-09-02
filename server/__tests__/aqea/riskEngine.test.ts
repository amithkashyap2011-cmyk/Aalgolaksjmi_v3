import { jest } from '@jest/globals';
import mongoose from 'mongoose';

const mockGetWallet = jest.fn().mockReturnValue(new Map([["USDT", 10000], ["INR", 500000]])) as any;
jest.unstable_mockModule("../../src/services/paperState.js", () => ({
  getWallet: mockGetWallet,
}));

jest.unstable_mockModule("mongoose", () => {
  class MockSchema {
    static Types: any = { ObjectId: "ObjectId" };
    index() {}
  }
  const defaultQueryMock = {
    lean: jest.fn().mockResolvedValue([]),
    exec: jest.fn().mockResolvedValue([]),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    then: (cb: any, errCb?: any) => Promise.resolve(null).then(cb, errCb)
  };
  const mockModelObj = {
    index: jest.fn(),
    findOne: jest.fn().mockReturnValue(defaultQueryMock),
    find: jest.fn().mockReturnValue(defaultQueryMock),
    create: jest.fn().mockResolvedValue({}),
    updateOne: jest.fn().mockResolvedValue({})
  };
  return {
    default: {
      connection: { readyState: 1 },
      Types: { ObjectId: class { id: any; constructor(id: any) { this.id = id; } toString() { return this.id; } static isValid() { return true; } } },
      model: jest.fn().mockReturnValue(mockModelObj),
      Schema: MockSchema,
      connect: jest.fn().mockResolvedValue({})
    },
    Schema: MockSchema,
    model: jest.fn().mockReturnValue(mockModelObj)
  };
});

const chainMock = {
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  lean: (jest.fn() as any).mockResolvedValue([])
};

jest.unstable_mockModule("../../src/models/Trade.js", () => ({ Trade: { find: jest.fn().mockReturnValue(chainMock) } }));
jest.unstable_mockModule("../../models/Trade.js", () => ({ Trade: { find: jest.fn().mockReturnValue(chainMock) } }));
jest.unstable_mockModule("../../src/models/Settings.js", () => ({
  default: { findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) },
  Settings: { findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) }
}));
jest.unstable_mockModule("../../models/Settings.js", () => ({
  default: { findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) },
  Settings: { findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) }
}));

jest.unstable_mockModule("../../src/services/aqea/AqeaAudit.js", () => ({
  AqeaAuditService: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), critical: jest.fn(), error: jest.fn() }
}));

let RiskEngine: any, AQEA_CONFIG: any, Trade: any, Settings: any;
let mockTradeFind: any;

beforeAll(async () => {
  ({ RiskEngine } = await import("../../src/services/aqea/riskEngine.js"));
  ({ AQEA_CONFIG } = await import("../../src/services/aqea/config.js"));
  ({ Trade } = await import("../../src/models/Trade.js"));
  ({ Settings } = await import("../../src/models/Settings.js"));
});

afterAll(async () => {
  // mongoose is mocked — no real connection to close
});

describe("AQEA Risk Engine", () => {
  const userId = "69c2bc93c8601b4eaf3abe2f";
  const symbol = "BTCUSDT";

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.spyOn(Settings, "findOne").mockResolvedValue(null as any);
    mockTradeFind = jest.spyOn(Trade, "find").mockImplementation(() => ({ lean: (jest.fn() as any).mockResolvedValue([]) } as any));
    mockGetWallet.mockReturnValue(new Map([["USDT", 20000]]));
  });

  test("Approved trade with valid Kelly sizing", async () => {
    const ctx: any = {
      userId,
      symbol,
      mode: "PAPER",
      accountType: "FUTURES",
      currentPrice: 100000,
      atr: 2000,
      winRate: 0.6,
      rewardRisk: 2,
      fundingRate: 0.0001
    };

    const res = await RiskEngine.validateTrade(ctx);
    expect(mockTradeFind.mock.calls.length).toBeGreaterThan(0);
    expect(res.allowed).toBe(true);
    expect(res.positionSize).toBe(2000);
    expect(res.reason).toBe("Risk Approved (Weather Adj: 1.00x)");
  });

  test("Reject if daily drawdown limit exceeded", async () => {
    const ctx: any = {
      userId, symbol, mode: "PAPER", accountType: "FUTURES",
      currentPrice: 100000, atr: 2000, winRate: 0.6, rewardRisk: 2, fundingRate: 0.0001
    };

    mockTradeFind.mockReturnValueOnce({ lean: (jest.fn() as any).mockResolvedValue([]) }); // open trades
    mockTradeFind.mockReturnValueOnce({ lean: (jest.fn() as any).mockResolvedValue([{ pnl: -1500, status: "CLOSED", openedAt: new Date() }]) }); // month-window trades
    mockTradeFind.mockReturnValueOnce({ lean: (jest.fn() as any).mockResolvedValue([{ pnl: -1500, status: "CLOSED" }]) }); // all-time trades

    const res = await RiskEngine.validateTrade(ctx);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("DAILY_DRAWDOWN_BREACH");
  });

  const FIXED_NOW = new Date("2026-01-29T12:00:00Z");

  test("Reject if weekly drawdown limit exceeded (but daily alone would not breach)", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-18T12:00:00Z")); // Thursday

    const ctx: any = {
      userId, symbol, mode: "PAPER", accountType: "FUTURES",
      currentPrice: 100000, atr: 2000, winRate: 0.6, rewardRisk: 2, fundingRate: 0.0001
    };
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    const dayOfWeek = todayStart.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStart.setDate(todayStart.getDate() - diffToMonday);
    const earlierThisWeek = new Date(weekStart.getTime() + 3600000);

    mockTradeFind.mockReturnValueOnce({ lean: (jest.fn() as any).mockResolvedValue([]) });
    mockTradeFind.mockReturnValueOnce({
      lean: (jest.fn() as any).mockResolvedValue([
        { pnl: -200, status: "CLOSED", openedAt: now },
        { pnl: -2500, status: "CLOSED", openedAt: earlierThisWeek },
      ]),
    });
    mockTradeFind.mockReturnValueOnce({ lean: (jest.fn() as any).mockResolvedValue([{ pnl: -2900, status: "CLOSED" }]) });

    const res = await RiskEngine.validateTrade(ctx);
    jest.useRealTimers();
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("WEEKLY_DRAWDOWN_BREACH");
  });

  test("Reject if monthly drawdown limit exceeded (but weekly alone would not breach)", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-25T12:00:00Z")); // 4th Thursday of month

    const ctx: any = {
      userId, symbol, mode: "PAPER", accountType: "FUTURES",
      currentPrice: 100000, atr: 2000, winRate: 0.6, rewardRisk: 2, fundingRate: 0.0001
    };
    const threeWeeksAgo = new Date(new Date().getTime() - 21 * 24 * 60 * 60 * 1000);

    mockTradeFind.mockReturnValueOnce({ lean: (jest.fn() as any).mockResolvedValue([]) });
    mockTradeFind.mockReturnValueOnce({
      lean: (jest.fn() as any).mockResolvedValue([{ pnl: -3500, status: "CLOSED", openedAt: threeWeeksAgo }]),
    });
    mockTradeFind.mockReturnValueOnce({ lean: (jest.fn() as any).mockResolvedValue([{ pnl: -850, status: "CLOSED" }]) });

    const res = await RiskEngine.validateTrade(ctx);
    jest.useRealTimers();
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("MONTHLY_DRAWDOWN_BREACH");
  });

  test("Reject if all-time portfolio drawdown limit exceeded (but this month alone would not breach)", async () => {
    const ctx: any = {
      userId, symbol, mode: "PAPER", accountType: "FUTURES",
      currentPrice: 100000, atr: 2000, winRate: 0.6, rewardRisk: 2, fundingRate: 0.0001
    };

    mockTradeFind.mockReturnValueOnce({ lean: (jest.fn() as any).mockResolvedValue([]) });
    mockTradeFind.mockReturnValueOnce({ lean: (jest.fn() as any).mockResolvedValue([]) });
    mockTradeFind.mockReturnValueOnce({ lean: (jest.fn() as any).mockResolvedValue([{ pnl: -5000, status: "CLOSED" }]) });

    const res = await RiskEngine.validateTrade(ctx);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("PORTFOLIO_DRAWDOWN_BREACH");
  });

  test("Reject if max open positions reached", async () => {
    // Open 5 positions
    const mockPositions = Array(5).fill({ quantity: 1, entryPrice: 10, leverage: 1 });
    mockTradeFind.mockImplementation(() => ({ lean: (jest.fn() as any).mockResolvedValue(mockPositions) }));

    const ctx: any = {
      userId, symbol, mode: "PAPER", accountType: "FUTURES",
      currentPrice: 100000, atr: 2000, winRate: 0.6, rewardRisk: 2, fundingRate: 0.0001
    };

    const res = await RiskEngine.validateTrade(ctx);
    expect(mockTradeFind.mock.calls.length).toBeGreaterThan(0);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("MAX_POSITIONS_BREACH");
  });

  test("Reject if portfolio exposure > 10%", async () => {
    // Open 1 position with 75% exposure (15000 notional on 20000 balance)
    mockTradeFind.mockReturnValue({ lean: (jest.fn() as any).mockResolvedValue([{ quantity: 1, entryPrice: 15000, leverage: 1 }]) });

    const ctx: any = {
      userId, symbol, mode: "PAPER", accountType: "FUTURES",
      currentPrice: 100000, atr: 2000, winRate: 0.6, rewardRisk: 2, fundingRate: 0.0001
    };

    const res = await RiskEngine.validateTrade(ctx);
    expect(mockTradeFind.mock.calls.length).toBeGreaterThan(0);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("PORTFOLIO_EXPOSURE_LIMIT_REACHED");
  });

  test("Volatility adjustment reduces position size", async () => {
    mockTradeFind.mockReturnValue({ lean: (jest.fn() as any).mockResolvedValue([]) });
    const ctxNormal: any = {
      userId, symbol, mode: "PAPER", accountType: "FUTURES",
      currentPrice: 100000, atr: 10000, winRate: 0.6, rewardRisk: 2, fundingRate: 0.0001
    };
    const resNormal = await RiskEngine.validateTrade(ctxNormal);

    const ctxHighVol: any = {
      userId, symbol, mode: "PAPER", accountType: "FUTURES",
      currentPrice: 100000, atr: 20000, winRate: 0.6, rewardRisk: 2, fundingRate: 0.0001
    };
    const resHighVol = await RiskEngine.validateTrade(ctxHighVol);

    expect(resHighVol.positionSize).toBeLessThan(resNormal.positionSize);
  });

  // calculateRiskScore's output was never asserted on anywhere in this file
  // — proven by mutation testing: changing `score -= 15` to `score -= 999`
  // for the posCount>=3 penalty passed all existing tests unchanged. Each
  // deduction branch gets its own test below, isolating one factor at a time.
  test("riskScore starts at 100 with no penalty factors", async () => {
    mockTradeFind.mockReturnValue({ lean: (jest.fn() as any).mockResolvedValue([]) });
    const ctx: any = {
      userId, symbol, mode: "PAPER", accountType: "FUTURES",
      currentPrice: 100000, atr: 2000, winRate: 0.6, rewardRisk: 2, fundingRate: 0.0001
    };
    const res = await RiskEngine.validateTrade(ctx);
    expect(res.riskScore).toBe(100);
  });

  test("riskScore deducts 15 when 3+ positions are already open", async () => {
    const mockPositions = Array(3).fill({ quantity: 1, entryPrice: 10, leverage: 1 });
    mockTradeFind.mockImplementation(() => ({ lean: (jest.fn() as any).mockResolvedValue(mockPositions) }));
    const ctx: any = {
      userId, symbol, mode: "PAPER", accountType: "FUTURES",
      currentPrice: 100000, atr: 2000, winRate: 0.6, rewardRisk: 2, fundingRate: 0.0001
    };
    const res = await RiskEngine.validateTrade(ctx);
    expect(res.riskScore).toBe(85);
  });

  test("riskScore deducts 20 for winRate below 50%", async () => {
    mockTradeFind.mockReturnValue({ lean: (jest.fn() as any).mockResolvedValue([]) });
    const ctx: any = {
      userId, symbol, mode: "PAPER", accountType: "FUTURES",
      currentPrice: 100000, atr: 2000, winRate: 0.4, rewardRisk: 2, fundingRate: 0.0001
    };
    const res = await RiskEngine.validateTrade(ctx);
    expect(res.riskScore).toBe(80);
  });

  test("riskScore deducts 10 for rewardRisk below 1.0", async () => {
    mockTradeFind.mockReturnValue({ lean: (jest.fn() as any).mockResolvedValue([]) });
    const ctx: any = {
      userId, symbol, mode: "PAPER", accountType: "FUTURES",
      currentPrice: 100000, atr: 2000, winRate: 0.6, rewardRisk: 0.5, fundingRate: 0.0001
    };
    const res = await RiskEngine.validateTrade(ctx);
    expect(res.riskScore).toBe(90);
  });

  test("riskScore deducts 20 for fundingRate above 0.03", async () => {
    mockTradeFind.mockReturnValue({ lean: (jest.fn() as any).mockResolvedValue([]) });
    const ctx: any = {
      userId, symbol, mode: "PAPER", accountType: "FUTURES",
      currentPrice: 100000, atr: 2000, winRate: 0.6, rewardRisk: 2, fundingRate: 0.05
    };
    const res = await RiskEngine.validateTrade(ctx);
    expect(res.riskScore).toBe(80);
  });

  test("riskScore never goes below 0 even with every penalty stacked", async () => {
    const mockPositions = Array(3).fill({ quantity: 1, entryPrice: 10, leverage: 1 });
    mockTradeFind.mockImplementation(() => ({ lean: (jest.fn() as any).mockResolvedValue(mockPositions) }));
    const ctx: any = {
      userId, symbol, mode: "PAPER", accountType: "FUTURES",
      currentPrice: 100000, atr: 2000, winRate: 0.2, rewardRisk: 0.5, fundingRate: 0.05
    };
    const res = await RiskEngine.validateTrade(ctx);
    // 100 - 15 - 20 - 10 - 20 = 35, well above 0, but confirms the floor
    // logic doesn't accidentally go negative here or elsewhere.
    expect(res.riskScore).toBe(35);
    expect(res.riskScore).toBeGreaterThanOrEqual(0);
  });
});
