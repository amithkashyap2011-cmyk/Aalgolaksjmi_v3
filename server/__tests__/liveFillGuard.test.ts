import fs from "node:fs";
import { jest } from "@jest/globals";
import {
  recordLiveFillWithRetry, isLiveEntryBlocked, placeWithFillConfirmation, _resetLiveEntryBlocksForTest,
  ORPHAN_JOURNAL_PATH,
} from "../src/services/liveFillGuard.js";
import { rescale1000xOrderResult } from "../src/services/binanceService.js";

const fill = { userId: "u1", symbol: "BTCUSDT", side: "BUY", qty: 1, avgPrice: 100, orderId: 9, clientOrderId: "cid1", accountType: "FUTURES" };

describe("orphan live fill handling", () => {
  let append: any;
  beforeEach(() => {
    _resetLiveEntryBlocksForTest();
    append = jest.spyOn(fs, "appendFileSync").mockImplementation(() => {});
    jest.spyOn(fs, "mkdirSync").mockImplementation((() => undefined) as any);
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test("retries then succeeds without journaling", async () => {
    const create = (jest.fn() as any).mockRejectedValueOnce(new Error("db down")).mockResolvedValue({ id: 1 });
    const out = await recordLiveFillWithRetry(fill, create, { backoffMs: 1 });
    expect(out).toEqual({ id: 1 });
    expect(create).toHaveBeenCalledTimes(2);
    expect(append).not.toHaveBeenCalled();
    expect(isLiveEntryBlocked("u1", "BTCUSDT")).toBe(false);
  });

  test("existsFn prevents duplicate create when a timed-out write actually landed", async () => {
    const create = (jest.fn() as any).mockRejectedValue(new Error("timeout"));
    const out = await recordLiveFillWithRetry(fill, create, { backoffMs: 1, existsFn: async () => ({ id: "dup" }) });
    expect(out).toEqual({ id: "dup" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("persistent failure journals JSONL, blocks entries, rethrows", async () => {
    const create = (jest.fn() as any).mockRejectedValue(new Error("db down"));
    await expect(recordLiveFillWithRetry(fill, create, { backoffMs: 1 })).rejects.toMatchObject({ orphanHandled: true });
    expect(create).toHaveBeenCalledTimes(3);
    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0][0]).toBe(ORPHAN_JOURNAL_PATH);
    const line = JSON.parse(String(append.mock.calls[0][1]).trim());
    expect(line).toMatchObject({ userId: "u1", symbol: "BTCUSDT", side: "BUY", qty: 1, avgPrice: 100, orderId: 9, clientOrderId: "cid1", accountType: "FUTURES", error: "db down" });
    expect(isLiveEntryBlocked("u1", "BTCUSDT")).toBe(true);
    expect(isLiveEntryBlocked("u1", "ETHUSDT")).toBe(false);
  });

  test("ambiguous placement + FILLED query is treated as filled", async () => {
    const place = (jest.fn() as any).mockRejectedValue(new Error("request timeout"));
    const query = (jest.fn() as any).mockResolvedValue({ status: "FILLED", executedQty: "1" });
    await expect(placeWithFillConfirmation(fill, place, query)).resolves.toMatchObject({ status: "FILLED" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  test("ambiguous placement + order not found rethrows original, no block", async () => {
    const place = (jest.fn() as any).mockRejectedValue(new Error("ETIMEDOUT"));
    const query = (jest.fn() as any).mockRejectedValue(new Error("Binance -2013 Order does not exist"));
    await expect(placeWithFillConfirmation(fill, place, query)).rejects.toThrow("ETIMEDOUT");
    expect(isLiveEntryBlocked("u1", "BTCUSDT")).toBe(false);
  });

  test("ambiguous placement + query failure blocks and journals", async () => {
    const place = (jest.fn() as any).mockRejectedValue(new Error("socket hang up"));
    const query = (jest.fn() as any).mockRejectedValue(new Error("network down"));
    await expect(placeWithFillConfirmation(fill, place, query)).rejects.toThrow("socket hang up");
    expect(isLiveEntryBlocked("u1", "BTCUSDT")).toBe(true);
    expect(append).toHaveBeenCalled();
  });

  test("definite rejection does not query", async () => {
    const place = (jest.fn() as any).mockRejectedValue(new Error("Binance Spot 400: invalid quantity"));
    const query = jest.fn();
    await expect(placeWithFillConfirmation(fill, place, query as any)).rejects.toThrow("400");
    expect(query).not.toHaveBeenCalled();
  });
});

describe("1000x futures result rescale", () => {
  test("scales qty x1000 and price /1000 for 1000PEPEUSDT", () => {
    const out = rescale1000xOrderResult("1000PEPEUSDT", { executedQty: "5", avgPrice: "0.012", cumQuote: "0.06", orderId: 1 });
    expect(parseFloat(out.executedQty)).toBeCloseTo(5000);
    expect(parseFloat(out.avgPrice)).toBeCloseTo(0.000012);
    expect(out.cumQuote).toBe("0.06");
  });
  test("leaves ordinary symbols untouched", () => {
    const r = { executedQty: "5", avgPrice: "100" };
    expect(rescale1000xOrderResult("BTCUSDT", r)).toBe(r);
  });
});
