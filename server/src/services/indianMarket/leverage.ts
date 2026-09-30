/**
 * Leverage for a paper Indian equity order.
 *
 * Delivery (CNC) is always 1×. Intraday (MIS) defaults to 5× and is capped at 5× —
 * the intraday leverage INDstocks lists for these stocks. (The route used to allow
 * up to 20× and let CNC orders carry leverage too.)
 */
export const MAX_INDIAN_MIS_LEVERAGE = 5;

export function resolveIndianLeverage(productType: string | undefined, requested: unknown): number {
  if (productType !== "MIS") return 1;
  const n = Math.floor(Number(requested));
  if (!Number.isFinite(n) || n < 1) return MAX_INDIAN_MIS_LEVERAGE;
  return Math.min(MAX_INDIAN_MIS_LEVERAGE, n);
}
