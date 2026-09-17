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

export type TradingControlStatus = "RUNNING" | "PAUSED" | "KILLED";

let currentTradingStatus: TradingControlStatus = "RUNNING";

export function getTradingControlStatus(): TradingControlStatus {
  return currentTradingStatus;
}

export function setTradingControlStatus(status: TradingControlStatus): void {
  currentTradingStatus = status;
}
