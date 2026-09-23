/**
 * Runs the LIVE quant specialists (QuantStrategyRegistry on the FeaturePipeline
 * tensor, regime from RegimeEngine) over plain historical candles, for callers
 * without a live decide() cycle: the backtester and the quantum StrategyAgent.
 *
 * Limits vs live: candles carry no order book or trade flow, so ORDER_FLOW
 * always HOLDs and Gayatri loses its two flow checks. The LAKSHMI consensus
 * here covers the quant specialists only (the live router also weighs DL
 * models, which aren't replayable per bar).
 */
import { computeSnapshot, type OHLC } from "../../indicatorService.js";
import { FeaturePipeline, type Standardized15Features } from "../pipeline/FeaturePipeline.js";
import { RegimeEngine } from "../regimeEngine.js";
import { QuantStrategyRegistry, type QuantExpertSignal } from "./QuantStrategyRegistry.js";

export const STRATEGY_IDS: Record<string, QuantExpertSignal["strategyId"]> = {
  AARYAN: "AARYAN_MOMENTUM",
  AAYUSH: "AAYUSH_MEAN_REVERSION",
  GAYATRI: "GAYATRI_24_SIGNAL",
  OHMKARA: "OHMKARA_528HZ",
  SMC: "SMC_INSTITUTIONAL",
  ORDER_FLOW: "ORDER_FLOW_CVD",
};

export interface QuantBarsResult {
  features: Standardized15Features;
  regime: string;
  signals: QuantExpertSignal[];
  /** Regime-weighted consensus: ≥2 agreeing specialists and a 1.5× margin, else HOLD. */
  consensus: { direction: "LONG" | "SHORT" | "HOLD"; confidence: number };
}

export function quantSignalsFromBars(bars: OHLC[], symbol = "BACKTEST"): QuantBarsResult {
  const ind: any = computeSnapshot(bars);
  const close = bars[bars.length - 1].close;
  const vols = bars.map((b) => b.volume ?? 0);
  const n = Math.max(1, Math.min(20, vols.length));
  const volumeAvg = vols.slice(-20).reduce((a, v) => a + v, 0) / n;
  const features = FeaturePipeline.process({ symbol, currentPrice: close, indicators: ind, bars, marketData: { volumeAvg } });
  const regime = RegimeEngine.analyze({
    adx: ind.adx14 || 0,
    atr: ind.atr14 || 0,
    atrTrailing: ind.atrTrailing || (ind.atr14 || 0) * 0.95,
    ema200: ind.sma200 ?? ind.ema55 ?? ind.ema21 ?? close,
    close,
    volume: vols[vols.length - 1] || 0,
    volumeAvg,
  });
  const signals = QuantStrategyRegistry.evaluateAll(features, regime.state);

  let longW = 0, shortW = 0, nLong = 0, nShort = 0, total = 0;
  for (const s of signals) {
    const w = s.confidence * s.regimeCompatibility;
    total += s.regimeCompatibility;
    if (s.direction === "LONG") { longW += w; nLong++; }
    if (s.direction === "SHORT") { shortW += w; nShort++; }
  }
  let direction: "LONG" | "SHORT" | "HOLD" = "HOLD";
  if (nLong >= 2 && longW > shortW * 1.5) direction = "LONG";
  else if (nShort >= 2 && shortW > longW * 1.5) direction = "SHORT";
  const confidence = direction === "HOLD" ? 0 : Number(((direction === "LONG" ? longW : shortW) / Math.max(total, 1e-9)).toFixed(4));

  return { features, regime: String(regime.state), signals, consensus: { direction, confidence } };
}
