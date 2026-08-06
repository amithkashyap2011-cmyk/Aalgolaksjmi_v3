/*
 * ─── Exchange & Partial Fill Simulator ────────────────────────
 *
 * Simulates order matching against Binance Testnet, Bybit Testnet,
 * and OKX Demo exchange environments with partial fills.
 */

export interface PartialFillResult {
  requestedQty: number;
  filledQty: number;
  remainingQty: number;
  fillRatio: number;
}

export class ExchangeSimulator {
  /**
   * Simulates order fill ratio based on order size and simulated liquidity depth.
   */
  public static simulateFill(requestedQty: number, exchangeType: string = "BINANCE_TESTNET"): PartialFillResult {
    // 95% of orders get 100% filled; 5% of large orders get partial fills
    const isPartial = Math.random() < 0.05 && requestedQty > 0.5;
    const fillRatio = isPartial ? +(0.60 + Math.random() * 0.35).toFixed(2) : 1.0;

    const filledQty = +(requestedQty * fillRatio).toFixed(4);
    const remainingQty = +(requestedQty - filledQty).toFixed(4);

    return {
      requestedQty,
      filledQty,
      remainingQty,
      fillRatio,
    };
  }
}
