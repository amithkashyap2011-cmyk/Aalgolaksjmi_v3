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
  "BTCUSDT",
  "ETHUSDT",
  "ADAUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "DOGEUSDT",
  "SHIBUSDT",
  "XRPUSDT",
] as const;
export type Symbol = (typeof SYMBOLS)[number];

/* ── Label map ───────────────────────────────────────── */
export const SYMBOL_LABELS: Record<string, string> = {
  BTCUSDT: "BTC",
  DOGEUSDT: "DOGE",
  SHIBUSDT: "SHIB",
  ETHUSDT: "ETH",
  ADAUSDT: "ADA",
  BNBUSDT: "BNB",
  SOLUSDT: "SOL",
  XRPUSDT: "XRP",
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
  {
    id: "OHMKARA",
    name: "Ohmkara",
    emoji: "🔱",
    tagline: "The Primordial Sound — Ultra-Precision Entry",
    description:
      "Only fires when 5 independent resonance gates align simultaneously: " +
      "OM Octave (8/8), EMA Spine (9>21>55>SMA200), Momentum Wave (MACD+RSI 45–62), " +
      "Bollinger Precision Zone, and ADX Conviction (≥25). " +
      "Rare but ultra-high win-rate entries. TP: 4.5×ATR (min 3.5%), SL: 1.2×ATR.",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    barColor: "bg-amber-500",
  },
  {
    id: "SARASWATI",
    name: "Saraswati",
    emoji: "📚",
    tagline: "The Wisdom Weaver — Signal Synthesis",
    description:
      "Blends technical momentum, on-chain flow, and sentiment resonance into one adaptive execution strategy. " +
      "Triggers only when knowledge, liquidity, and trend alignment are all present. " +
      "Ideal for smart trend captures with disciplined risk control.",
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
    barColor: "bg-cyan-500",
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
  const isAda = symbol === "ADAUSDT";
  return [
    { id: 1,  syllable: GAYATRI_SYLLABLES[0],  octave: "TAT", label: "EMA9 > EMA21",     active: isAda ? true : seed % 3 !== 0, detail: "Short-term trend aligned" },
    { id: 2,  syllable: GAYATRI_SYLLABLES[1],  octave: "TAT", label: "EMA21 > EMA55",    active: isAda ? true : seed % 4 !== 0, detail: "Mid-term trend confirmed" },
    { id: 3,  syllable: GAYATRI_SYLLABLES[2],  octave: "TAT", label: "MACD > signal",    active: true,           detail: "Momentum rising" },
    { id: 4,  syllable: GAYATRI_SYLLABLES[3],  octave: "TAT", label: "MACD histogram +", active: isAda ? true : seed % 2 === 0, detail: "Positive momentum" },
    { id: 5,  syllable: GAYATRI_SYLLABLES[4],  octave: "TAT", label: "RSI > 40",         active: true,           detail: "Not oversold" },
    { id: 6,  syllable: GAYATRI_SYLLABLES[5],  octave: "TAT", label: "RSI < 70",         active: isAda ? false : seed % 5 !== 0, detail: "Not overbought" },
    { id: 7,  syllable: GAYATRI_SYLLABLES[6],  octave: "TAT", label: "Price > EMA9",     active: true,           detail: "Above fast MA" },
    { id: 8,  syllable: GAYATRI_SYLLABLES[7],  octave: "TAT", label: "Positive candle",  active: isAda ? true : seed % 3 !== 2, detail: "Bullish close" },
    { id: 9,  syllable: GAYATRI_SYLLABLES[8],  octave: "SAT", label: "Above BB middle",  active: true,           detail: "Above Bollinger mean" },
    { id: 10, syllable: GAYATRI_SYLLABLES[9],  octave: "SAT", label: "Below BB upper",   active: true,           detail: "Not overextended" },
    { id: 11, syllable: GAYATRI_SYLLABLES[10], octave: "SAT", label: "BB expanding",     active: isAda ? false : seed % 3 !== 1, detail: "Volatility alive" },
    { id: 12, syllable: GAYATRI_SYLLABLES[11], octave: "SAT", label: "Above SMA200",     active: isAda ? true : seed % 2 === 0, detail: "Long-term bullish" },
    { id: 13, syllable: GAYATRI_SYLLABLES[12], octave: "SAT", label: "ATR active",       active: true,           detail: "Market active" },
    { id: 14, syllable: GAYATRI_SYLLABLES[13], octave: "SAT", label: "Healthy vol",      active: true,           detail: "0.5%–5% range" },
    { id: 15, syllable: GAYATRI_SYLLABLES[14], octave: "SAT", label: "Bullish candle",   active: isAda ? true : seed % 4 !== 3, detail: "Close > Open" },
    { id: 16, syllable: GAYATRI_SYLLABLES[15], octave: "SAT", label: "Fast MA rising",   active: isAda ? false : seed % 3 === 0, detail: "EMA9 slope +" },
    { id: 17, syllable: GAYATRI_SYLLABLES[16], octave: "OM",  label: "RSI balanced",     active: true,           detail: "30–70 zone" },
    { id: 18, syllable: GAYATRI_SYLLABLES[17], octave: "OM",  label: "MACD controlled",  active: true,           detail: "|Hist| < ATR" },
    { id: 19, syllable: GAYATRI_SYLLABLES[18], octave: "OM",  label: "Near EMA21 (<5%)", active: isAda ? true : seed % 2 !== 0, detail: "Not overextended" },
    { id: 20, syllable: GAYATRI_SYLLABLES[19], octave: "OM",  label: "Liquidity OK",     active: true,           detail: "ATR/Price > 0.5%" },
    { id: 21, syllable: GAYATRI_SYLLABLES[20], octave: "OM",  label: "BB %B healthy",    active: true,           detail: "0.2–0.8 range" },
    { id: 22, syllable: GAYATRI_SYLLABLES[21], octave: "OM",  label: "Full EMA harmony", active: isAda ? false : seed % 3 !== 2, detail: "9 > 21 > 55" },
    { id: 23, syllable: GAYATRI_SYLLABLES[22], octave: "OM",  label: "RSI moderate",     active: isAda ? false : seed % 4 !== 0, detail: "35–65 zone" },
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

export function generateMockStrategyEvals(symbol: string, weights?: Record<string, number>): MockStrategyEval[] {
  if (symbol === "BTCUSDT") {
    return [
      {
        id: "LAKSHMI", name: "Lakshmi 🪷", emoji: "🪷",
        signal: "BUY",
        confidence: 1.0,
        slPct: 1.8, tpPct: 4.2,
        reasons: [
          "Consensus: Aaryan=BUY, Aayush=BUY, Gayatri=22/24",
          "Gayatri gate PASSED ✅",
          "No-loss guards: trailing SL immediate",
        ],
      },
      {
        id: "AARYAN", name: "Aaryan ⚔️", emoji: "⚔️",
        signal: "BUY",
        confidence: 1.0,
        slPct: 2.1, tpPct: 4.5,
        reasons: [
          "EMA9 > EMA21 (short bullish)",
          "MACD histogram positive & rising",
          "RSI in warrior zone: 54",
        ],
      },
      {
        id: "AAYUSH", name: "Aayush 🌱", emoji: "🌱",
        signal: "HOLD",
        confidence: 0.60,
        slPct: 3.0, tpPct: 3.5,
        reasons: [
          "RSI near accumulation zone",
          "Price approaching lower Bollinger support",
          "Scale-in: 70% allocated",
        ],
      },
      {
        id: "GAYATRI", name: "Gayatri 🕉️", emoji: "🕉️",
        signal: "STRONG_BUY",
        confidence: 0.92,
        slPct: 2.5, tpPct: 5.0,
        reasons: [
          "Frequency: 22/24 signals resonating",
          "528 Hz ✨ Love Frequency",
          "TAT: 7/8, SAT: 8/8, OM: 7/8",
        ],
      },
      {
        id: "OHMKARA", name: "Ohmkara 🔱", emoji: "🔱",
        signal: "BUY",
        confidence: 0.95,
        slPct: 1.2, tpPct: 4.5,
        reasons: [
          "OM Octave fully aligned (8/8) 🕉️",
          "EMA Spine stacked (9>21>55)",
          "ADX Trend Strength = 34 (≥ 25)",
        ],
      },
      {
        id: "SARASWATI", name: "Saraswati 📚", emoji: "📚",
        signal: "BUY",
        confidence: 0.94,
        slPct: 1.7, tpPct: 3.8,
        reasons: [
          "Knowledge fusion gate passed across trend, sentiment, and liquidity",
          "On-chain flow confirms the breakout",
          "Momentum and trend structure align for a smart capture",
        ],
      },
    ];
  }

  if (symbol === "ADAUSDT") {
    return [
      {
        id: "LAKSHMI", name: "Lakshmi 🪷", emoji: "🪷",
        signal: "HOLD",
        confidence: 0.75,
        slPct: 1.2, tpPct: 3.5,
        reasons: [
          "Infrasound Noise Gate active (18.8 Hz) 🌌",
          "Consensus tightened: need ≥18/24 (Gayatri=19/24)",
          "Protective Hold: low directional ADX < 18.8",
        ],
      },
      {
        id: "AARYAN", name: "Aaryan ⚔️", emoji: "⚔️",
        signal: "BUY",
        confidence: 0.85,
        slPct: 1.5, tpPct: 3.5,
        reasons: [
          "EMA breakout present",
          "RSI restricted: noise protection active",
        ],
      },
      {
        id: "AAYUSH", name: "Aayush 🌱", emoji: "🌱",
        signal: "HOLD",
        confidence: 0.50,
        slPct: 1.8, tpPct: 2.8,
        reasons: [
          "Range-bound consolidation",
        ],
      },
      {
        id: "GAYATRI", name: "Gayatri 🕉️", emoji: "🕉️",
        signal: "BUY",
        confidence: 0.80,
        slPct: 1.6, tpPct: 3.2,
        reasons: [
          "Frequency: 19/24 signals active",
          "18.8 Hz 🌌 Noise Elimination Gate active",
          "TAT: 6/8, SAT: 6/8, OM: 7/8",
        ],
      },
      {
        id: "OHMKARA", name: "Ohmkara 🔱", emoji: "🔱",
        signal: "SELL",
        confidence: 0.80,
        slPct: 1.0, tpPct: 3.5,
        reasons: [
          "OM Octave broken (3/8)",
          "Sideways range detected (ADX = 14 < 15)",
          "Primordial exit override triggered ⚠️",
        ],
      },
      {
        id: "SARASWATI", name: "Saraswati 📚", emoji: "📚",
        signal: "HOLD",
        confidence: 0.72,
        slPct: 1.4, tpPct: 3.0,
        reasons: [
          "Signal synthesis is neutral until liquidity and sentiment converge",
          "Waiting for knowledge gate to confirm trend continuation",
          "Adaptive risk profile prefers patient entry",
        ],
      },
    ];
  }

  return [
    {
      id: "LAKSHMI", name: "Lakshmi 🪷", emoji: "🪷",
      signal: "HOLD",
      confidence: 0.45,
      slPct: 2.0, tpPct: 3.0,
      reasons: ["Market waiting for trend confirmed"],
    },
    {
      id: "AARYAN", name: "Aaryan ⚔️", emoji: "⚔️",
      signal: "HOLD",
      confidence: 0.35,
      slPct: 2.0, tpPct: 3.0,
      reasons: ["No EMA crossover detected"],
    },
    {
      id: "AAYUSH", name: "Aayush 🌱", emoji: "🌱",
      signal: "HOLD",
      confidence: 0.55,
      slPct: 2.0, tpPct: 3.0,
      reasons: ["Neutral zone"],
    },
    {
      id: "GAYATRI", name: "Gayatri 🕉️", emoji: "🕉️",
      signal: "HOLD",
      confidence: 0.40,
      slPct: 2.0, tpPct: 3.0,
      reasons: ["Resonance low: 12/24"],
    },
    {
      id: "OHMKARA", name: "Ohmkara 🔱", emoji: "🔱",
      signal: "HOLD",
      confidence: 0.30,
      slPct: 1.5, tpPct: 4.5,
      reasons: ["Insufficient gate resonance (2/5 active)"],
    },
    {
      id: "SARASWATI", name: "Saraswati 📚", emoji: "📚",
      signal: "HOLD",
      confidence: 0.35,
      slPct: 1.8, tpPct: 3.2,
      reasons: ["Waiting for deeper signal alignment across on-chain, sentiment, and momentum"],
    },
  ];
}

export interface MockFundamentalMetric {
  label: string;
  score: number;
  detail: string;
}

export interface MockFundamentalAnalysis {
  symbol: string;
  status: "POSITIVE" | "NEUTRAL" | "CAUTION";
  fundamentalScore: number;
  summary: string;
  metrics: MockFundamentalMetric[];
  notes: string[];
}

export function generateMockFundamentalAnalysis(symbol: string): MockFundamentalAnalysis {
  const seed = symbol.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const makeScore = (base: number, variance: number, offset = 0) =>
    Math.min(98, Math.max(18, Math.round(base + ((seed * offset) % variance))));

  const sentiment = makeScore(48, 28, 1);
  const networkActivity = makeScore(42, 36, 2);
  const devMomentum = makeScore(38, 34, 3);
  const exchangeFlows = makeScore(34, 40, 4);
  const ecosystemHealth = makeScore(36, 38, 5);
  const fundamentalScore = Math.round((sentiment + networkActivity + devMomentum + exchangeFlows + ecosystemHealth) / 5);
  const status = fundamentalScore >= 72 ? "POSITIVE" : fundamentalScore >= 52 ? "NEUTRAL" : "CAUTION";

  return {
    symbol,
    status,
    fundamentalScore,
    summary:
      status === "POSITIVE"
        ? "Market structure, developer momentum, and sentiment are aligned for a supportive bias."
        : status === "NEUTRAL"
        ? "Fundamentals are mixed; the trade engine should remain cautious and prefer technical confirmation."
        : "Fundamental signals are soft. Wait for stronger on-chain or sentiment confirmation before adding exposure.",
    metrics: [
      { label: "Sentiment", score: sentiment, detail: "Community + social pulse" },
      { label: "Network", score: networkActivity, detail: "Activity, liquidity, flows" },
      { label: "Dev", score: devMomentum, detail: "Ecosystem & momentum" },
      { label: "Exchange", score: exchangeFlows, detail: "Inflows/outflows & depth" },
      { label: "Ecosystem", score: ecosystemHealth, detail: "Overall health & growth" },
    ],
    notes: [
      "This is a mock fundamental feed for dashboard visibility.",
      "Live on-chain and social analytics are not currently wired into the engine.",
    ],
  };
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

export function generateCandles(base: number, timeframe: string = "1m", count = 120): MockCandle[] {
  const candles: MockCandle[] = [];
  let price = base;
  const now = Date.now();
  const intervalMap: Record<string, number> = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3600000,
    "4h": 14400000,
    "1d": 86400000
  };
  const step = intervalMap[timeframe] || 60_000;
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 5) * 0.015 + Math.cos(i / 3) * 0.005;
    const change = wave * base;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.abs(wave) * base * 0.2;
    const low = Math.min(open, close) - Math.abs(wave) * base * 0.2;
    candles.push({
      time: now - (count - i) * step,
      open: +open.toFixed(6),
      high: +high.toFixed(6),
      low: +low.toFixed(6),
      close: +close.toFixed(6),
      volume: +Math.floor(25000 + Math.abs(wave) * 100000).toFixed(0),
    });
    price = close;
  }
  return candles;
}

export function generateMockCandles(symbol: string, timeframe: string = "1m"): MockCandle[] {
  const bases: Record<string, number> = { 
    BTCUSDT: 65420.50, 
    DOGEUSDT: 0.082, 
    SHIBUSDT: 0.000012, 
    ETHUSDT: 2450, 
    ADAUSDT: 0.38, 
    BNBUSDT: 310,
    SOLUSDT: 150,
    XRPUSDT: 2.45
  };
  const base = bases[symbol] ?? bases.DOGEUSDT;
  return generateCandles(base, timeframe);
}

export const MOCK_CANDLES: Record<string, MockCandle[]> = {
  BTCUSDT: generateCandles(65420.50),
  DOGEUSDT: generateCandles(0.082),
  SHIBUSDT: generateCandles(0.000012),
  ETHUSDT: generateCandles(2450),
  ADAUSDT: generateCandles(0.38),
  BNBUSDT: generateCandles(310),
  SOLUSDT: generateCandles(150),
  XRPUSDT: generateCandles(2.45),
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
export const MOCK_WALLET = { balance: 0.0, inrEquivalent: 0.0, inrRate: 83.50 }; // Baseline reference

/* ── Mock positions (with strategy + SL/TP) ──────────── */
export const MOCK_POSITIONS: Position[] = [
  { id: "1", symbol: "BTCUSDT", side: "BUY", qty: 0.1, entry: 65000, sl: 64000, tp: 68000, pnl: 50, strategy: "LAKSHMI" },
  { id: "2", symbol: "ETHUSDT", side: "BUY", qty: 0.02, entry: 2400, sl: 2350, tp: 2500, pnl: 75, strategy: "SARASWATI" },
];

/* ── Mock trade history ──────────────────────────────── */
const strategyNames = ["LAKSHMI", "AARYAN", "AAYUSH", "GAYATRI", "OHMKARA", "SARASWATI"];
export const MOCK_TRADES: HistoryTrade[] = Array.from({ length: 30 }, (_, i) => {
  const syms = ["DOGEUSDT", "SHIBUSDT", "ETHUSDT", "ADAUSDT", "BNBUSDT"];
  const sym = syms[i % 5];
  const side: "BUY" | "SELL" = i % 3 === 0 ? "SELL" : "BUY";
  const baseEntry = sym === "ETHUSDT" ? 2450 : sym === "BNBUSDT" ? 310 : sym === "SHIBUSDT" ? 0.000012 : 0.40;
  const entry = baseEntry + (i % 7) * 0.005 * baseEntry;
  const pnl = ((i % 5) - 2) * 12.5;
  return {
    id: i + 1,
    symbol: sym,
    side,
    qty: +(10 + (i % 10) * 5).toFixed(2),
    entry: +entry.toFixed(sym === "SHIBUSDT" ? 10 : 4),
    exit: +(entry + pnl / 100).toFixed(sym === "SHIBUSDT" ? 10 : 4),
    pnl: +pnl.toFixed(2),
    time: new Date(Date.now() - i * 3_600_000).toLocaleString(),
    strategy: strategyNames[i % 4],
  };
});

/* ── Mock alerts ─────────────────────────────────────── */
export const MOCK_ALERTS: Alert[] = [
  { id: "a0",  level: "AMBER", text: "🌌 INFRASOUND NOISE GATE active (18.8 Hz) on ADAUSDT — entry gate tightened to 18/24", time: "Just now" },
  { id: "a1",  level: "GREEN", text: "🪷 LAKSHMI BUY — consensus 3/3 on DOGEUSDT, Gayatri 19/24 (518 Hz)", time: "1 min ago" },
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
    Math.sin(i / 4) * 4 + Math.cos(i / 7) * 2 + Math.sin(i / 2) * 0.6 + 5,
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
  "Saraswati",
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
