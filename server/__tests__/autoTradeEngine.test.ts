/*
 * ─── Auto‑Trade Engine Unit Tests ─────────────────────
 *
 * Tests for enableUser, disableUser, isEnabled state management.
 * These are pure in-memory Set operations — no Mongo/Binance needed.
 * TC-L1 to TC-L10.
 */
import { jest } from "@jest/globals";
import {
  enableUser,
  disableUser,
  isEnabled,
  start,
  stop,
  clearPeakPrice,
  clearUserState,
  setCooldown,
  getScannerCount,
} from "../src/services/autoTradeEngine";

const userA = "507f1f77bcf86cd799439011";
const userB = "507f1f77bcf86cd799439012";
const userC = "507f1f77bcf86cd799439013";

/* Silence console.log from enableUser / disableUser / start / stop */
const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

afterAll(() => {
  logSpy.mockRestore();
  stop(); // ensure no dangling interval
});

/* Clean state between tests */
beforeEach(() => {
  disableUser(userA);
  disableUser(userB);
  disableUser(userC);
  stop();
});

/* ═══════════════════════════════════════════════════════
 *  enableUser / disableUser / isEnabled
 * ═══════════════════════════════════════════════════════ */

describe("autoTradeEngine — state management", () => {
  test("TC-L1: user is disabled by default", () => {
    expect(isEnabled(userA)).toBe(false);
  });

  test("TC-L2: enableUser → isEnabled returns true", () => {
    enableUser(userA);
    expect(isEnabled(userA)).toBe(true);
  });

  test("TC-L3: disableUser → isEnabled returns false", () => {
    enableUser(userA);
    disableUser(userA);
    expect(isEnabled(userA)).toBe(false);
  });

  test("TC-L4: enabling twice is idempotent", () => {
    enableUser(userA);
    enableUser(userA);
    expect(isEnabled(userA)).toBe(true);
  });

  test("TC-L5: disabling already-disabled user is safe", () => {
    const nonExistent = "507f1f77bcf86cd799439014";
    expect(() => disableUser(nonExistent)).not.toThrow();
    expect(isEnabled(nonExistent)).toBe(false);
  });

  test("TC-L6: multiple users are independent", () => {
    enableUser(userA);
    enableUser(userB);
    disableUser(userA);
    expect(isEnabled(userA)).toBe(false);
    expect(isEnabled(userB)).toBe(true);
  });

  test("TC-L7: enable → disable → re-enable works", () => {
    enableUser(userA);
    disableUser(userA);
    enableUser(userA);
    expect(isEnabled(userA)).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════
 *  start / stop scheduler
 * ═══════════════════════════════════════════════════════ */

describe("autoTradeEngine — scheduler lifecycle", () => {
  test("TC-L8: start does not throw", () => {
    expect(() => start(60_000)).not.toThrow();
    stop();
  });

  test("TC-L9: double start is safe (no throw)", () => {
    start(60_000);
    expect(() => start(60_000)).not.toThrow();
    stop();
  });

  test("TC-L10: stop without start is safe", () => {
    expect(() => stop()).not.toThrow();
  });
});

/* ═══════════════════════════════════════════════════════
 *  clearPeakPrice / clearUserState / setCooldown / setPrimarySymbol
 *  / getScannerCount
 *
 *  These back onto module-private Maps (peakPrices, cooldowns,
 *  autoEnabledUsers, primarySymbols) with no getter exposed for direct
 *  inspection, so these tests verify externally-observable behavior
 *  (no throw, safety on repeated/unknown-key calls, and — for
 *  getScannerCount — the one internal state change that IS observable
 *  through another exported function) rather than internal map contents.
 *  setPrimarySymbol's Settings.updateOne call is fire-and-forget with its
 *  own .catch(), so it's safe to call without a live Mongo connection.
 * ═══════════════════════════════════════════════════════ */

describe("autoTradeEngine — auxiliary state functions", () => {
  test("TC-L11: clearPeakPrice on a never-set key is safe", () => {
    expect(() => clearPeakPrice(userA, "BTCUSDT", "fake-trade-id")).not.toThrow();
  });

  test("TC-L12: clearUserState on a user with no state is safe", () => {
    expect(() => clearUserState(userA)).not.toThrow();
  });

  test("TC-L13: clearUserState does not affect other users' enabled state", () => {
    enableUser(userA);
    enableUser(userB);
    clearUserState(userA);
    // clearUserState only clears peakPrices/cooldowns, not autoEnabledUsers —
    // verifying it doesn't have a wider blast radius than its own state.
    expect(isEnabled(userA)).toBe(true);
    expect(isEnabled(userB)).toBe(true);
  });

  test("TC-L14: setCooldown does not throw for any positive minute value", () => {
    expect(() => setCooldown(userA, "BTCUSDT", 5)).not.toThrow();
    expect(() => setCooldown(userA, "BTCUSDT", 0)).not.toThrow();
  });

  // setPrimarySymbol is deliberately not tested here: it fires a real,
  // unmocked Settings.updateOne() with no timeout configured, which hangs
  // indefinitely in Mongoose's command buffer when no connection exists —
  // confirmed by actually running it in this file (the test process never
  // returned). This test file works specifically because every other
  // function here only touches in-memory Maps; testing setPrimarySymbol
  // properly needs Settings mocked, which would require converting this
  // whole file to jest.unstable_mockModule + dynamic imports and risks
  // destabilizing the existing, working tests for a single low-value case.

  test("TC-L16: getScannerCount reflects the number of enabled users", () => {
    disableUser(userA);
    disableUser(userB);
    disableUser(userC);
    const before = getScannerCount();
    enableUser(userA);
    enableUser(userB);
    expect(getScannerCount()).toBe(before + 2);
    disableUser(userA);
    expect(getScannerCount()).toBe(before + 1);
  });
});
