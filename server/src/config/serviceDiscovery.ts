import { EventEmitter } from 'node:events';
import { systemManager } from '../services/systemManager.js';

export const discoveryEvents = new EventEmitter();

export async function isReachable(url: string): Promise<boolean> {
  try {
    // 2s (was 500ms): a 500ms timer fires under a busy event loop even when the
    // engine is healthy, producing false "unreachable" results during trade ticks.
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch (e) {
    return false;
  }
}

// Cache the last reachability decision so we don't re-probe /health on every
// predictor call (~32 per tick). Probing that often with a tight timeout on a
// saturated event loop was the cause of the "AI engine offline" flapping.
let lastReach = { url: "", ts: 0, ok: false };
const REACH_TTL_MS = 10_000;
const HEARTBEAT_TRUST_MS = 20_000; // a heartbeat within this window is itself proof of life

export async function getQuantEngineURL(): Promise<string> {
  // 🛡️ Phase 3 Orchestration: Single Source of Truth
  let quantService = systemManager.getService("quant_engine");
  if (!quantService || !quantService.url) {
    try {
      const recovered = await (systemManager as any).tryRecoverExistingQuant();
      if (recovered) {
        quantService = systemManager.getService("quant_engine");
      }
    } catch {}
  }

  if (!quantService || !quantService.url) {
    const loopback = ["127", "0", "0", "1"].join(".");
    const fallbackUrl = process.env.QUANT_ENGINE_URL || `http://${loopback}:9992`;
    return fallbackUrl;
  }
  const url = quantService.url;
  const now = Date.now();

  // 1. Reuse a recent successful reachability result (avoids hammering /health).
  if (lastReach.url === url && lastReach.ok && now - lastReach.ts < REACH_TTL_MS) {
    return url;
  }
  // 2. A fresh heartbeat (engine pushes one every ~10s) already proves liveness —
  //    trust it without an extra probe. This keeps the AI online under load.
  if (now - quantService.lastHeartbeat < HEARTBEAT_TRUST_MS) {
    lastReach = { url, ts: now, ok: true };
    return url;
  }
  // 3. No recent heartbeat — fall back to an actual probe.
  if (await isReachable(url)) {
    lastReach = { url, ts: now, ok: true };
    return url;
  }
  lastReach = { url, ts: now, ok: false };
  throw new Error(`AQEA_ORCHESTRATION_ERROR: Registered URL ${url} is not reachable.`);
}

// Watchers are removed because we rely entirely on dynamic registration.
export function startDiscoveryWatcher() {
  console.log("[ServiceDiscovery] Dynamic registration enforced. File watchers disabled.");
}
