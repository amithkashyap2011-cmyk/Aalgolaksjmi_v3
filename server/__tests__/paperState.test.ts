/*
 * ─── Paper State Unit Tests ────────────────────────────
 *
 * Tests the in-memory PositionIndex (Map keyed by symbol+mode)
 * and Wallet (asset→balance map) data structures.
 */
import {
  getPosition,
  setPosition,
  removePosition,
  getOpenPositions,
  getWallet,
  setWalletBalance,
  type PaperPosition,
} from "../src/services/paperState";

/* Use unique user IDs per test to avoid cross-contamination */
let uid = 0;
function uniqueUser(): string {
  return `test-user-${++uid}-${Date.now()}`;
}

describe("PositionIndex (Map<symbol+mode, PaperPosition>)", () => {
  /* ── TC-39: set and get position ───────────────── */
  test("TC-39: setPosition + getPosition round-trips correctly", () => {
    const user = uniqueUser();
    const pos: PaperPosition = {
      userId: user,
      symbol: "DOGEUSDT",
      side: "BUY",
      quantity: 1000,
      entryPrice: 0.15,
      tradeId: "trade-1",
    };
    setPosition(user, "DOGEUSDT", "PAPER", pos);
    const got = getPosition(user, "DOGEUSDT", "PAPER");
    expect(got).toEqual(pos);
  });

  /* ── TC-40: undefined for missing position ─────── */
  test("TC-40: getPosition returns undefined for non-existent key", () => {
    const user = uniqueUser();
    expect(getPosition(user, "BTCUSDT", "PAPER")).toBeUndefined();
  });

  /* ── TC-41: separate modes are isolated ────────── */
  test("TC-41: PAPER and LIVE positions are independent", () => {
    const user = uniqueUser();
    const paperPos: PaperPosition = {
      userId: user, symbol: "ETHUSDT", side: "BUY",
      quantity: 5, entryPrice: 3000, tradeId: "t1",
    };
    const livePos: PaperPosition = {
      userId: user, symbol: "ETHUSDT", side: "SELL",
      quantity: 2, entryPrice: 3100, tradeId: "t2",
    };
    setPosition(user, "ETHUSDT", "PAPER", paperPos);
    setPosition(user, "ETHUSDT", "LIVE", livePos);

    expect(getPosition(user, "ETHUSDT", "PAPER")!.side).toBe("BUY");
    expect(getPosition(user, "ETHUSDT", "LIVE")!.side).toBe("SELL");
  });

  /* ── TC-42: removePosition ─────────────────────── */
  test("TC-42: removePosition deletes only the targeted position", () => {
    const user = uniqueUser();
    setPosition(user, "DOGEUSDT", "PAPER", {
      userId: user, symbol: "DOGEUSDT", side: "BUY",
      quantity: 500, entryPrice: 0.12, tradeId: "t3",
    });
    setPosition(user, "SHIBUSDT", "PAPER", {
      userId: user, symbol: "SHIBUSDT", side: "BUY",
      quantity: 100000, entryPrice: 0.00002, tradeId: "t4",
    });

    removePosition(user, "DOGEUSDT", "PAPER");
    expect(getPosition(user, "DOGEUSDT", "PAPER")).toBeUndefined();
    expect(getPosition(user, "SHIBUSDT", "PAPER")).toBeDefined();
  });

  /* ── TC-43: getOpenPositions ───────────────────── */
  test("TC-43: getOpenPositions returns all positions for user+mode", () => {
    const user = uniqueUser();
    const symbols = ["DOGEUSDT", "ETHUSDT", "BNBUSDT"];
    symbols.forEach((s, i) => {
      setPosition(user, s, "PAPER", {
        userId: user, symbol: s, side: "BUY",
        quantity: 100 * (i + 1), entryPrice: 1, tradeId: `t${i}`,
      });
    });

    const open = getOpenPositions(user, "PAPER");
    expect(open).toHaveLength(3);
    const syms = open.map((p) => p.symbol).sort();
    expect(syms).toEqual(["BNBUSDT", "DOGEUSDT", "ETHUSDT"]);
  });

  /* ── TC-44: getOpenPositions filters by mode ───── */
  test("TC-44: getOpenPositions does not return other modes", () => {
    const user = uniqueUser();
    setPosition(user, "DOGEUSDT", "PAPER", {
      userId: user, symbol: "DOGEUSDT", side: "BUY",
      quantity: 100, entryPrice: 0.1, tradeId: "t-paper",
    });
    setPosition(user, "DOGEUSDT", "LIVE", {
      userId: user, symbol: "DOGEUSDT", side: "SELL",
      quantity: 50, entryPrice: 0.11, tradeId: "t-live",
    });

    const paperPositions = getOpenPositions(user, "PAPER");
    expect(paperPositions).toHaveLength(1);
    expect(paperPositions[0].tradeId).toBe("t-paper");
  });
});

describe("Wallet (Map<asset, balance>)", () => {
  /* ── TC-45: new user gets default 5000 USDT ───── */
  test("TC-45: getWallet auto-seeds 5000 USDT for new user", () => {
    const user = uniqueUser();
    const w = getWallet(user, "PAPER");
    expect(w.get("USDT")).toBe(5000);
  });

  /* ── TC-46: setWalletBalance updates correctly ── */
  test("TC-46: setWalletBalance modifies the wallet", () => {
    const user = uniqueUser();
    setWalletBalance(user, "PAPER", "USDT", 3500);
    expect(getWallet(user, "PAPER").get("USDT")).toBe(3500);
  });

  /* ── TC-47: multiple assets ────────────────────── */
  test("TC-47: wallet supports multiple assets", () => {
    const user = uniqueUser();
    setWalletBalance(user, "PAPER", "USDT", 2000);
    setWalletBalance(user, "PAPER", "DOGE", 50000);
    setWalletBalance(user, "PAPER", "ETH", 1.5);

    const w = getWallet(user, "PAPER");
    expect(w.get("USDT")).toBe(2000);
    expect(w.get("DOGE")).toBe(50000);
    expect(w.get("ETH")).toBe(1.5);
  });

  /* ── TC-48: PAPER and LIVE wallets are separate ── */
  test("TC-48: wallets are isolated per mode", () => {
    const user = uniqueUser();
    setWalletBalance(user, "PAPER", "USDT", 1000);
    setWalletBalance(user, "LIVE", "USDT", 999);

    expect(getWallet(user, "PAPER").get("USDT")).toBe(1000);
    expect(getWallet(user, "LIVE").get("USDT")).toBe(999);
  });

  /* ── TC-49: balance can go to zero ─────────────── */
  test("TC-49: balance can be set to zero", () => {
    const user = uniqueUser();
    setWalletBalance(user, "PAPER", "USDT", 0);
    expect(getWallet(user, "PAPER").get("USDT")).toBe(0);
  });

  /* ── TC-50: independent users ──────────────────── */
  test("TC-50: different users have independent wallets", () => {
    const userA = uniqueUser();
    const userB = uniqueUser();
    setWalletBalance(userA, "PAPER", "USDT", 1111);
    setWalletBalance(userB, "PAPER", "USDT", 2222);

    expect(getWallet(userA, "PAPER").get("USDT")).toBe(1111);
    expect(getWallet(userB, "PAPER").get("USDT")).toBe(2222);
  });
});
