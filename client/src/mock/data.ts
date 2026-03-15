/*
 * ─── Phase 2 Mock Data ────────────────────────────────
 *
 * All UI components in Phase 2 use ONLY this mock data.
 * No API calls – pure frontend development.
 *
 * Updated: Multi-coin selection, SHIBUSDT added, core
 * strategies (Aaryan, Aayush, Gayatri, Lakshmi),
 * Gayatri 24-signal frequency system.
 */

import type { Position, Alert, HistoryTrade, BehaviorWeights } from "../store/useAppStore";

/* ── Symbols (multi-select supported) ────────────────── */
export const SYMBOLS = [
  "DOGEUSDT",
  "SHIBUSDT",
  "ETHUSDT",
  "ADAUSDT",
  "BNBUSDT",
] as const;
export type Symbol = (typeof SYMBOLS)[number];

/* ── Label map ───────────────────────────────────────── */
export const SYMBOL_LABELS: Record<string, string> = {
  DOGEUSDT: "DOGE",
  SHIBUSDT: "SHIB",
  ETHUSDT: "ETH",
  ADAUSDT: "ADA",
  BNBUSDT: "BNB",
};

/* ── Timeframes ──────────────────────────────────────── */
export const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

/* ── Fibonacci size percentages ──────────────────────── */
export const FIB_SIZES = [3, 5, 8, 13, 21] as const;

/* ══════════════════════════════════════════════════════
 *  CORE STRATEGIES
 * ══════════════════════════════════════════════════════ */

export type StrategySignal = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

/**
 * Strategy definition for UI display and mock evaluation
 */
export interface StrategyDef {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  color: string;
  bgColor: string;
  barColor: string;
}

export const CORE_STRATEGIES: StrategyDef[] = [
  {
    id: "LAKSHMI",
    name: "Lakshmi",
    emoji: "🪷",
    tagline: "The Hybrid Goddess — No-Loss Strategy",
    description:
      "Combines the best from Aaryan, Aayush & Gayatri. Only enters on multi-strategy consensus " +
      "with Gayatri ≥ 16/24 frequency gate. Tightest SL, widest TP, immediate trailing. " +
      "The ultimate prosperity strategy — abundance without loss.",
    color: "text-aalgold",
    bgColor: "bg-aalgold/10",
    barColor: "bg-aalgold",
  },
  {
    id: "AARYAN",
    name: "Aaryan",
    emoji: "⚔️",
    tagline: "The Disciplined Warrior",
    description:
      "Momentum + breakout strategy. Enters on confirmed EMA crossovers with MACD & volume confirmation. " +
      "Tight ATR-based stop-loss (1.5×ATR), aggressive trailing. Warrior spirit — " +
      "disciplined entries, decisive exits.",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    barColor: "bg-blue-500",
  },
  {
    id: "AAYUSH",
    name: "Aayush",
    emoji: "🌱",
    tagline: "The Patient Accumulator",
    description:
      "Mean-reversion with patience. Waits for RSI oversold / Bollinger lower band conditions. " +
      "Scales in progressively (40% → 70% → 100%). Wider stops for room to breathe. " +
      "Steady accumulation — nurturing growth.",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    barColor: "bg-emerald-500",
  },
  {
    id: "GAYATRI",
    name: "Gayatri",
    emoji: "🕉️",
    tagline: "24-Signal Mantra Frequency",
    description:
      "Maps 24 market signals to the 24 syllables of the Gayatri Mantra. " +
      "Three octaves (TAT/SAT/OM) measure Momentum, Structure & Harmony. " +
      "≥ 20/24 = 528 Hz deep resonance → STRONG BUY. Dynamic SL based on frequency.",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    barColor: "bg-purple-500",
  },
];

/* ══════════════════════════════════════════════════════
 *  GAYATRI 24-SIGNAL MOCK DATA
 * ══════════════════════════════════════════════════════ */

export interface GayatriSignalItem {
  id: number;
  syllable: string;
  octave: "TAT" | "SAT" | "OM";
  label: string;
  active: boolean;
  detail: string;
}

const GAYATRI_SYLLABLES = [
  "tat", "sa", "vi", "tur", "va", "re", "ṇi", "yaṃ",
  "bhar", "go", "de", "vas", "ya", "dhī", "ma", "hi",
  "dhi", "yo", "yo", "naḥ", "pra", "cho", "da", "yāt",
];

/** Generate a mock Gayatri 24-signal evaluation for a symbol */
export function generateMockGayatriSignals(symbol: string): GayatriSignalItem[] {
  const seed = symbol.charCodeAt(0) + symbol.charCodeAt(1);
  return [
    { id: 1,  syllable: GAYATRI_SYLLABLES[0],  octave: "TAT", label: "EMA9 > EMA21",     active: seed % 3 !== 0, detail: "Short-term trend aligned" },
    { id: 2,  syllable: GAYATRI_SYLLABLES[1],  octave: "TAT", label: "EMA21 > EMA55",    active: seed % 4 !== 0, detail: "Mid-term trend confirmed" },
    { id: 3,  syllable: GAYATRI_SYLLABLES[2],  octave: "TAT", label: "MACD > signal",    active: true,           detail: "Momentum rising" },
    { id: 4,  syllable: GAYATRI_SYLLABLES[3],  octave: "TAT", label: "MACD histogram +", active: seed % 2 === 0, detail: "Positive momentum" },
    { id: 5,  syllable: GAYATRI_SYLLABLES[4],  octave: "TAT", label: "RSI > 40",         active: true,           detail: "Not oversold" },
    { id: 6,  syllable: GAYATRI_SYLLABLES[5],  octave: "TAT", label: "RSI < 70",         active: seed % 5 !== 0, detail: "Not overbought" },
    { id: 7,  syllable: GAYATRI_SYLLABLES[6],  octave: "TAT", label: "Price > EMA9",     active: true,           detail: "Above fast MA" },
    { id: 8,  syllable: GAYATRI_SYLLABLES[7],  octave: "TAT", label: "Positive candle",  active: seed % 3 !== 2, detail: "Bullish close" },
    { id: 9,  syllable: GAYATRI_SYLLABLES[8],  octave: "SAT", label: "Above BB middle",  active: true,           detail: "Above Bollinger mean" },
    { id: 10, syllable: GAYATRI_SYLLABLES[9],  octave: "SAT", label: "Below BB upper",   active: true,           detail: "Not overextended" },
    { id: 11, syllable: GAYATRI_SYLLABLES[10], octave: "SAT", label: "BB expanding",     active: seed % 3 !== 1, detail: "Volatility alive" },
    { id: 12, syllable: GAYATRI_SYLLABLES[11], octave: "SAT", label: "Above SMA200",     active: seed % 2 === 0, detail: "Long-term bullish" },
    { id: 13, syllable: GAYATRI_SYLLABLES[12], octave: "SAT", label: "ATR active",       active: true,           detail: "Market active" },
    { id: 14, syllable: GAYATRI_SYLLABLES[13], octave: "SAT", label: "Healthy vol",      active: true,           detail: "0.5%–5% range" },
    { id: 15, syllable: GAYATRI_SYLLABLES[14], octave: "SAT", label: "Bullish candle",   active: seed % 4 !== 3, detail: "Close > Open" },
    { id: 16, syllable: GAYATRI_SYLLABLES[15], octave: "SAT", label: "Fast MA rising",   active: seed % 3 === 0, detail: "EMA9 slope +" },
    { id: 17, syllable: GAYATRI_SYLLABLES[16], octave: "OM",  label: "RSI balanced",     active: true,           detail: "30–70 zone" },
    { id: 18, syllable: GAYATRI_SYLLABLES[17], octave: "OM",  label: "MACD controlled",  active: true,           detail: "|Hist| < ATR" },
    { id: 19, syllable: GAYATRI_SYLLABLES[18], octave: "OM",  label: "Near EMA21 (<5%)", active: seed % 2 !== 0, detail: "Not overextended" },
    { id: 20, syllable: GAYATRI_SYLLABLES[19], octave: "OM",  label: "Liquidity OK",     active: true,           detail: "ATR/Price > 0.5%" },
    { id: 21, syllable: GAYATRI_SYLLABLES[20], octave: "OM",  label: "BB %B healthy",    active: true,           detail: "0.2–0.8 range" },
    { id: 22, syllable: GAYATRI_SYLLABLES[21], octave: "OM",  label: "Full EMA harmony", active: seed % 3 !== 2, detail: "9 > 21 > 55" },
    { id: 23, syllable: GAYATRI_SYLLABLES[22], octave: "OM",  label: "RSI moderate",     active: seed % 4 !== 0, detail: "35–65 zone" },
    { id: 24, syllable: GAYATRI_SYLLABLES[23], octave: "OM",  label: "Resonance ≥ 15",   active: true,           detail: "Composite check" },
  ];
}

/** Mock strategy evaluation per symbol */
export interface MockStrategyEval {
  id: string;
  name: string;
  emoji: string;
  signal: StrategySignal;
  confidence: number;
  slPct: number;
  tpPct: number;
  reasons: string[];
}

export function generateMockStrategyEvals(symbol: string): MockStrategyEval[] {
  const seed = symbol.charCodeAt(0) + symbol.charCodeAt(symbol.length - 6);
  const gayatriSignals = generateMockGayatriSignals(symbol);
  const gayatriFreq = gayatriSignals.filter((s) => s.active).length;

  return [
    {
      id: "LAKSHMI", name: "Lakshmi 🪷", emoji: "🪷",
      signal: gayatriFreq >= 16 ? "BUY" : gayatriFreq < 10 ? "SELL" : "HOLD",
      confidence: Math.min(1, gayatriFreq / 24 + 0.1),
      slPct: 1.8, tpPct: 4.2,
      reasons: [
        `Consensus: Aaryan=${seed % 2 === 0 ? "BUY" : "HOLD"}, Aayush=${seed % 3 === 0 ? "BUY" : "HOLD"}, Gayatri=${gayatriFreq}/24`,
        gayatriFreq >= 16 ? "Gayatri gate PASSED ✅" : "Gayatri gate FAILED ⛔",
        "No-loss guards: trailing SL immediate",
      ],
    },
    {
      id: "AARYAN", name: "Aaryan ⚔️", emoji: "⚔️",
      signal: seed % 3 === 0 ? "BUY" : seed % 3 === 1 ? "HOLD" : "SELL",
      confidence: 0.62 + (seed % 20) / 100,
      slPct: 2.1, tpPct: 4.5,
      reasons: ["EMA9 > EMA21 (short bullish)", "MACD histogram positive & rising", `RSI in warrior zone: ${42 + (seed % 15)}`],
    },
    {
      id: "AAYUSH", name: "Aayush 🌱", emoji: "🌱",
      signal: seed % 4 === 0 ? "BUY" : "HOLD",
      confidence: 0.48 + (seed % 25) / 100,
      slPct: 3.0, tpPct: 3.5,
      reasons: ["RSI near accumulation zone", "Price approaching lower Bollinger support", `Scale-in: ${seed % 2 === 0 ? "70%" : "40%"} allocated`],
    },
    {
      id: "GAYATRI", name: "Gayatri 🕉️", emoji: "🕉️",
      signal: gayatriFreq >= 20 ? "STRONG_BUY" : gayatriFreq >= 16 ? "BUY" : gayatriFreq >= 12 ? "HOLD" : "SELL",
      confidence: gayatriFreq / 24,
      slPct: 2.5, tpPct: gayatriFreq >= 16 ? 5.0 : 2.0,
      reasons: [
        `Frequency: ${gayatriFreq}/24 signals resonating`,
        gayatriFreq >= 20 ? "528 Hz ✨ Love Frequency" : gayatriFreq >= 16 ? "432 Hz 🎵 Harmonic" : gayatriFreq >= 12 ? "396 Hz ⚖️ Liberation" : "285 Hz ⚠️ Healing Needed",
        `TAT: ${gayatriSignals.filter((s) => s.octave === "TAT" && s.active).length}/8, SAT: ${gayatriSignals.filter((s) => s.octave === "SAT" && s.active).length}/8, OM: ${gayatriSignals.filter((s) => s.octave === "OM" && s.active).length}/8`,
      ],
    },
  ];
}

/* ── Mock OHLCV candles (120 bars) ───────────────────── */
export interface MockCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function generateCandles(base: number, count = 120): MockCandle[] {
  const candles: MockCandle[] = [];
  let price = base;
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.48) * base * 0.02;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * base * 0.005;
    const low = Math.min(open, close) - Math.random() * base * 0.005;
    candles.push({
      time: now - (count - i) * 60_000,
      open: +open.toFixed(6),
      high: +high.toFixed(6),
      low: +low.toFixed(6),
      close: +close.toFixed(6),
      volume: +(Math.random() * 50000 + 10000).toFixed(0),
    });
    price = close;
  }
  return candles;
}

export const MOCK_CANDLES: Record<string, MockCandle[]> = {
  DOGEUSDT: generateCandles(0.082),
  SHIBUSDT: generateCandles(0.000012),
  ETHUSDT: generateCandles(2450),
  ADAUSDT: generateCandles(0.38),
  BNBUSDT: generateCandles(310),
};

/* ── Fibonacci levels ────────────────────────────────── */
export interface FibLevels {
  low: number;
  high: number;
  fib236: number;
  fib382: number;
  fib500: number;
  fib618: number;
  fib786: number;
}

export function computeFibLevels(candles: MockCandle[]): FibLevels {
  const lows = candles.map((c: MockCandle) => c.low);
  const highs = candles.map((c: MockCandle) => c.high);
  const low = Math.min(...lows);
  const high = Math.max(...highs);
  const range = high - low;
  return {
    low, high,
    fib236: low + range * 0.236,
    fib382: low + range * 0.382,
    fib500: low + range * 0.5,
    fib618: low + range * 0.618,
    fib786: low + range * 0.786,
  };
}

/* ── Mock wallet ─────────────────────────────────────── */
export const MOCK_WALLET = { balance: 5000.0 };

/* ── Mock positions (with strategy + SL/TP) ──────────── */
export const MOCK_POSITIONS: Position[] = [
  { id: "p1", symbol: "DOGEUSDT", side: "BUY",  qty: 12000, entry: 0.0812, pnl: 14.40, strategy: "AARYAN",  sl: 0.0790, tp: 0.0860 },
  { id: "p2", symbol: "ETHUSDT",  side: "BUY",  qty: 0.85,  entry: 2430,   pnl: -12.50, strategy: "LAKSHMI", sl: 2380,   tp: 2530 },
  { id: "p3", symbol: "BNBUSDT",  side: "SELL", qty: 2.5,   entry: 312,    pnl: 7.80, strategy: "GAYATRI", sl: 320,    tp: 295 },
  { id: "p4", symbol: "SHIBUSDT", side: "BUY",  qty: 5000000, entry: 0.0000118, pnl: 3.20, strategy: "AAYUSH", sl: 0.0000112, tp: 0.0000130 },
  { id: "p5", symbol: "ADAUSDT",  side: "BUY",  qty: 800,   entry: 0.375,  pnl: 5.60, strategy: "AARYAN",  sl: 0.365,  tp: 0.400 },
];

/* ── Mock trade history ──────────────────────────────── */
const strategyNames = ["LAKSHMI", "AARYAN", "AAYUSH", "GAYATRI"];
export const MOCK_TRADES: HistoryTrade[] = Array.from({ length: 30 }, (_, i) => {
  const syms = ["DOGEUSDT", "SHIBUSDT", "ETHUSDT", "ADAUSDT", "BNBUSDT"];
  const sym = syms[i % 5];
  const side: "BUY" | "SELL" = i % 3 === 0 ? "SELL" : "BUY";
  const entry = sym === "ETHUSDT" ? 2400 + Math.random() * 100
    : sym === "BNBUSDT" ? 300 + Math.random() * 20
    : sym === "SHIBUSDT" ? 0.000011 + Math.random() * 0.000003
    : Math.random() * 0.5;
  const pnl = (Math.random() - 0.45) * 50;
  return {
    id: i + 1,
    symbol: sym,
    side,
    qty: +(Math.random() * 100 + 1).toFixed(2),
    entry: +entry.toFixed(sym === "SHIBUSDT" ? 10 : 4),
    exit: +(entry + pnl / 10).toFixed(sym === "SHIBUSDT" ? 10 : 4),
    pnl: +pnl.toFixed(2),
    time: new Date(Date.now() - i * 3_600_000).toLocaleString(),
    strategy: strategyNames[i % 4],
  };
});

/* ── Mock alerts ─────────────────────────────────────── */
export const MOCK_ALERTS: Alert[] = [
  { id: "a1",  level: "GREEN", text: "🪷 LAKSHMI BUY — consensus 3/3 on DOGEUSDT, Gayatri 19/24 (432 Hz)", time: "1 min ago" },
  { id: "a2",  level: "GREEN", text: "⚔️ AARYAN BUY — EMA crossover + MACD breakout on ETHUSDT 5m", time: "3 min ago" },
  { id: "a3",  level: "AMBER", text: "🌱 AAYUSH HOLD — RSI 42, waiting for accumulation zone on SHIBUSDT", time: "5 min ago" },
  { id: "a4",  level: "GREEN", text: "🕉️ GAYATRI 20/24 — 528 Hz Deep Resonance on DOGEUSDT! STRONG_BUY", time: "8 min ago" },
  { id: "a5",  level: "RED",   text: "⚔️ AARYAN SELL — trailing SL triggered on ADAUSDT (-1.5% ATR)", time: "12 min ago" },
  { id: "a6",  level: "AMBER", text: "🪷 LAKSHMI HOLD — Gayatri gate 14/24 (need ≥ 16) on BNBUSDT", time: "15 min ago" },
  { id: "a7",  level: "RED",   text: "🕉️ GAYATRI 7/24 — dissonance on ADAUSDT, 285 Hz ⚠️ EXIT recommended", time: "20 min ago" },
  { id: "a8",  level: "GREEN", text: "🌱 AAYUSH BUY — RSI 28 oversold extreme, scale-in 100% on SHIBUSDT", time: "25 min ago" },
  { id: "a9",  level: "AMBER", text: "Max drawdown threshold 80% reached — Dog guard activated 🐕", time: "30 min ago" },
  { id: "a10", level: "RED",   text: "Conflicting: Eagle 🦅 vs Cheetah 🐆 on BNBUSDT — Spider web ⛔", time: "35 min ago" },
];

/* ── Mock Hive Mind model scores ─────────────────────── */
export interface HiveMindModel {
  name: string;
  shortName: string;
  pct: number;
  color: string;
  barColor: string;
  description: string;
}

export const MOCK_HIVEMIND: HiveMindModel[] = [
  { name: "Lakshmi Master", shortName: "🪷", pct: 78, color: "text-aalgold",    barColor: "bg-aalgold",    description: "Hybrid goddess — best-of-all consensus, no-loss strategy" },
  { name: "Aaryan",         shortName: "⚔️", pct: 68, color: "text-blue-600",   barColor: "bg-blue-500",   description: "Disciplined warrior — momentum + breakout signals" },
  { name: "Aayush",         shortName: "🌱", pct: 55, color: "text-emerald-600", barColor: "bg-emerald-500", description: "Patient accumulator — mean-reversion, scale-in" },
  { name: "Gayatri 24-Sig", shortName: "🕉️", pct: 71, color: "text-purple-600", barColor: "bg-purple-500", description: "Mantra frequency — 24 signals, 528 Hz harmony" },
  { name: "Animal Blend",   shortName: "🐾", pct: 62, color: "text-amber-500",  barColor: "bg-amber-500",  description: "10-animal behaviour model weighted blend" },
  { name: "ML/DL Fusion",   shortName: "🧠", pct: 45, color: "text-cyan-500",   barColor: "bg-cyan-500",   description: "Machine learning + deep learning ensemble" },
];

/* ── Mock probability scores ─────────────────────────── */
export interface ProbScore {
  label: string;
  pct: number;
  barColor: string;
  dotColor: string;
}

export const MOCK_PROB_SCORES: ProbScore[] = [
  { label: "High Probability", pct: 72, barColor: "bg-aalgreen", dotColor: "bg-aalgreen" },
  { label: "Neutral",          pct: 18, barColor: "bg-amber-400", dotColor: "bg-amber-400" },
  { label: "Low Probability",  pct: 10, barColor: "bg-aalred",   dotColor: "bg-aalred" },
];

/* ── Mock OhmSync wave data ──────────────────────────── */
export function generateOhmWave(): [number, number][] {
  const now = Date.now();
  return Array.from({ length: 80 }, (_, i) => [
    now - (80 - i) * 1000,
    Math.sin(i / 4) * 4 + Math.cos(i / 7) * 2 + Math.random() * 0.6 + 5,
  ] as [number, number]);
}

/* ── Animal/Bird behavior modifiers ──────────────────── */
export interface AnimalModifier {
  key: string;
  emoji: string;
  name: string;
  desc: string;
  tooltip: string;
}

export const ANIMAL_MODIFIERS: AnimalModifier[] = [
  { key: "Eagle",    emoji: "🦅", name: "Eagle",    desc: "High-level precision",  tooltip: "Scans wider timeframes for macro confluence before entering. Reduces false signals on noisy pairs." },
  { key: "Tiger",    emoji: "🐯", name: "Tiger",    desc: "Aggressive entries",    tooltip: "Increases position sizing and enters on weaker confirmations. Higher risk / higher reward." },
  { key: "Cheetah",  emoji: "🐆", name: "Cheetah",  desc: "Speed focus",           tooltip: "Targets ultra-short scalps. Tightens stop-loss and take-profit for rapid turnover." },
  { key: "Fox",      emoji: "🦊", name: "Fox",      desc: "Adaptive cunning",      tooltip: "Switches strategies mid-session based on volatility regime shifts." },
  { key: "Tortoise", emoji: "🐢", name: "Tortoise", desc: "Slow & steady",         tooltip: "Only acts on strong, multi-factor confirmations. Minimizes trade frequency." },
  { key: "Dog",      emoji: "🐕", name: "Dog",      desc: "Loyal risk guard",      tooltip: "Enforces hard drawdown limits and trailing stops regardless of signal strength." },
  { key: "Owl",      emoji: "🦉", name: "Owl",      desc: "Night-session filter",  tooltip: "Activates only during low-volume sessions (Asian/late NY). Adjusts for thin liquidity." },
  { key: "Cow",      emoji: "🐄", name: "Cow",      desc: "Liquidity aware",       tooltip: "Monitors order-book depth and avoids entries when spread widens beyond threshold." },
  { key: "Spider",   emoji: "🕷️", name: "Spider",   desc: "Web of triggers",       tooltip: "Requires multiple simultaneous signals (RSI + MACD + volume) before committing." },
  { key: "Lion",     emoji: "🦁", name: "Lion",     desc: "Alpha signals",         tooltip: "Prioritises high-conviction alpha signals and ignores noise. Larger but fewer trades." },
];

/* ── Default behavior weights ────────────────────────── */
export const DEFAULT_WEIGHTS: BehaviorWeights = Object.fromEntries(
  ANIMAL_MODIFIERS.map((a) => [a.key, 50]),
);

/* ── Mock backtest strategies ────────────────────────── */
export const BACKTEST_STRATEGIES = [
  "Lakshmi Master",
  "Aaryan",
  "Aayush",
  "Gayatri 24-Signal",
  "Trend",
  "Pattern",
  "Short-Term",
  "Scalper",
  "Mean Reversion",
  "Momentum",
  "Breakout",
] as const;

/* ── Mock backtest result stats ──────────────────────── */
export interface BacktestStats {
  totalTrades: number;
  winRate: string;
  avgPnl: string;
  maxDrawdown: string;
  sharpeRatio: string;
  profitFactor: string;
}

export const MOCK_BACKTEST_STATS: BacktestStats = {
  totalTrades: 247,
  winRate: "64.3%",
  avgPnl: "+$12.48",
  maxDrawdown: "-8.2%",
  sharpeRatio: "1.87",
  profitFactor: "2.14",
};
