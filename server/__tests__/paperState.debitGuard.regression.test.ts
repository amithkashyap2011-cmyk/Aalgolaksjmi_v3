/*
 * Regression: debitWalletAndCreateTrade must re-check funds under the wallet
 * lock. Two entries that both passed the caller's pre-lock balance check used
 * to both debit, driving the wallet negative. Runs fully in-memory (no Mongo).
 */
import { jest } from "@jest/globals";
import * as paper from "../src/services/paperState";

describe("paperState.debitWalletAndCreateTrade funds guard", () => {
  const uid = "aaaaaaaaaaaaaaaaaaaaaaaa";

  it("rejects the second concurrent debit that the balance cannot cover", async () => {
    await paper.setWalletBalance(uid, "PAPER", "USDT", 100, "SPOT");
    let created = 0;
    const open = () => paper.debitWalletAndCreateTrade(uid, "PAPER", "SPOT", 60, async () => { created++; return { ok: true }; });
    const results = await Promise.allSettled([open(), open()]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect(created).toBe(1);
    expect(paper.getWallet(uid, "PAPER", "SPOT").get("USDT")).toBeCloseTo(40, 8);
  });

  it("does not create the trade when funds are insufficient", async () => {
    await paper.setWalletBalance(uid, "PAPER", "USDT", 10, "FUTURES");
    const fn = (jest.fn() as any).mockResolvedValue({});
    await expect(paper.debitWalletAndCreateTrade(uid, "PAPER", "FUTURES", 50, fn)).rejects.toThrow(/INSUFFICIENT_FUNDS/);
    expect(fn).not.toHaveBeenCalled();
    expect(paper.getWallet(uid, "PAPER", "FUTURES").get("USDT")).toBe(10);
  });
});
