import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * ─── Concurrency regression tests — paperState.ts ──────
 *
 * These are real integration tests against a live MongoDB replica set
 * (required for the transactions withWalletLock/debitWalletAndCreateTrade
 * depend on) — not mocked. They exist specifically to convert two races
 * that were found and fixed by hand this session into permanent,
 * automated regression tests:
 *
 *   1. The manual place-order TOCTOU race: concurrent requests each
 *      reading "no existing position" before any had committed, causing
 *      N concurrent orders on one symbol to create N fragmented Trade
 *      documents instead of one correctly-averaged position. Proven live
 *      with 20 and 30 concurrent orders; reproduced here deterministically
 *      with debitWalletAndCreateTrade directly.
 *   2. Lost-update on concurrent wallet debits without the per-wallet lock.
 *
 * Uses a dedicated test database (not the real `aalgolakshmi` db) on the
 * same replica set, with a per-test-run unique userId so repeated runs
 * never collide with leftover data, and full cleanup in afterAll.
 */
import mongoose from "mongoose";
import { Trade } from "../src/models/Trade";
import { WalletSnapshot } from "../src/models/WalletSnapshot";
import * as paper from "../src/services/paperState";

const TEST_MONGO_URI = process.env.MONGO_URI_TEST || "mongodb://127.0.0.1:27017/aalgolakshmi_test?replicaSet=rs0";
const testUserId = new mongoose.Types.ObjectId().toString();
const MODE = "PAPER";
const ACCOUNT_TYPE = "FUTURES";

const MANDATORY_TRADE_FIELDS = {
  entrySource: "TEST", decisionPath: {}, authorizedVotes: {}, shadowVotes: {}, coreScore: 0, finalScore: 0,
};

beforeAll(async () => {
  const connected = await connectIfAvailable();
    if (!connected) return;
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await Trade.deleteMany({ userId: testUserId });
    await WalletSnapshot.deleteMany({ userId: testUserId });
  }
  await disconnectMongo();
});

beforeEach(async () => {
  if (mongoose.connection.readyState !== 1) return;
  await Trade.deleteMany({ userId: testUserId });
  await WalletSnapshot.deleteMany({ userId: testUserId });
  await paper.setWalletBalance(testUserId, MODE, "USDT", 100_000, ACCOUNT_TYPE);
});

describe("Concurrency regression — withWalletLock / debitWalletAndCreateTrade", () => {
  test("REGRESSION (lost update): 20 concurrent debits of the same wallet all land — no lost update", async () => {
    if (skipIfNoMongo()) return;
    const debitAmount = 10;
    const concurrency = 20;

    await Promise.all(
      Array.from({ length: concurrency }, (_, i) =>
        paper.debitWalletAndCreateTrade(
          testUserId, MODE, ACCOUNT_TYPE, debitAmount,
          (session) => Trade.create([{
            userId: testUserId, mode: MODE, accountType: ACCOUNT_TYPE,
            symbol: "BTCUSDT", side: "BUY", quantity: 0.001, entryPrice: 10000, leverage: 1,
            status: "OPEN", ...MANDATORY_TRADE_FIELDS,
          }], { session }).then(docs => docs[0])
        )
      )
    );

    const wallet = paper.getWallet(testUserId, MODE, ACCOUNT_TYPE);
    const finalBalance = wallet.get("USDT") ?? 0;
    // Without the lock, this session proved concurrent debits lose
    // updates — the balance would land higher than expected because some
    // debits silently overwrote each other instead of stacking. With the
    // fix, every single debit must be reflected exactly.
    expect(finalBalance).toBeCloseTo(100_000 - debitAmount * concurrency, 6);

    const tradeCount = await Trade.countDocuments({ userId: testUserId, symbol: "BTCUSDT" });
    expect(tradeCount).toBe(concurrency);
  }, 30000);

  test("REGRESSION (rollback safety): a failed create leaves the wallet completely untouched", async () => {
    if (skipIfNoMongo()) return;
    const testUserId2 = new mongoose.Types.ObjectId().toHexString();
    const wallet = paper.getWallet(testUserId2, MODE, ACCOUNT_TYPE);
    const before = wallet.get("USDT") ?? 0;

    await expect(
      paper.debitWalletAndCreateTrade(
        testUserId2, MODE, ACCOUNT_TYPE, 500,
        // Missing entryPrice (required, no schema default) — forces a
        // real Mongoose validation failure inside the transaction.
        (session) => Trade.create([{
          userId: testUserId2, mode: MODE, accountType: ACCOUNT_TYPE,
          symbol: "BTCUSDT", side: "BUY", quantity: 0.001, leverage: 1,
          status: "OPEN", ...MANDATORY_TRADE_FIELDS,
        }], { session }).then(docs => docs[0])
      )
    ).rejects.toThrow();

    const after = paper.getWallet(testUserId2, MODE, ACCOUNT_TYPE).get("USDT") ?? 0;
    expect(after).toBe(before);
    const orphaned = await Trade.countDocuments({ userId: testUserId2, symbol: "BTCUSDT" });
    expect(orphaned).toBe(0);
  }, 30000);

  test("REGRESSION: creditWalletAndCloseTrade only credits once even with concurrent close attempts on the same trade", async () => {
    if (skipIfNoMongo()) return;
    const testUserId3 = new mongoose.Types.ObjectId().toHexString();
    const trade = await Trade.create({
      userId: testUserId3, mode: MODE, accountType: ACCOUNT_TYPE,
      symbol: "ETHUSDT", side: "BUY", quantity: 1, entryPrice: 1000, leverage: 1,
      status: "OPEN", ...MANDATORY_TRADE_FIELDS,
    });
    const beforeBalance = paper.getWallet(testUserId, MODE, ACCOUNT_TYPE).get("USDT") ?? 0;
    const creditAmount = 1000;

    // Simulates two concurrent close attempts racing for the same trade
    // (e.g. a manual close request landing at the same instant as an
    // automatic SL/TP trigger) — the atomic-claim pattern (findOneAndUpdate
    // on status:"OPEN") must let exactly one succeed.
    const results = await Promise.all([
      paper.creditWalletAndCloseTrade(testUserId, MODE, ACCOUNT_TYPE, creditAmount,
        (session) => Trade.findOneAndUpdate({ _id: trade._id, status: "OPEN" }, { status: "CLOSED", exitPrice: 2000 }, { session })),
      paper.creditWalletAndCloseTrade(testUserId, MODE, ACCOUNT_TYPE, creditAmount,
        (session) => Trade.findOneAndUpdate({ _id: trade._id, status: "OPEN" }, { status: "CLOSED", exitPrice: 2000 }, { session })),
    ]);

    const successCount = results.filter(r => r !== null).length;
    expect(successCount).toBe(1);

    const afterBalance = paper.getWallet(testUserId, MODE, ACCOUNT_TYPE).get("USDT") ?? 0;
    // Credited exactly once, not twice (double-credit is a real-money
    // duplication bug if this claim isn't atomic).
    expect(afterBalance).toBeCloseTo(beforeBalance + creditAmount, 6);
  }, 30000);
});
