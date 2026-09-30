import fs from "node:fs";
const paper = await import("../src/services/paperState.js");

const UID = "6a39c0e7a5e2995ed257ca68";

test("an empty index/BSE wallet falls back to the funded NSE wallet, and reports which one it used", () => {
  paper.setWalletBalance(UID, "PAPER", "INR", 500_000, "INDIAN_NSE");
  paper.setWalletBalance(UID, "PAPER", "INR", 0, "INDIAN_NIFTY50");
  const r = paper.getIndianWalletWithFallback(UID, "PAPER", "INDIAN_NIFTY50");
  expect(r.accountType).toBe("INDIAN_NSE");
  expect(r.availableMargin).toBe(500_000);
});

test("a funded preferred wallet is used as is", () => {
  paper.setWalletBalance(UID, "PAPER", "INR", 100_000, "INDIAN_NIFTY50");
  expect(paper.getIndianWalletWithFallback(UID, "PAPER", "INDIAN_NIFTY50").accountType).toBe("INDIAN_NIFTY50");
});

test("the manual order route uses the fallback and no longer treats every *BANK* stock as an index", () => {
  const src = fs.readFileSync(new URL("../src/routes/indianMarket.ts", import.meta.url), "utf8");
  expect(src).not.toContain('symbol.includes("BANK")');
  expect(src).toContain("getIndianWalletWithFallback(userId, mode, preferredAccountType)");
  expect(src).toMatch(/INDEX_SYMBOLS = new Set\(\[[^\]]*"BANKNIFTY"/);
});
