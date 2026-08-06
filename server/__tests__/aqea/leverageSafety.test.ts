import { jest } from '@jest/globals';

const chainMock = {
  lean: (jest.fn() as any).mockResolvedValue([])
};

jest.unstable_mockModule("../../src/models/Trade.js", () => ({
  Trade: { find: jest.fn().mockReturnValue(chainMock) }
}));

const mockSetWalletBalance = jest.fn() as any;
const mockGetWallet = jest.fn() as any;
const mockGetOpenPositions = jest.fn() as any;

jest.unstable_mockModule("../../src/services/paperState.js", () => ({
  setWalletBalance: mockSetWalletBalance,
  getWallet: mockGetWallet,
  getOpenPositions: mockGetOpenPositions,
  getWalletStats: jest.fn()
}));

let RiskEngine: any, Trade: any;
beforeAll(async () => {
  ({ RiskEngine } = await import("../../src/services/aqea/riskEngine.js"));
  ({ Trade } = await import("../../src/models/Trade.js"));
});

describe("Phase 5: Leverage Safety Validation", () => {
  const userId = "69c2bc93c8601b4eaf3abe2f";
  
  beforeEach(() => {
    jest.clearAllMocks();
    if (Trade?.find) {
      jest.spyOn(Trade, "find").mockReturnValue(chainMock as any);
    }
    mockGetWallet.mockReturnValue(new Map([["USDT", 10000]]));
    mockGetOpenPositions.mockReturnValue([]);
  });

  test("Leverage is capped at 10x even if calculation suggests more", async () => {
    const ctx: any = {
      userId, symbol: "BTCUSDT", mode: "PAPER", accountType: "FUTURES",
      currentPrice: 100000, 
      atr: 500,
      winRate: 0.6, rewardRisk: 2, fundingRate: 0.0001
    };

    const res = await RiskEngine.validateTrade(ctx);
    expect(res.leverage).toBeLessThanOrEqual(10);
  });
});
