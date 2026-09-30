import { jest } from "@jest/globals";

const pricing = await import("../src/services/indianMarket/indianPricing.js");
const feed = await import("../src/services/indianMarket/indstocks/indstocksPriceFeed.js");

const INDEX_CSV = "EXCH,SEGMENT,SECURITY_ID\nNSE,NIFTY 50,40000001\nNSE,Nifty Bank,40000002\nBSE,SENSEX,40000006\n";

/** Fake INDstocks: equities at NSE_<token>, indices only answer under the "NSE"/"BSE" prefix. */
function fakeGet(prices: Record<string, number>) {
  return jest.fn(async (path: string) => {
    if (path.startsWith("/market/instruments")) return new Response(INDEX_CSV);
    const codes = decodeURIComponent(path.split("scrip-codes=")[1]).split(",");
    const data: Record<string, any> = {};
    for (const c of codes) if (prices[c] != null) data[c] = { live_price: prices[c], day_open: prices[c], day_high: prices[c], day_low: prices[c], prev_close: prices[c], volume: 10 };
    return new Response(JSON.stringify({ status: "success", data }));
  });
}

beforeEach(() => feed.resetIndstocksFeedForTesting());

test("equity codes reuse Angel tokens and indices are looked up and verified", async () => {
  const get = fakeGet({ NSE_40000001: 25000, NSE_40000002: 55000, BSE_40000006: 82000 });
  const map = await feed.resolveScrips("tok", get as any);
  expect(map.SBIN).toBe("NSE_3045");
  expect(map.RELIANCE).toBe("NSE_2885");
  expect(map.NIFTY50).toBe("NSE_40000001");
  expect(map.SENSEX).toBe("BSE_40000006");
  expect(map.FINNIFTY).toBeUndefined();                     // not in the fake master → not guessed
  expect(feed.getIndstocksFeedStatus().unresolved).toContain("FINNIFTY");
});

test("an index whose price cannot be confirmed is left unresolved, not guessed", async () => {
  const get = fakeGet({});                                  // nothing answers
  const map = await feed.resolveScrips("tok", get as any);
  expect(map.NIFTY50).toBeUndefined();
  expect(map.SBIN).toBe("NSE_3045");
});

test("fills symbols with no fresh real quote, and only compares where Angel is live", async () => {
  // Angel is live for TCS (fresh), not for SBIN.
  pricing.applyRealQuote("TCS", { ltp: 3000, open: 3000, high: 3000, low: 3000 });
  expect(pricing.hasFreshRealQuote("SBIN")).toBe(false);
  const get = fakeGet({ NSE_3045: 971.9, NSE_11536: 3030 });
  await feed.pollOnce("tok", get as any);

  const st = feed.getIndstocksFeedStatus();
  expect(st.appliedAsFallback).toBeGreaterThanOrEqual(1);
  expect(pricing.hasFreshRealQuote("SBIN")).toBe(true);
  expect(pricing.MOCK_LIVE_INDIAN_TIKERS.SBIN.ltp).toBe(971.9);
  expect(pricing.MOCK_LIVE_INDIAN_TIKERS.TCS.ltp).toBe(3000);   // Angel's price NOT overwritten
  expect(st.divergence.TCS).toBe(1);                             // +1.00% vs Angel
  expect(st.maxDivergencePct).toBe(1);
});
