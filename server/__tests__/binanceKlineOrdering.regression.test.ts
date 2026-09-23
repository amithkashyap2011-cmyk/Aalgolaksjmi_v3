/*
 * Regression: late final update of the previous bar (2026-09-23).
 *
 * The out-of-order guard compared closeTime against the in-progress bar's
 * (future) closeTime, so the previous 5m bar's final update — delivered just
 * after the next bar opened, around WS reconnects — was rejected and that bar
 * kept a partial OHLC (live logs: SOL/ETH/BNB/DOGE "Rejected out-of-order").
 */
import { updateKlineCache, getKlines, Kline } from "../src/services/binanceService.js";

const BAR = 300_000;
const T0 = 1_790_146_800_000; // aligned 5m open

function bar(i: number, close: string): Kline {
  return {
    openTime: T0 + i * BAR,
    closeTime: T0 + (i + 1) * BAR - 1,
    open: "100",
    high: "110",
    low: "90",
    close,
    volume: "10",
  };
}

// limit = bars loaded, so the cache-first path serves it (needs >= min(limit, 20)).
async function cached(symbol: string, bars: number): Promise<Kline[]> {
  return getKlines(symbol, "5m", undefined, undefined, bars);
}

describe("updateKlineCache ordering", () => {
  test("accepts the previous bar's late final update and replaces it in place", async () => {
    const sym = "ORDERTESTAUSDT";
    updateKlineCache(sym, "5m", bar(0, "101")); // partial
    updateKlineCache(sym, "5m", bar(1, "102")); // next bar opens
    updateKlineCache(sym, "5m", bar(0, "105")); // late final of bar 0

    const k = await cached(sym, 2);
    const b0 = k.find((x) => x.openTime === T0);
    expect(b0?.close).toBe("105");
    expect(k.filter((x) => x.openTime === T0)).toHaveLength(1);
    expect(k[k.length - 1].openTime).toBe(T0 + BAR);
  });

  test("still rejects a bar older than the previous one", async () => {
    const sym = "ORDERTESTBUSDT";
    updateKlineCache(sym, "5m", bar(0, "101"));
    updateKlineCache(sym, "5m", bar(1, "102"));
    updateKlineCache(sym, "5m", bar(2, "103"));
    updateKlineCache(sym, "5m", bar(0, "999")); // two bars stale

    const k = await cached(sym, 3);
    expect(k.find((x) => x.openTime === T0)?.close).toBe("101");
  });
});
