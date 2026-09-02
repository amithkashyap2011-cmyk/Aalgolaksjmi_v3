/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Global Currency Service & Exchange Rate Governance
 * ═══════════════════════════════════════════════════════════════════
 *
 * Provides resilient, auditable, and bounded USDT/INR and USD/INR
 * exchange rate conversion with multi-provider fallback, exponential
 * backoff retry governance, strict sanity validation, and deterministic
 * test isolation.
 */

export type CurrencyRateStatus = "LIVE" | "CACHED" | "STALE" | "FALLBACK" | "UNAVAILABLE";

export type CurrencyRateSource =
  | "LIVE_OPEN_ER"
  | "LIVE_EXCHANGE_RATE_HOST"
  | "LIVE_COINGECKO"
  | "LIVE_CRYPTOCOMPARE"
  | "CACHED_LAST_KNOWN"
  | "SAFE_FALLBACK"
  | "TEST_MOCK";

export interface CurrencyRateMetadata {
  rate: number;
  source: CurrencyRateSource;
  status: CurrencyRateStatus;
  fetchedAt: number;
  ageSeconds: number;
  isLive: boolean;
  failureCount: number;
  nextRetryAt: number;
}

export interface IFXProvider {
  name: string;
  sourceId: CurrencyRateSource;
  fetchRate(timeoutMs?: number): Promise<number | null>;
}

/**
 * Validates that an exchange rate is a positive, finite number within sane bounds.
 * (USDT is pegged ~1:1 USD; USD/INR historically trades in the 50.0 - 200.0 range).
 */
export function isValidCurrencyRate(rate: any): rate is number {
  return (
    typeof rate === "number" &&
    Number.isFinite(rate) &&
    !Number.isNaN(rate) &&
    rate >= 50.0 &&
    rate <= 200.0
  );
}

// ── Built-in Providers ──

export class OpenERProvider implements IFXProvider {
  public name = "OpenER";
  public sourceId: CurrencyRateSource = "LIVE_OPEN_ER";

  public async fetchRate(timeoutMs: number = 2000): Promise<number | null> {
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      const rate = json?.rates?.INR;
      return isValidCurrencyRate(rate) ? rate : null;
    } catch {
      return null;
    }
  }
}

export class ExchangeRateHostProvider implements IFXProvider {
  public name = "ExchangeRateHost";
  public sourceId: CurrencyRateSource = "LIVE_EXCHANGE_RATE_HOST";

  public async fetchRate(timeoutMs: number = 2000): Promise<number | null> {
    try {
      const res = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=INR", {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      const rate = json?.rates?.INR;
      return isValidCurrencyRate(rate) ? rate : null;
    } catch {
      return null;
    }
  }
}

export class CoinGeckoProvider implements IFXProvider {
  public name = "CoinGecko";
  public sourceId: CurrencyRateSource = "LIVE_COINGECKO";

  public async fetchRate(timeoutMs: number = 2000): Promise<number | null> {
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr", {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      const rate = json?.tether?.inr;
      return isValidCurrencyRate(rate) ? rate : null;
    } catch {
      return null;
    }
  }
}

export class CryptoCompareProvider implements IFXProvider {
  public name = "CryptoCompare";
  public sourceId: CurrencyRateSource = "LIVE_CRYPTOCOMPARE";

  public async fetchRate(timeoutMs: number = 2000): Promise<number | null> {
    try {
      const res = await fetch("https://min-api.cryptocompare.com/data/price?fsym=USDT&tsyms=INR", {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      const rate = json?.INR;
      return isValidCurrencyRate(rate) ? rate : null;
    } catch {
      return null;
    }
  }
}

export class CurrencyService {
  // Safe default fallback rate
  public static readonly DEFAULT_FALLBACK_RATE: number = 84.50;

  // Cache intervals
  public static readonly REFRESH_INTERVAL_MS: number = 15 * 60 * 1000; // 15 minutes
  public static readonly MAX_CACHE_AGE_MS: number = 24 * 60 * 60 * 1000; // 24 hours
  public static readonly BASE_RETRY_INTERVAL_MS: number = 2 * 60 * 1000; // 2 minutes
  public static readonly MAX_RETRY_INTERVAL_MS: number = 15 * 60 * 1000; // 15 minutes

  // Runtime state
  private static currentRate: number = CurrencyService.DEFAULT_FALLBACK_RATE;
  private static lastSuccessfulFetchAt: number = 0;
  private static lastAttemptAt: number = 0;
  private static nextRetryAt: number = 0;
  private static failureCount: number = 0;
  private static currentStatus: CurrencyRateStatus = "FALLBACK";
  private static currentSource: CurrencyRateSource = "SAFE_FALLBACK";

  // Active providers list
  private static providers: IFXProvider[] = [
    new OpenERProvider(),
    new ExchangeRateHostProvider(),
    new CoinGeckoProvider(),
    new CryptoCompareProvider(),
  ];

  // Test overrides
  private static mockProvider: IFXProvider | null = null;
  private static mockRateOverride: number | null = null;

  /**
   * Refreshes the currency rate from live providers if cache is expired or retry window reached.
   */
  public static async refreshRate(force: boolean = false): Promise<number> {
    const now = Date.now();

    // In test environment, if no explicit live fetch requested and test mock exists, return deterministic rate
    if (process.env.NODE_ENV === "test" && !force && this.mockProvider === null && this.mockRateOverride === null) {
      if (this.lastSuccessfulFetchAt === 0) {
        this.currentRate = this.DEFAULT_FALLBACK_RATE;
        this.currentStatus = "CACHED";
        this.currentSource = "TEST_MOCK";
        this.lastSuccessfulFetchAt = now;
      }
      return this.currentRate;
    }

    // Check mock override
    if (this.mockRateOverride !== null) {
      this.currentRate = this.mockRateOverride;
      this.currentStatus = "LIVE";
      this.currentSource = "TEST_MOCK";
      this.lastSuccessfulFetchAt = now;
      return this.currentRate;
    }

    // Check if current cache is fresh
    if (!force && this.lastSuccessfulFetchAt > 0 && now - this.lastSuccessfulFetchAt < this.REFRESH_INTERVAL_MS) {
      return this.currentRate;
    }

    // Check retry backoff window
    if (!force && this.failureCount > 0 && now < this.nextRetryAt) {
      return this.currentRate;
    }

    this.lastAttemptAt = now;

    // Use mock provider if injected
    const activeProviders = this.mockProvider ? [this.mockProvider] : this.providers;

    for (const provider of activeProviders) {
      try {
        const rate = await provider.fetchRate(2000);
        if (isValidCurrencyRate(rate)) {
          this.currentRate = rate;
          this.lastSuccessfulFetchAt = now;
          this.failureCount = 0;
          this.nextRetryAt = 0;
          this.currentStatus = "LIVE";
          this.currentSource = provider.sourceId;

          if (process.env.NODE_ENV !== "test") {
            console.log(`[CURRENCY] USDT/INR Rate Updated: ₹${rate.toFixed(2)} (via ${provider.name})`);
          }
          return this.currentRate;
        }
      } catch {
        // Fall through to next provider
      }
    }

    // All live providers failed
    this.failureCount += 1;

    // Calculate exponential backoff with jitter
    const backoffExponent = Math.min(this.failureCount - 1, 4);
    const backoffMs = Math.min(
      this.MAX_RETRY_INTERVAL_MS,
      this.BASE_RETRY_INTERVAL_MS * Math.pow(1.5, backoffExponent)
    );
    const jitterMs = Math.floor(Math.random() * 3000);
    this.nextRetryAt = now + backoffMs + jitterMs;

    // Determine status based on cache age
    if (this.lastSuccessfulFetchAt > 0) {
      const cacheAge = now - this.lastSuccessfulFetchAt;
      if (cacheAge <= this.MAX_CACHE_AGE_MS) {
        this.currentStatus = "CACHED";
        this.currentSource = "CACHED_LAST_KNOWN";
      } else {
        this.currentStatus = "STALE";
        this.currentSource = "SAFE_FALLBACK";
      }
    } else {
      this.currentStatus = "FALLBACK";
      this.currentSource = "SAFE_FALLBACK";
      this.currentRate = this.DEFAULT_FALLBACK_RATE;
    }

    // Log appropriately (warn for transient provider failure when cached/fallback rate exists)
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        `[CURRENCY] Transient live FX provider failure (attempt ${this.failureCount}); using ${this.currentStatus} rate ₹${this.currentRate.toFixed(2)} (source: ${this.currentSource}, nextRetryIn: ${Math.round((this.nextRetryAt - now) / 1000)}s)`
      );
    }

    return this.currentRate;
  }

  /**
   * Synchronous getter for current rate.
   */
  public static getRate(): number {
    return this.currentRate;
  }

  /**
   * Alias for getRate / refreshRate consistency.
   */
  public static async getUsdtInrRate(): Promise<number> {
    return this.refreshRate();
  }

  /**
   * Converts USDT amount to INR using current rate.
   */
  public static convertToInr(usdt: number): number {
    if (!Number.isFinite(usdt)) return 0;
    return usdt * this.currentRate;
  }

  /**
   * Converts INR amount to USDT using current rate.
   */
  public static convertToUsdt(inr: number): number {
    if (!Number.isFinite(inr) || this.currentRate <= 0) return 0;
    return inr / this.currentRate;
  }

  /**
   * Formats dual currency string (USDT + INR).
   */
  public static formatDual(usdt: number): string {
    if (!Number.isFinite(usdt)) return "0.00 USDT (₹0)";
    const inr = this.convertToInr(usdt);
    return `${usdt.toFixed(2)} USDT (₹${Math.round(inr).toLocaleString()})`;
  }

  /**
   * Returns complete metadata and governance health information.
   */
  public static getMetadata(): CurrencyRateMetadata {
    const now = Date.now();
    const ageSeconds = this.lastSuccessfulFetchAt > 0 ? Math.floor((now - this.lastSuccessfulFetchAt) / 1000) : 0;
    return {
      rate: this.currentRate,
      source: this.currentSource,
      status: this.currentStatus,
      fetchedAt: this.lastSuccessfulFetchAt,
      ageSeconds,
      isLive: this.currentStatus === "LIVE",
      failureCount: this.failureCount,
      nextRetryAt: this.nextRetryAt,
    };
  }

  /**
   * Returns health diagnostic status for /health/full and system monitoring.
   */
  public static getHealth(): Record<string, any> {
    const meta = this.getMetadata();
    return {
      status: meta.status === "UNAVAILABLE" ? "error" : "ok",
      rate: meta.rate,
      rateStatus: meta.status,
      source: meta.source,
      lastSuccessfulFetchAt: meta.fetchedAt ? new Date(meta.fetchedAt).toISOString() : null,
      cacheAgeSeconds: meta.ageSeconds,
      failureCount: meta.failureCount,
      nextRetryAt: meta.nextRetryAt ? new Date(meta.nextRetryAt).toISOString() : null,
    };
  }

  // ── Testing & Diagnostic Helpers ──

  public static setMockProvider(provider: IFXProvider | null): void {
    this.mockProvider = provider;
  }

  public static setMockRate(rate: number | null): void {
    this.mockRateOverride = rate;
    if (rate !== null && isValidCurrencyRate(rate)) {
      this.currentRate = rate;
      this.currentStatus = "LIVE";
      this.currentSource = "TEST_MOCK";
      this.lastSuccessfulFetchAt = Date.now();
    }
  }

  public static resetForTesting(): void {
    this.currentRate = this.DEFAULT_FALLBACK_RATE;
    this.lastSuccessfulFetchAt = 0;
    this.lastAttemptAt = 0;
    this.nextRetryAt = 0;
    this.failureCount = 0;
    this.currentStatus = "FALLBACK";
    this.currentSource = "SAFE_FALLBACK";
    this.mockProvider = null;
    this.mockRateOverride = null;
  }
}

// In production / non-test environments, perform initial non-blocking refresh on boot
if (process.env.NODE_ENV !== "test") {
  CurrencyService.refreshRate().catch(() => {});
}
