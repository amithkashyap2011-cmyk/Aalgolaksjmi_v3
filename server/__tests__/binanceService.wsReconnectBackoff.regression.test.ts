/*
 * ─── Regression: combined-socket reconnect backoff must persist ───────
 * ─── across the delete-and-recreate reconnect cycle ────────────────────
 *
 * Found live: the "combined spot" WebSocket was reconnecting once a
 * second indefinitely (198 times in ~2 minutes) instead of backing off
 * toward the intended 30s ceiling. Root cause: reconnectAttempts lived on
 * the per-connection CombinedSocket object, but every reconnect discards
 * the old CombinedSocket (`combinedSockets.delete(type)` on close) and
 * builds a brand new one with reconnectAttempts back at 0 — so the
 * exponential backoff (`2^attempts * 1000ms`) could never see anything
 * but attempts=0, forever computing the 1s floor. Worse, the counter was
 * also reset to 0 the instant "open" fired, so even a connection Binance
 * accepted and then closed again a second later reset the count right
 * back to zero before the next close ever saw a non-zero value.
 *
 * Fixed by moving the counter into a module-level map keyed by socket
 * type (spot/futures) that survives the object's lifecycle, and only
 * resetting it once a connection has stayed open for 10s (a genuine
 * recovery), not on every raw "open" event.
 */
import { jest } from "@jest/globals";

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];
  readyState = MockWebSocket.OPEN;
  private listeners: Record<string, Array<(...args: any[]) => void>> = {};

  constructor(_url: string) {
    MockWebSocket.instances.push(this);
  }

  on(event: string, cb: (...args: any[]) => void) {
    (this.listeners[event] ??= []).push(cb);
    return this;
  }

  emit(event: string, ...args: any[]) {
    for (const cb of this.listeners[event] ?? []) cb(...args);
  }

  send(_data: string) {}

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close", 1006, Buffer.from("mock close"));
  }
}

jest.unstable_mockModule("ws", () => ({ default: MockWebSocket }));

let subscribeTicker: any;

beforeAll(async () => {
  ({ subscribeTicker } = await import("../src/services/binanceService.js"));
});

beforeEach(() => {
  jest.useFakeTimers();
  MockWebSocket.instances.length = 0;
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

const mockIo = {} as any;

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("binanceService — combined-socket reconnect backoff", () => {
  test("backoff escalates across repeated fast reconnects instead of staying flat at 1s", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    subscribeTicker("BTCUSDT", mockIo, false);
    await flushMicrotasks();
    expect(MockWebSocket.instances.length).toBe(1);

    // Connection opens then closes again almost immediately (well inside
    // the 10s stability window) — the failure pattern actually observed.
    MockWebSocket.instances[0].emit("open");
    MockWebSocket.instances[0].close();

    expect(logSpy.mock.calls.some((c) => String(c[0]).includes("Reconnecting combined spot WebSocket in 1000ms (Attempt 1)"))).toBe(true);

    // Let the 1000ms reconnect timer fire — this re-subscribes and builds
    // a brand new socket instance.
    jest.advanceTimersByTime(1000);
    await flushMicrotasks();
    expect(MockWebSocket.instances.length).toBe(2);

    // Same fast open-then-close pattern on the new instance.
    MockWebSocket.instances[1].emit("open");
    MockWebSocket.instances[1].close();

    // With the bug: this would again read "Attempt 1" / 1000ms. Fixed:
    // the counter carried over, so this is attempt 2 at a 2s delay.
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes("Reconnecting combined spot WebSocket in 2000ms (Attempt 2)"))).toBe(true);
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes("Attempt 1"))).toBe(true); // only the first cycle's message

    logSpy.mockRestore();
  });

  test("backoff resets to the 1s floor only after a connection stays open for 10s", async () => {
    // Uses isFutures=true (the "futures" socket type) so this test's
    // reconnect-attempt counter is independent of the previous test's
    // "spot" counter — they're tracked in separate module-level state.
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    subscribeTicker("ETHUSDT", mockIo, true);
    await flushMicrotasks();
    MockWebSocket.instances[0].emit("open");
    MockWebSocket.instances[0].close(); // attempt 1 -> 1000ms

    jest.advanceTimersByTime(1000);
    await flushMicrotasks();
    MockWebSocket.instances[1].emit("open");
    MockWebSocket.instances[1].close(); // attempt 2 -> 2000ms, confirms it grew

    expect(logSpy.mock.calls.some((c) => String(c[0]).includes("(Attempt 2)"))).toBe(true);

    jest.advanceTimersByTime(2000);
    await flushMicrotasks();
    // This time stay open past the 10s stability window before closing again.
    MockWebSocket.instances[2].emit("open");
    jest.advanceTimersByTime(10000);
    await flushMicrotasks();
    MockWebSocket.instances[2].close();

    // The stable-open reset means this is back to attempt 1 at 1000ms,
    // not attempt 3.
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes("Reconnecting combined futures WebSocket in 1000ms (Attempt 1)"))).toBe(true);

    logSpy.mockRestore();
  });
});
