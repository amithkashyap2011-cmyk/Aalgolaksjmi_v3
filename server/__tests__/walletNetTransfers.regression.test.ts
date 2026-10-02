import { describe, it, expect } from "@jest/globals";
import { netTransfersFor } from "../src/routes/wallet.js";

// The real record from 2026-09-30: one ADJUSTMENT stored on the RECEIVING wallet (SPOT).
const xfer = { amount: 160, accountType: "SPOT", note: "Internal transfer: 160.0000 USDT FUTURES → SPOT" };

describe("wallet capital base nets internal transfers", () => {
  it("receiving wallet gains the transferred capital", () => expect(netTransfersFor("SPOT", [xfer])).toBe(160));
  it("sending wallet loses it (no record is stored on that side)", () => expect(netTransfersFor("FUTURES", [xfer])).toBe(-160));
  it("both wallets together net to zero, so the combined view is unchanged", () => {
    expect(netTransfersFor("SPOT", [xfer]) + netTransfersFor("FUTURES", [xfer])).toBe(0);
  });
  it("reproduces the reported bug fix: futures baseline 156.35-160 gives +6.20 P/L on 2.55 equity", () => {
    const capital = 156.3473 + netTransfersFor("FUTURES", [xfer]);
    expect(2.5514 - capital).toBeCloseTo(6.2, 1);
  });
  it("handles several transfers in both directions and ignores malformed notes", () => {
    const docs = [xfer, { amount: 50, accountType: "FUTURES", note: "Internal transfer: 50.0000 USDT SPOT → FUTURES" }, { amount: 9, accountType: "SPOT", note: "garbage" }];
    expect(netTransfersFor("SPOT", docs)).toBe(160 - 50 + 9);
    expect(netTransfersFor("FUTURES", docs)).toBe(-160 + 50);
  });
});
