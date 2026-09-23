/*
 * Regression: ticker subscriptions are reference-counted (2026-09-23).
 *
 * The chart and the footer's rotating ticker both subscribed BTCUSDT; with a
 * plain Set, the footer rotating off BTCUSDT emitted "unsubscribe" and froze
 * the chart's live price until it remounted.
 */
import { describe, it, expect, beforeEach } from "vitest";

type SocketModule = typeof import("../lib/socket");

let mod: SocketModule;
let emit: ReturnType<typeof import("vitest").vi.fn>;

beforeEach(async () => {
  const { vi } = await import("vitest");
  vi.resetModules();
  mod = await vi.importActual<SocketModule>("../lib/socket");
  emit = mod.socket.emit as any;
  emit.mockClear();
});

const calls = (event: string) => emit.mock.calls.filter((c: any[]) => c[0] === event).length;

describe("ticker subscription ref-counting", () => {
  it("keeps the stream while another component still holds it", () => {
    mod.subscribeTicker("BTCUSDT"); // chart
    mod.subscribeTicker("BTCUSDT"); // footer ticker
    expect(calls("subscribe")).toBe(1);

    mod.unsubscribeTicker("BTCUSDT"); // footer rotates away
    expect(calls("unsubscribe")).toBe(0);

    mod.unsubscribeTicker("BTCUSDT"); // chart unmounts
    expect(calls("unsubscribe")).toBe(1);
  });

  it("ignores an unsubscribe with no matching subscribe", () => {
    mod.unsubscribeTicker("ETHUSDT");
    expect(calls("unsubscribe")).toBe(0);
  });

  it("counts spot and futures separately", () => {
    mod.subscribeTicker("SOLUSDT", false);
    mod.subscribeTicker("SOLUSDT", true);
    mod.unsubscribeTicker("SOLUSDT", true);
    expect(emit).toHaveBeenLastCalledWith("unsubscribe", { symbol: "SOLUSDT", isFutures: true });
    expect(calls("unsubscribe")).toBe(1);
  });
});
