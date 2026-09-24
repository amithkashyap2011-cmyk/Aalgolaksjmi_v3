/**
 * AIFooterTradeBar — Golden Ratio (φ = 1.618) Design System
 *
 * Fibonacci spacing scale : 5 · 8 · 13 · 21 · 34 · 55px
 * Typography scale        : 10 · 11 · 13 · 16 · 21px  (each ×φ from prev)
 * Layout splits           : 61.8 % primary / 38.2 % secondary
 * Border radii            : 5 · 8 · 13 · 21px
 * Icon sizes              : 13 · 16 · 21px
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as api from "../../lib/api";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/useAppStore";
import { useDashboardStore } from "../../store/useDashboardStore";
import { checkIsIndianMarketOpen } from "../../utils/indianMarketHours";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Clock,
  Zap,
  Play,
  X,
  Sparkles,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  EyeOff,
  Shield,
  Target,
  DollarSign,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────── */

export interface UpcomingTradePrediction {
  symbol: string;
  exchange: string;
  domain: "CRYPTO" | "INDIAN";
  direction: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  /** ENGINE = the auto-trader's own latest decision; ANALYSIS = the separate
   *  ensemble report (can disagree with what the engine will trade). */
  source?: "ENGINE" | "ANALYSIS";
  engineThreshold?: number;   // probability (0–100) a side needs before the engine trades
  engineReason?: string;
  entryPrice: number;
  targetTp: number;
  stopLoss: number;
  estimatedLeverage: number;
  allocatedMargin: number;
  modelsVoting: number;
  totalModels: number;
  countdownSec: number;
  regime: string;
  reasons: string[];
}

/* ─── Market Symbol Universes ────────────────────────────────────────── */

export const DEFAULT_CRYPTO_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
  "DOTUSDT",
  "LINKUSDT",
  "BNBUSDT",
  "SHIBUSDT",
  "TRXUSDT",
];

export const DEFAULT_INDIAN_SYMBOLS = [
  "NIFTY50",
  "BANKNIFTY",
  "SENSEX",
  "RELIANCE",
  "TCS",
  "HDFCBANK",
  "INFY",
  "ICICIBANK",
  "TATASTEEL",
  "SBIN",
  "AXISBANK",
  "KOTAKBANK",
  "BHARTIARTL",
  "TATAMOTORS",
];

/* ─── Constants ──────────────────────────────────────────────────────── */

const COUNTDOWN_TOTAL = 15;
// RADAR preferences, per browser (a convenience — safe if storage is blocked).
const RADAR_SPEEDS = [5, 15, 30, 60] as const;
const RADAR_PREFS_KEY = "aiFooterRadarPrefs";
type RadarPrefs = { autoRotate?: boolean; speedSec?: number; band?: string; symbol?: { crypto?: string; india?: string } };
// Confidence filter for the AI recommendation (LONG/SHORT only; HOLD is not a
// recommendation). Confidence is 0–100.
const CONF_BANDS = [
  { id: "ALL", label: "All signals", min: -1, max: 1000 },
  { id: "90+", label: "> 90%", min: 90, max: 1000 },
  { id: "80-90", label: "80–90%", min: 80, max: 90 },
  { id: "70-80", label: "70–80%", min: 70, max: 80 },
  { id: "50-70", label: "50–70%", min: 50, max: 70 },
  { id: "<50", label: "< 50%", min: -1, max: 50 },
] as const;
const bandOf = (id?: string) => CONF_BANDS.find((b) => b.id === id) ?? CONF_BANDS[0];
const readRadarPrefs = (): RadarPrefs => {
  try { return JSON.parse(localStorage.getItem(RADAR_PREFS_KEY) || "{}") || {}; } catch { return {}; }
};
const writeRadarPrefs = (patch: RadarPrefs) => {
  try {
    const cur = readRadarPrefs();
    localStorage.setItem(RADAR_PREFS_KEY, JSON.stringify({ ...cur, ...patch, symbol: { ...cur.symbol, ...patch.symbol } }));
  } catch { /* storage unavailable — prefs just don't persist */ }
};
// How long a signal counts for ranking (the display cache is only 20s).
const SIGNAL_TTL_MS = 10 * 60_000;
const DISMISS_STORAGE_KEY = "aqea_footer_bar_dismissed";

/* φ-scale helpers */
const φ = {
  /** Fibonacci spacing: 5 8 13 21 34 55 */
  sp: { xs: 5, sm: 8, md: 13, lg: 21, xl: 34, xxl: 55 } as const,
  /** Typography: 10 11 13 16 21 */
  fs: { xxs: 10, xs: 11, sm: 13, md: 16, lg: 21 } as const,
  /** Border radius: 5 8 13 21 */
  r: { xs: 5, sm: 8, md: 13, lg: 21 } as const,
  /** Icon sizes */
  ic: { sm: 13, md: 16, lg: 21 } as const,
  /** Footer bar height — 55px bar + 16px copyright strip = 71px total */
  barH: 55,
  copyrightH: 16,
} as const;

/* ─── Pure Initial State Factory ─────────────────────────────────────── */

function createInitialPrediction(
  symbol: string,
  isIndian: boolean,
  accountType: "SPOT" | "FUTURES" | "BOTH",
  livePrice?: number,
): UpcomingTradePrediction {
  const price = livePrice && livePrice > 0 ? livePrice : 0;
  const isIndianSym = isIndian || DEFAULT_INDIAN_SYMBOLS.includes(symbol) || !symbol.endsWith("USDT");
  const isDeriv = symbol.includes("CE") || symbol.includes("PE") || symbol.includes("FUT") || symbol.startsWith("NIFTY") || symbol.startsWith("BANKNIFTY");
  return {
    symbol,
    exchange: isIndianSym ? (isDeriv ? "NSE F&O" : "NSE (EQUITY)") : `BINANCE ${accountType === "BOTH" ? "FUTURES" : accountType}`,
    domain: isIndianSym ? "INDIAN" : "CRYPTO",
    direction: "HOLD",
    confidence: 0,
    entryPrice: price,
    targetTp: price,
    stopLoss: price,
    estimatedLeverage: isIndianSym || accountType === "SPOT" ? 1 : 5,
    allocatedMargin: isIndianSym ? 25000 : 2500,
    modelsVoting: 0,
    totalModels: isIndianSym ? 4 : 8,
    countdownSec: COUNTDOWN_TOTAL,
    regime: "Evaluating...",
    reasons: ["Evaluating live neural consensus from quant engine..."],
  };
}

/* ─── Real Backend AI Prediction Fetchers ────────────────────────────── */

async function fetchRealCryptoPrediction(
  symbol: string,
  accountType: "SPOT" | "FUTURES" | "BOTH",
  livePrice?: number,
): Promise<UpcomingTradePrediction> {
  const report = await api.getEnsembleReport(symbol, "5m", 200);
  const direction: "LONG" | "SHORT" | "HOLD" =
    report.signal === "LONG" ? "LONG" : report.signal === "SHORT" ? "SHORT" : "HOLD";

  const confRaw = typeof report.confidence === "number" ? report.confidence : 0.5;
  const confidence = confRaw <= 1.0 ? parseFloat((confRaw * 100).toFixed(1)) : parseFloat(confRaw.toFixed(1));

  const currentPrice = livePrice && livePrice > 0 ? livePrice : (report.marketPulse?.vwap || 0);

  // Dynamic quantitative ATR bracket calculated from market volatility
  const vol = Math.max(report.marketPulse?.volatilityScore || 0.012, 0.008);
  const slPct = Math.min(Math.max(vol * 1.5, 0.008), 0.035);
  const tpPct = slPct * 1.8;

  const tpMult = direction === "SHORT" ? (1 - tpPct) : (1 + tpPct);
  const slMult = direction === "SHORT" ? (1 + slPct) : (1 - slPct);

  const decimals = currentPrice > 100 ? 2 : currentPrice > 1 ? 4 : 6;
  const targetTp = direction === "HOLD" ? currentPrice : parseFloat((currentPrice * tpMult).toFixed(decimals));
  const stopLoss = direction === "HOLD" ? currentPrice : parseFloat((currentPrice * slMult).toFixed(decimals));

  const models = Array.isArray(report.models) ? report.models : [];
  const totalModels = models.length > 0 ? models.length : 8;

  let modelsVoting = 0;
  if (direction === "LONG") {
    modelsVoting = models.filter((m: any) => (m.longProbability > 0.5) || (m.weight > 0 && m.confidence > 0.5)).length;
  } else if (direction === "SHORT") {
    modelsVoting = models.filter((m: any) => (m.shortProbability > 0.5) || (m.weight > 0 && m.confidence > 0.5)).length;
  } else {
    modelsVoting = models.filter((m: any) => Math.abs((m.longProbability || 0.5) - 0.5) < 0.15).length;
  }
  if (modelsVoting === 0) modelsVoting = Math.max(1, Math.round(totalModels * (confidence / 100)));

  const reasons: string[] = [];
  models
    .filter((m: any) => m.notes && (m.weight > 0.04 || m.confidence > 0.6))
    .slice(0, 3)
    .forEach((m: any) => {
      reasons.push(`${m.modelName.replace(/-/g, " ").toUpperCase()}: ${m.notes}`);
    });

  if (typeof report.marketPulse?.orderBookImbalance === "number") {
    const obPct = (report.marketPulse.orderBookImbalance * 100).toFixed(1);
    reasons.push(`Order Book Depth Imbalance: ${Number(obPct) > 0 ? "+" : ""}${obPct}%`);
  }
  if (typeof report.marketPulse?.fundingRate === "number") {
    reasons.push(`Funding Rate: ${(report.marketPulse.fundingRate * 100).toFixed(4)}% | Microstructure: ${report.regime || "Active"}`);
  }
  if (reasons.length === 0) {
    reasons.push(`Consensus: ${direction} signal with ${confidence}% aggregate confidence`);
    reasons.push(`Market Regime: ${report.regime || "Standard Volatility"}`);
  }

  const isSpot = accountType === "SPOT";
  const estimatedLeverage = isSpot ? 1 : 5;
  const allocatedMargin = isSpot ? 1000 : 2500;

  return {
    symbol,
    exchange: isSpot ? "BINANCE SPOT" : "BINANCE FUTURES",
    domain: "CRYPTO",
    direction,
    confidence,
    entryPrice: currentPrice,
    targetTp,
    stopLoss,
    estimatedLeverage,
    allocatedMargin,
    modelsVoting,
    totalModels,
    countdownSec: COUNTDOWN_TOTAL,
    regime: report.regime || "Low Volatility",
    reasons,
  };
}

async function fetchRealIndianPrediction(
  symbol: string,
  cachedStocks?: any[],
): Promise<{ prediction: UpcomingTradePrediction; stocks: any[] }> {
  let stocks = cachedStocks;
  if (!stocks || stocks.length === 0) {
    const res = await fetch("/api/indian-market/scan?userId=guest-user");
    const json = await res.json();
    if (json?.success && Array.isArray(json.stocks)) {
      stocks = json.stocks;
    }
  }

  const stock = stocks?.find((s: any) => s.symbol === symbol) || stocks?.[0];
  if (!stock) {
    throw new Error(`Symbol ${symbol} not found in Indian market scan`);
  }

  const direction: "LONG" | "SHORT" | "HOLD" =
    stock.aiSignal === "LONG" ? "LONG" : stock.aiSignal === "SHORT" ? "SHORT" : "HOLD";
  // No AI confidence means none — not a made-up 75% (it skewed filters/ranking).
  const confidence = Number(stock.aiConfidence) || 0;
  const price = stock.price || 0;

  const tpMult = direction === "SHORT" ? 0.98 : 1.025;
  const slMult = direction === "SHORT" ? 1.015 : 0.985;
  const targetTp = direction === "HOLD" ? price : parseFloat((price * tpMult).toFixed(2));
  const stopLoss = direction === "HOLD" ? price : parseFloat((price * slMult).toFixed(2));

  const reasons = Array.isArray(stock.reasons) && stock.reasons.length > 0
    ? stock.reasons
    : [`AI Scan Strategy: ${stock.strategy || "MOMENTUM_BREAKOUT"}`, `Market Regime: ${stock.regime || "NORMAL"}`];

  const isDeriv = stock.symbol.includes("CE") || stock.symbol.includes("PE") || stock.symbol.includes("FUT") || stock.category === "NIFTY50" || stock.category === "BANKNIFTY" || stock.symbol.startsWith("NIFTY") || stock.symbol.startsWith("BANKNIFTY");
  const exchText = isDeriv ? `${stock.exchange || "NSE"} F&O` : `${stock.exchange || "NSE"} (${stock.category || "EQUITY"})`;

  const prediction: UpcomingTradePrediction = {
    symbol: stock.symbol,
    exchange: exchText,
    domain: "INDIAN",
    direction,
    confidence,
    entryPrice: price,
    targetTp,
    stopLoss,
    estimatedLeverage: 1,
    allocatedMargin: stock.lotSize ? stock.lotSize * price : 25000,
    modelsVoting: 4,
    totalModels: 4,
    countdownSec: COUNTDOWN_TOTAL,
    regime: stock.regime || "RANGING",
    reasons,
  };

  return { prediction, stocks: stocks || [] };
}

function formatPrice(price: number): string {
  const d = price > 100 ? 2 : price > 1 ? 4 : price > 0.01 ? 6 : 8;
  return price.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function getRR(p: UpcomingTradePrediction): string | null {
  if (p.direction === "HOLD") return null;
  const reward = Math.abs(p.targetTp - p.entryPrice);
  const risk = Math.abs(p.entryPrice - p.stopLoss);
  return risk > 0 ? (reward / risk).toFixed(2) : null;
}

/* ─── Token helpers ──────────────────────────────────────────────────── */

const dirColor = (d: string) => d === "LONG" ? "#10b981" : d === "SHORT" ? "#ef4444" : "#f59e0b";
const modeColor = (m: string) => m === "LIVE" ? "#ef4444" : "#10b981";
const regimeLabel = (r: string) =>
  ({
    BULLISH_MOMENTUM: "🟢 Bullish Momentum",
    BEARISH_DIVERGENCE: "🔴 Bearish Divergence",
    NEUTRAL_RANGE: "🟡 Neutral Range",
    "Low Volatility": "⚪ Low Volatility",
    "High Volatility": "⚡ High Volatility",
    "Strong Bull": "🟢 Strong Bull",
    "Strong Bear": "🔴 Strong Bear",
    "Consolidation": "🟡 Consolidation",
    "Bullish Expansion": "🟢 Bullish Expansion",
    "Bearish Expansion": "🔴 Bearish Expansion",
    RANGING: "🟡 Ranging Market",
    TRENDING_UP: "🟢 Trending Up",
    TRENDING_DOWN: "🔴 Trending Down",
  }[r] ?? (r.startsWith("Evaluating") ? "⏳ Evaluating..." : r));

/* ─── Micro design tokens ────────────────────────────────────────────── */

const SPOT_COLOR = "#38bdf8";
const FUTURES_COLOR = "#f59e0b";

/* ─── Sub-components ─────────────────────────────────────────────────── */

/** A φ-proportioned stat chip: label (38.2%) · value (61.8%) */
function StatChip({ icon, label, value, color = "#64748b" }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: φ.sp.xs, fontSize: φ.fs.xxs, color: "var(--ds-text-faint,#64748b)" }}>
      <span style={{ color }}>{icon}</span>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ fontFamily: "monospace", fontWeight: 900, color, fontSize: φ.fs.xs }}>{value}</span>
    </div>
  );
}

/** A price/stat card in the popup — height ≈ φ × width / 2.618 */
function MetaCard({
  label, value, bg, border, labelColor, valueColor,
}: {
  label: string; value: React.ReactNode;
  bg?: string; border?: string; labelColor?: string; valueColor?: string;
}) {
  return (
    <div style={{
      background: bg ?? "var(--ds-surface-2,#f8fafc)",
      border: `1px solid ${border ?? "var(--ds-border,#e2e8f0)"}`,
      borderRadius: φ.r.sm,
      padding: `${φ.sp.sm}px ${φ.sp.md}px`,
    }}>
      <span style={{ fontSize: φ.fs.xxs, color: labelColor ?? "var(--ds-text-faint,#64748b)", fontWeight: 700, display: "block", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: φ.sp.xs - 2 }}>
        {label}
      </span>
      <span style={{ fontSize: φ.fs.sm, fontWeight: 900, color: valueColor ?? "var(--ds-text,#0f172a)", fontFamily: "monospace" }}>
        {value}
      </span>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */

export default function AIFooterTradeBar() {

  /* Dismiss */
  const [isDismissed, setIsDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_STORAGE_KEY) === "true"; } catch { return false; }
  });
  const dismiss = () => { try { localStorage.setItem(DISMISS_STORAGE_KEY, "true"); } catch { } setIsDismissed(true); };

  /* Core UI state */
  const [isExpanded, setIsExpanded] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [execSuccess, setExecSuccess] = useState(false);
  const [countdown, setCountdown] = useState(() => {
    const v = Number(readRadarPrefs().speedSec);
    return (RADAR_SPEEDS as readonly number[]).includes(v) ? v : COUNTDOWN_TOTAL;
  });
  const [customMargin, setCustomMargin] = useState("");
  const [customLeverage, setCustomLeverage] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const popupRef = useRef<HTMLDivElement>(null);
  const { headerData } = useDashboardStore();

  /* Store */
  const activeMarket = useAppStore((s) => s.activeMarket);
  const accountType = useAppStore((s) => s.accountType);
  const cryptoMode = useAppStore((s) => s.mode) as "PAPER" | "LIVE";
  const indianMode = useAppStore((s) => s.indianMode);
  const setSymbol = useAppStore((s) => s.setSymbol);
  const selectedSymbol = useAppStore((s) => s.selectedSymbol);
  const allowedSymbols = useAppStore((s) => s.allowedSymbols);

  const isIndianRoute = activeMarket === "INDIA"
    || location.pathname.startsWith("/indian-market")
    || location.pathname.startsWith("/india");

  /* Dynamic Candidate Symbols across market universe */
  const [indianSymbols, setIndianSymbols] = useState<string[]>(DEFAULT_INDIAN_SYMBOLS);
  const indianStocksRef = useRef<any[]>([]);

  const candidateSymbols = useMemo(() => {
    return isIndianRoute
      ? indianSymbols
      : Array.from(new Set([...(allowedSymbols?.length ? allowedSymbols : []), ...DEFAULT_CRYPTO_SYMBOLS]));
  }, [isIndianRoute, indianSymbols, allowedSymbols]);

  /* BOTH-mode blink */
  const [blinkPhase, setBlinkPhase] = useState<"SPOT" | "FUTURES">("SPOT");
  useEffect(() => {
    if (accountType !== "BOTH") return;
    let dip: ReturnType<typeof setTimeout>;
    const t = setInterval(() => { dip = setTimeout(() => setBlinkPhase((p) => p === "SPOT" ? "FUTURES" : "SPOT"), 220); }, 2400);
    return () => { clearInterval(t); clearTimeout(dip); };
  }, [accountType]);

  /* Active Symbol & Dynamic Rotation */
  const [activeSymbol, setActiveSymbol] = useState<string>(() => {
    const saved = readRadarPrefs().symbol?.[isIndianRoute ? "india" : "crypto"];
    if (saved) return saved;
    if (selectedSymbol && (isIndianRoute ? DEFAULT_INDIAN_SYMBOLS.includes(selectedSymbol) : true)) {
      return selectedSymbol;
    }
    return isIndianRoute ? DEFAULT_INDIAN_SYMBOLS[0] : (allowedSymbols?.[0] || DEFAULT_CRYPTO_SYMBOLS[0]);
  });
  const [autoRotate, setAutoRotate] = useState<boolean>(() => readRadarPrefs().autoRotate ?? true);
  const [speedSec, setSpeedSec] = useState<number>(() => {
    const v = Number(readRadarPrefs().speedSec);
    return (RADAR_SPEEDS as readonly number[]).includes(v) ? v : COUNTDOWN_TOTAL;
  });
  const [confBand, setConfBand] = useState<string>(() => bandOf(readRadarPrefs().band).id);
  useEffect(() => { writeRadarPrefs({ autoRotate, speedSec, band: confBand }); }, [autoRotate, speedSec, confBand]);
  useEffect(() => { writeRadarPrefs({ symbol: { [isIndianRoute ? "india" : "crypto"]: activeSymbol } }); }, [activeSymbol, isIndianRoute]);
  // Latest direction/confidence per symbol, kept longer than the 20s display
  // cache so RADAR can rank symbols it has already looked at.
  const signalMap = useRef<Map<string, { direction: string; confidence: number; time: number }>>(new Map());
  const [signalVersion, setSignalVersion] = useState(0); // re-render when background scans land

  // The auto-trader's latest decision per symbol (GET /trading/live-decisions).
  // The footer shows THIS as the AI call; the ensemble report is only used for
  // levels, or labelled "analysis" when the engine hasn't evaluated a coin.
  const liveDecisions = useRef<Record<string, any>>({});
  useEffect(() => {
    if (isIndianRoute) return;
    let alive = true;
    const load = () => fetch("/trading/live-decisions")
      .then((r) => r.json())
      .then((d) => { if (alive && d?.decisions) { liveDecisions.current = d.decisions; setSignalVersion((v) => v + 1); } })
      .catch(() => {});
    load();
    const t = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, [isIndianRoute]);
  const withEngine = useCallback((p: UpcomingTradePrediction): UpcomingTradePrediction => {
    if (!p || p.domain !== "CRYPTO") return p;
    const e = liveDecisions.current[p.symbol];
    if (!e || Date.now() - e.at > 5 * 60_000) return { ...p, source: "ANALYSIS" };
    const pct = (x?: number) => (typeof x === "number" ? Math.round(x * 1000) / 10 : undefined);
    const buy = pct(e.buyProbability), sell = pct(e.sellProbability);
    // Confidence = probability of the side the engine is (or would be) taking.
    const conf = e.decision === "LONG" ? buy : e.decision === "SHORT" ? sell : Math.max(buy ?? 0, sell ?? 0);
    return {
      ...p,
      source: "ENGINE",
      direction: e.decision,
      confidence: conf ?? Number(e.confidence) ?? 0,
      engineThreshold: pct(e.threshold),
      engineReason: e.reason,
    };
  }, []);

  // Open positions come first in the rotation. Crypto: the app store.
  // Indian: polled from the positions endpoint while on an Indian page.
  const cryptoPositions = useAppStore((s) => s.positions);
  const [indianOpen, setIndianOpen] = useState<string[]>([]);
  useEffect(() => {
    if (!isIndianRoute) return;
    let alive = true;
    const load = () => fetch("/api/indian-market/positions")
      .then((r) => r.json())
      .then((d) => {
        const list = (d?.positions ?? d?.data ?? []) as any[];
        if (alive) setIndianOpen(Array.from(new Set(list.map((p) => String(p.underlying || p.symbol)).filter(Boolean))));
      })
      .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [isIndianRoute]);
  const openSymbols = useMemo(
    () => (isIndianRoute ? indianOpen : Array.from(new Set((cryptoPositions || []).map((p) => p.symbol)))),
    [isIndianRoute, indianOpen, cryptoPositions],
  );
  const [isLoadingPrediction, setIsLoadingPrediction] = useState<boolean>(false);
  const predictionCache = useRef<Map<string, { pred: UpcomingTradePrediction; time: number }>>(new Map());

  // Adjust activeSymbol if market domain changes (Crypto <-> Indian)
  useEffect(() => {
    if (isIndianRoute) {
      if (!indianSymbols.includes(activeSymbol)) {
        setActiveSymbol(indianSymbols[0] || "RELIANCE");
      }
    } else {
      if (!candidateSymbols.includes(activeSymbol)) {
        setActiveSymbol(candidateSymbols[0] || "BTCUSDT");
      }
    }
  }, [isIndianRoute, candidateSymbols]); // eslint-disable-line

  // Sync only when user explicitly changes selectedSymbol elsewhere in the app (not on every re-render)
  const prevSelectedSymbolRef = useRef(selectedSymbol);
  useEffect(() => {
    if (selectedSymbol && selectedSymbol !== prevSelectedSymbolRef.current && candidateSymbols.includes(selectedSymbol)) {
      prevSelectedSymbolRef.current = selectedSymbol;
      setActiveSymbol(selectedSymbol);
      setCountdown(speedSec);
    }
  }, [selectedSymbol, candidateSymbols]);

  /* Live price */
  const [fetchedPrice, setFetchedPrice] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    api.getCurrentTickerPrices([activeSymbol])
      .then((prices: any) => {
        if (alive && prices && typeof prices[activeSymbol] === "number") {
          setFetchedPrice(prices[activeSymbol]);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [activeSymbol]);

  const getLivePrice = useCallback((sym: string) => {
    if (sym === activeSymbol && fetchedPrice && fetchedPrice > 0) return fetchedPrice;
    return headerData?.find((h) => h.symbol === sym)?.price;
  }, [headerData, activeSymbol, fetchedPrice]);

  /* Prediction */
  const [prediction, setPrediction] = useState<UpcomingTradePrediction>(() =>
    createInitialPrediction(activeSymbol, isIndianRoute, accountType, getLivePrice(activeSymbol))
  );

  const applyPrediction = useCallback((raw: UpcomingTradePrediction) => {
    const p = withEngine(raw);
    if (p?.symbol) {
      signalMap.current.set(p.symbol, { direction: p.direction, confidence: Number(p.confidence) || 0, time: Date.now() });
      setSignalVersion((v) => v + 1);
    }
    setPrediction(p);
    setCustomMargin(String(p.allocatedMargin));
    setCustomLeverage(String(p.estimatedLeverage));
    setExecError(null);
    setExecSuccess(false);
  }, []);

  const loadPrediction = useCallback(async (sym: string, forceRefresh = false) => {
    const now = Date.now();
    const isTargetIndian = isIndianRoute || DEFAULT_INDIAN_SYMBOLS.includes(sym) || !sym.endsWith("USDT");
    const cached = predictionCache.current.get(sym);
    if (!forceRefresh && cached && now - cached.time < 20000) {
      applyPrediction(cached.pred);
      return;
    }
    // After NSE close the inputs are frozen, so re-scanning only repeats the
    // last signal; keep the cached one until the next session.
    if (!forceRefresh && cached && isTargetIndian) {
      const status = checkIsIndianMarketOpen();
      if (!status.isOpen && !status.isPreMarket) {
        applyPrediction(cached.pred);
        return;
      }
    }

    setIsLoadingPrediction(true);
    try {
      const liveP = getLivePrice(sym);
      if (isTargetIndian) {
        const { prediction: indianPred, stocks } = await fetchRealIndianPrediction(sym, indianStocksRef.current);
        if (stocks.length > 0) {
          indianStocksRef.current = stocks;
          setIndianSymbols(stocks.map((s: any) => s.symbol));
        }
        predictionCache.current.set(sym, { pred: indianPred, time: now });
        applyPrediction(indianPred);
      } else {
        const cryptoPred = await fetchRealCryptoPrediction(sym, accountType, liveP);
        predictionCache.current.set(sym, { pred: cryptoPred, time: now });
        applyPrediction(cryptoPred);
      }
    } catch (err: any) {
      console.warn("[AIFooterTradeBar] Real AI prediction load warning:", err?.message);
    } finally {
      setIsLoadingPrediction(false);
    }
  }, [isIndianRoute, activeMarket, accountType, getLivePrice, applyPrediction]);

  // Initial and on-change fetch
  useEffect(() => {
    loadPrediction(activeSymbol);
  }, [activeSymbol, loadPrediction]);

  // ── Confidence filter ────────────────────────────────────────────────
  // With a band selected, only matching coins are displayed. Other symbols
  // are evaluated in the background (not shown) to find new matches.
  const bandActive = confBand !== "ALL";
  const radarUniverse = useMemo(() => Array.from(new Set([...openSymbols, ...candidateSymbols])), [openSymbols, candidateSymbols]);
  const matchingSymbols = useMemo(() => {
    if (!bandActive) return candidateSymbols;
    const b = bandOf(confBand);
    const now = Date.now();
    return radarUniverse.filter((sym) => {
      const x = signalMap.current.get(sym);
      return !!x && now - x.time < SIGNAL_TTL_MS && x.direction !== "HOLD" && x.confidence >= b.min && x.confidence < b.max;
    }).sort((a, c) => signalMap.current.get(c)!.confidence - signalMap.current.get(a)!.confidence);
  }, [bandActive, confBand, radarUniverse, candidateSymbols, signalVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const scanCursor = useRef(0);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  useEffect(() => {
    if (!bandActive) return;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      const now = Date.now();
      const stale = radarUniverse.filter((sym) => { const x = signalMap.current.get(sym); return !x || now - x.time >= SIGNAL_TTL_MS; });
      setScanProgress({ done: radarUniverse.length - stale.length, total: radarUniverse.length });
      if (!stale.length) return;
      const sym = stale[scanCursor.current++ % stale.length];
      busy = true;
      try {
        const isIndian = isIndianRoute || DEFAULT_INDIAN_SYMBOLS.includes(sym) || !sym.endsWith("USDT");
        const raw = isIndian
          ? (await fetchRealIndianPrediction(sym, indianStocksRef.current)).prediction
          : await fetchRealCryptoPrediction(sym, accountType, getLivePrice(sym));
        predictionCache.current.set(sym, { pred: raw, time: Date.now() });
        const pred = withEngine(raw);
        signalMap.current.set(sym, { direction: pred.direction, confidence: Number(pred.confidence) || 0, time: Date.now() });
        setSignalVersion((v) => v + 1);
      } catch { /* try again on a later tick */ } finally { busy = false; }
    };
    tick();
    const t = setInterval(tick, 2500);
    return () => clearInterval(t);
  }, [bandActive, radarUniverse, isIndianRoute, accountType, getLivePrice, withEngine]);
  // Keep the displayed coin inside the band: jump to the best match when the
  // current coin isn't (or no longer is) one.
  useEffect(() => {
    if (bandActive && matchingSymbols.length && !matchingSymbols.includes(activeSymbol)) {
      setActiveSymbol(matchingSymbols[0]);
      setCountdown(speedSec);
    }
  }, [bandActive, matchingSymbols, activeSymbol, speedSec]);
  const noMatchDisplayed = bandActive && !matchingSymbols.includes(activeSymbol);

  // Dynamically update prediction entry/TP/SL when live ticker price arrives
  useEffect(() => {
    if (fetchedPrice && fetchedPrice > 0) {
      setPrediction((prev) => {
        if (!prev || prev.symbol !== activeSymbol) return prev;
        const tpMult = prev.direction === "SHORT" ? 0.978 : 1.022;
        const slMult = prev.direction === "SHORT" ? 1.012 : 0.988;
        return {
          ...prev,
          entryPrice: fetchedPrice,
          // Significant digits, not 2/4 decimals (4 decimals turned PEPE's
          // $0.0000052 levels into 0 / the same value).
          targetTp: prev.direction === "HOLD" ? fetchedPrice : Number((fetchedPrice * tpMult).toPrecision(6)),
          stopLoss: prev.direction === "HOLD" ? fetchedPrice : Number((fetchedPrice * slMult).toPrecision(6)),
        };
      });
    }
  }, [fetchedPrice, activeSymbol]);

  // Rotation order: open positions → fresh LONG/SHORT signals (strongest
  // first) → symbols not yet evaluated or stale → recent HOLDs last. HOLDs are
  // still revisited once their signal goes stale, so new setups get found.
  const radarOrder = useCallback((): string[] => {
    const now = Date.now();
    const fresh = (s: string) => {
      const x = signalMap.current.get(s);
      return x && now - x.time < SIGNAL_TTL_MS ? x : undefined;
    };
    if (confBand !== "ALL") {
      // Filtered: known matches (strongest first), then symbols not yet
      // evaluated or stale — they must be scanned to know if they match.
      // Known non-matching symbols are skipped.
      const b = bandOf(confBand);
      const universe = Array.from(new Set([...openSymbols, ...candidateSymbols]));
      const matches = universe.filter((s) => {
        const x = fresh(s);
        return x && x.direction !== "HOLD" && x.confidence >= b.min && x.confidence < b.max;
      }).sort((a, c) => fresh(c)!.confidence - fresh(a)!.confidence);
      return matches; // only matching coins are displayed; others scan in the background
    }
    const open = openSymbols.filter((s) => candidateSymbols.includes(s) || isIndianRoute);
    const rest = candidateSymbols.filter((s) => !open.includes(s));
    const active = rest.filter((s) => fresh(s) && fresh(s)!.direction !== "HOLD")
      .sort((a, b) => fresh(b)!.confidence - fresh(a)!.confidence);
    const unknown = rest.filter((s) => !fresh(s));
    const holds = rest.filter((s) => fresh(s)?.direction === "HOLD");
    return [...open, ...active, ...unknown, ...holds];
  }, [candidateSymbols, openSymbols, isIndianRoute, confBand]);

  const rotateToNext = useCallback(() => {
    const order = radarOrder();
    setActiveSymbol((curr) => {
      const idx = order.indexOf(curr);
      return order.length ? order[(idx + 1) % order.length] : curr;
    });
    setCountdown(speedSec);
  }, [radarOrder, speedSec]);

  const rotateToPrev = useCallback(() => {
    const order = radarOrder();
    setActiveSymbol((curr) => {
      const idx = order.indexOf(curr);
      return order.length ? order[idx > 0 ? idx - 1 : order.length - 1] : curr;
    });
    setCountdown(speedSec);
  }, [radarOrder, speedSec]);

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (autoRotate && !isExpanded) {
            rotateToNext();
          } else {
            loadPrediction(activeSymbol, true);
          }
          return speedSec;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [autoRotate, isExpanded, rotateToNext, activeSymbol, loadPrediction, speedSec]);

  useEffect(() => { setCustomMargin(String(prediction.allocatedMargin)); setCustomLeverage(String(prediction.estimatedLeverage)); }, []); // eslint-disable-line

  /* Escape key */
  useEffect(() => {
    if (!isExpanded) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") { setIsExpanded(false); setExecError(null); } };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [isExpanded]);

  /* Derived */
  const isIndianAsset =
    isIndianRoute ||
    prediction.domain === "INDIAN" ||
    (Boolean(prediction.exchange) && (prediction.exchange.includes("NSE") || prediction.exchange.includes("BSE"))) ||
    DEFAULT_INDIAN_SYMBOLS.includes(activeSymbol) ||
    activeSymbol.includes("CE") ||
    activeSymbol.includes("PE") ||
    !activeSymbol.endsWith("USDT");

  // Indian orders use the Indian market's own PAPER/LIVE choice — sending the
  // crypto mode here routed Indian orders to the broker as LIVE whenever
  // crypto was LIVE.
  const mode = isIndianAsset ? indianMode : cryptoMode;

  const indianStatus = isIndianAsset ? checkIsIndianMarketOpen() : null;
  const mktClosed = !!(indianStatus && !indianStatus.isOpen && !indianStatus.isPreMarket);
  const cur = isIndianAsset ? "₹" : "$";
  const rrRatio = getRR(prediction);
  const resolvedAT = isIndianAsset ? "SPOT" : accountType === "FUTURES" ? "FUTURES" : "SPOT";
  const isDeriv = activeSymbol.includes("CE") || activeSymbol.includes("PE") || activeSymbol.includes("FUT") || activeSymbol.startsWith("NIFTY") || activeSymbol.startsWith("BANKNIFTY");

  const exchLabel = isIndianAsset
    ? (prediction.domain === "INDIAN" && prediction.exchange && !prediction.exchange.includes("BINANCE")
        ? prediction.exchange
        : isDeriv ? "NSE F&O" : "NSE (EQUITY)")
    : accountType === "BOTH"
      ? `BINANCE ${blinkPhase}`
      : prediction.exchange;

  const exchColor = isIndianAsset
    ? "#ea580c"
    : accountType === "BOTH"
      ? (blinkPhase === "SPOT" ? SPOT_COLOR : FUTURES_COLOR)
      : undefined;

  const progressPct = ((speedSec - countdown) / speedSec) * 100;
  const dc = dirColor(prediction.direction);
  const mc = modeColor(mode);
  const isSpotLocked = isIndianAsset || resolvedAT === "SPOT";

  /* Order execution */
  const handleExecute = async () => {
    if (isExecuting || execSuccess) return;
    setExecError(null);
    setIsExecuting(true);
    try {
      const margin = parseFloat(customMargin) || prediction.allocatedMargin;
      const lev = parseInt(customLeverage, 10) || prediction.estimatedLeverage;
      const ep = prediction.entryPrice > 0 ? prediction.entryPrice : 1;
      const qty = parseFloat((margin / ep).toFixed(5));
      const side: "BUY" | "SELL" = prediction.direction === "SHORT" ? "SELL" : "BUY";

      if (isIndianAsset) {
        const res = await fetch("/api/indian-market/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: prediction.symbol,
            transactionType: side,
            quantity: Math.max(1, Math.round(qty)),
            productType: isDeriv ? "MIS" : "CNC",
            orderType: "MARKET",
            mode,
            stopLoss: prediction.stopLoss,
            target: prediction.targetTp,
          }),
        });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || "Indian market order placement failed");
      } else {
        // Only send the AI's levels when they belong to this side: on HOLD they
        // equal the price (instant exit), and on the opposite call they're
        // inverted (stop above a buy). Otherwise the server sets side-correct
        // defaults.
        const aiSide = prediction.direction === "LONG" ? "BUY" : prediction.direction === "SHORT" ? "SELL" : null;
        const levels = aiSide === side ? { sl: prediction.stopLoss, tp: prediction.targetTp } : {};
        const orderRes: any = await api.placeOrder({ symbol: prediction.symbol, side, quantity: qty, mode, ...levels, leverage: lev, accountType: resolvedAT });
        for (const w of orderRes?.warnings ?? []) useAppStore.getState().addAlert("AMBER", `⚠️ ${w}`);
      }

      setExecSuccess(true);
      setSymbol(prediction.symbol);
      setTimeout(() => {
        setIsExpanded(false); setExecSuccess(false);
        if (isIndianAsset) navigate("/india");
        else if (resolvedAT === "FUTURES") navigate("/futures");
        else navigate("/spot");
      }, 1800);
    } catch (err: any) {
      setExecError(err?.message || "Order placement failed");
    } finally {
      setIsExecuting(false);
    }
  };

  const toggle = () => { setIsExpanded((v) => !v); setExecError(null); setExecSuccess(false); };

  if (isDismissed) return null;

  /* ── Render ───────────────────────────────────────────────────────── */
  return (
    <>
      {/* ── CSS: animations + input reset ─────────────────────────── */}
      <style>{`
        @keyframes aqea-blink {
          0%,100%{opacity:1} 9%{opacity:.18} 18%{opacity:1}
        }
        .aqea-blink { animation: aqea-blink 2.4s ease-in-out infinite; }

        @keyframes aqea-success {
          0%{transform:scale(.88);opacity:0} 65%{transform:scale(1.05);opacity:1} 100%{transform:scale(1)}
        }
        .aqea-success { animation: aqea-success .38s cubic-bezier(.34,1.56,.64,1) forwards; }

        @keyframes aqea-ring {
          0%{box-shadow:0 0 0 0 rgba(16,185,129,.5)} 70%{box-shadow:0 0 0 10px rgba(16,185,129,0)} 100%{box-shadow:0 0 0 0 rgba(16,185,129,0)}
        }
        .aqea-ring { animation: aqea-ring 1.1s ease-out infinite; border-radius:50%; }

        @keyframes aqea-bar-in {
          from { transform: translateX(-50%) scaleY(0); opacity:0; }
          to   { transform: translateX(-50%) scaleY(1); opacity:1; }
        }
        .aqea-popup {
          animation: aqea-bar-in .22s cubic-bezier(.4,0,.2,1) both;
          transform-origin: bottom center;
        }

        .aqea-input {
          width:100%; box-sizing:border-box;
          padding:7px 10px; border-radius:${φ.r.sm}px;
          font-size:${φ.fs.sm}px; font-weight:700; font-family:monospace;
          border:1px solid var(--ds-border,#cbd5e1);
          background:var(--ds-surface,#fff);
          color:var(--ds-text,#0f172a);
          outline:none; transition:border-color .15s;
        }
        .aqea-input:focus { border-color:#2563eb; }
        .aqea-input:disabled { background:var(--ds-surface-2,#f1f5f9); color:var(--ds-text-faint,#94a3b8); cursor:not-allowed; }

        .aqea-btn-close:hover { background:var(--ds-surface-3,#e2e8f0)!important; }
        .aqea-btn-primary:hover:not(:disabled) { filter:brightness(1.1); transform:translateY(-1px); box-shadow:0 6px 16px rgba(37,99,235,.35)!important; }
        .aqea-btn-primary { transition:all .18s ease; }
        .aqea-dismiss:hover { color:#ef4444!important; }

        @media (max-width: 1023px) {
          .aqea-popup {
            bottom: ${φ.barH + φ.copyrightH + 56 + φ.sp.sm}px !important;
          }
        }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════
          FOOTER BAR  —  height: φ.barH = 55px (Fibonacci)
          Layout: Golden Ratio proportions with zero-clip flex flow
          ══════════════════════════════════════════════════════════════ */}
      <div
        style={{
          background: "var(--ds-surface,#fff)",
          borderTop: "1px solid var(--ds-border,#cbd5e1)",
          boxShadow: "0 -4px 20px rgba(0,0,0,.07)",
          display: "flex",
          flexDirection: "column",
          zIndex: 35,
          position: "relative",
          flexShrink: 0,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* ── Main bar row — 55px ── */}
        <div className="aqea-footer-main" style={{
          padding: `0 ${φ.sp.lg}px`,
          height: φ.barH,
          minHeight: φ.barH,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: φ.sp.md,
          position: "relative",
          width: "100%",
          boxSizing: "border-box",
        }}>
          {/* Countdown progress bar — 3px, gradient, smooth 1s transition */}
          <div style={{ position: "absolute", bottom: 0, left: 0, height: 3, width: `${progressPct}%`, background: "linear-gradient(90deg,#2563eb,#7c3aed)", transition: "width 1s linear", pointerEvents: "none" }} />

          {/* ── LEFT — symbol identity & signal badges (nowrap) ── */}
            <div className="aqea-footer-left" style={{ display: "flex", alignItems: "center", gap: φ.sp.sm, minWidth: 0, flexShrink: 0 }}>
              {/* Brain icon — 34×34 (Fibonacci) */}
              <div style={{ width: φ.sp.xl, height: φ.sp.xl, borderRadius: φ.r.sm, background: "rgba(37,99,235,.1)", border: "1px solid rgba(37,99,235,.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563eb", flexShrink: 0 }}>
                <Brain size={φ.ic.sm} className="animate-pulse" />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, justifyContent: "center" }}>
                {/* Row 1 — micro badges */}
                <div style={{ display: "flex", alignItems: "center", gap: φ.sp.xs, flexWrap: "nowrap", whiteSpace: "nowrap" }}>
                  <Badge bg="rgba(168,85,247,.12)" color="#a855f7" border="rgba(168,85,247,.28)">AI SIGNAL</Badge>
                  <Badge bg={`${mc}14`} color={mc} border={`${mc}40`}>
                    {mode === "LIVE" ? "🔴" : "🟢"} {mode}
                  </Badge>
                  <span
                    className={(!isIndianAsset && accountType === "BOTH") ? "aqea-blink" : undefined}
                    style={{ fontSize: φ.fs.xxs, fontWeight: 800, padding: "1px 6px", borderRadius: φ.r.xs, background: exchColor ? `${exchColor}18` : "var(--ds-surface-2,#f1f5f9)", color: exchColor || "var(--ds-text,#334155)", border: `1px solid ${exchColor ? `${exchColor}55` : "var(--ds-border,#cbd5e1)"}`, fontFamily: "monospace", transition: "all .4s" }}>
                    {exchLabel}
                  </span>
                </div>

                {/* Row 2 — primary identity */}
                <div style={{ display: "flex", alignItems: "center", gap: φ.sp.sm, flexWrap: "nowrap", whiteSpace: "nowrap" }}>
                  {/* Symbol with Previous/Next Arrows and Quick Switcher */}
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); rotateToPrev(); }}
                      title="Previous AI Opportunity"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--ds-text-faint,#64748b)",
                        cursor: "pointer",
                        padding: "1px 2px",
                        display: "flex",
                        alignItems: "center",
                        borderRadius: 3,
                        transition: "color 0.15s"
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#2563eb")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ds-text-faint,#64748b)")}
                    >
                      <ChevronLeft size={14} />
                    </button>

                    <select
                      value={activeSymbol}
                      onChange={(e) => {
                        setActiveSymbol(e.target.value);
                        setCountdown(speedSec);
                      }}
                      style={{
                        fontSize: φ.fs.md,
                        fontWeight: 900,
                        color: "var(--ds-text,#0f172a)",
                        letterSpacing: "-0.02em",
                        lineHeight: 1,
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        padding: 0,
                        margin: 0,
                      }}
                    >
                      {matchingSymbols.map((sym) => (
                        <option key={sym} value={sym} style={{ background: "var(--ds-surface, #fff)", color: "var(--ds-text, #0f172a)" }}>
                          {sym}{bandActive ? ` · ${signalMap.current.get(sym)?.direction} ${signalMap.current.get(sym)?.confidence}%` : ""}
                        </option>
                      ))}
                      {!matchingSymbols.includes(activeSymbol) && (
                        <option value={activeSymbol} disabled={bandActive} style={{ background: "var(--ds-surface, #fff)", color: "var(--ds-text, #0f172a)" }}>
                          {bandActive ? "No match" : activeSymbol}
                        </option>
                      )}
                    </select>

                    <button
                      onClick={(e) => { e.stopPropagation(); rotateToNext(); }}
                      title="Next AI Opportunity"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--ds-text-faint,#64748b)",
                        cursor: "pointer",
                        padding: "1px 2px",
                        display: "flex",
                        alignItems: "center",
                        borderRadius: 3,
                        transition: "color 0.15s"
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#2563eb")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ds-text-faint,#64748b)")}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  {/* Direction pill. After NSE close an Indian signal is computed on
                      frozen closing prices, so it's shown as the last signal, not
                      as a live call. */}
                  {noMatchDisplayed ? (
                    <span title="No coin is currently in this confidence range; the rest are being scanned in the background" style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: φ.r.xs, fontSize: φ.fs.xxs, fontWeight: 900, background: "rgba(100,116,139,.12)", color: "#64748b", border: "1px solid rgba(100,116,139,.35)" }}>
                      <RotateCw size={φ.ic.sm - 2} className={scanProgress.done < scanProgress.total ? "animate-spin" : ""} />
                      NO COIN IN {bandOf(confBand).label} · scanned {scanProgress.done}/{scanProgress.total}
                    </span>
                  ) : mktClosed && isIndianAsset ? (
                    <>
                      <span title={indianStatus?.message} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: φ.r.xs, fontSize: φ.fs.xxs, fontWeight: 900, background: "rgba(100,116,139,.12)", color: "#64748b", border: "1px solid rgba(100,116,139,.35)" }}>
                        <Minus size={φ.ic.sm - 2} />
                        MARKET CLOSED
                      </span>
                      <span style={{ fontSize: φ.fs.xs, fontWeight: 600, color: "var(--ds-text-faint,#64748b)" }} className="hidden sm:inline">
                        Last: <strong style={{ color: dc }}>{prediction.direction}</strong> {prediction.confidence}% at close
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: φ.r.xs, fontSize: φ.fs.xxs, fontWeight: 900, background: `${dc}14`, color: dc, border: `1px solid ${dc}38` }}>
                        {isLoadingPrediction ? (
                          <RotateCw size={φ.ic.sm - 2} className="animate-spin" />
                        ) : prediction.direction === "LONG" ? (
                          <TrendingUp size={φ.ic.sm - 2} />
                        ) : prediction.direction === "SHORT" ? (
                          <TrendingDown size={φ.ic.sm - 2} />
                        ) : (
                          <Minus size={φ.ic.sm - 2} />
                        )}
                        {isLoadingPrediction ? "EVALUATING" : prediction.direction}
                      </span>
                      {/* Confidence — 13px secondary (φ.fs.sm) */}
                      <span
                        title={prediction.source === "ENGINE"
                          ? `Auto-trader's live decision. ${prediction.engineReason || ""}`
                          : "Ensemble analysis only — the auto-trader hasn't evaluated this coin recently, so this is not what it will trade."}
                        style={{ fontSize: φ.fs.xs, fontWeight: 600, color: "var(--ds-text-faint,#64748b)" }}
                        className="hidden sm:inline"
                      >
                        <strong style={{ color: "#2563eb" }}>{prediction.confidence}%</strong>
                        {prediction.source === "ENGINE" && prediction.direction === "HOLD" && prediction.engineThreshold ? (
                          <span> · needs {prediction.engineThreshold}%</span>
                        ) : null}
                        {prediction.source === "ANALYSIS" && <span style={{ marginLeft: 4, fontSize: 9, fontStyle: "italic" }}>analysis</span>}
                      </span>
                    </>
                  )}

                  {/* Auto-cycle indicator badge / button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setAutoRotate(r => !r); }}
                    title={autoRotate ? `Auto-cycling every ${speedSec}s: open positions first, then the strongest LONG/SHORT signals, HOLDs last (click to pause)` : "Auto-cycle paused (click to resume)"}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "2px 6px",
                      borderRadius: φ.r.xs,
                      fontSize: 9,
                      fontWeight: 800,
                      background: autoRotate ? "rgba(37,99,235,0.08)" : "var(--ds-surface-2, #f1f5f9)",
                      color: autoRotate ? "#2563eb" : "var(--ds-text-faint, #94a3b8)",
                      border: `1px solid ${autoRotate ? "rgba(37,99,235,0.25)" : "var(--ds-border, #cbd5e1)"}`,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <RotateCw size={10} className={autoRotate ? "animate-spin" : ""} style={{ animationDuration: "6s" }} />
                    <span className="hidden lg:inline">{autoRotate ? "RADAR" : "PAUSED"}</span>
                  </button>
                  {/* Time per symbol; saved per browser. */}
                  <select
                    value={speedSec}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { const v = Number(e.target.value); setSpeedSec(v); setCountdown(v); }}
                    title="Seconds per symbol"
                    style={{ fontSize: 9, fontWeight: 700, padding: "1px 2px", borderRadius: φ.r.xs, background: "transparent", color: "var(--ds-text-faint, #94a3b8)", border: "1px solid var(--ds-border, #cbd5e1)", cursor: "pointer" }}
                  >
                    {RADAR_SPEEDS.map((v) => <option key={v} value={v}>{v}s</option>)}
                  </select>
                  {/* Filter RADAR to AI recommendations in a confidence band. */}
                  <select
                    value={confBand}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { setConfBand(e.target.value); setCountdown(Math.min(countdown, 2)); }}
                    title="Show only LONG/SHORT recommendations in this confidence range"
                    style={{ fontSize: 9, fontWeight: 700, padding: "1px 2px", borderRadius: φ.r.xs, background: confBand === "ALL" ? "transparent" : "rgba(37,99,235,0.08)", color: confBand === "ALL" ? "var(--ds-text-faint, #94a3b8)" : "#2563eb", border: `1px solid ${confBand === "ALL" ? "var(--ds-border, #cbd5e1)" : "rgba(37,99,235,0.35)"}`, cursor: "pointer" }}
                  >
                    {CONF_BANDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                  </select>
                  {bandActive && (
                    <span title={`${matchingSymbols.length} coin(s) in ${bandOf(confBand).label}; scanned ${scanProgress.done}/${scanProgress.total}`} style={{ fontSize: 9, fontWeight: 800, padding: "2px 5px", borderRadius: φ.r.xs, color: matchingSymbols.length ? "#2563eb" : "var(--ds-text-faint, #94a3b8)", border: "1px solid var(--ds-border, #cbd5e1)" }}>
                      {matchingSymbols.length} match{scanProgress.done < scanProgress.total ? ` · scanning ${scanProgress.done}/${scanProgress.total}` : ""}
                    </span>
                  )}
                  {openSymbols.includes(activeSymbol) && (
                    <span title="You hold this position — RADAR checks open positions first" style={{ fontSize: 9, fontWeight: 800, padding: "2px 5px", borderRadius: φ.r.xs, color: "#059669", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}>
                      OPEN
                    </span>
                  )}
                </div>
              </div>
            </div>

          {/* ── CENTER — stats chips (golden ratio spacing) ── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: φ.sp.md, flex: 1, minWidth: 0 }} className="hidden md:flex">
              <StatChip icon={<Clock size={φ.ic.sm} />} label="Eval in:" value={`${countdown}s`} color="#d97706" />
              <StatChip icon={<Zap size={φ.ic.sm} />} label="Vote:" value={`${prediction.modelsVoting}/${prediction.totalModels}`} color="#059669" />
              {rrRatio && <StatChip icon={<Target size={φ.ic.sm} />} label="R:R" value={`1:${rrRatio}`} color="#8b5cf6" />}
            </div>

          {/* ── RIGHT — controls ── */}
          <div className="aqea-footer-right" style={{ display: "flex", alignItems: "center", gap: φ.sp.sm, flexShrink: 0, marginLeft: "auto" }}>
            <button className="aqea-dismiss" onClick={dismiss} title="Hide permanently" style={{ background: "none", border: "none", color: "var(--ds-text-faint,#94a3b8)", cursor: "pointer", padding: `${φ.sp.xs}px`, borderRadius: φ.r.xs, display: "flex", alignItems: "center", gap: φ.sp.xs, fontSize: φ.fs.xxs, fontWeight: 700, transition: "color .15s" }}>
              <EyeOff size={φ.ic.sm} />
              <span className="hidden sm:inline">Hide</span>
            </button>

            <button onClick={toggle} style={{ display: "inline-flex", alignItems: "center", gap: φ.sp.xs, padding: `${φ.sp.xs}px ${φ.sp.md}px`, borderRadius: φ.r.sm, fontSize: φ.fs.xs, fontWeight: 800, background: isExpanded ? "#2563eb" : "rgba(37,99,235,.08)", color: isExpanded ? "#fff" : "#2563eb", border: "1px solid rgba(37,99,235,.28)", cursor: "pointer", transition: "all .15s" }}>
              <BarChart3 size={φ.ic.sm} />
              <span>{isExpanded ? "Hide Forecast" : "View Forecast"}</span>
              {isExpanded ? <ChevronDown size={φ.ic.sm} /> : <ChevronUp size={φ.ic.sm} />}
            </button>
          </div>
        </div>

        {/* ── Copyright strip — φ.copyrightH = 16px ── */}
        <div style={{
          height: φ.copyrightH,
          minHeight: φ.copyrightH,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderTop: "1px solid var(--ds-border,#e2e8f0)",
          background: "var(--ds-surface-2,#f8fafc)",
          gap: φ.sp.sm,
          paddingInline: φ.sp.lg,
          boxSizing: "border-box",
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--ds-text-faint,#94a3b8)", letterSpacing: "0.06em", textTransform: "uppercase", userSelect: "none", whiteSpace: "nowrap" }}>
            © {new Date().getFullYear()} AalgoLabs(OPC) PVT. LTD. · All rights reserved
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          POPUP MODAL
          Width: 576px (≈ 360 × φ² — golden rectangle)
          Padding: 21px (φ.sp.lg — Fibonacci)
          ══════════════════════════════════════════════════════════════ */}
      {isExpanded && (
        <div
          ref={popupRef}
          className="aqea-popup"
          style={{
            position: "fixed",
            bottom: φ.barH + φ.copyrightH + φ.sp.sm,   // sit above bar + copyright strip
            left: "50%",
            transform: "translateX(-50%)",
            width: "94%",
            maxWidth: 576,                       // ≈ 360 × φ²
            background: "var(--ds-surface,#fff)",
            border: "1px solid var(--ds-border,#e2e8f0)",
            borderRadius: φ.r.lg,
            padding: φ.sp.lg,
            boxShadow: "0 24px 55px rgba(0,0,0,.16), 0 8px 21px rgba(0,0,0,.08)",
            zIndex: 9999,
            color: "var(--ds-text,#0f172a)",
          }}
        >
          {/* ── Success overlay ───────────────────────────────────── */}
          {execSuccess && (
            <div className="aqea-success" style={{ position: "absolute", inset: 0, borderRadius: φ.r.lg, background: "#10b981", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: φ.sp.sm, zIndex: 10 }}>
              <div className="aqea-ring"><CheckCircle size={φ.sp.xxl} color="#fff" /></div>
              <div style={{ fontSize: φ.fs.md, fontWeight: 900, color: "#fff" }}>Order Placed!</div>
              <div style={{ fontSize: φ.fs.xs, color: "rgba(255,255,255,.85)", fontWeight: 600 }}>
                {prediction.direction === "SHORT" ? "SELL" : "BUY"} {prediction.symbol} · {mode} Mode · Redirecting…
              </div>
            </div>
          )}

          {/* ── Header row ───────────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: φ.sp.md }}>
            {/* Title — uses φ-proportioned gap */}
            <div style={{ display: "flex", alignItems: "center", gap: φ.sp.sm }}>
              <div style={{ width: φ.sp.xl, height: φ.sp.xl, borderRadius: φ.r.sm, background: "rgba(37,99,235,.1)", border: "1px solid rgba(37,99,235,.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563eb" }}>
                <Sparkles size={φ.ic.sm} />
              </div>
              <div>
                <div style={{ fontSize: φ.fs.md, fontWeight: 900, color: "var(--ds-text,#0f172a)", letterSpacing: "-0.02em" }}>
                  AI Trade Evaluation
                </div>
                <div style={{ fontSize: φ.fs.xxs, color: "var(--ds-text-faint,#64748b)", marginTop: 2 }}>
                  Neural Ensemble Prediction Matrix
                </div>
              </div>
            </div>

            {/* Right: mode badge + close */}
            <div style={{ display: "flex", alignItems: "center", gap: φ.sp.sm }}>
              <span style={{ fontSize: φ.fs.xxs, fontWeight: 900, padding: "3px 8px", borderRadius: φ.r.xs, background: `${mc}14`, color: mc, border: `1px solid ${mc}38` }}>
                {mode === "LIVE" ? "🔴" : "🟢"} {mode} MODE
              </span>
              <button onClick={() => { setIsExpanded(false); setExecError(null); setExecSuccess(false); }} style={{ width: φ.sp.xl, height: φ.sp.xl, borderRadius: φ.r.sm, background: "var(--ds-surface-2,#f1f5f9)", border: "1px solid var(--ds-border,#cbd5e1)", color: "var(--ds-text-faint,#64748b)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={φ.ic.sm} />
              </button>
            </div>
          </div>

          {/* ── Indian market closed warning ─────────────────────── */}
          {mktClosed && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: φ.sp.sm, padding: `${φ.sp.sm}px ${φ.sp.md}px`, borderRadius: φ.r.sm, marginBottom: φ.sp.md, background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.32)" }}>
              <AlertTriangle size={φ.ic.sm} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: φ.fs.xs, fontWeight: 800, color: "#b45309", marginBottom: 3 }}>Indian Market Closed</div>
                <div style={{ fontSize: φ.fs.xxs, color: "#92400e" }}>{indianStatus!.message}</div>
              </div>
            </div>
          )}

          {/* ── Identity row: 4 cells using φ grid ──────────────── */}
          {/* 3 primary cells (61.8%) + 1 regime cell (38.2%) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: φ.sp.sm, marginBottom: φ.sp.md }}>
            <MetaCard label="Symbol" value={prediction.symbol} />
            <MetaCard
              label="Signal"
              value={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: dc }}>
                  {prediction.direction === "LONG" ? <TrendingUp size={φ.ic.sm} /> :
                    prediction.direction === "SHORT" ? <TrendingDown size={φ.ic.sm} /> :
                      <Minus size={φ.ic.sm} />}
                  {prediction.direction}
                </span>
              }
              valueColor={dc}
            />
            <MetaCard label="Confidence" value={`${prediction.confidence}%`} valueColor="#2563eb" />
            <MetaCard label="Regime" value={<span style={{ fontSize: φ.fs.xxs }}>{regimeLabel(prediction.regime)}</span>} />
          </div>

          {/* ── Price levels: 3 columns — Entry | TP | SL ───────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: φ.sp.sm, marginBottom: φ.sp.md }}>
            <MetaCard label="Entry Price" value={`${cur}${formatPrice(prediction.entryPrice)}`} />
            <MetaCard label="Target TP" value={`${cur}${formatPrice(prediction.targetTp)}`} bg="rgba(16,185,129,.07)" border="rgba(16,185,129,.22)" labelColor="#059669" valueColor="#059669" />
            <MetaCard label="Stop-Loss" value={`${cur}${formatPrice(prediction.stopLoss)}`} bg="rgba(239,68,68,.06)" border="rgba(239,68,68,.22)" labelColor="#dc2626" valueColor="#dc2626" />
          </div>

          {/* ── Stat strip: R:R · Margin · Leverage ─────────────── */}
          {/* Uses 61.8 / 19.1 / 19.1 weighting (φ-weighted) */}
          <div style={{ display: "grid", gridTemplateColumns: "1.618fr 1fr 1fr", gap: φ.sp.sm, marginBottom: φ.sp.md }}>
            {rrRatio ? (
              <div style={{ background: "rgba(139,92,246,.07)", border: "1px solid rgba(139,92,246,.22)", borderRadius: φ.r.sm, padding: `${φ.sp.sm}px ${φ.sp.md}px`, display: "flex", alignItems: "center", gap: φ.sp.sm }}>
                <Target size={φ.ic.md} color="#8b5cf6" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: φ.fs.xxs, color: "#7c3aed", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>Risk : Reward</div>
                  <div style={{ fontSize: φ.fs.md, fontWeight: 900, color: "#7c3aed", fontFamily: "monospace", marginTop: 2 }}>1 : {rrRatio}</div>
                </div>
              </div>
            ) : (
              <div style={{ background: "var(--ds-surface-2,#f8fafc)", border: "1px solid var(--ds-border,#e2e8f0)", borderRadius: φ.r.sm, padding: `${φ.sp.sm}px ${φ.sp.md}px`, display: "flex", alignItems: "center", color: "var(--ds-text-faint,#94a3b8)", fontSize: φ.fs.xs }}>
                No directional signal (HOLD)
              </div>
            )}

            <div style={{ background: "rgba(37,99,235,.06)", border: "1px solid rgba(37,99,235,.18)", borderRadius: φ.r.sm, padding: `${φ.sp.sm}px ${φ.sp.md}px` }}>
              <div style={{ fontSize: φ.fs.xxs, color: "#1d4ed8", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>
                <DollarSign size={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} />
                Margin
              </div>
              <div style={{ fontSize: φ.fs.sm, fontWeight: 900, color: "#1d4ed8", fontFamily: "monospace" }}>
                {cur}{(parseFloat(customMargin) || prediction.allocatedMargin).toLocaleString()}
              </div>
            </div>

            <div style={{ background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.22)", borderRadius: φ.r.sm, padding: `${φ.sp.sm}px ${φ.sp.md}px` }}>
              <div style={{ fontSize: φ.fs.xxs, color: "#b45309", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>
                <Shield size={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} />
                Leverage
              </div>
              <div style={{ fontSize: φ.fs.sm, fontWeight: 900, color: "#b45309", fontFamily: "monospace" }}>
                {parseInt(customLeverage, 10) || prediction.estimatedLeverage}×
              </div>
            </div>
          </div>

          {/* ── Editable inputs — 61.8 / 38.2 split ────────────── */}
          <div style={{ background: "var(--ds-surface-2,#f8fafc)", border: "1px solid var(--ds-border,#e2e8f0)", borderRadius: φ.r.md, padding: `${φ.sp.md}px`, marginBottom: φ.sp.md }}>
            <div style={{ fontSize: φ.fs.xs, fontWeight: 800, color: "var(--ds-text,#0f172a)", marginBottom: φ.sp.sm }}>
              ✏️ Adjust Order Parameters
            </div>
            {/* 61.8% margin · 38.2% leverage — φ-weighted columns */}
            <div style={{ display: "grid", gridTemplateColumns: "1.618fr 1fr", gap: φ.sp.sm }}>
              <div>
                <label style={{ fontSize: φ.fs.xxs, fontWeight: 700, color: "var(--ds-text-faint,#64748b)", display: "block", marginBottom: φ.sp.xs }}>
                  Margin ({isIndianAsset ? "₹" : "USDT"})
                </label>
                <input type="number" min="1" step="any" value={customMargin} onChange={(e) => setCustomMargin(e.target.value)} className="aqea-input" />
              </div>
              <div>
                <label style={{ fontSize: φ.fs.xxs, fontWeight: 700, color: "var(--ds-text-faint,#64748b)", display: "block", marginBottom: φ.sp.xs }}>
                  Leverage (×)
                </label>
                <input type="number" min="1" max="125" step="1" value={customLeverage} onChange={(e) => setCustomLeverage(e.target.value)} disabled={isSpotLocked} className="aqea-input" />
                {isSpotLocked && (
                  <div style={{ fontSize: 9, color: "var(--ds-text-faint,#94a3b8)", marginTop: 3 }}>Fixed at 1× for Spot / Indian equity</div>
                )}
              </div>
            </div>
          </div>

          {/* ── Neural signal drivers ─────────────────────────────── */}
          <div style={{ marginBottom: φ.sp.md }}>
            <div style={{ fontSize: φ.fs.xs, fontWeight: 800, color: "var(--ds-text,#0f172a)", marginBottom: φ.sp.sm }}>Neural Signal Drivers</div>
            <div style={{ display: "flex", flexDirection: "column", gap: φ.sp.xs }}>
              {prediction.reasons.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: φ.sp.sm, fontSize: φ.fs.xxs, color: "var(--ds-text-faint,#64748b)" }}>
                  <span style={{ width: φ.sp.xs, height: φ.sp.xs, borderRadius: "50%", background: "#2563eb", flexShrink: 0 }} />
                  {r}
                </div>
              ))}
            </div>
          </div>

          {/* ── Error banner ─────────────────────────────────────── */}
          {execError && (
            <div style={{ display: "flex", alignItems: "center", gap: φ.sp.sm, padding: `${φ.sp.sm}px ${φ.sp.md}px`, borderRadius: φ.r.sm, marginBottom: φ.sp.sm, background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.28)", color: "#dc2626", fontSize: φ.fs.xs, fontWeight: 700 }}>
              <AlertTriangle size={φ.ic.sm} style={{ flexShrink: 0 }} />
              {execError}
            </div>
          )}

          {/* ── Disclaimer bar ───────────────────────────────────── */}
          <div style={{ padding: `${φ.sp.xs}px ${φ.sp.md}px`, borderRadius: φ.r.sm, marginBottom: φ.sp.md, background: "var(--ds-surface-2,#f8fafc)", border: "1px solid var(--ds-border,#e2e8f0)", color: "var(--ds-text-faint,#94a3b8)", fontSize: 9.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>AI-generated forecast. Server risk gates still apply.</span>
            <kbd style={{ fontSize: 9, background: "var(--ds-surface,#fff)", border: "1px solid var(--ds-border,#cbd5e1)", borderRadius: 3, padding: "1px 5px", color: "var(--ds-text-faint,#94a3b8)" }}>Esc</kbd>
          </div>

          {/* ── Actions: Close (38.2%) · Primary (61.8%) ────────── */}
          {/* Button width ratio honours φ: primary ≈ 1.618× close */}
          <div style={{ display: "flex", gap: φ.sp.sm, justifyContent: "flex-end" }}>
            <button className="aqea-btn-close" onClick={() => { setIsExpanded(false); setExecError(null); setExecSuccess(false); }} style={{ padding: `${φ.sp.sm}px ${φ.sp.md}px`, borderRadius: φ.r.sm, background: "var(--ds-surface-2,#f1f5f9)", border: "1px solid var(--ds-border,#cbd5e1)", color: "var(--ds-text,#334155)", fontSize: φ.fs.xs, fontWeight: 700, cursor: "pointer", transition: "background .15s" }}>
              Close
            </button>

            {prediction.direction === "HOLD" ? (
              <div style={{ padding: `${φ.sp.sm}px ${φ.sp.lg}px`, borderRadius: φ.r.sm, background: "rgba(245,158,11,.09)", border: "1px solid rgba(245,158,11,.28)", color: "#b45309", fontSize: φ.fs.xs, fontWeight: 800, display: "flex", alignItems: "center", gap: φ.sp.xs }}>
                <Minus size={φ.ic.sm} /> Hold — No Signal
              </div>
            ) : (
              <button
                className="aqea-btn-primary"
                onClick={handleExecute}
                disabled={isExecuting || execSuccess || (mktClosed && isIndianAsset)}
                style={{
                  padding: `${φ.sp.sm}px ${φ.sp.lg}px`,
                  borderRadius: φ.r.sm,
                  background: execSuccess ? "#10b981" : "#2563eb",
                  border: "none", color: "#fff",
                  fontSize: φ.fs.xs, fontWeight: 800,
                  cursor: (isExecuting || execSuccess || (mktClosed && isIndianAsset)) ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: φ.sp.xs,
                  boxShadow: "0 2px 13px rgba(37,99,235,.28)",
                  opacity: (isExecuting || (mktClosed && isIndianAsset)) ? 0.72 : 1,
                }}
              >
                {execSuccess ? <CheckCircle size={φ.ic.sm} /> : <Play size={φ.ic.sm} />}
                {isExecuting ? "Placing Order…"
                  : execSuccess ? "Order Placed!"
                    : mktClosed && isIndianAsset ? "Market Closed"
                      : `Trade on ${isIndianAsset ? "India" : resolvedAT === "FUTURES" ? "Futures" : "Spot"} Terminal`}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Inline Badge ────────────────────────────────────────────────────── */
function Badge({ children, bg, color, border }: { children: React.ReactNode; bg: string; color: string; border: string }) {
  return (
    <span style={{ fontSize: 9.5, fontWeight: 800, padding: "1px 6px", borderRadius: φ.r.xs, background: bg, color, border: `1px solid ${border}`, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>
      {children}
    </span>
  );
}
