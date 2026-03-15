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
} from "../src/services/autoTradeEngine";

/* Silence console.log from enableUser / disableUser / start / stop */
const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

afterAll(() => {
  logSpy.mockRestore();
  stop(); // ensure no dangling interval
});

/* Clean state between tests */
beforeEach(() => {
  disableUser("userA");
  disableUser("userB");
  disableUser("userC");
  stop();
});

/* ═══════════════════════════════════════════════════════
 *  enableUser / disableUser / isEnabled
 * ═══════════════════════════════════════════════════════ */

describe("autoTradeEngine — state management", () => {
  test("TC-L1: user is disabled by default", () => {
    expect(isEnabled("userA")).toBe(false);
  });

  test("TC-L2: enableUser → isEnabled returns true", () => {
    enableUser("userA");
    expect(isEnabled("userA")).toBe(true);
  });

  test("TC-L3: disableUser → isEnabled returns false", () => {
    enableUser("userA");
    disableUser("userA");
    expect(isEnabled("userA")).toBe(false);
  });

  test("TC-L4: enabling twice is idempotent", () => {
    enableUser("userA");
    enableUser("userA");
    expect(isEnabled("userA")).toBe(true);
  });

  test("TC-L5: disabling already-disabled user is safe", () => {
    expect(() => disableUser("nonExistent")).not.toThrow();
    expect(isEnabled("nonExistent")).toBe(false);
  });

  test("TC-L6: multiple users are independent", () => {
    enableUser("userA");
    enableUser("userB");
    disableUser("userA");
    expect(isEnabled("userA")).toBe(false);
    expect(isEnabled("userB")).toBe(true);
  });

  test("TC-L7: enable → disable → re-enable works", () => {
    enableUser("userA");
    disableUser("userA");
    enableUser("userA");
    expect(isEnabled("userA")).toBe(true);
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
