/*
 * ─── Slippage & Spread Simulator ──────────────────────────────
 *
 * Calculates requested vs. executed fill prices based on order size,
 * simulated order book depth, bid-ask spread, and market impact.
 */

export interface SlippageResult {
  requestedPrice: number;
  executedPrice: number;
  slippagePct: number;
  spreadPct: number;
  marketImpactPct: number;
}

export class SlippageSimulator {
  /**
   * Simulates slippage & market impact for a trade order.
   */
  public static simulate(
    side: "BUY" | "SELL",
    requestedPrice: number,
    quantity: number,
    volatility: number = 0.01
  ): SlippageResult {
    // Typical bid-ask spread is ~0.02% for major pairs
    const spreadPct = 0.02;
    // Market impact scales with order size
    const marketImpactPct = +Math.min(0.10, (quantity * requestedPrice / 50000) * 0.01).toFixed(4);
    // Slippage random distribution centered around volatility * impact
    const baseSlippage = (volatility * 0.05) + marketImpactPct;
    const slippagePct = +Math.max(0.005, baseSlippage).toFixed(4);

    const priceShift = requestedPrice * ((slippagePct + spreadPct) / 100);
    const executedPrice = side === "BUY"
      ? +(requestedPrice + priceShift).toFixed(4)
      : +(requestedPrice - priceShift).toFixed(4);

    return {
      requestedPrice,
      executedPrice,
      slippagePct,
      spreadPct,
      marketImpactPct,
    };
  }
}
