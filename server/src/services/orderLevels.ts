/** Minimum stop/target distance: ~2× taker fee (0.1%) plus a little slippage. */
export const MIN_LEVEL_DISTANCE = 0.0025;

/**
 * A BUY needs stop < price < target, a SELL the reverse, each at least a
 * round trip of fees away. Manual orders went through with the stop above a
 * buy (DOGE) and stop = target below entry (PEPE) — guaranteed losses.
 */
export function validateOrderLevels(side: "BUY" | "SELL", price: number, sl: number, tp: number): { slDist: number; tpDist: number; error?: string } {
  const slDist = (side === "BUY" ? price - sl : sl - price) / price;
  const tpDist = (side === "BUY" ? tp - price : price - tp) / price;
  if (!(slDist > 0) || !(tpDist > 0)) {
    return {
      slDist, tpDist,
      error: side === "BUY"
        ? `Invalid levels for a BUY: stop-loss must be below the price and target above it (price ${price}, stop ${sl}, target ${tp}).`
        : `Invalid levels for a SELL: stop-loss must be above the price and target below it (price ${price}, stop ${sl}, target ${tp}).`,
    };
  }
  if (slDist < MIN_LEVEL_DISTANCE || tpDist < MIN_LEVEL_DISTANCE) {
    return {
      slDist, tpDist,
      error: `Stop-loss and target must each be at least ${(MIN_LEVEL_DISTANCE * 100).toFixed(2)}% from the price — closer than the round-trip fees (stop ${(slDist * 100).toFixed(2)}%, target ${(tpDist * 100).toFixed(2)}%).`,
    };
  }
  return { slDist, tpDist };
}
