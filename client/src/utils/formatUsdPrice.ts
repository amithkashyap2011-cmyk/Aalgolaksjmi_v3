/** USD price with enough precision for sub-cent coins (PEPE/SHIB/BONK), never "$0.00". */
export function formatUsdPrice(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const a = Math.abs(p);
  const d = a >= 100 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : a >= 0.0001 ? 6 : 8;
  return `$${p.toLocaleString("en-US", { minimumFractionDigits: a >= 100 ? 2 : 0, maximumFractionDigits: d })}`;
}
