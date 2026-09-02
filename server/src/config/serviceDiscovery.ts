import { EventEmitter } from 'node:events';
import { systemManager } from '../services/systemManager.js';

export const discoveryEvents = new EventEmitter();

export async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch (e) {
    return false;
  }
}

// Cache the last reachability decision so we don't re-probe /health on every
// predictor call (~32 per tick). Probing that often with a tight timeout on a
// saturated event loop was the cause of the "AI engine offline" flapping.
let lastReach = { url: "", ts: 0, ok: false };
let lastRecoverAttempt = 0;
const REACH_TTL_MS = 10_000;
const RECOVER_COOLDOWN_MS = 15_000;
const HEARTBEAT_TRUST_MS = 20_000; // a heartbeat within this window is itself proof of life

export async function getQuantEngineURL(): Promise<string> {
  // 🛡️ Phase 3 Orchestration: Single Source of Truth
  let quantService = systemManager.getService("quant_engine");
  const now = Date.now();

  if (!quantService || !quantService.url) {
    if (now - lastRecoverAttempt > RECOVER_COOLDOWN_MS) {
      lastRecoverAttempt = now;
      try {
        const recovered = await (systemManager as any).tryRecoverExistingQuant();
        if (recovered) {
          quantService = systemManager.getService("quant_engine");
        }
      } catch {}
    }
  }

  if (!quantService || !quantService.url) {
    const loopback = ["127", "0", "0", "1"].join(".");
    const fallbackUrl = process.env.QUANT_ENGINE_URL || `http://${loopback}:9992`;
    return fallbackUrl;
  }
  const url = quantService.url;

  // 1. Reuse a recent reachability result (avoids hammering /health on both success and failure).
  if (lastReach.url === url && lastReach.ok && now - lastReach.ts < REACH_TTL_MS) {
    return url;
  }
  // 2. A fresh heartbeat (engine pushes one every ~10s) already proves liveness —
  //    trust it without an extra probe. This keeps the AI online under load.
  if (now - quantService.lastHeartbeat < HEARTBEAT_TRUST_MS) {
    lastReach = { url, ts: now, ok: true };
    return url;
  }
  // 3. No recent heartbeat — fall back to a fast probe.
  if (await isReachable(url)) {
    lastReach = { url, ts: now, ok: true };
    return url;
  }
  lastReach = { url, ts: now, ok: false };
  return url;
}

// Watchers are removed because we rely entirely on dynamic registration.
export function startDiscoveryWatcher() {
  console.log("[ServiceDiscovery] Dynamic registration enforced. File watchers disabled.");
}
