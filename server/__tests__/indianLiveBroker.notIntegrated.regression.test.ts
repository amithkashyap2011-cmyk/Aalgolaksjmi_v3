/*
 * Regression: no fake Indian LIVE fills (2026-09-23).
 *
 * No Indian broker (Angel One / Kite) is integrated. The LIVE adapter used to
 * return an instant "COMPLETE" fill once LIVE_TRADING_ENABLED was true — a
 * "live" trade that never reached any broker — and the Angel One test endpoint
 * always answered HANDSHAKE_SUCCESSFUL. Both must now refuse honestly.
 */
import { LiveBrokerExecutionAdapter, INDIAN_BROKER_NOT_INTEGRATED } from "../src/services/indianMarket/brokerAdapter.js";

describe("LiveBrokerExecutionAdapter without a real broker", () => {
  const order = {
    clientOrderId: "t-live-1",
    tradingSymbol: "RELIANCE",
    exchange: "NSE",
    action: "BUY",
    instrumentType: "EQ",
    quantity: 1,
    price: 2990,
    orderType: "MARKET",
    productType: "MIS",
  } as any;

  const prev = process.env.LIVE_TRADING_ENABLED;
  afterAll(() => {
    if (prev === undefined) delete process.env.LIVE_TRADING_ENABLED;
    else process.env.LIVE_TRADING_ENABLED = prev;
  });

  test("refuses even when LIVE_TRADING_ENABLED is true", async () => {
    process.env.LIVE_TRADING_ENABLED = "true";
    const res = await new LiveBrokerExecutionAdapter().placeOrder("user-x", order);
    expect(res.ok).toBe(false);
    expect(res.status).toBe("REJECTED");
    expect(res.filledQty).toBe(0);
    expect(res.rejectionReason).toBe(INDIAN_BROKER_NOT_INTEGRATED);
  });

  test("still reports the env guard first when LIVE_TRADING_ENABLED is off", async () => {
    process.env.LIVE_TRADING_ENABLED = "false";
    const res = await new LiveBrokerExecutionAdapter().placeOrder("user-x", order);
    expect(res.ok).toBe(false);
    expect(res.rejectionReason).toContain("LIVE_TRADING_DISABLED");
  });
});
