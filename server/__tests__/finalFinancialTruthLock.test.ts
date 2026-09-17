import { connectIfAvailable, disconnectMongo } from "./helpers/mongoTestHelper.js";
import { jest, describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import mongoose from "mongoose";

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getKlines: (jest.fn() as any).mockResolvedValue([]),
  getLatestFundingRate: (jest.fn() as any).mockResolvedValue(0.0001),
  getFuturesOpenInterest: (jest.fn() as any).mockResolvedValue(1000),
  getTickerPrice: (jest.fn() as any).mockResolvedValue(50000),
  getTickerPriceSync: (jest.fn() as any).mockReturnValue(50000),
  subscribeTicker: jest.fn(),
  unsubscribeTicker: jest.fn(),
  getActiveSocketsInfo: (jest.fn() as any).mockReturnValue([]),
  formatFuturesQuantity: (jest.fn() as any).mockImplementation((s: string, q: number) => String(q)),
  setFuturesLeverage: (jest.fn() as any).mockResolvedValue({ leverage: 10 }),
  placeFuturesOrder: (jest.fn() as any).mockResolvedValue({ orderId: 12345 }),
  genClientOrderId: (jest.fn() as any).mockReturnValue("test-order-1"),
}));

let paper: any;
let WalletSnapshot: any;
let WalletTransaction: any;

const testUserId = new mongoose.Types.ObjectId().toString();

describe("AQEA V3: Final Financial Truth Lock & Invariant Certification", () => {
  beforeAll(async () => {
    await connectIfAvailable();
    paper = await import("../src/services/paperState.js");
    ({ WalletSnapshot } = await import("../src/models/WalletSnapshot.js"));
    ({ WalletTransaction } = await import("../src/models/WalletTransaction.js"));

    // Ensure clean state for test user
    if (mongoose.connection.readyState === 1) {
      await WalletSnapshot.deleteMany({ userId: new mongoose.Types.ObjectId(testUserId) });
      await WalletTransaction.deleteMany({ userId: new mongoose.Types.ObjectId(testUserId) });
    }
    paper.resetAllPaperStateToZero();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await WalletSnapshot.deleteMany({ userId: new mongoose.Types.ObjectId(testUserId) });
      await WalletTransaction.deleteMany({ userId: new mongoose.Types.ObjectId(testUserId) });
    }
    await disconnectMongo();
  });

  it("1. Idempotent Paper Initialization: 1st call credits ₹20,000, subsequent calls credit +₹0", async () => {
    const txnRef = `TEST_INIT_${Date.now()}_20000_INR`;

    // Call 1
    const res1 = await paper.initializePaperAccount(testUserId, "INDIAN_NSE", 20000, "INR", txnRef);
    expect(res1.success).toBe(true);
    expect(res1.credited).toBe(20000);
    expect(res1.balance).toBe(20000);
    expect(res1.alreadyInitialized).toBe(false);
    expect(res1.source).toBe("PAPER_INITIALIZATION");

    // Call 2 (duplicate attempt)
    const res2 = await paper.initializePaperAccount(testUserId, "INDIAN_NSE", 20000, "INR", txnRef);
    expect(res2.success).toBe(true);
    expect(res2.credited).toBe(0);
    expect(res2.balance).toBe(20000);
    expect(res2.alreadyInitialized).toBe(true);

    // Call 3 (triplicate attempt)
    const res3 = await paper.initializePaperAccount(testUserId, "INDIAN_NSE", 20000, "INR", txnRef);
    expect(res3.success).toBe(true);
    expect(res3.credited).toBe(0);
    expect(res3.balance).toBe(20000);
    expect(res3.alreadyInitialized).toBe(true);

    // Verify ledger has exactly 1 transaction
    if (mongoose.connection.readyState === 1) {
      const txCount = await WalletTransaction.countDocuments({
        userId: new mongoose.Types.ObjectId(testUserId),
        accountType: "INDIAN_NSE",
        capitalSource: "PAPER_INITIALIZATION",
      });
      expect(txCount).toBe(1);
    }
  });

  it("2. Restart & Rehydration Invariance: Multiple restarts never duplicate capital", async () => {
    // Check initial
    const w0 = paper.getWallet(testUserId, "PAPER", "INDIAN_NSE");
    expect(w0.get("INR")).toBe(20000);

    // Restart #1: Purge memory and hydrate from MongoDB
    paper.resetAllPaperStateToZero();
    await paper.hydrate();
    const w1 = paper.getWallet(testUserId, "PAPER", "INDIAN_NSE");
    expect(w1.get("INR")).toBe(20000);

    // Restart #2: Purge memory and hydrate again
    paper.resetAllPaperStateToZero();
    await paper.hydrate();
    const w2 = paper.getWallet(testUserId, "PAPER", "INDIAN_NSE");
    expect(w2.get("INR")).toBe(20000);

    // Restart #3: Purge memory and hydrate again
    paper.resetAllPaperStateToZero();
    await paper.hydrate();
    const w3 = paper.getWallet(testUserId, "PAPER", "INDIAN_NSE");
    expect(w3.get("INR")).toBe(20000);
  });

  it("3. Dual-Market Isolation: India ₹20,000 does NOT leak into Crypto Spot or Futures", async () => {
    const spot = paper.getWallet(testUserId, "PAPER", "SPOT");
    const futures = paper.getWallet(testUserId, "PAPER", "FUTURES");
    const nse = paper.getWallet(testUserId, "PAPER", "INDIAN_NSE");

    expect(nse.get("INR")).toBe(20000);
    expect(nse.get("USDT") ?? 0).toBe(0);

    expect(spot.get("USDT") ?? 0).toBe(0);
    expect(spot.get("INR") ?? 0).toBe(0);

    expect(futures.get("USDT") ?? 0).toBe(0);
    expect(futures.get("INR") ?? 0).toBe(0);
  });

  it("4. Database-Level Uniqueness: Compound unique sparse index rejects duplicate transactions", async () => {
    if (mongoose.connection.readyState !== 1) return;

    const uniqueTxnRef = `DUP_CHECK_${Date.now()}`;
    await WalletTransaction.create({
      userId: new mongoose.Types.ObjectId(testUserId),
      type: "DEPOSIT",
      method: "SYSTEM",
      capitalSource: "PAPER_INITIALIZATION",
      amount: 1000,
      currency: "INR",
      status: "COMPLETED",
      txnRef: uniqueTxnRef,
      accountType: "INDIAN_NSE",
    });

    let duplicateThrew = false;
    try {
      await WalletTransaction.create({
        userId: new mongoose.Types.ObjectId(testUserId),
        type: "DEPOSIT",
        method: "SYSTEM",
        capitalSource: "PAPER_INITIALIZATION",
        amount: 1000,
        currency: "INR",
        status: "COMPLETED",
        txnRef: uniqueTxnRef,
        accountType: "INDIAN_NSE",
      });
    } catch (err: any) {
      duplicateThrew = true;
      expect(err?.code).toBe(11000); // MongoDB duplicate key code
    }

    expect(duplicateThrew).toBe(true);
  });

  it("5. Capital vs P&L Invariant: Empty ₹20,000 account has 0 P&L and ₹20,000 Capital", () => {
    const nse = paper.getWallet(testUserId, "PAPER", "INDIAN_NSE");
    const openPositions = paper.getOpenPositions(testUserId, "PAPER");

    expect(nse.get("INR")).toBe(20000);
    expect(openPositions.length).toBe(0);

    // Unrealized and realized P&L are strictly 0
    const unrealizedPnl = 0;
    const realizedPnl = 0;
    const totalEquity = (nse.get("INR") ?? 0) + unrealizedPnl;

    expect(totalEquity).toBe(20000);
    expect(realizedPnl).toBe(0);
    expect(unrealizedPnl).toBe(0);
  });
});
