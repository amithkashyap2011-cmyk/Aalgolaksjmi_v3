/**
 * RSI(14) and ADX(14) with Wilder smoothing, computed from real candles.
 * Replaces the sine-wave rsi14/adx14 the Indian strategies were deciding on.
 */

/** Wilder RSI over `closes` (oldest first). Needs ≥ period+1 values. */
export function rsi(closes: number[], period = 14): number | undefined {
  if (closes.length < period + 1) return undefined;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** Wilder ADX over HLC series (oldest first). Needs ≥ 2*period+1 bars. */
export function adx(highs: number[], lows: number[], closes: number[], period = 14): number | undefined {
  const n = closes.length;
  if (n < 2 * period + 1 || highs.length !== n || lows.length !== n) return undefined;
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 1; i < n; i++) {
    const up = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  let atr = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let pDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let mDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  const dx: number[] = [];
  for (let i = period; i <= tr.length; i++) {
    if (i > period) {
      atr = atr - atr / period + tr[i - 1];
      pDM = pDM - pDM / period + plusDM[i - 1];
      mDM = mDM - mDM / period + minusDM[i - 1];
    }
    const pDI = atr > 0 ? (100 * pDM) / atr : 0;
    const mDI = atr > 0 ? (100 * mDM) / atr : 0;
    const sum = pDI + mDI;
    dx.push(sum > 0 ? (100 * Math.abs(pDI - mDI)) / sum : 0);
  }
  if (dx.length < period) return undefined;
  let adxVal = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) adxVal = (adxVal * (period - 1) + dx[i]) / period;
  return adxVal;
}
