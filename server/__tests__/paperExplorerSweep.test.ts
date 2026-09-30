import { jest } from "@jest/globals";
import fs from "node:fs";
const { closeExpiredExplorationTrades } = await import("../src/services/paperExplorer.js");

const H = 3_600_000;
afterEach(() => jest.restoreAllMocks());

test("closes only trades older than 2 hours, through the normal close path", async () => {
  const calls: any[] = [];
  jest.spyOn(globalThis, "fetch").mockImplementation((async (url: any, init: any) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ pnl: 0.01 }), { status: 200 });
  }) as any);
  const trades = [
    { _id: "old", symbol: "XLMUSDT", openedAt: new Date(Date.now() - 17 * H) },
    { _id: "fresh", symbol: "TRXUSDT", openedAt: new Date(Date.now() - 1 * H) },
    { _id: "edge", symbol: "ATOMUSDT", openedAt: new Date(Date.now() - 2.1 * H) },
  ];
  const closed = await closeExpiredExplorationTrades(trades, 9991);
  expect([...closed].sort()).toEqual(["edge", "old"]);
  expect(calls).toHaveLength(2);
  expect(calls[0].url).toBe("http://127.0.0.1:9991/trading/close-position");
  expect(calls[0].body).toMatchObject({ mode: "PAPER", reason: "EXPLORATION_TIME_EXIT" });
});

test("a failed close is reported as not closed (retried next sweep)", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
  const closed = await closeExpiredExplorationTrades([{ _id: "a", symbol: "XLMUSDT", openedAt: new Date(Date.now() - 5 * H) }], 9991);
  expect(closed.size).toBe(0);
});

test("with entries disabled the explorer still runs the time-exit sweep, and the engine stores a top-level exit reason (source guard)", () => {
  const ex = fs.readFileSync(new URL("../src/services/paperExplorer.ts", import.meta.url), "utf8");
  expect(ex).toMatch(/PAPER_EXPLORATION === "false"\) \{[\s\S]*explorationSweepTick/);
  const eng = fs.readFileSync(new URL("../src/services/autoTradeEngine.ts", import.meta.url), "utf8");
  expect(eng).toMatch(/exitReason: reason,\n\s+meta: preservedMeta/);
});
