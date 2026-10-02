import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
process.env.JWT_SECRET = JWT_SECRET;

let releasePlace: () => void = () => {};
const placeFuturesOrder = jest.fn(() => new Promise((resolve) => {
  releasePlace = () => resolve({ orderId: 1, executedQty: "5", avgPrice: "100", status: "FILLED" });
}));
const fakeTrade = { _id: "t1", symbol: "BTCUSDT", side: "BUY", quantity: 5, entryPrice: 100, accountType: "FUTURES", status: "OPEN", mode: "LIVE" };

const actualBinance: any = await import("../src/services/binanceService.js");
const actualTrade: any = await import("../src/models/Trade.js");
jest.unstable_mockModule("../src/services/binanceService.js", () => {
  const actual = actualBinance;
  return {
    ...actual,
    placeFuturesOrder,
    formatFuturesQuantity: (jest.fn() as any).mockResolvedValue("5"),
    extractBinanceRequestIp: () => null,
  };
});
jest.unstable_mockModule("../src/models/Trade.js", () => {
  const actual = actualTrade;
  return { ...actual, Trade: { findOne: (jest.fn() as any).mockResolvedValue(fakeTrade), updateOne: (jest.fn() as any).mockResolvedValue({}) } };
});
jest.unstable_mockModule("../src/models/ApiKeys.js", () => ({
  ApiKeys: { findOne: (jest.fn() as any).mockResolvedValue({ encryptedKey: "a", iv: "b", authTag: "c", encryptedSecret: "d", ivSecret: "e", authTagSecret: "f" }) },
}));
jest.unstable_mockModule("../src/lib/crypto.js", () => ({ decrypt: () => "x", encrypt: () => ({}) }));
jest.unstable_mockModule("../src/services/aqea/governance/LiveExecutionBarrier.js", () => ({
  LiveExecutionBarrier: { verifyExecutionPermitted: () => ({ permitted: true }) },
}));

const waitCalls = async (n: number) => {
  for (let i = 0; i < 100 && placeFuturesOrder.mock.calls.length < n; i++) await new Promise((r) => setTimeout(r, 20));
};

describe("manual LIVE close in-flight guard", () => {
  test("second concurrent close gets 409, key released afterwards", async () => {
    const router = (await import("../src/routes/trading.js")).default;
    const app = express();
    app.use(express.json());
    app.use("/trading", router);
    const token = jwt.sign({ sub: "507f1f77bcf86cd799439011" }, JWT_SECRET);
    const send = () => request(app).post("/trading/close-position").set("Authorization", `Bearer ${token}`).send({ tradeId: "t1", mode: "LIVE" }).then((r) => r);

    const first = send();
    await waitCalls(1);
    expect(placeFuturesOrder).toHaveBeenCalledTimes(1);
    const second = await send();
    expect(second.status).toBe(409);
    expect(placeFuturesOrder).toHaveBeenCalledTimes(1);
    releasePlace();
    await first;

    const third = send();
    await waitCalls(2);
    expect(placeFuturesOrder).toHaveBeenCalledTimes(2);
    releasePlace();
    expect((await third).status).not.toBe(409);
  });
});
