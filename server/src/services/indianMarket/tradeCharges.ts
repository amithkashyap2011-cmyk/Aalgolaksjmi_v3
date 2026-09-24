import { AuthoritativeLedger } from "./authoritativeLedger.js";

/**
 * Brokerage + exchange + taxes for a trade at close, computed the same way
 * the ledger reports them (so wallet cash and reported net P/L agree). Exits
 * used to credit gross P/L and never deduct these (₹845.26 by 2026-09-24).
 */
export function chargesAtClose(trade: any): number {
  try {
    const plain = typeof trade?.toObject === "function" ? trade.toObject() : trade;
    const c = AuthoritativeLedger.buildAuthoritativePosition({ ...plain, status: "CLOSED" }).charges;
    return Number.isFinite(c) && c > 0 ? Math.round(c * 100) / 100 : 0;
  } catch {
    return 0;
  }
}
