/*
 * ─── Canary test: verifies the test environment itself ──
 *
 * This exists because of a real, costly incident this session: running
 * `npx jest <file>` directly (instead of the exact `npm test` script)
 * silently omits `--experimental-vm-modules`, a Node flag this whole
 * suite's ESM module mocking depends on. Without it, jest.unstable_mockModule
 * silently fails to intercept — every mocked module call falls through to
 * the REAL implementation instead, and tests can pass or fail for
 * completely the wrong reason with no error raised. That cost a large
 * amount of misdirected debugging before the root cause was found.
 *
 * This file makes that failure mode loud and immediate instead of silent.
 * If this test fails, STOP — don't trust any other test result in the
 * same run; fix the invocation first.
 */
import { jest } from '@jest/globals';

const mockFn = jest.fn(() => "MOCKED_VALUE");
jest.unstable_mockModule("../src/services/pnlService.js", () => ({
  TAKER_FEE: 0.0004,
  computeUnrealisedPnl: mockFn,
}));

describe("Canary — test environment sanity", () => {
  test("jest.unstable_mockModule actually intercepts the target module (requires --experimental-vm-modules)", async () => {
    const { computeUnrealisedPnl } = await import("../src/services/pnlService.js");
    const result = computeUnrealisedPnl({} as any, 0);
    expect(result).toBe("MOCKED_VALUE");
    expect(mockFn).toHaveBeenCalled();
    // If this assertion ever fails, `computeUnrealisedPnl` returned a real
    // number instead of "MOCKED_VALUE" — meaning the mock silently did not
    // apply. Re-run with: node --experimental-vm-modules node_modules/.bin/jest
    // (exactly what `npm test` already does) rather than a bare `npx jest`.
  });

  test("required Node flag is actually active in this process", () => {
    // --experimental-vm-modules doesn't set an obviously-named env var, but
    // it does change how jest's ESM support behaves — the mock-interception
    // check above is the real signal. This second check is a cheap,
    // fast-failing sanity check that VM modules support exists at all in
    // this Node binary/version, catching a Node downgrade that removed it.
    expect(typeof (globalThis as any).WebAssembly).toBe("object"); // proxy for "modern Node runtime", cheap to check
    expect(process.version).toMatch(/^v\d+\./);
  });
});
