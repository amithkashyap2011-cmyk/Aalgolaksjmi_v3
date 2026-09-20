/**
 * ─── Wallet Module Unit Tests ──────────────────────────────────────────
 *
 * Tests the wallet balance computation, aggregation filters, and HTTP
 * endpoints. Focuses on:
 *
 * 1. accountTypeMatch filter correctness (SPOT, FUTURES, INDIAN_* types)
 * 2. PAPER mode balance computation (crypto + Indian accounts)
 * 3. Response shape and field validation
 * 4. Currency field correctness (INR vs USDT)
 * 5. totalDeposited / totalDepositedInr coherence
 * 6. Edge cases: guest users, no positions, zero balance
 */

import { describe, it, expect, beforeAll, afterAll, jest, beforeEach } from "@jest/globals";
import mongoose from "mongoose";
import request from "supertest";

// ── Mock heavy dependencies that the wallet module imports ──────────

// paperState: in-memory wallets & positions
jest.unstable_mockModule("../src/services/paperState.js", () => ({
  getWallet: jest.fn<(userId: string, mode: string, accountType: string) => Map<string, number>>(),
  getOpenPositions: jest.fn<(userId: string, mode: string) => any[]>(),
  setWalletBalance: jest.fn(() => Promise.resolve()),
}));

// binanceService: live price lookups
jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getTickerPriceSync: jest.fn<(symbol: string, isFutures: boolean) => number>(),
  getAccount: jest.fn(),
  getFuturesAccount: jest.fn(),
  getFuturesPositions: jest.fn(),
}));

// pnlService: unrealised PnL
jest.unstable_mockModule("../src/services/pnlService.js", () => ({
  computeUnrealisedPnl: jest.fn<(position: any, currentPrice: number) => number>(),
}));

// sentinelAuditor: background audit
jest.unstable_mockModule("../src/services/sentinelAuditor.js", () => ({
  runSentinelAudit: jest.fn(() => Promise.resolve()),
}));

// aqeaUi: dashboard cache invalidation
jest.unstable_mockModule("../src/routes/aqeaUi.js", () => ({
  clearDashboardCache: jest.fn(),
}));

// currencyService
jest.unstable_mockModule("../src/services/currencyService.js", () => ({
  CurrencyService: {
    getRate: jest.fn(() => 95.96),
  },
}));

// razorpayService
jest.unstable_mockModule("../src/services/razorpayService.js", () => ({
  createOrder: jest.fn(),
  verifyPayment: jest.fn(),
}));

// logger
jest.unstable_mockModule("../src/utils/logger.js", () => ({
  log: jest.fn(),
}));

// auth middleware
jest.unstable_mockModule("../src/middleware/auth.js", () => ({
  authGuard: (_req: any, _res: any, next: any) => next(),
  optionalAuth: (_req: any, _res: any, next: any) => next(),
}));

// crypto (decryption)
jest.unstable_mockModule("../src/lib/crypto.js", () => ({
  decrypt: jest.fn(() => "mock-key"),
}));

// ── DB Models: lightweight stubs ────────────────────────────────────

const mockAggregate = jest.fn(() => Promise.resolve([]));

jest.unstable_mockModule("../src/models/WalletTransaction.js", () => ({
  WalletTransaction: {
    aggregate: mockAggregate,
    find: jest.fn(() => ({ sort: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) })),
    findOne: jest.fn(() => Promise.resolve(null)),
    create: jest.fn(() => Promise.resolve({})),
    insertMany: jest.fn(() => Promise.resolve([])),
    countDocuments: jest.fn(() => Promise.resolve(0)),
  },
}));

jest.unstable_mockModule("../src/models/Trade.js", () => ({
  Trade: {
    aggregate: jest.fn(() => Promise.resolve([])),
    find: jest.fn(() => ({ sort: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) })),
  },
}));

jest.unstable_mockModule("../src/models/ApiKeys.js", () => ({
  ApiKeys: {
    findOne: jest.fn(() => Promise.resolve(null)),
  },
}));

jest.unstable_mockModule("../src/models/Alert.js", () => ({
  Alert: {
    create: jest.fn(),
    find: jest.fn(() => ({ sort: () => ({ lean: () => Promise.resolve([]) }) })),
  },
}));

jest.unstable_mockModule("../src/models/WalletSnapshot.js", () => ({
  WalletSnapshot: {
    findOne: jest.fn(() => Promise.resolve(null)),
    create: jest.fn(),
  },
}));

// ── Import the module under test AFTER mocks are set up ─────────────

let computeAccountBalance: typeof import("../src/routes/wallet.js")["computeAccountBalance"];
let paper: Awaited<ReturnType<typeof import("../src/services/paperState.js")>>;
let binanceService: Awaited<ReturnType<typeof import("../src/services/binanceService.js")>>;
let pnlService: Awaited<ReturnType<typeof import("../src/services/pnlService.js")>>;

beforeAll(async () => {
  // Stub mongoose connection readyState as disconnected (1 = connected)
  // so getCachedWalletAggregates' DB branch doesn't fire in unit tests
  // (we test aggregation filtering separately below).
  Object.defineProperty(mongoose.connection, "readyState", {
    get: () => 0, // disconnected
    configurable: true,
  });

  const walletMod = await import("../src/routes/wallet.js");
  computeAccountBalance = walletMod.computeAccountBalance;

  paper = await import("../src/services/paperState.js");
  binanceService = await import("../src/services/binanceService.js");
  pnlService = await import("../src/services/pnlService.js");
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── HELPERS ────────────────────────────────────────────────────────

const TEST_USER = "guest-user";
const RATE = 95.96; // INR per USDT

function mockWallet(balances: Record<string, number>) {
  const m = new Map<string, number>(Object.entries(balances));
  (paper.getWallet as jest.Mock).mockReturnValue(m);
}

function mockNoPositions() {
  (paper.getOpenPositions as jest.Mock).mockReturnValue([]);
}

// ────────────────────────────────────────────────────────────────────
// 1. PAPER MODE – CRYPTO ACCOUNTS
// ────────────────────────────────────────────────────────────────────

describe("Wallet: computeAccountBalance (PAPER mode)", () => {

  describe("SPOT account", () => {
    it("returns USDT balance with correct currency field", async () => {
      mockWallet({ USDT: 250 });
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", "SPOT", RATE);

      expect(result.currency).toBe("USDT");
      expect(result.usdt).toBe(250);
      expect(result.totalBalance).toBe(250);
      expect(result.realizedBalance).toBe(250);
      expect(result.inrEquivalent).toBe(+(250 * RATE).toFixed(2));
      expect(result.balanceUnknown).toBe(false);
    });

    it("includes unrealized PnL from open spot positions", async () => {
      mockWallet({ USDT: 200 });
      (paper.getOpenPositions as jest.Mock).mockReturnValue([
        { symbol: "BTCUSDT", accountType: "SPOT", quantity: 0.01, entryPrice: 50000, leverage: 1 },
      ]);
      (binanceService.getTickerPriceSync as jest.Mock).mockReturnValue(55000);
      (pnlService.computeUnrealisedPnl as jest.Mock).mockReturnValue(50); // +$50 unrealized

      const result = await computeAccountBalance(TEST_USER, "PAPER", "SPOT", RATE);

      // lockedMargin = 0.01 * 50000 / 1 = 500
      expect(result.lockedMargin).toBe(500);
      // realizedBalance = usdt(200) + lockedMargin(500) = 700
      expect(result.realizedBalance).toBe(700);
      // totalBalance = 700 + unrealizedPnl(50) = 750
      expect(result.totalBalance).toBe(750);
    });
  });

  describe("FUTURES account", () => {
    it("returns USDT balance for futures with leverage-adjusted margin", async () => {
      mockWallet({ USDT: 1000 });
      (paper.getOpenPositions as jest.Mock).mockReturnValue([
        { symbol: "ETHUSDT", accountType: "FUTURES", quantity: 1, entryPrice: 3000, leverage: 10 },
      ]);
      (binanceService.getTickerPriceSync as jest.Mock).mockReturnValue(3100);
      (pnlService.computeUnrealisedPnl as jest.Mock).mockReturnValue(100);

      const result = await computeAccountBalance(TEST_USER, "PAPER", "FUTURES", RATE);

      expect(result.currency).toBe("USDT");
      // lockedMargin = 1 * 3000 / 10 = 300
      expect(result.lockedMargin).toBe(300);
      // realizedBalance = 1000 + 300 = 1300
      expect(result.realizedBalance).toBe(1300);
      // totalBalance = 1300 + 100 = 1400
      expect(result.totalBalance).toBe(1400);
    });

    it("filters positions to only FUTURES account type", async () => {
      mockWallet({ USDT: 500 });
      (paper.getOpenPositions as jest.Mock).mockReturnValue([
        { symbol: "BTCUSDT", accountType: "SPOT", quantity: 0.1, entryPrice: 50000, leverage: 1 },
        { symbol: "ETHUSDT", accountType: "FUTURES", quantity: 2, entryPrice: 3000, leverage: 20 },
      ]);
      (binanceService.getTickerPriceSync as jest.Mock).mockReturnValue(3100);
      (pnlService.computeUnrealisedPnl as jest.Mock).mockReturnValue(200);

      const result = await computeAccountBalance(TEST_USER, "PAPER", "FUTURES", RATE);

      // Only FUTURES position: lockedMargin = 2 * 3000 / 20 = 300
      expect(result.lockedMargin).toBe(300);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 2. PAPER MODE – INDIAN ACCOUNTS
  // ──────────────────────────────────────────────────────────────────

  describe("INDIAN_NSE account", () => {
    it("returns INR-denominated balance with usdt=0", async () => {
      mockWallet({ INR: 9000 });
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", "INDIAN_NSE", RATE);

      expect(result.currency).toBe("INR");
      expect(result.usdt).toBe(0);
      expect(result.inr).toBe(9000);
      expect(result.totalBalance).toBe(9000);
      expect(result.realizedBalance).toBe(9000);
      // inrEquivalent for Indian = totalBalance (already INR)
      expect(result.inrEquivalent).toBe(9000);
    });

    it("includes margin from open Indian positions", async () => {
      mockWallet({ INR: 5000 });
      (paper.getOpenPositions as jest.Mock).mockReturnValue([
        { symbol: "RELIANCE", accountType: "INDIAN_NSE", quantity: 10, entryPrice: 2500, leverage: 1 },
      ]);
      (binanceService.getTickerPriceSync as jest.Mock).mockReturnValue(2600);
      (pnlService.computeUnrealisedPnl as jest.Mock).mockReturnValue(1000);

      const result = await computeAccountBalance(TEST_USER, "PAPER", "INDIAN_NSE", RATE);

      // lockedMargin = 10 * 2500 / 1 = 25000
      expect(result.lockedMargin).toBe(25000);
      // realizedBalance = INR(5000) + lockedMargin(25000) = 30000
      expect(result.realizedBalance).toBe(30000);
      // totalBalance = 30000 + unrealizedPnl(1000) = 31000
      expect(result.totalBalance).toBe(31000);
    });
  });

  describe("INDIAN_BSE account", () => {
    it("correctly identifies as Indian and uses INR currency", async () => {
      mockWallet({ INR: 4000 });
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", "INDIAN_BSE", RATE);

      expect(result.currency).toBe("INR");
      expect(result.usdt).toBe(0);
      expect(result.totalBalance).toBe(4000);
    });
  });

  describe("INDIAN_NIFTY50 account", () => {
    it("correctly identifies as Indian and uses INR currency", async () => {
      mockWallet({ INR: 4000 });
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", "INDIAN_NIFTY50", RATE);

      expect(result.currency).toBe("INR");
      expect(result.usdt).toBe(0);
      expect(result.totalBalance).toBe(4000);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 3. RESPONSE SHAPE VALIDATION
  // ──────────────────────────────────────────────────────────────────

  describe("Response shape", () => {
    it("returns all required financial fields", async () => {
      mockWallet({ USDT: 100 });
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", "SPOT", RATE);

      const requiredFields = [
        "usdt", "inr", "currency", "totalBalance", "lockedMargin",
        "savingsUsdt", "isUnactivated", "balanceUnknown", "realizedBalance",
        "bookedProfit", "inrEquivalent", "inrRate", "totalDeposited",
        "totalDepositedInr", "totalWithdrawn", "realizedPnL", "userId",
      ];

      for (const field of requiredFields) {
        expect(result).toHaveProperty(field);
      }
    });

    it("all numeric fields are actual numbers, not NaN or strings", async () => {
      mockWallet({ USDT: 0 });
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", "FUTURES", RATE);

      const numericFields = [
        "usdt", "inr", "totalBalance", "lockedMargin", "savingsUsdt",
        "realizedBalance", "bookedProfit", "inrEquivalent", "inrRate",
        "totalDeposited", "totalDepositedInr", "totalWithdrawn", "realizedPnL",
      ];

      for (const field of numericFields) {
        const val = (result as any)[field];
        expect(typeof val).toBe("number");
        expect(Number.isNaN(val)).toBe(false);
      }
    });

    it("includes inrRate matching the provided rate", async () => {
      mockWallet({ USDT: 100 });
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", "SPOT", RATE);
      expect(result.inrRate).toBe(RATE);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 4. EDGE CASES
  // ──────────────────────────────────────────────────────────────────

  describe("Edge cases", () => {
    it("handles empty wallet (zero balance)", async () => {
      mockWallet({});
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", "SPOT", RATE);

      expect(result.usdt).toBe(0);
      expect(result.totalBalance).toBe(0);
      expect(result.lockedMargin).toBe(0);
      expect(result.inrEquivalent).toBe(0);
    });

    it("handles wallet with no USDT key for crypto", async () => {
      mockWallet({ BTC: 0.5 }); // USDT key doesn't exist
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", "SPOT", RATE);

      expect(result.usdt).toBe(0);
      expect(result.totalBalance).toBe(0);
    });

    it("handles wallet with no INR key for Indian", async () => {
      mockWallet({}); // INR key doesn't exist
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", "INDIAN_NSE", RATE);

      expect(result.inr).toBe(0);
      expect(result.totalBalance).toBe(0);
    });

    it("returns userId in the response", async () => {
      mockWallet({ USDT: 100 });
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", "SPOT", RATE);
      expect(result.userId).toBe(TEST_USER);
    });

    it("handles multiple open positions of the same account type", async () => {
      mockWallet({ USDT: 1000 });
      (paper.getOpenPositions as jest.Mock).mockReturnValue([
        { symbol: "BTCUSDT", accountType: "FUTURES", quantity: 0.1, entryPrice: 50000, leverage: 10 },
        { symbol: "ETHUSDT", accountType: "FUTURES", quantity: 2, entryPrice: 3000, leverage: 20 },
        { symbol: "BNBUSDT", accountType: "FUTURES", quantity: 5, entryPrice: 400, leverage: 5 },
      ]);
      (binanceService.getTickerPriceSync as jest.Mock).mockReturnValue(0); // will fallback to entry
      (pnlService.computeUnrealisedPnl as jest.Mock).mockReturnValue(0);

      const result = await computeAccountBalance(TEST_USER, "PAPER", "FUTURES", RATE);

      // lockedMargin = (0.1*50000/10) + (2*3000/20) + (5*400/5)
      //             = 500 + 300 + 400 = 1200
      expect(result.lockedMargin).toBe(1200);
      // realizedBalance = 1000 + 1200 = 2200
      expect(result.realizedBalance).toBe(2200);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 5. CURRENCY CORRECTNESS
  // ──────────────────────────────────────────────────────────────────

  describe("Currency correctness", () => {
    it.each([
      ["SPOT", "USDT"],
      ["FUTURES", "USDT"],
      ["INDIAN_NSE", "INR"],
      ["INDIAN_BSE", "INR"],
      ["INDIAN_NIFTY50", "INR"],
    ])("account type %s returns currency=%s", async (accountType, expectedCurrency) => {
      if (accountType.startsWith("INDIAN_")) {
        mockWallet({ INR: 1000 });
      } else {
        mockWallet({ USDT: 100 });
      }
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", accountType, RATE);
      expect(result.currency).toBe(expectedCurrency);
    });

    it("Indian accounts always return usdt=0 regardless of wallet contents", async () => {
      mockWallet({ USDT: 999, INR: 5000 });
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", "INDIAN_NSE", RATE);
      expect(result.usdt).toBe(0);
      // INR balance should still be reported
      expect(result.totalBalance).toBe(5000);
    });

    it("crypto inrEquivalent = totalBalance * rate", async () => {
      mockWallet({ USDT: 300 });
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", "SPOT", RATE);
      expect(result.inrEquivalent).toBe(+(300 * RATE).toFixed(2));
    });

    it("Indian inrEquivalent = totalBalance (already INR)", async () => {
      mockWallet({ INR: 7500 });
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", "INDIAN_NSE", RATE);
      expect(result.inrEquivalent).toBe(7500);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 6. DEPOSITS AGGREGATION (disconnected DB → defaults to 0)
  // ──────────────────────────────────────────────────────────────────

  describe("Deposits aggregation (DB disconnected)", () => {
    it("totalDeposited defaults to 0 when DB is not connected", async () => {
      mockWallet({ USDT: 500 });
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", "SPOT", RATE);

      expect(result.totalDeposited).toBe(0);
      expect(result.totalDepositedInr).toBe(0);
      expect(result.totalWithdrawn).toBe(0);
      expect(result.realizedPnL).toBe(0);
    });

    it("bookedProfit = max(0, realizedPnL - withdrawals) = 0 when both are 0", async () => {
      mockWallet({ USDT: 100 });
      mockNoPositions();

      const result = await computeAccountBalance(TEST_USER, "PAPER", "FUTURES", RATE);
      expect(result.bookedProfit).toBe(0);
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// 7. accountTypeMatch FILTER (the bug we fixed)
//    — Tests the MongoDB aggregation filter logic that was broken for
//    Indian account types. We test this by connecting the DB mock.
// ────────────────────────────────────────────────────────────────────

describe("Wallet: accountTypeMatch filter correctness", () => {
  let walletModule: typeof import("../src/routes/wallet.js");
  let WalletTransactionMock: any;

  beforeAll(async () => {
    walletModule = await import("../src/routes/wallet.js");
    WalletTransactionMock = (await import("../src/models/WalletTransaction.js")).WalletTransaction;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // To test the filter, we need to enable DB connection and provide a
  // valid userId. We'll set readyState=1, mock a valid ObjectId, and
  // capture what $match query is passed to aggregate().
  it("SPOT filter matches exactly { accountType: 'SPOT' }", async () => {
    // Temporarily enable DB
    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 1,
      configurable: true,
    });

    const validId = new mongoose.Types.ObjectId().toString();
    mockWallet({ USDT: 100 });
    mockNoPositions();

    // The aggregate mock captures calls
    mockAggregate.mockResolvedValue([]);
    const TradeModel = (await import("../src/models/Trade.js")).Trade;
    (TradeModel.aggregate as jest.Mock).mockResolvedValue([]);

    await walletModule.computeAccountBalance(validId, "PAPER", "SPOT", RATE);

    // Verify the $match contains { accountType: "SPOT" }
    const calls = mockAggregate.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2); // deposits + withdrawals

    const depositPipeline = calls[0][0];
    const matchStage = depositPipeline[0].$match;
    expect(matchStage.accountType).toBe("SPOT");
    expect(matchStage.$or).toBeUndefined();

    // Restore disconnected state
    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 0,
      configurable: true,
    });
  });

  it("FUTURES filter matches { $or: [FUTURES, not-exists, null] }", async () => {
    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 1,
      configurable: true,
    });

    const validId = new mongoose.Types.ObjectId().toString();
    mockWallet({ USDT: 100 });
    mockNoPositions();
    mockAggregate.mockResolvedValue([]);
    const TradeModel = (await import("../src/models/Trade.js")).Trade;
    (TradeModel.aggregate as jest.Mock).mockResolvedValue([]);

    await walletModule.computeAccountBalance(validId, "PAPER", "FUTURES", RATE);

    const calls = mockAggregate.mock.calls;
    const matchStage = calls[0][0][0].$match;
    expect(matchStage.$or).toBeDefined();
    expect(matchStage.$or).toEqual(
      expect.arrayContaining([
        { accountType: "FUTURES" },
        { accountType: { $exists: false } },
        { accountType: null },
      ])
    );

    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 0,
      configurable: true,
    });
  });

  it("INDIAN_NSE filter matches exactly { accountType: 'INDIAN_NSE' } (the fixed bug)", async () => {
    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 1,
      configurable: true,
    });

    const validId = new mongoose.Types.ObjectId().toString();
    mockWallet({ INR: 5000 });
    mockNoPositions();
    mockAggregate.mockResolvedValue([]);
    const TradeModel = (await import("../src/models/Trade.js")).Trade;
    (TradeModel.aggregate as jest.Mock).mockResolvedValue([]);

    await walletModule.computeAccountBalance(validId, "PAPER", "INDIAN_NSE", RATE);

    const calls = mockAggregate.mock.calls;
    const matchStage = calls[0][0][0].$match;

    // CRITICAL: Before the fix, this would have been $or: [FUTURES, ...]
    // which would never match INDIAN_NSE transactions → totalDeposited = 0.
    expect(matchStage.accountType).toBe("INDIAN_NSE");
    expect(matchStage.$or).toBeUndefined();

    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 0,
      configurable: true,
    });
  });

  it("INDIAN_BSE filter matches exactly { accountType: 'INDIAN_BSE' }", async () => {
    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 1,
      configurable: true,
    });

    const validId = new mongoose.Types.ObjectId().toString();
    mockWallet({ INR: 4000 });
    mockNoPositions();
    mockAggregate.mockResolvedValue([]);
    const TradeModel = (await import("../src/models/Trade.js")).Trade;
    (TradeModel.aggregate as jest.Mock).mockResolvedValue([]);

    await walletModule.computeAccountBalance(validId, "PAPER", "INDIAN_BSE", RATE);

    const calls = mockAggregate.mock.calls;
    const matchStage = calls[0][0][0].$match;
    expect(matchStage.accountType).toBe("INDIAN_BSE");
    expect(matchStage.$or).toBeUndefined();

    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 0,
      configurable: true,
    });
  });

  it("INDIAN_NIFTY50 filter matches exactly { accountType: 'INDIAN_NIFTY50' }", async () => {
    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 1,
      configurable: true,
    });

    const validId = new mongoose.Types.ObjectId().toString();
    mockWallet({ INR: 4000 });
    mockNoPositions();
    mockAggregate.mockResolvedValue([]);
    const TradeModel = (await import("../src/models/Trade.js")).Trade;
    (TradeModel.aggregate as jest.Mock).mockResolvedValue([]);

    await walletModule.computeAccountBalance(validId, "PAPER", "INDIAN_NIFTY50", RATE);

    const calls = mockAggregate.mock.calls;
    const matchStage = calls[0][0][0].$match;
    expect(matchStage.accountType).toBe("INDIAN_NIFTY50");
    expect(matchStage.$or).toBeUndefined();

    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 0,
      configurable: true,
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// 8. DEPOSIT CONVERSION CORRECTNESS
//    — When DB returns deposit groups, verify INR→USDT conversion
// ────────────────────────────────────────────────────────────────────

describe("Wallet: deposit currency conversion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("converts INR deposits to USDT using the provided rate", async () => {
    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 1,
      configurable: true,
    });

    const validId = new mongoose.Types.ObjectId().toString();
    mockWallet({ INR: 9000 });
    mockNoPositions();

    // Simulate aggregate returning an INR deposit group
    mockAggregate
      .mockResolvedValueOnce([{ _id: "INR", total: 5000 }])  // deposits
      .mockResolvedValueOnce([]);  // withdrawals

    const TradeModel = (await import("../src/models/Trade.js")).Trade;
    (TradeModel.aggregate as jest.Mock).mockResolvedValue([]);

    const result = await computeAccountBalance(validId, "PAPER", "INDIAN_NSE", RATE);

    // deposits = 5000 INR / 95.96 rate ≈ 52.1065 USDT
    expect(result.totalDeposited).toBeCloseTo(5000 / RATE, 2);
    // totalDepositedInr should be back-converted: deposits * rate ≈ 5000
    expect(result.totalDepositedInr).toBeCloseTo(5000, 0);

    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 0,
      configurable: true,
    });
  });

  it("sums USDT deposits without conversion", async () => {
    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 1,
      configurable: true,
    });

    const validId = new mongoose.Types.ObjectId().toString();
    mockWallet({ USDT: 250 });
    mockNoPositions();

    mockAggregate
      .mockResolvedValueOnce([{ _id: "USDT", total: 250 }])  // deposits
      .mockResolvedValueOnce([]);  // withdrawals

    const TradeModel = (await import("../src/models/Trade.js")).Trade;
    (TradeModel.aggregate as jest.Mock).mockResolvedValue([]);

    const result = await computeAccountBalance(validId, "PAPER", "SPOT", RATE);

    expect(result.totalDeposited).toBe(250);
    expect(result.totalDepositedInr).toBe(+(250 * RATE).toFixed(2));

    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 0,
      configurable: true,
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// 9. BOOKED PROFIT CALCULATION
// ────────────────────────────────────────────────────────────────────

describe("Wallet: bookedProfit calculation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("bookedProfit = max(0, realizedPnL - withdrawals) when PnL > withdrawals", async () => {
    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 1,
      configurable: true,
    });

    const validId = new mongoose.Types.ObjectId().toString();
    mockWallet({ USDT: 500 });
    mockNoPositions();

    mockAggregate
      .mockResolvedValueOnce([{ _id: "USDT", total: 200 }])  // deposits
      .mockResolvedValueOnce([{ _id: "USDT", total: 50 }]);   // withdrawals

    const TradeModel = (await import("../src/models/Trade.js")).Trade;
    (TradeModel.aggregate as jest.Mock).mockResolvedValue([{ _id: null, total: 150 }]); // realizedPnL = 150

    const result = await computeAccountBalance(validId, "PAPER", "SPOT", RATE);

    // bookedProfit = max(0, 150 - 50) = 100
    expect(result.bookedProfit).toBe(100);
    expect(result.totalWithdrawn).toBe(50);
    expect(result.realizedPnL).toBe(150);

    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 0,
      configurable: true,
    });
  });

  it("bookedProfit is clamped to 0 when withdrawals > realizedPnL", async () => {
    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 1,
      configurable: true,
    });

    const validId = new mongoose.Types.ObjectId().toString();
    mockWallet({ USDT: 500 });
    mockNoPositions();

    mockAggregate
      .mockResolvedValueOnce([])  // deposits
      .mockResolvedValueOnce([{ _id: "USDT", total: 100 }]);  // withdrawals

    const TradeModel = (await import("../src/models/Trade.js")).Trade;
    (TradeModel.aggregate as jest.Mock).mockResolvedValue([{ _id: null, total: 30 }]); // pnl=30 < withdrawn=100

    const result = await computeAccountBalance(validId, "PAPER", "SPOT", RATE);

    // bookedProfit = max(0, 30 - 100) = max(0, -70) = 0
    expect(result.bookedProfit).toBe(0);

    Object.defineProperty(mongoose.connection, "readyState", {
      get: () => 0,
      configurable: true,
    });
  });
});

describe("Wallet: /deposit/test-funds endpoint unit tests", () => {
  let app: any;
  let paperMock: any;
  const testUserId = new mongoose.Types.ObjectId().toString();

  beforeAll(async () => {
    const express = (await import("express")).default;
    const router = (await import("../src/routes/wallet.js")).default;
    paperMock = await import("../src/services/paperState.js");

    app = express();
    app.use(express.json());
    // Attach testUserId to req for authGuard
    app.use((req: any, _res: any, next: any) => {
      req.userId = testUserId;
      next();
    });
    app.use("/wallet", router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects non-positive deposit amount with 400", async () => {
    const res = await request(app)
      .post("/wallet/deposit/test-funds")
      .send({ amount: 0, currency: "INR" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid deposit amount/i);
  });

  it("converts INR to USDT for SPOT deposit using exchange rate", async () => {
    (paperMock.getWallet as jest.Mock).mockReturnValue(new Map([["USDT", 0]]));

    const res = await request(app)
      .post("/wallet/deposit/test-funds")
      .send({ amount: 10000, accountType: "SPOT", currency: "INR" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.currency).toBe("INR");
    // 10000 / 95.96 = 104.2101 USDT (never 10,000 USDT!)
    expect(res.body.totalUsdt).toBeCloseTo(104.21, 1);
    expect(paperMock.setWalletBalance).toHaveBeenCalledWith(
      testUserId,
      "PAPER",
      "USDT",
      expect.closeTo(104.21, 1),
      "SPOT",
      "PAPER_INITIALIZATION"
    );
  });

  it("converts INR to USDT for FUTURES deposit using exchange rate", async () => {
    (paperMock.getWallet as jest.Mock).mockReturnValue(new Map([["USDT", 50]]));

    const res = await request(app)
      .post("/wallet/deposit/test-funds")
      .send({ amount: 10000, accountType: "FUTURES", currency: "INR" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.currency).toBe("INR");
    // 10000 / 95.96 = 104.2101 USDT + 50 current = 154.21 USDT
    expect(res.body.totalUsdt).toBeCloseTo(104.21, 1);
    expect(res.body.newBalance).toBeCloseTo(154.21, 1);
    expect(paperMock.setWalletBalance).toHaveBeenCalledWith(
      testUserId,
      "PAPER",
      "USDT",
      expect.closeTo(154.21, 1),
      "FUTURES",
      "PAPER_INITIALIZATION"
    );
  });

  it("splits INR 50/50 between SPOT and FUTURES when accountType is BOTH", async () => {
    (paperMock.getWallet as jest.Mock).mockReturnValue(new Map([["USDT", 0]]));

    const res = await request(app)
      .post("/wallet/deposit/test-funds")
      .send({ amount: 20000, accountType: "BOTH", currency: "INR" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.accountType).toBe("BOTH");
    // 20,000 INR total = ~208.42 USDT total -> ~104.21 USDT to SPOT and ~104.21 USDT to FUTURES
    expect(res.body.totalUsdt).toBeCloseTo(208.42, 1);
    expect(res.body.spotBalance).toBeCloseTo(104.21, 1);
    expect(res.body.futuresBalance).toBeCloseTo(104.21, 1);
    expect(paperMock.setWalletBalance).toHaveBeenCalledWith(
      testUserId,
      "PAPER",
      "USDT",
      expect.closeTo(104.21, 1),
      "SPOT",
      "PAPER_INITIALIZATION"
    );
    expect(paperMock.setWalletBalance).toHaveBeenCalledWith(
      testUserId,
      "PAPER",
      "USDT",
      expect.closeTo(104.21, 1),
      "FUTURES",
      "PAPER_INITIALIZATION"
    );
  });

  it("deposits native INR without conversion when accountType is INDIAN_NSE", async () => {
    (paperMock.getWallet as jest.Mock).mockReturnValue(new Map([["INR", 5000]]));

    const res = await request(app)
      .post("/wallet/deposit/test-funds")
      .send({ amount: 10000, accountType: "INDIAN_NSE", currency: "INR" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.currency).toBe("INR");
    expect(res.body.deposited).toBe(10000);
    expect(res.body.newBalance).toBe(15000);
    expect(paperMock.setWalletBalance).toHaveBeenCalledWith(
      testUserId,
      "PAPER",
      "INR",
      15000,
      "INDIAN_NSE",
      "PAPER_INITIALIZATION"
    );
  });
});
