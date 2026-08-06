/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Global Currency Service
 * ═══════════════════════════════════════════════════════════════════
 */

export class CurrencyService {
  private static usdtInrRate: number = 84.50; // Fallback rate
  private static lastFetch: number = 0;
  private static REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

  /**
   * Fetches the latest USDT/INR rate from a reliable source.
   */
  public static async refreshRate(): Promise<number> {
    const now = Date.now();
    if (this.lastFetch > 0 && now - this.lastFetch < this.REFRESH_INTERVAL) {
      return this.usdtInrRate;
    }

    // USDT is pegged ~1:1 to USD, so USD→INR is the standard proxy for the rate.
    // Try a couple of free, key-less FX sources in order; keep the last good value
    // (or the fallback) if all fail.
    const sources: { url: string; pick: (j: any) => number | undefined }[] = [
      { url: "https://open.er-api.com/v6/latest/USD",                 pick: (j) => j?.rates?.INR },
      { url: "https://api.exchangerate.host/latest?base=USD&symbols=INR", pick: (j) => j?.rates?.INR },
    ];

    for (const src of sources) {
      try {
        const res = await fetch(src.url, { signal: AbortSignal.timeout(1000) });
        if (!res.ok) continue;
        const json = await res.json();
        const rate = src.pick(json);
        if (typeof rate === "number" && rate > 50 && rate < 200) {
          this.usdtInrRate = rate;
          this.lastFetch = now;
          console.log(`[CURRENCY] USDT/INR Rate Updated: ₹${rate.toFixed(2)} (via ${new URL(src.url).host})`);
          return this.usdtInrRate;
        }
      } catch {
        // try next source
      }
    }

    // All sources failed — keep the last known rate but retry again in ~2 min
    // (instead of waiting the full refresh interval) so it self-heals quickly.
    console.error(`[CURRENCY] Live rate fetch failed; keeping ₹${this.usdtInrRate.toFixed(2)}`);
    this.lastFetch = now - this.REFRESH_INTERVAL + 120_000;
    return this.usdtInrRate;
  }

  public static getRate(): number {
    return this.usdtInrRate;
  }

  /**
   * Helper to convert USDT to INR
   */
  public static convertToInr(usdt: number): number {
    return usdt * this.usdtInrRate;
  }

  /**
   * Formats for reporting
   */
  public static formatDual(usdt: number): string {
    const inr = this.convertToInr(usdt);
    return `${usdt.toFixed(2)} USDT (₹${Math.round(inr).toLocaleString()})`;
  }
}

// Initial fetch
CurrencyService.refreshRate();
