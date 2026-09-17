/*
 * ─── Regression: quant_engine heartbeat routing (2026-09-15) ──
 *
 * heartbeat() used to special-case an unrecognized "quant_engine" service
 * by auto-registering it via a portFile read that fell back to a hardcoded
 * 'http://127.0.0.1:8000' if that read didn't produce a value — nothing
 * has ever listened there. Because Python's registry_client.py runs its
 * heartbeat loop independently of Node's process lifecycle, the very
 * first heartbeat after almost every Node restart hit this path and
 * locked in a dead URL for that process's entire lifetime, silently
 * routing every model prediction to a closed port and forcing every
 * predictor into its own fallback heuristic. Python's own registry
 * client already re-registers correctly on a 404 — this test locks in
 * that heartbeat() no longer masks that 404 for quant_engine specifically.
 */
import { SystemManager } from "../src/services/systemManager";

describe("SystemManager.heartbeat — quant_engine routing regression", () => {
  it("rejects (returns false) a heartbeat for an unregistered quant_engine instead of silently registering a guessed URL", () => {
    const sm = SystemManager.getInstance();
    (sm as any).services.delete("quant_engine");

    const result = sm.heartbeat("quant_engine", { status: "Online" });

    expect(result).toBe(false);
    expect(sm.getService("quant_engine")).toBeUndefined();
  });

  it("never registers the old hardcoded fallback URL for an unrecognized quant_engine heartbeat", () => {
    const sm = SystemManager.getInstance();
    (sm as any).services.delete("quant_engine");

    sm.heartbeat("quant_engine", { status: "Online" });

    const service = sm.getService("quant_engine");
    expect(service?.url).not.toBe("http://127.0.0.1:8000");
  });

  it("still accepts heartbeats for an already-registered quant_engine and updates its health without touching its url", () => {
    const sm = SystemManager.getInstance();
    sm.registerService({ name: "quant_engine", url: "http://127.0.0.1:53592", version: "11.5.0", health: { status: "Online" } });

    const result = sm.heartbeat("quant_engine", { status: "Degraded" });

    expect(result).toBe(true);
    const service = sm.getService("quant_engine");
    expect(service?.url).toBe("http://127.0.0.1:53592");
    expect(service?.health).toEqual({ status: "Degraded" });
  });

  it("rejects a heartbeat for any other unrecognized service the same way (no quant_engine-only special case)", () => {
    const sm = SystemManager.getInstance();
    (sm as any).services.delete("some_other_service");

    const result = sm.heartbeat("some_other_service", { status: "Online" });

    expect(result).toBe(false);
  });
});
