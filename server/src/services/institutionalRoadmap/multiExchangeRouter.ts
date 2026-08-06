/*
 * ─── Phase 29: Multi Exchange Router Architecture ───────────
 *
 * Unified API router across Binance, Bybit, OKX, and Indian Equities (NSE/BSE).
 */

export class MultiExchangeRouter {
  public static getSupportedExchanges(): string[] {
    return ["BINANCE_FUTURES", "BYBIT_FUTURES", "OKX_SWAP", "INDIAN_NSE", "INDIAN_BSE"];
  }
}
