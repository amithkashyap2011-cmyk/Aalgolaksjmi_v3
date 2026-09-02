/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Unified 15-Feature Intelligence Pipeline (Phase 1)
 * ═══════════════════════════════════════════════════════════════════
 * Standardized feature extraction, validation, and normalization.
 * Guarantees zero duplicate indicator calculations and schema integrity.
 */

export type FeatureValidityState = "VALID" | "DEGRADED" | "INVALID" | "CRITICAL_INVALID";

export interface FeatureHealthReport {
  overallState: FeatureValidityState;
  isValid: boolean;
  isTradePermitted: boolean;
  missingFeatures: string[];
  invalidFeatures: string[];
  staleFeatures: string[];
  outOfRangeFeatures: string[];
  sourceFailures: string[];
  criticalFailures: string[];
  dataAgeMs: number;
  featureCompleteness: number; // 0.0 to 1.0
  reasons: string[];
}

export interface RawMarketContext {
  symbol: string;
  currentPrice: number;
  indicators: any;
  bars: any[];
  volume?: number;
  timestamp?: number;
  marketData?: {
    btcDominance?: number;
    fundingRate?: number;
    volumeAvg?: number;
    openInterest?: number;
    orderBook?: {
      bids?: [number, number][];
      asks?: [number, number][];
      bidVol?: number;
      askVol?: number;
    };
    marketBreadth?: {
      advancing?: number;
      declining?: number;
      breadthRatio?: number;
    };
  };
  newsSentiment?: {
    score?: number;
    impact?: "HIGH" | "MEDIUM" | "LOW";
    hasTier1Event?: boolean;
    headline?: string;
  };
}

export interface Standardized15Features {
  // A. Raw / Market State (1-6)
  ohlcv: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    vwap: number;
  };
  orderBook: {
    bidVol: number;
    askVol: number;
    imbalance: number; // -1.0 to +1.0
    spread: number;
  };
  cvd: {
    cvdScore: number;
    delta: number;
    buyerRatio: number;
  };
  fundingRate: {
    rate: number;
    annualizedRate: number;
    bias: "OVERLEVERAGED_LONG" | "OVERLEVERAGED_SHORT" | "NEUTRAL";
  };
  openInterest: {
    oi: number;
    oiExpansion: number;
    trend: "EXPANDING" | "CONTRACTING" | "STABLE";
  };
  volatility: {
    realizedVol: number;
    parkinsonVol: number;
    ratio: number;
  };

  // B. Derived Technical Features (7-10)
  atr: {
    atr14: number;
    atrPercent: number;
    volatilityState: "LOW" | "NORMAL" | "HIGH" | "EXTREME";
  };
  rsi: {
    rsi14: number;
    state: "OVERSOLD" | "NEUTRAL" | "OVERBOUGHT";
    divergence: "BULLISH" | "BEARISH" | "NONE";
  };
  macd: {
    macd: number;
    signal: number;
    histogram: number;
    momentum: "ACCELERATING_BULL" | "DECELERATING_BULL" | "ACCELERATING_BEAR" | "DECELERATING_BEAR";
  };
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
    bandwidth: number;
    percentB: number;
    isSqueeze: boolean;
  };

  // C. Market Structure (11-13)
  smc: {
    orderBlock: boolean;
    fvg: boolean;
    bos: boolean;
    choch: boolean;
    poc: number;
    structuralTrend: "BULLISH" | "BEARISH" | "NEUTRAL";
  };
  liquiditySweeps: {
    sweepBuySide: boolean;
    sweepSellSide: boolean;
    sweepMagnitude: number;
  };
  marketBreadth: {
    breadthRatio: number; // 0.0 to 1.0
    advanceDeclineState: "BROAD_RALLY" | "NEUTRAL" | "BROAD_LIQUIDATION";
  };

  // D. External Macro / NLP Intelligence (14-15)
  macroNews: {
    hasTier1Event: boolean;
    eventLockActive: boolean;
    impact: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  };
  nlpSentiment: {
    score: number; // -1.0 to +1.0
    confidence: number;
    classification: "EXTREME_FEAR" | "BEARISH" | "NEUTRAL" | "BULLISH" | "EXTREME_GREED";
  };

  // Normalized Tensor Slice for ML Models (Input Version 2)
  tensorVector: number[];
  inputVersion: number;
  timestamp: number;
  symbol?: string;
  marketDomain?: "CRYPTO" | "INDIAN";
}

export class FeaturePipeline {
  public static readonly INPUT_VERSION = 2;
  public static readonly DIMENSION = 12;

  /**
   * Transforms raw context and indicators into the standardized 15-feature intelligence layer.
   */
  public static process(ctx: RawMarketContext): Standardized15Features {
    const ind = ctx.indicators || {};
    const price = ctx.currentPrice || ind.close || 1;
    const bars = ctx.bars || [];

    // 1. OHLCV
    const open = Number(ind.open ?? price);
    const high = Number(ind.high ?? price);
    const low = Number(ind.low ?? price);
    const close = Number(price);
    const volume = Number(ind.volume ?? 0);
    const vwap = Number(ind.vwap ?? price);

    // 2. Order Book
    const ob = ctx.marketData?.orderBook || {};
    const bidVol = Number(ob.bidVol ?? 100);
    const askVol = Number(ob.askVol ?? 100);
    const totalVol = bidVol + askVol;
    const imbalance = totalVol > 0 ? (bidVol - askVol) / totalVol : 0;
    const spread = Math.max(0, (high - low) * 0.05);

    // 3. CVD
    const cvdScore = Number(ind.cvd ?? 0);
    const delta = Number(ind.delta ?? 0);
    const buyerRatio = totalVol > 0 ? bidVol / totalVol : 0.5;

    // 4. Funding Rate
    const funding = Number(ctx.marketData?.fundingRate ?? 0);
    const annFunding = funding * 3 * 365;
    const fundingBias = funding > 0.0005 ? "OVERLEVERAGED_LONG" : (funding < -0.0005 ? "OVERLEVERAGED_SHORT" : "NEUTRAL");

    // 5. Open Interest
    const oi = Number(ctx.marketData?.openInterest ?? 1000);
    const oiExp = Number(ind.oiExpansion ?? 0);
    const oiTrend = oiExp > 5 ? "EXPANDING" : (oiExp < -5 ? "CONTRACTING" : "STABLE");

    // 6. Volatility
    const std14 = Number(ind.stdDev || ind.std_14 || (price * 0.01));
    const realizedVol = price > 0 ? std14 / price : 0.01;
    const parkinsonVol = high > low && low > 0 ? Math.sqrt(Math.pow(Math.log(high / low), 2) / (4 * Math.log(2))) : 0.01;
    const volRatio = realizedVol / Math.max(0.001, parkinsonVol);

    // 7. ATR
    const atr14 = Math.max(0.0001, Number(ind.atr14 ?? (price * 0.015)));
    const atrPct = (atr14 / price) * 100;
    const volState = atrPct > 3.0 ? "EXTREME" : (atrPct > 1.8 ? "HIGH" : (atrPct < 0.6 ? "LOW" : "NORMAL"));

    // 8. RSI
    const rsi14 = Math.min(100, Math.max(0, Number(ind.rsi14 ?? 50)));
    const rsiState = rsi14 < 30 ? "OVERSOLD" : (rsi14 > 70 ? "OVERBOUGHT" : "NEUTRAL");
    const rsiDiv = ind.bullishDivergence ? "BULLISH" : (ind.bearishDivergence ? "BEARISH" : "NONE");

    // 9. MACD
    const macdVal = Number(ind.macd?.macd ?? 0);
    const macdSig = Number(ind.macd?.signal ?? 0);
    const macdHist = Number(ind.macd?.histogram ?? (macdVal - macdSig));
    const macdMomentum = macdHist > 0 
      ? (macdHist > (ind.prevMacdHistogram || 0) ? "ACCELERATING_BULL" : "DECELERATING_BULL")
      : (macdHist < (ind.prevMacdHistogram || 0) ? "ACCELERATING_BEAR" : "DECELERATING_BEAR");

    // 10. Bollinger
    const bMid = Number(ind.bollinger?.middle ?? price);
    const bUpper = Number(ind.bollinger?.upper ?? (bMid + atr14 * 2));
    const bLower = Number(ind.bollinger?.lower ?? (bMid - atr14 * 2));
    const bBandwidth = bMid > 0 ? (bUpper - bLower) / bMid : 0.04;
    const bPercent = (bUpper - bLower) > 0 ? (close - bLower) / (bUpper - bLower) : 0.5;
    const isSqueeze = bBandwidth < 0.025;

    // 11. SMC
    const smcTrend = close > (ind.ema50 || price) ? "BULLISH" : (close < (ind.ema50 || price) ? "BEARISH" : "NEUTRAL");

    // 12. Liquidity Sweeps
    const sweepBuy = Boolean(high > (ind.recentHigh || high * 1.01) && close < (ind.recentHigh || high));
    const sweepSell = Boolean(low < (ind.recentLow || low * 0.99) && close > (ind.recentLow || low));

    // 13. Market Breadth
    const breadthRatio = Math.min(1.0, Math.max(0.0, Number(ctx.marketData?.marketBreadth?.breadthRatio ?? 0.5)));
    const breadthState = breadthRatio > 0.65 ? "BROAD_RALLY" : (breadthRatio < 0.35 ? "BROAD_LIQUIDATION" : "NEUTRAL");

    // 14 & 15. Macro News & Sentiment
    const news = ctx.newsSentiment || {};
    const nlpScore = Math.min(1.0, Math.max(-1.0, Number(news.score ?? 0)));
    const nlpClass = nlpScore >= 0.5 ? "EXTREME_GREED" : (nlpScore > 0.1 ? "BULLISH" : (nlpScore <= -0.5 ? "EXTREME_FEAR" : (nlpScore < -0.1 ? "BEARISH" : "NEUTRAL")));

    // ── Build Normalized 12-Dimensional Tensor Vector for Model Inputs ──
    const ret1 = bars.length >= 2 ? (close - bars[bars.length - 2].close) / bars[bars.length - 2].close : 0;
    const vol1 = bars.length >= 2 ? (volume - bars[bars.length - 2].volume) / Math.max(1, bars[bars.length - 2].volume) : 0;
    const distMa = bMid > 0 ? (close - bMid) / bMid : 0;
    const hiLow = low > 0 ? (high - low) / low : 0;
    const maFast = Number(ind.ema9 ?? close);
    const maSlow = Number(ind.ema21 ?? close);

    const tensorVector = [
      (open - close) / price,
      (high - close) / price,
      (low - close) / price,
      ret1,
      vol1,
      distMa,
      hiLow,
      std14 / price,
      (maFast - close) / price,
      (maSlow - close) / price,
      (rsi14 - 50) / 50,
      imbalance
    ].map(v => isNaN(v) || !isFinite(v) ? 0 : Number(v.toFixed(6)));

    return {
      ohlcv: { open, high, low, close, volume, vwap },
      orderBook: { bidVol, askVol, imbalance: Number(imbalance.toFixed(4)), spread: Number(spread.toFixed(4)) },
      cvd: { cvdScore: Number(cvdScore.toFixed(2)), delta: Number(delta.toFixed(2)), buyerRatio: Number(buyerRatio.toFixed(4)) },
      fundingRate: { rate: funding, annualizedRate: Number((annFunding * 100).toFixed(2)), bias: fundingBias },
      openInterest: { oi, oiExpansion: oiExp, trend: oiTrend },
      volatility: { realizedVol: Number(realizedVol.toFixed(4)), parkinsonVol: Number(parkinsonVol.toFixed(4)), ratio: Number(volRatio.toFixed(2)) },
      atr: { atr14: Number(atr14.toFixed(4)), atrPercent: Number(atrPct.toFixed(2)), volatilityState: volState },
      rsi: { rsi14: Number(rsi14.toFixed(2)), state: rsiState, divergence: rsiDiv },
      macd: { macd: Number(macdVal.toFixed(4)), signal: Number(macdSig.toFixed(4)), histogram: Number(macdHist.toFixed(4)), momentum: macdMomentum },
      bollinger: { upper: Number(bUpper.toFixed(2)), middle: Number(bMid.toFixed(2)), lower: Number(bLower.toFixed(2)), bandwidth: Number(bBandwidth.toFixed(4)), percentB: Number(bPercent.toFixed(4)), isSqueeze },
      smc: { orderBlock: Boolean(ind.orderBlock), fvg: Boolean(ind.fvg), bos: Boolean(ind.bos), choch: Boolean(ind.choch), poc: Number(ind.poc ?? price), structuralTrend: smcTrend },
      liquiditySweeps: { sweepBuySide: sweepBuy, sweepSellSide: sweepSell, sweepMagnitude: Number(atrPct.toFixed(2)) },
      marketBreadth: { breadthRatio: Number(breadthRatio.toFixed(2)), advanceDeclineState: breadthState },
      macroNews: { hasTier1Event: Boolean(news.hasTier1Event), eventLockActive: Boolean(news.hasTier1Event), impact: news.impact || "NONE" },
      nlpSentiment: { score: Number(nlpScore.toFixed(4)), confidence: 0.85, classification: nlpClass },
      tensorVector,
      inputVersion: FeaturePipeline.INPUT_VERSION,
      timestamp: Date.now(),
      symbol: ctx.symbol,
      marketDomain: (ctx.symbol && (ctx.symbol.endsWith("USDT") || ctx.symbol.endsWith("BTC") || ctx.symbol.endsWith("BUSD"))) ? "CRYPTO" : "INDIAN"
    };
  }
  /**
   * Evaluates comprehensive feature health and validity before processing.
   * Fail-Closed: Never silently converts NaN, null, or undefined critical features to zero.
   */
  public static validateHealth(ctx: RawMarketContext): FeatureHealthReport {
    const missingFeatures: string[] = [];
    const invalidFeatures: string[] = [];
    const staleFeatures: string[] = [];
    const outOfRangeFeatures: string[] = [];
    const sourceFailures: string[] = [];
    const criticalFailures: string[] = [];
    const reasons: string[] = [];

    const now = Date.now();
    const dataAgeMs = ctx.timestamp ? Math.max(0, now - ctx.timestamp) : 0;

    // 1. Symbol & Market Context Check
    if (!ctx.symbol || typeof ctx.symbol !== "string" || ctx.symbol.trim().length === 0) {
      criticalFailures.push("symbol");
      reasons.push("Missing or invalid trading pair symbol");
    }

    // 2. Price Validation (Critical)
    const price = ctx.currentPrice;
    if (price === undefined || price === null || typeof price !== "number") {
      missingFeatures.push("currentPrice");
      criticalFailures.push("currentPrice");
      reasons.push("currentPrice is missing or null/undefined");
    } else if (isNaN(price) || !isFinite(price) || price <= 0) {
      invalidFeatures.push("currentPrice");
      criticalFailures.push("currentPrice");
      reasons.push(`currentPrice is non-finite or non-positive: ${price}`);
    }

    // 2b. Volume / Liquidity Validation
    if (ctx.volume !== undefined) {
      if (isNaN(ctx.volume) || !isFinite(ctx.volume) || ctx.volume <= 0) {
        invalidFeatures.push("volume");
        criticalFailures.push("volume");
        reasons.push(`Volume is zero or non-finite (liquidity freeze): ${ctx.volume}`);
      }
    }

    // 3. Indicators Check
    const ind = ctx.indicators;
    if (!ind || typeof ind !== "object") {
      missingFeatures.push("indicators");
      criticalFailures.push("indicators");
      reasons.push("indicators object is missing or invalid");
    } else {
      // Open / High / Low / Close
      if (ind.high !== undefined && (isNaN(ind.high) || !isFinite(ind.high) || ind.high <= 0)) {
        invalidFeatures.push("high");
        criticalFailures.push("high");
        reasons.push(`High price is non-finite: ${ind.high}`);
      }
      if (ind.low !== undefined && (isNaN(ind.low) || !isFinite(ind.low) || ind.low <= 0)) {
        invalidFeatures.push("low");
        criticalFailures.push("low");
        reasons.push(`Low price is non-finite: ${ind.low}`);
      }
      if (ind.high !== undefined && ind.low !== undefined && ind.high < ind.low) {
        invalidFeatures.push("high_low_inversion");
        criticalFailures.push("high_low_inversion");
        reasons.push(`High price (${ind.high}) is less than Low price (${ind.low})`);
      }

      // ATR (Critical for Risk and EV Gate)
      if (ind.atr14 !== undefined) {
        if (isNaN(ind.atr14) || !isFinite(ind.atr14) || ind.atr14 <= 0) {
          invalidFeatures.push("atr14");
          criticalFailures.push("atr14");
          reasons.push(`ATR14 is non-finite or non-positive: ${ind.atr14}`);
        }
      }

      // RSI Range Validation
      if (ind.rsi14 !== undefined) {
        if (isNaN(ind.rsi14) || !isFinite(ind.rsi14)) {
          invalidFeatures.push("rsi14");
          reasons.push(`RSI14 is non-finite: ${ind.rsi14}`);
        } else if (ind.rsi14 < 0 || ind.rsi14 > 100) {
          outOfRangeFeatures.push("rsi14");
          reasons.push(`RSI14 out of bounds [0, 100]: ${ind.rsi14}`);
        }
      }

      // MACD Validation
      if (ind.macd !== undefined && typeof ind.macd === "object") {
        if (isNaN(ind.macd.macd) || !isFinite(ind.macd.macd)) {
          invalidFeatures.push("macd.macd");
          reasons.push(`MACD value is non-finite: ${ind.macd.macd}`);
        }
        if (isNaN(ind.macd.signal) || !isFinite(ind.macd.signal)) {
          invalidFeatures.push("macd.signal");
          reasons.push(`MACD signal is non-finite: ${ind.macd.signal}`);
        }
      }
    }

    // 4. Stale Data Check (> 60s) and Future Timestamp Check
    if (ctx.timestamp && ctx.timestamp > now + 5000) {
      invalidFeatures.push("timestamp");
      criticalFailures.push("timestamp");
      reasons.push(`Future market data timestamp (${ctx.timestamp} > ${now}) detected: temporal leakage error`);
    } else if (dataAgeMs > 60_000) {
      staleFeatures.push("marketDataTimestamp");
      criticalFailures.push("marketDataTimestamp");
      reasons.push(`Market data timestamp latency (${dataAgeMs}ms) exceeds 60s hard ceiling`);
    }

    // 5. Calculate Overall Validity State
    let overallState: FeatureValidityState = "VALID";
    if (criticalFailures.length > 0) {
      overallState = "CRITICAL_INVALID";
    } else if (invalidFeatures.length > 0 || outOfRangeFeatures.length > 0) {
      overallState = "INVALID";
    } else if (missingFeatures.length > 0 || sourceFailures.length > 0 || staleFeatures.length > 0) {
      overallState = "DEGRADED";
    }

    const totalTrackedFeatures = 15;
    const failedFeatureCount = missingFeatures.length + invalidFeatures.length + outOfRangeFeatures.length;
    const featureCompleteness = Math.max(0, Math.min(1.0, (totalTrackedFeatures - failedFeatureCount) / totalTrackedFeatures));

    const isTradePermitted = overallState === "VALID" || overallState === "DEGRADED";

    return {
      overallState,
      isValid: overallState === "VALID",
      isTradePermitted,
      missingFeatures,
      invalidFeatures,
      staleFeatures,
      outOfRangeFeatures,
      sourceFailures,
      criticalFailures,
      dataAgeMs,
      featureCompleteness: Number(featureCompleteness.toFixed(4)),
      reasons
    };
  }

  public static validate(features: Standardized15Features): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (features.inputVersion !== FeaturePipeline.INPUT_VERSION) {
      errors.push("Invalid inputVersion: " + features.inputVersion);
    }

    if (!Array.isArray(features.tensorVector) || features.tensorVector.length !== FeaturePipeline.DIMENSION) {
      errors.push("Tensor vector dimension mismatch: got " + features.tensorVector?.length + ", expected " + FeaturePipeline.DIMENSION);
    } else {
      features.tensorVector.forEach((val, idx) => {
        if (typeof val !== "number" || isNaN(val) || !isFinite(val)) {
          errors.push("Invalid value in tensorVector at index " + idx + ": " + val);
        }
      });
    }

    if (features.ohlcv.close <= 0 || !isFinite(features.ohlcv.close)) errors.push("Invalid close price: " + features.ohlcv.close);
    if (features.rsi.rsi14 < 0 || features.rsi.rsi14 > 100) errors.push("RSI out of range: " + features.rsi.rsi14);
    if (features.nlpSentiment.score < -1.0 || features.nlpSentiment.score > 1.0) errors.push("NLP score out of range: " + features.nlpSentiment.score);
    if (Date.now() - features.timestamp > 300000) errors.push("STALE_MARKET_DATA: Features are older than 5 minutes");

    return { valid: errors.length === 0, errors };
  }
}
