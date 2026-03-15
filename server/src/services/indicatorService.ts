/*
 * ─── Indicator Service ─────────────────────────────────
 *
 * Streaming / incremental technical indicators.
 * Each indicator maintains internal state so it can be
 * updated bar‑by‑bar without recomputing from scratch.
 *
 * Exposed helpers also accept a plain number[] for batch use.
 *
 * Indicators: EMA, SMA, RSI, MACD, ATR, Bollinger Bands,
 *             rolling StdDev, ADX (simplified).
 */

import { RingBuffer } from "../lib/ringBuffer.js";

/* ════════════════════════════════════════════════════════
 *  1.  EMA  (Exponential Moving Average)
 * ════════════════════════════════════════════════════════ */

export class StreamingEMA {
  private k: number;
  private _value: number | null = null;

  constructor(readonly period: number) {
    this.k = 2 / (period + 1);
  }

  get value(): number | null { return this._value; }

  /** Feed one new close price; returns updated EMA. */
  update(price: number): number {
    if (this._value === null) {
      this._value = price; // seed with first value
    } else {
      this._value = price * this.k + this._value * (1 - this.k);
    }
    return this._value;
  }

  reset(): void { this._value = null; }
}

/** Batch EMA over a number[]. Returns array of same length. */
export function ema(prices: number[], period: number): number[] {
  const s = new StreamingEMA(period);
  return prices.map((p) => s.update(p));
}

/* ════════════════════════════════════════════════════════
 *  2.  SMA  (Simple Moving Average) – rolling window
 * ════════════════════════════════════════════════════════ */

export class StreamingSMA {
  private ring: RingBuffer<number>;
  private _sum = 0;

  constructor(readonly period: number) {
    this.ring = new RingBuffer<number>(period);
  }

  get value(): number | null {
    return this.ring.isFull ? this._sum / this.period : null;
  }

  update(price: number): number | null {
    if (this.ring.isFull) {
      this._sum -= this.ring.at(0) as number;
    }
    this.ring.push(price);
    this._sum += price;
    return this.value;
  }

  reset(): void { this.ring.clear(); this._sum = 0; }
}

export function sma(prices: number[], period: number): (number | null)[] {
  const s = new StreamingSMA(period);
  return prices.map((p) => s.update(p));
}

/* ════════════════════════════════════════════════════════
 *  3.  RSI  (Relative Strength Index)
 * ════════════════════════════════════════════════════════ */

export class StreamingRSI {
  private period: number;
  private prevPrice: number | null = null;
  private avgGain = 0;
  private avgLoss = 0;
  private count = 0;
  private _value: number | null = null;

  constructor(period = 14) {
    this.period = period;
  }

  get value(): number | null { return this._value; }

  update(price: number): number | null {
    if (this.prevPrice === null) {
      this.prevPrice = price;
      this.count++;
      return null;
    }

    const change = price - this.prevPrice;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    this.prevPrice = price;
    this.count++;

    if (this.count <= this.period) {
      // accumulation phase – simple average
      this.avgGain += gain / this.period;
      this.avgLoss += loss / this.period;
      if (this.count === this.period) {
        const rs = this.avgLoss === 0 ? 100 : this.avgGain / this.avgLoss;
        this._value = 100 - 100 / (1 + rs);
      }
    } else {
      // smoothed (Wilder's)
      this.avgGain = (this.avgGain * (this.period - 1) + gain) / this.period;
      this.avgLoss = (this.avgLoss * (this.period - 1) + loss) / this.period;
      const rs = this.avgLoss === 0 ? 100 : this.avgGain / this.avgLoss;
      this._value = 100 - 100 / (1 + rs);
    }
    return this._value;
  }

  reset(): void {
    this.prevPrice = null;
    this.avgGain = 0;
    this.avgLoss = 0;
    this.count = 0;
    this._value = null;
  }
}

export function rsi(prices: number[], period = 14): (number | null)[] {
  const s = new StreamingRSI(period);
  return prices.map((p) => s.update(p));
}

/* ════════════════════════════════════════════════════════
 *  4.  MACD
 * ════════════════════════════════════════════════════════ */

export interface MACDValue {
  macd: number;
  signal: number;
  histogram: number;
}

export class StreamingMACD {
  private fast: StreamingEMA;
  private slow: StreamingEMA;
  private sig: StreamingEMA;
  private count = 0;
  private _value: MACDValue | null = null;

  constructor(fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    this.fast = new StreamingEMA(fastPeriod);
    this.slow = new StreamingEMA(slowPeriod);
    this.sig = new StreamingEMA(signalPeriod);
    this.count = 0;
  }

  get value(): MACDValue | null { return this._value; }

  update(price: number): MACDValue | null {
    this.fast.update(price);
    this.slow.update(price);
    this.count++;
    if (this.fast.value === null || this.slow.value === null) return null;
    const macdLine = this.fast.value - this.slow.value;
    const signalLine = this.sig.update(macdLine);
    this._value = {
      macd: macdLine,
      signal: signalLine,
      histogram: macdLine - signalLine,
    };
    return this._value;
  }

  reset(): void {
    this.fast.reset();
    this.slow.reset();
    this.sig.reset();
    this.count = 0;
    this._value = null;
  }
}

/* ════════════════════════════════════════════════════════
 *  5.  ATR  (Average True Range)
 * ════════════════════════════════════════════════════════ */

export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
}

export class StreamingATR {
  private period: number;
  private prevClose: number | null = null;
  private _value: number | null = null;
  private count = 0;
  private sum = 0;

  constructor(period = 14) {
    this.period = period;
  }

  get value(): number | null { return this._value; }

  update(bar: OHLC): number | null {
    let tr: number;
    if (this.prevClose === null) {
      tr = bar.high - bar.low;
    } else {
      tr = Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - this.prevClose),
        Math.abs(bar.low - this.prevClose),
      );
    }
    this.prevClose = bar.close;
    this.count++;

    if (this.count <= this.period) {
      this.sum += tr;
      if (this.count === this.period) {
        this._value = this.sum / this.period;
      }
    } else {
      // Wilder's smoothing
      this._value = (this._value! * (this.period - 1) + tr) / this.period;
    }
    return this._value;
  }

  reset(): void {
    this.prevClose = null;
    this._value = null;
    this.count = 0;
    this.sum = 0;
  }
}

/* ════════════════════════════════════════════════════════
 *  6.  Bollinger Bands
 * ════════════════════════════════════════════════════════ */

export interface BollingerValue {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
}

export class StreamingBollinger {
  private ring: RingBuffer<number>;
  private _sum = 0;
  private _sumSq = 0;
  private stdMul: number;

  constructor(readonly period: number = 20, stdMultiplier = 2) {
    this.ring = new RingBuffer<number>(period);
    this.stdMul = stdMultiplier;
  }

  get value(): BollingerValue | null {
    if (!this.ring.isFull) return null;
    const mean = this._sum / this.period;
    const variance = this._sumSq / this.period - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));
    return {
      upper: mean + this.stdMul * std,
      middle: mean,
      lower: mean - this.stdMul * std,
      bandwidth: std > 0 ? (2 * this.stdMul * std) / mean : 0,
    };
  }

  update(price: number): BollingerValue | null {
    if (this.ring.isFull) {
      const old = this.ring.at(0) as number;
      this._sum -= old;
      this._sumSq -= old * old;
    }
    this.ring.push(price);
    this._sum += price;
    this._sumSq += price * price;
    return this.value;
  }

  reset(): void {
    this.ring.clear();
    this._sum = 0;
    this._sumSq = 0;
  }
}

/* ════════════════════════════════════════════════════════
 *  7.  Rolling StdDev / Variance  (for volatility)
 * ════════════════════════════════════════════════════════ */

export class StreamingStdDev {
  private ring: RingBuffer<number>;
  private _sum = 0;
  private _sumSq = 0;

  constructor(readonly period: number) {
    this.ring = new RingBuffer<number>(period);
  }

  get value(): number | null {
    if (!this.ring.isFull) return null;
    const mean = this._sum / this.period;
    const variance = this._sumSq / this.period - mean * mean;
    return Math.sqrt(Math.max(0, variance));
  }

  update(price: number): number | null {
    if (this.ring.isFull) {
      const old = this.ring.at(0) as number;
      this._sum -= old;
      this._sumSq -= old * old;
    }
    this.ring.push(price);
    this._sum += price;
    this._sumSq += price * price;
    return this.value;
  }
}

/* ════════════════════════════════════════════════════════
 *  8.  ADX  (Average Directional Index) — simplified
 * ════════════════════════════════════════════════════════ */

export class StreamingADX {
  private period: number;
  private prevBar: OHLC | null = null;
  private smoothPlusDM = 0;
  private smoothMinusDM = 0;
  private smoothTR = 0;
  private adxAccum = 0;
  private adxCount = 0;
  private _value: number | null = null;
  private count = 0;

  constructor(period = 14) { this.period = period; }

  get value(): number | null { return this._value; }

  update(bar: OHLC): number | null {
    if (this.prevBar === null) { this.prevBar = bar; this.count++; return null; }

    const upMove = bar.high - this.prevBar.high;
    const downMove = this.prevBar.low - bar.low;
    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - this.prevBar.close),
      Math.abs(bar.low - this.prevBar.close),
    );
    this.prevBar = bar;
    this.count++;

    if (this.count <= this.period) {
      this.smoothPlusDM += plusDM;
      this.smoothMinusDM += minusDM;
      this.smoothTR += tr;
      if (this.count === this.period) {
        // Initialise smoothed values
        // First DX reading
        const plusDI = this.smoothTR > 0 ? (this.smoothPlusDM / this.smoothTR) * 100 : 0;
        const minusDI = this.smoothTR > 0 ? (this.smoothMinusDM / this.smoothTR) * 100 : 0;
        const diSum = plusDI + minusDI;
        const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
        this.adxAccum = dx;
        this.adxCount = 1;
      }
    } else {
      // Wilder smoothing
      this.smoothPlusDM = this.smoothPlusDM - this.smoothPlusDM / this.period + plusDM;
      this.smoothMinusDM = this.smoothMinusDM - this.smoothMinusDM / this.period + minusDM;
      this.smoothTR = this.smoothTR - this.smoothTR / this.period + tr;

      const plusDI = this.smoothTR > 0 ? (this.smoothPlusDM / this.smoothTR) * 100 : 0;
      const minusDI = this.smoothTR > 0 ? (this.smoothMinusDM / this.smoothTR) * 100 : 0;
      const diSum = plusDI + minusDI;
      const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;

      this.adxCount++;
      if (this.adxCount <= this.period) {
        this.adxAccum += dx;
        if (this.adxCount === this.period) {
          this._value = this.adxAccum / this.period;
        }
      } else {
        // Wilder smooth ADX
        this._value = (this._value! * (this.period - 1) + dx) / this.period;
      }
    }
    return this._value;
  }

  reset(): void {
    this.prevBar = null;
    this.smoothPlusDM = 0; this.smoothMinusDM = 0; this.smoothTR = 0;
    this.adxAccum = 0; this.adxCount = 0;
    this._value = null; this.count = 0;
  }
}

/* ════════════════════════════════════════════════════════
 *  9.  VWAP  (Volume Weighted Average Price) — session
 *
 *  Uses cumulative typical price × volume / cumulative volume.
 *  Call reset() at the start of each trading session.
 * ════════════════════════════════════════════════════════ */

export interface OHLCVol extends OHLC {
  volume: number;
}

export class StreamingVWAP {
  private cumTPV = 0;  // Σ(typical_price × volume)
  private cumVol = 0;  // Σ(volume)
  private _value: number | null = null;

  get value(): number | null { return this._value; }

  update(bar: OHLCVol): number | null {
    const tp = (bar.high + bar.low + bar.close) / 3;
    this.cumTPV += tp * bar.volume;
    this.cumVol += bar.volume;
    this._value = this.cumVol > 0 ? this.cumTPV / this.cumVol : null;
    return this._value;
  }

  reset(): void {
    this.cumTPV = 0;
    this.cumVol = 0;
    this._value = null;
  }
}

/* ════════════════════════════════════════════════════════
 *  10.  Snapshot: compute all indicators for N bars
 * ════════════════════════════════════════════════════════ */

export interface IndicatorSnapshot {
  rsi14: number | null;
  ema9: number | null;
  ema21: number | null;
  ema55: number | null;
  sma200: number | null;
  macd: MACDValue | null;
  atr14: number | null;
  adx14: number | null;
  bollinger: BollingerValue | null;
  stdDev20: number | null;
  /** Current close price */
  close: number;
  /** %‑change from previous close */
  changePercent: number;
}

/**
 * Compute a full IndicatorSnapshot from a bar series.
 * Pass OHLC bars oldest → newest.
 */
export function computeSnapshot(bars: OHLC[]): IndicatorSnapshot {
  const rsiCalc = new StreamingRSI(14);
  const ema9 = new StreamingEMA(9);
  const ema21 = new StreamingEMA(21);
  const ema55 = new StreamingEMA(55);
  const sma200 = new StreamingSMA(200);
  const macdCalc = new StreamingMACD();
  const atrCalc = new StreamingATR(14);
  const adxCalc = new StreamingADX(14);
  const bollCalc = new StreamingBollinger(20, 2);
  const stdCalc = new StreamingStdDev(20);

  for (const bar of bars) {
    rsiCalc.update(bar.close);
    ema9.update(bar.close);
    ema21.update(bar.close);
    ema55.update(bar.close);
    sma200.update(bar.close);
    macdCalc.update(bar.close);
    atrCalc.update(bar);
    adxCalc.update(bar);
    bollCalc.update(bar.close);
    stdCalc.update(bar.close);
  }

  const last = bars[bars.length - 1];
  const prev = bars.length > 1 ? bars[bars.length - 2] : last;
  const changePercent = prev.close !== 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;

  return {
    rsi14: rsiCalc.value,
    ema9: ema9.value,
    ema21: ema21.value,
    ema55: ema55.value,
    sma200: sma200.value,
    macd: macdCalc.value,
    atr14: atrCalc.value,
    adx14: adxCalc.value,
    bollinger: bollCalc.value,
    stdDev20: stdCalc.value,
    close: last.close,
    changePercent,
  };
}
