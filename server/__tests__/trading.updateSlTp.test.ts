import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import { jest } from '@jest/globals';
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getKlines: (jest.fn() as any).mockResolvedValue([]),
  getLatestFundingRate: (jest.fn() as any).mockResolvedValue(0),
  getTickerPrice: (jest.fn() as any).mockResolvedValue(100),
  getTickerPriceSync: (jest.fn() as any).mockResolvedValue(100),
  isRestBanned: (jest.fn() as any).mockReturnValue(false),
}));

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
const testUserId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ sub: testUserId }, JWT_SECRET);

let app: express.Express;
let Trade: any, paper: any;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  await connectIfAvailable();
  paper = await import("../src/services/paperState.js");
  ({ Trade } = await import("../src/models/Trade.js"));

  const tradingRouter = (await import("../src/routes/trading.js")).default;
  app = express();
  app.use(express.json());
  app.use("/trading", tradingRouter);
});

afterAll(async () => {
  if (Trade && mongoose?.connection?.readyState === 1) await Trade.deleteMany({ userId: testUserId });
  await disconnectMongo();
});

describe("POST /trading/update-sl-tp", () => {
  it("should update leverage for open position by tradeId and symbol", async () => {
    if (skipIfNoMongo() || !Trade) return;

    const trade = await Trade.create({
      userId: testUserId,
      symbol: "DOGEUSDT",
      side: "BUY",
      quantity: 1000,
      entryPrice: 0.07,
      leverage: 4,
      mode: "PAPER",
      status: "OPEN",
      accountType: "FUTURES",
      entrySource: "TEST",
      decisionPath: {},
      authorizedVotes: {},
      shadowVotes: {},
      coreScore: 0,
      finalScore: 0,
    });

    paper.setPosition(testUserId, "DOGEUSDT", "PAPER", {
      userId: testUserId,
      symbol: "DOGEUSDT",
      side: "BUY",
      quantity: 1000,
      entryPrice: 0.07,
      leverage: 4,
      tradeId: trade._id.toString(),
      accountType: "FUTURES"
    });

    const res = await request(app)
      .post("/trading/update-sl-tp")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tradeId: trade._id.toString(),
        symbol: "DOGEUSDT",
        leverage: 10,
        mode: "PAPER"
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.leverage).toBe(10);

    const updatedTrade = await Trade.findById(trade._id);
    expect(updatedTrade.leverage).toBe(10);

    const memPos = paper.getPosition(testUserId, "DOGEUSDT", "PAPER", "FUTURES");
    expect(memPos?.leverage).toBe(10);

    await Trade.deleteMany({ userId: testUserId });
  });
});
