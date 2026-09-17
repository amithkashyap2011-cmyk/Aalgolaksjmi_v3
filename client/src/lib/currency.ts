/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Frontend Currency Utility (V5.1 Robust)
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * Single shared fallback FX rate (₹ per USDT), used everywhere a live
 * `inrRate` is missing or 0. Centralised so every component converts the
 * same USDT amount at an identical rate. Matches the baseline used by the
 * store/wallet (MOCK_WALLET.inrRate = 83.5).
 */
export const DEFAULT_INR_RATE = 83.5;

export type CurrencyDisplayMode = "USDT_ONLY" | "INR_ONLY" | "USDT_INR" | "USD_ONLY";

export interface CurrencyFormatOptions {
  mode: CurrencyDisplayMode;
  inrRate: number;
  compact?: boolean;
}

/**
 * Compact USD string. Below $1k, small amounts (<$10, e.g. a few cents of
 * daily P&L) keep 2 decimals so they don't collapse to "$0" — which, next
 * to a whole-rupee INR figure that's still visibly non-zero (₹4 ≈ $0.04),
 * reads as a contradiction ("+$0 (₹4)") even though both numbers were
 * correctly rounded, just at very different precision.
 */
const formatUsdCompact = (usd: number): string => {
  const abs = Math.abs(usd);
  if (abs >= 1000) return `$${(usd / 1000).toFixed(1)}k`;
  if (abs < 10) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(0)}`;
};

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
  const safeRate = isFinite(inrRate) && inrRate > 0 ? inrRate : DEFAULT_INR_RATE; // Default fallback to prevent NaN
  
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
  const rate = isFinite(inrRate) && inrRate > 0 ? inrRate : DEFAULT_INR_RATE;
  const inr = safe * rate;

  const usdtPart = `${safe.toLocaleString(undefined, { minimumFractionDigits: Math.min(2, decimals), maximumFractionDigits: decimals })} USDT`;
  // Small amounts keep a few decimals; larger ones round to whole rupees.
  const inrDigits = Math.abs(inr) < 100 ? 2 : 0;
  const inrPart = `₹${inr.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: inrDigits })}`;

  if (mode === "USDT_ONLY") return usdtPart;
  if (mode === "INR_ONLY") return inrPart;
  return `${usdtPart} (${inrPart})`;
};

/**
 * Formats an amount starting from INR, displaying both Rupees and USD:
 * Example: formatInrWithUsd(509369, 85.0) -> "₹5,09,369 ($5,992)"
 */
export const formatInrWithUsd = (inr: number, inrRate = DEFAULT_INR_RATE, compact = false): string => {
  const safeInr = isFinite(inr) ? inr : 0;
  const safeRate = isFinite(inrRate) && inrRate > 0 ? inrRate : DEFAULT_INR_RATE;
  const usd = safeInr / safeRate;
  const inrStr = compact ? formatInrCompact(safeInr) : `₹${Math.round(safeInr).toLocaleString("en-IN")}`;
  const usdStr = compact
    ? formatUsdCompact(usd)
    : `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${inrStr} (${usdStr})`;
};

/**
 * Formats an amount starting from USD/USDT, displaying both Dollars and Rupees:
 * Example: formatUsdWithInr(10000, 85.0) -> "$10,000.00 (₹8,50,000)"
 */
export const formatUsdWithInr = (usd: number, inrRate = DEFAULT_INR_RATE, compact = false): string => {
  const safeUsd = isFinite(usd) ? usd : 0;
  const safeRate = isFinite(inrRate) && inrRate > 0 ? inrRate : DEFAULT_INR_RATE;
  const inr = safeUsd * safeRate;
  const usdStr = compact
    ? formatUsdCompact(safeUsd)
    : `$${safeUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const inrStr = compact ? formatInrCompact(inr) : `₹${Math.round(inr).toLocaleString("en-IN")}`;
  return `${usdStr} (${inrStr})`;
};
