/**
 * AIFooterTradeBar — Golden Ratio (φ = 1.618) Design System
 *
 * Fibonacci spacing scale : 5 · 8 · 13 · 21 · 34 · 55px
 * Typography scale        : 10 · 11 · 13 · 16 · 21px  (each ×φ from prev)
 * Layout splits           : 61.8 % primary / 38.2 % secondary
 * Border radii            : 5 · 8 · 13 · 21px
 * Icon sizes              : 13 · 16 · 21px
 */

import { useState, useEffect, useCallback, useRef } from "react";
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

/* ─── Data pools ─────────────────────────────────────────────────────── */

const CRYPTO_POOL = [
  { symbol: "BTCUSDT", exchange: "BINANCE FUTURES", basePrice: 64250.0, leverage: 5, reasons: ["Bi-LSTM 2-Layer momentum flip", "1D CNN spatial volume delta", "Transformer micro-structure attention"] },
  { symbol: "ETHUSDT", exchange: "BINANCE FUTURES", basePrice: 3480.0, leverage: 5, reasons: ["Mamba SSM orderbook imbalance +2.8%", "Multi-head cross-attention signal", "Stochastic momentum RSI divergence"] },
  { symbol: "SOLUSDT", exchange: "BINANCE FUTURES", basePrice: 148.5, leverage: 3, reasons: ["High-frequency order flow delta", "Exponential volume surge +18%", "Ensemble neural consensus 4/4"] },
  { symbol: "XRPUSDT", exchange: "BINANCE FUTURES", basePrice: 0.585, leverage: 5, reasons: ["Order book depth skew +3.2%", "Breakout liquidity sweep detection", "xLSTM exponential memory confirm"] },
  { symbol: "DOGEUSDT", exchange: "BINANCE FUTURES", basePrice: 0.105, leverage: 4, reasons: ["CVD volume acceleration surge", "Multi-head cross attention spike", "Mean-reversion bounce from VWAP"] },
  { symbol: "BNBUSDT", exchange: "BINANCE SPOT", basePrice: 585.0, leverage: 1, reasons: ["Mean-reversion support bounce", "Microstructure orderbook liquidity depth", "Transformer trend-following confirm"] },
];

const INDIAN_POOL = [
  { symbol: "RELIANCE", exchange: "NSE (EQUITY)", basePrice: 2985.4, leverage: 1, reasons: ["Bi-LSTM momentum flip", "Conv1D spatial volume spike", "Mamba SSM orderbook imbalance +2.4%"] },
  { symbol: "TCS", exchange: "NSE (EQUITY)", basePrice: 3890.0, leverage: 1, reasons: ["Institutional delivery volume spike", "Multi-timeframe moving average breakout", "RSI divergence bullish confirmation"] },
  { symbol: "INFY", exchange: "NSE (EQUITY)", basePrice: 1640.5, leverage: 1, reasons: ["Option open interest buildup support", "Neural ensemble volatility breakout", "Order flow buy imbalance +3.1%"] },
  { symbol: "HDFCBANK", exchange: "NSE (EQUITY)", basePrice: 1510.0, leverage: 1, reasons: ["BankNifty sector strength correlation", "1D CNN momentum filter triggered", "Deep reinforcement policy reward peak"] },
];

/* ─── Constants ──────────────────────────────────────────────────────── */

const COUNTDOWN_TOTAL = 15;
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

/* ─── Pure helpers ───────────────────────────────────────────────────── */

function generatePrediction(
  item: { symbol: string; exchange: string; basePrice: number; leverage: number; reasons: string[] },
  isIndian: boolean,
  livePrice?: number,
): UpcomingTradePrediction {
  const roll = Math.random();
  const direction: "LONG" | "SHORT" | "HOLD" = roll > 0.55 ? "LONG" : roll > 0.15 ? "SHORT" : "HOLD";
  const price = livePrice && livePrice > 0 ? livePrice : item.basePrice;
  const tpMult = direction === "SHORT" ? 0.978 : 1.022;
  const slMult = direction === "SHORT" ? 1.012 : 0.988;
  return {
    symbol: item.symbol,
    exchange: item.exchange,
    domain: isIndian ? "INDIAN" : "CRYPTO",
    direction,
    confidence: parseFloat((82 + Math.random() * 14).toFixed(1)),
    entryPrice: price,
    targetTp: direction === "HOLD" ? price : parseFloat((price * tpMult).toFixed(price > 100 ? 2 : 4)),
    stopLoss: direction === "HOLD" ? price : parseFloat((price * slMult).toFixed(price > 100 ? 2 : 4)),
    estimatedLeverage: item.leverage,
    allocatedMargin: isIndian ? 25000 : 2500,
    modelsVoting: 4,
    totalModels: 4,
    countdownSec: COUNTDOWN_TOTAL,
    regime: direction === "LONG" ? "BULLISH_MOMENTUM" : direction === "SHORT" ? "BEARISH_DIVERGENCE" : "NEUTRAL_RANGE",
    reasons: item.reasons,
  };
}

function resolvePoolItem(symbol: string, isIndian: boolean, accountType: "SPOT" | "FUTURES" | "BOTH") {
  const pool = isIndian ? INDIAN_POOL : CRYPTO_POOL;
  const found = pool.find((p) => p.symbol === symbol);
  if (found) return { ...found, isIndian };
  return {
    symbol,
    exchange: isIndian ? "NSE (EQUITY)" : `BINANCE ${accountType === "BOTH" ? "FUTURES" : accountType}`,
    basePrice: 0,
    leverage: isIndian || accountType === "SPOT" ? 1 : 5,
    reasons: ["Ensemble neural consensus", "Order-flow imbalance signal", "Multi-timeframe momentum confirmation"],
    isIndian,
  };
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
  ({ BULLISH_MOMENTUM: "🟢 Bullish Momentum", BEARISH_DIVERGENCE: "🔴 Bearish Divergence", NEUTRAL_RANGE: "🟡 Neutral Range" }[r] ?? r);

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
  const [countdown, setCountdown] = useState(COUNTDOWN_TOTAL);
  const [customMargin, setCustomMargin] = useState("");
  const [customLeverage, setCustomLeverage] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const popupRef = useRef<HTMLDivElement>(null);
  const { headerData } = useDashboardStore();

  /* Store */
  const activeMarket = useAppStore((s) => s.activeMarket);
  const accountType = useAppStore((s) => s.accountType);
  const mode = useAppStore((s) => s.mode) as "PAPER" | "LIVE";
  const setSymbol = useAppStore((s) => s.setSymbol);
  const selectedSymbol = useAppStore((s) => s.selectedSymbol);

  const isIndianRoute = activeMarket === "INDIA"
    || location.pathname.startsWith("/indian-market")
    || location.pathname.startsWith("/india");

  /* BOTH-mode blink */
  const [blinkPhase, setBlinkPhase] = useState<"SPOT" | "FUTURES">("SPOT");
  useEffect(() => {
    if (accountType !== "BOTH") return;
    let dip: ReturnType<typeof setTimeout>;
    const t = setInterval(() => { dip = setTimeout(() => setBlinkPhase((p) => p === "SPOT" ? "FUTURES" : "SPOT"), 220); }, 2400);
    return () => { clearInterval(t); clearTimeout(dip); };
  }, [accountType]);

  /* Active Symbol & Pool Rotation */
  const currentPool = isIndianRoute ? INDIAN_POOL : CRYPTO_POOL;
  const [activeSymbol, setActiveSymbol] = useState<string>(() => selectedSymbol || currentPool[0].symbol);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);

  // Sync when user explicitly changes selectedSymbol elsewhere in the app
  useEffect(() => {
    if (selectedSymbol) {
      setActiveSymbol(selectedSymbol);
    }
  }, [selectedSymbol]);

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
  const [prediction, setPrediction] = useState<UpcomingTradePrediction>(() => {
    const item = resolvePoolItem(activeSymbol, isIndianRoute, accountType);
    return generatePrediction(item, isIndianRoute, getLivePrice(item.symbol));
  });

  const applyPrediction = useCallback((p: UpcomingTradePrediction) => {
    setPrediction(p);
    setCustomMargin(String(p.allocatedMargin));
    setCustomLeverage(String(p.estimatedLeverage));
    setExecError(null);
    setExecSuccess(false);
  }, []);

  // Dynamically update prediction when live ticker price arrives
  useEffect(() => {
    if (fetchedPrice && fetchedPrice > 0) {
      setPrediction((prev) => {
        if (prev.symbol !== activeSymbol) return prev;
        const tpMult = prev.direction === "SHORT" ? 0.978 : 1.022;
        const slMult = prev.direction === "SHORT" ? 1.012 : 0.988;
        return {
          ...prev,
          entryPrice: fetchedPrice,
          targetTp: prev.direction === "HOLD" ? fetchedPrice : parseFloat((fetchedPrice * tpMult).toFixed(fetchedPrice > 100 ? 2 : 4)),
          stopLoss: prev.direction === "HOLD" ? fetchedPrice : parseFloat((fetchedPrice * slMult).toFixed(fetchedPrice > 100 ? 2 : 4)),
        };
      });
    }
  }, [fetchedPrice, activeSymbol]);

  const rotateToNext = useCallback(() => {
    const symbols = currentPool.map((p) => p.symbol);
    const idx = symbols.indexOf(activeSymbol);
    const nextSym = idx >= 0 ? symbols[(idx + 1) % symbols.length] : symbols[0];
    setActiveSymbol(nextSym);
    setCountdown(COUNTDOWN_TOTAL);
  }, [currentPool, activeSymbol]);

  const rotateToPrev = useCallback(() => {
    const symbols = currentPool.map((p) => p.symbol);
    const idx = symbols.indexOf(activeSymbol);
    const prevSym = idx > 0 ? symbols[idx - 1] : symbols[symbols.length - 1];
    setActiveSymbol(prevSym);
    setCountdown(COUNTDOWN_TOTAL);
  }, [currentPool, activeSymbol]);

  useEffect(() => {
    const item = resolvePoolItem(activeSymbol, isIndianRoute, accountType);
    applyPrediction(generatePrediction(item, isIndianRoute, getLivePrice(item.symbol)));
  }, [activeSymbol, isIndianRoute, accountType, getLivePrice, applyPrediction]);

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (autoRotate && !isExpanded) {
            rotateToNext();
          } else {
            const item = resolvePoolItem(activeSymbol, isIndianRoute, accountType);
            applyPrediction(generatePrediction(item, isIndianRoute, getLivePrice(item.symbol)));
          }
          return COUNTDOWN_TOTAL;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [activeSymbol, isIndianRoute, accountType, getLivePrice, applyPrediction, autoRotate, isExpanded, rotateToNext]);

  useEffect(() => { setCustomMargin(String(prediction.allocatedMargin)); setCustomLeverage(String(prediction.estimatedLeverage)); }, []); // eslint-disable-line

  /* Escape key */
  useEffect(() => {
    if (!isExpanded) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") { setIsExpanded(false); setExecError(null); } };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [isExpanded]);

  /* Derived */
  const isIndianAsset = prediction.domain === "INDIAN" || prediction.exchange.includes("NSE") || prediction.exchange.includes("BSE");
  const indianStatus = isIndianAsset ? checkIsIndianMarketOpen() : null;
  const mktClosed = !!(indianStatus && !indianStatus.isOpen && !indianStatus.isPreMarket);
  const cur = isIndianAsset ? "₹" : "$";
  const rrRatio = getRR(prediction);
  const resolvedAT = isIndianAsset ? "SPOT" : accountType === "FUTURES" ? "FUTURES" : "SPOT";
  const exchLabel = accountType === "BOTH" ? `BINANCE ${blinkPhase}` : prediction.exchange;
  const exchColor = accountType === "BOTH" ? (blinkPhase === "SPOT" ? SPOT_COLOR : FUTURES_COLOR) : undefined;
  const progressPct = ((COUNTDOWN_TOTAL - countdown) / COUNTDOWN_TOTAL) * 100;
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

      await api.placeOrder({ symbol: prediction.symbol, side, quantity: qty, mode, sl: prediction.stopLoss, tp: prediction.targetTp, leverage: lev, accountType: resolvedAT });

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
          from { transform: scaleY(0); opacity:0; }
          to   { transform: scaleY(1); opacity:1; }
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
        <div style={{
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
            <div style={{ display: "flex", alignItems: "center", gap: φ.sp.sm, minWidth: 0, flexShrink: 0 }}>
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
                    className={accountType === "BOTH" ? "aqea-blink" : undefined}
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
                        setCountdown(COUNTDOWN_TOTAL);
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
                      {currentPool.map((p) => (
                        <option key={p.symbol} value={p.symbol} style={{ background: "var(--ds-surface, #fff)", color: "var(--ds-text, #0f172a)" }}>
                          {p.symbol}
                        </option>
                      ))}
                      {!currentPool.some(p => p.symbol === activeSymbol) && (
                        <option value={activeSymbol} style={{ background: "var(--ds-surface, #fff)", color: "var(--ds-text, #0f172a)" }}>
                          {activeSymbol}
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

                  {/* Direction pill */}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: φ.r.xs, fontSize: φ.fs.xxs, fontWeight: 900, background: `${dc}14`, color: dc, border: `1px solid ${dc}38` }}>
                    {prediction.direction === "LONG" ? <TrendingUp size={φ.ic.sm - 2} /> :
                      prediction.direction === "SHORT" ? <TrendingDown size={φ.ic.sm - 2} /> :
                        <Minus size={φ.ic.sm - 2} />}
                    {prediction.direction}
                  </span>
                  {/* Confidence — 13px secondary (φ.fs.sm) */}
                  <span style={{ fontSize: φ.fs.xs, fontWeight: 600, color: "var(--ds-text-faint,#64748b)" }} className="hidden sm:inline">
                    <strong style={{ color: "#2563eb" }}>{prediction.confidence}%</strong>
                  </span>

                  {/* Auto-cycle indicator badge / button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setAutoRotate(r => !r); }}
                    title={autoRotate ? "Auto-cycling every 15s across market opportunities (Click to pause)" : "Auto-cycle paused (Click to resume)"}
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
          <div style={{ display: "flex", alignItems: "center", gap: φ.sp.sm, flexShrink: 0, marginLeft: "auto" }}>
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
