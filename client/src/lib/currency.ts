/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Frontend Currency Utility (V5.1 Robust)
 * ═══════════════════════════════════════════════════════════════════
 */

export type CurrencyDisplayMode = "USDT_ONLY" | "INR_ONLY" | "USDT_INR" | "USD_ONLY";

export interface CurrencyFormatOptions {
  mode: CurrencyDisplayMode;
  inrRate: number;
  compact?: boolean;
}

export const formatInrCompact = (inr: number): string => {
  const abs = Math.abs(inr);
  const sign = inr < 0 ? "-" : "";
  if (abs >= 10000000) {
    return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`;
  }
  if (abs >= 100000) {
    return `${sign}₹${(abs / 100000).toFixed(2)}L`;
  }
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
};

export const formatCurrency = (value: number, options: CurrencyFormatOptions): string => {
  const safeValue = isFinite(value) ? value : 0;
  const { mode, inrRate, compact } = options;
  const safeRate = isFinite(inrRate) && inrRate > 0 ? inrRate : 85.0; // Default fallback to prevent NaN
  
  const inrValue = safeValue * safeRate;

  const usdtPart = compact
    ? `$${safeValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${safeValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
  const inrPart = compact ? `(${formatInrCompact(inrValue)})` : `(₹${Math.round(inrValue).toLocaleString("en-IN")})`;
  const usdPart = `$${safeValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (mode === "USDT_ONLY") return usdtPart;
  if (mode === "INR_ONLY") return compact ? formatInrCompact(inrValue) : `₹${Math.round(inrValue).toLocaleString("en-IN")}`;
  if (mode === "USD_ONLY") return usdPart;

  return `${usdtPart} ${inrPart}`;
};

/**
 * Precision-aware money/price formatter that appends the INR equivalent.
 * Use for asset prices (entry/mark/SL/TP) where `formatCurrency`'s 2-decimal
 * rounding would destroy small values (e.g. SHIBUSDT 0.00000423).
 *
 *   withInr(0.07489, 85)                       → "0.07 USDT (₹6.37)"
 *   withInr(0.07489, 85, { decimals: 8 })      → "0.07489000 USDT (₹6.3657)"
 *   withInr(1234.5, 85)                        → "1,234.50 USDT (₹1,04,933)"
 */
export const withInr = (
  value: number,
  inrRate: number,
  opts: { decimals?: number; mode?: CurrencyDisplayMode; prefix?: string } = {},
): string => {
  const decimals = opts.decimals ?? 2;
  const mode = opts.mode ?? "USDT_INR";
  const safe = isFinite(value) ? value : 0;
  const rate = isFinite(inrRate) && inrRate > 0 ? inrRate : 85.0;
  const inr = safe * rate;

  const usdtPart = `${safe.toLocaleString(undefined, { minimumFractionDigits: Math.min(2, decimals), maximumFractionDigits: decimals })} USDT`;
  // Small amounts keep a few decimals; larger ones round to whole rupees.
  const inrDigits = Math.abs(inr) < 100 ? 2 : 0;
  const inrPart = `₹${inr.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: inrDigits })}`;

  if (mode === "USDT_ONLY") return usdtPart;
  if (mode === "INR_ONLY") return inrPart;
  return `${usdtPart} (${inrPart})`;
};
