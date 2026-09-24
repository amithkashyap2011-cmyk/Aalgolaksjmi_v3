/*
 * Process-wide emergency-stop status for crypto trading, shared between
 * routes/trading.ts (the /control/pause|resume|kill admin endpoints) and
 * autoTradeEngine.ts (the 60s autonomous scheduler) — split into its own
 * module rather than living in trading.ts so autoTradeEngine.ts can read
 * it without a circular import (trading.ts already imports autoTradeEngine.ts).
 *
 * Both the manually-triggered order path (/place-order) and the autonomous
 * entry paths (handleLong/handleShort) must check this before placing a new
 * order. Closing/exiting an existing position is deliberately NOT gated by
 * this status — a killed/paused system should still be able to reduce risk.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type TradingControlStatus = "RUNNING" | "PAUSED" | "KILLED";

// Persisted so a server restart can't silently undo a Panic Stop / Pause
// (it was in-memory only and always came back as RUNNING).
const STATE_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../runtime/trading_control.json");

function load(): { status: TradingControlStatus; changedAt?: string } {
  try {
    const d = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (d?.status === "PAUSED" || d?.status === "KILLED" || d?.status === "RUNNING") return d;
  } catch { /* no saved state yet */ }
  return { status: "RUNNING" };
}

const initial = process.env.NODE_ENV === "test" ? { status: "RUNNING" as TradingControlStatus } : load();
let currentTradingStatus: TradingControlStatus = initial.status;
let changedAt: string | undefined = (initial as any).changedAt;

export function getTradingControlStatus(): TradingControlStatus {
  return currentTradingStatus;
}

export function getTradingControlChangedAt(): string | undefined {
  return changedAt;
}

export function setTradingControlStatus(status: TradingControlStatus): void {
  currentTradingStatus = status;
  changedAt = new Date().toISOString();
  if (process.env.NODE_ENV === "test") return;
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ status, changedAt }));
  } catch { /* best effort — status still applies in memory */ }
}
