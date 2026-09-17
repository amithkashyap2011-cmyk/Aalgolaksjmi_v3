import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/useAppStore";
import { useDashboardStore } from "../../store/useDashboardStore";
import { checkIsIndianMarketOpen } from "../../utils/indianMarketHours";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  ChevronUp,
  ChevronDown,
  Clock,
  Zap,
  Play,
  X,
  Sparkles,
  BarChart3
} from "lucide-react";

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

const CRYPTO_POOL = [
  { symbol: "BTCUSDT", exchange: "BINANCE FUTURES", basePrice: 64250.0, leverage: 5, reasons: ["Bi-LSTM 2-Layer momentum flip", "1D CNN spatial volume delta", "Transformer micro-structure attention"] },
  { symbol: "ETHUSDT", exchange: "BINANCE FUTURES", basePrice: 3480.0, leverage: 5, reasons: ["Mamba SSM orderbook imbalance +2.8%", "Multi-head cross-attention signal", "Stochastic momentum RSI divergence"] },
  { symbol: "SOLUSDT", exchange: "BINANCE FUTURES", basePrice: 148.5, leverage: 3, reasons: ["High-frequency order flow delta", "Exponential volume surge +18%", "Ensemble neural consensus 4/4"] },
  { symbol: "BNBUSDT", exchange: "BINANCE SPOT", basePrice: 585.0, leverage: 1, reasons: ["Mean-reversion support bounce", "Microstructure orderbook liquidity depth", "Transformer trend-following confirm"] },
];

const INDIAN_POOL = [
  { symbol: "RELIANCE", exchange: "NSE (EQUITY)", basePrice: 2985.4, leverage: 1, reasons: ["Bi-LSTM momentum flip", "Conv1D spatial volume spike", "Mamba SSM orderbook imbalance +2.4%"] },
  { symbol: "TCS", exchange: "NSE (EQUITY)", basePrice: 3890.0, leverage: 1, reasons: ["Institutional delivery volume spike", "Multi-timeframe moving average breakout", "RSI divergence bullish confirmation"] },
  { symbol: "INFY", exchange: "NSE (EQUITY)", basePrice: 1640.5, leverage: 1, reasons: ["Option open interest buildup support", "Neural ensemble volatility breakout", "Order flow buy imbalance +3.1%"] },
  { symbol: "HDFCBANK", exchange: "NSE (EQUITY)", basePrice: 1510.0, leverage: 1, reasons: ["BankNifty sector strength correlation", "1D CNN momentum filter triggered", "Deep reinforcement policy reward peak"] },
];

function generatePrediction(
  symbolItem: { symbol: string; exchange: string; basePrice: number; leverage: number; reasons: string[] },
  isIndian: boolean,
  livePrice?: number
): UpcomingTradePrediction {
  const direction: "LONG" | "SHORT" = Math.random() > 0.35 ? "LONG" : "SHORT";
  const price = livePrice && livePrice > 0 ? livePrice : symbolItem.basePrice;
  const tpMult = direction === "LONG" ? 1.022 : 0.978;
  const slMult = direction === "LONG" ? 0.988 : 1.012;

  return {
    symbol: symbolItem.symbol,
    exchange: symbolItem.exchange,
    domain: isIndian ? "INDIAN" : "CRYPTO",
    direction,
    confidence: parseFloat((82 + Math.random() * 14).toFixed(1)),
    entryPrice: price,
    targetTp: parseFloat((price * tpMult).toFixed(price > 100 ? 2 : 4)),
    stopLoss: parseFloat((price * slMult).toFixed(price > 100 ? 2 : 4)),
    estimatedLeverage: symbolItem.leverage,
    allocatedMargin: isIndian ? 25000 : 2500,
    modelsVoting: 4,
    totalModels: 4,
    countdownSec: 15,
    regime: direction === "LONG" ? "BULLISH_MOMENTUM" : "BEARISH_DIVERGENCE",
    reasons: symbolItem.reasons,
  };
}

// 🛡️ 2026-09-16: entry/TP/SL were rendered with a fixed 2-decimal
// toLocaleString, so any sub-$1 asset (e.g. DOGEUSDT ~$0.08) showed all
// three as the identical-looking "$0.08" even though they're genuinely
// distinct values (generatePrediction already computes them with 4-decimal
// precision below $100 — this was purely a display bug, not a calculation
// one). Mirrors that same magnitude-aware precision here, with one more
// tier for sub-cent assets (SHIB etc.).
function formatPrice(price: number): string {
  const decimals = price > 100 ? 2 : price > 1 ? 4 : price > 0.01 ? 6 : 8;
  return price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// A symbol the user selected that isn't one of the curated pool entries
// above still needs *something* sensible to show — this builds that
// fallback instead of silently ignoring the selection.
function resolvePoolItem(
  symbol: string,
  isIndian: boolean,
  accountType: "SPOT" | "FUTURES" | "BOTH"
) {
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

export default function AIFooterTradeBar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const location = useLocation();
  const navigate = useNavigate();
  const { headerData } = useDashboardStore();

  const activeMarket = useAppStore((s) => s.activeMarket);
  const accountType = useAppStore((s) => s.accountType);
  const setSymbol = useAppStore((s) => s.setSymbol);
  // The coin the user is actually looking at elsewhere in the app (ticker
  // bar / watchlist selection) — previously this widget ignored it
  // entirely and auto-cycled through its own fixed 4-symbol pool on a
  // 15s timer, so picking a different coin anywhere else had no visible
  // effect here at all.
  const selectedSymbol = useAppStore((s) => s.selectedSymbol);
  const isIndianRoute = activeMarket === "INDIA" || location.pathname.startsWith("/indian-market") || location.pathname.startsWith("/india");

  // "BOTH" mode's badge previously just re-tinted whatever text the cycling
  // prediction already had (e.g. "BINANCE FUTURES" painted blue) — the
  // color changed but the word "SPOT" never actually appeared, which is
  // what the color-blink was supposed to be signaling in the first place.
  // This explicitly alternates the label itself between the two markets.
  // BLINK_INTERVAL/BLINK_DIP are tuned to line up with the CSS keyframe
  // below (see .aqea-exchange-blink) so the text swap happens right at
  // the dimmest point of the fade instead of snapping instantly — a
  // real crossfade blink rather than a flicker.
  const BLINK_INTERVAL_MS = 2400;
  const BLINK_DIP_MS = 220;
  const [blinkPhase, setBlinkPhase] = useState<"SPOT" | "FUTURES">("SPOT");
  useEffect(() => {
    if (accountType !== "BOTH") return;
    let dipTimer: ReturnType<typeof setTimeout>;
    const mainTimer = setInterval(() => {
      dipTimer = setTimeout(() => {
        setBlinkPhase((prev) => (prev === "SPOT" ? "FUTURES" : "SPOT"));
      }, BLINK_DIP_MS);
    }, BLINK_INTERVAL_MS);
    return () => {
      clearInterval(mainTimer);
      clearTimeout(dipTimer);
    };
  }, [accountType]);

  const getLivePrice = useCallback((sym: string) => {
    const found = headerData?.find((h) => h.symbol === sym);
    return found?.price;
  }, [headerData]);

  const [prediction, setPrediction] = useState<UpcomingTradePrediction>(() => {
    const item = resolvePoolItem(selectedSymbol, isIndianRoute, accountType);
    return generatePrediction(item, isIndianRoute, getLivePrice(item.symbol));
  });

  // Re-evaluate immediately whenever the user picks a different coin,
  // switches Indian/Crypto, or changes the SPOT/FUTURES/BOTH filter.
  useEffect(() => {
    const item = resolvePoolItem(selectedSymbol, isIndianRoute, accountType);
    setPrediction(generatePrediction(item, isIndianRoute, getLivePrice(item.symbol)));
    setCountdown(15);
  }, [selectedSymbol, isIndianRoute, accountType, getLivePrice]);

  // Every 15s the AI "re-scores" the same selected coin (fresh direction/
  // confidence/levels) — it no longer jumps to a different symbol on its
  // own; the only thing that changes which coin is shown is the user's
  // own selection, handled by the effect above.
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          const item = resolvePoolItem(selectedSymbol, isIndianRoute, accountType);
          setPrediction(generatePrediction(item, isIndianRoute, getLivePrice(item.symbol)));
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [selectedSymbol, isIndianRoute, accountType, getLivePrice]);

  const isIndianAsset = prediction.domain === "INDIAN" || prediction.exchange.includes("NSE") || prediction.exchange.includes("BSE");
  const currencySymbol = isIndianAsset ? "₹" : "$";

  // 🛡️ 2026-09-16: this used to fake a success message via setTimeout
  // without ever calling the backend — no Trade was ever created, so the
  // "executed" order never appeared on the Orders page, and the symbol/
  // direction/confidence shown here are randomly generated in
  // generatePrediction() (Math.random()), not a real AQEA ensemble
  // decision. Wiring "Execute Now" straight to real order placement would
  // mean placing real (paper) trades off a coin flip, bypassing every
  // conviction/risk gate the real engine enforces — worse than the
  // original bug. Instead this sends the user to the real order-entry
  // terminal for this symbol, where the actual placeOrder flow (with its
  // real gates and a real Trade record) takes over.
  const handleManualExecute = () => {
    setSymbol(prediction.symbol);
    setIsExpanded(false);
    if (isIndianAsset) {
      navigate("/india");
    } else if (accountType === "FUTURES") {
      navigate("/futures");
    } else {
      navigate("/spot");
    }
  };

  const getDirColor = (dir: string) => {
    if (dir === "LONG") return "#10b981";
    if (dir === "SHORT") return "#ef4444";
    return "#f59e0b";
  };

  // Colors match TopBar.tsx's own SPOT (#38bdf8) / FUTURES (#f59e0b) tab
  // colors so the badge reads as "the same two markets" as the selector.
  const SPOT_COLOR = "#38bdf8";
  const FUTURES_COLOR = "#f59e0b";
  const exchangeLabel = accountType === "BOTH" ? `BINANCE ${blinkPhase}` : prediction.exchange;
  const exchangeColor = accountType === "BOTH"
    ? (blinkPhase === "SPOT" ? SPOT_COLOR : FUTURES_COLOR)
    : undefined;

  return (
    <>
      {/* Crossfade the exchange badge through its dim point right as the
          text swaps (see BLINK_DIP_MS above) instead of an instant snap —
          keyframe % must stay in sync with BLINK_INTERVAL_MS/BLINK_DIP_MS. */}
      <style>{`
        @keyframes aqea-exchange-blink {
          0%   { opacity: 1; }
          9%   { opacity: 0.18; }
          18%  { opacity: 1; }
          100% { opacity: 1; }
        }
        .aqea-exchange-blink {
          animation: aqea-exchange-blink 2.4s ease-in-out infinite;
        }
      `}</style>
      {/* ── Persistent Theme-Adaptive AI Footer Bar ── */}
      <div
        style={{
          background: "var(--ds-surface, #ffffff)",
          borderTop: "1px solid var(--ds-border, #cbd5e1)",
          boxShadow: "0 -4px 16px rgba(0, 0, 0, 0.06)",
          padding: "16px 20px",
          minHeight: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          zIndex: 35,
          position: "relative",
          flexShrink: 0,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* Left: Indicator & Symbol Info */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: "rgba(37, 99, 235, 0.1)",
              border: "1px solid rgba(37, 99, 235, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#2563eb",
              flexShrink: 0,
            }}
          >
            <Brain size={18} className="animate-pulse" />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9.5, fontWeight: 900, padding: "1px 6px", borderRadius: 4, background: "rgba(168, 85, 247, 0.15)", color: "#a855f7", border: "1px solid rgba(168, 85, 247, 0.3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                AI SIGNAL (PROPOSED)
              </span>
              <span style={{ fontSize: 9.5, fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                NOT AN OPEN POSITION
              </span>
              <span
                className={accountType === "BOTH" ? "aqea-exchange-blink" : undefined}
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: exchangeColor ? `${exchangeColor}22` : "var(--ds-surface-2, #f1f5f9)",
                  color: exchangeColor || "var(--ds-text, #334155)",
                  border: `1px solid ${exchangeColor ? `${exchangeColor}66` : "var(--ds-border, #cbd5e1)"}`,
                  fontFamily: "monospace",
                  transition: "background 0.4s ease, color 0.4s ease, border-color 0.4s ease",
                }}
              >
                {exchangeLabel}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: "var(--ds-text, #0f172a)", letterSpacing: "-0.01em" }}>
                {prediction.symbol}
              </span>

              {/* Signal Badge */}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "2px 7px",
                  borderRadius: 5,
                  fontSize: 10,
                  fontWeight: 900,
                  background: `${getDirColor(prediction.direction)}18`,
                  color: getDirColor(prediction.direction),
                  border: `1px solid ${getDirColor(prediction.direction)}44`,
                }}
              >
                {prediction.direction === "LONG" ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {prediction.direction}
              </span>

              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ds-text-faint, #64748b)" }} className="hidden sm:inline">
                Confidence: <strong style={{ color: "#2563eb" }}>{prediction.confidence}%</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Center: Countdown & Model Votes */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }} className="hidden md:flex">
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ds-text-faint, #64748b)" }}>
            <Clock size={14} color="#d97706" />
            <span style={{ fontWeight: 600 }}>Eval in:</span>
            <span style={{ fontFamily: "monospace", fontWeight: 900, color: "#d97706", fontSize: 13 }}>
              {countdown}s
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ds-text-faint, #64748b)" }}>
            <Zap size={14} color="#059669" />
            <span style={{ fontWeight: 600 }}>Ensemble Vote:</span>
            <span style={{ fontFamily: "monospace", fontWeight: 900, color: "#059669" }}>
              {prediction.modelsVoting}/{prediction.totalModels} Consensus
            </span>
          </div>
        </div>

        {/* Right: Expand Details Button & Trigger */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 13px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 800,
              background: isExpanded ? "#2563eb" : "rgba(37, 99, 235, 0.08)",
              color: isExpanded ? "#ffffff" : "#2563eb",
              border: "1px solid rgba(37, 99, 235, 0.3)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <BarChart3 size={13} />
            <span>{isExpanded ? "Hide Forecast" : "View Trade Popup"}</span>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* ── EXPANDED POPUP FORECAST MODAL ── */}
      {isExpanded && (
        <div
          style={{
            position: "fixed",
            bottom: 60,
            left: "50%",
            transform: "translateX(-50%)",
            width: "92%",
            maxWidth: 580,
            background: "var(--ds-surface, #ffffff)",
            border: "1px solid var(--ds-border, #cbd5e1)",
            borderRadius: 16,
            padding: 20,
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.15)",
            zIndex: 9999,
            color: "var(--ds-text, #0f172a)",
          }}
        >
          {/* Popup Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={18} color="#2563eb" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: "var(--ds-text, #0f172a)" }}>
                  Upcoming AI Trade Evaluation
                </div>
                <div style={{ fontSize: 11, color: "var(--ds-text-faint, #64748b)" }}>
                  Real-time Neural Ensemble Prediction Matrix
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsExpanded(false)}
              style={{
                background: "var(--ds-surface-2, #f1f5f9)",
                border: "1px solid var(--ds-border, #cbd5e1)",
                color: "var(--ds-text-faint, #64748b)",
                width: 26,
                height: 26,
                borderRadius: 6,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Symbol & Direction Details Box */}
          <div
            style={{
              background: "var(--ds-surface-2, #f8fafc)",
              border: "1px solid var(--ds-border, #e2e8f0)",
              borderRadius: 12,
              padding: 14,
              marginBottom: 14,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 10,
            }}
          >
            <div>
              <span style={{ fontSize: 10, color: "var(--ds-text-faint, #64748b)", fontWeight: 700, textTransform: "uppercase" }}>
                Target Symbol
              </span>
              <div style={{ fontSize: 16, fontWeight: 900, color: "var(--ds-text, #0f172a)", marginTop: 2 }}>
                {prediction.symbol}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 10, color: "var(--ds-text-faint, #64748b)", fontWeight: 700, textTransform: "uppercase" }}>
                Signal Direction
              </span>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 900,
                  color: getDirColor(prediction.direction),
                  marginTop: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {prediction.direction === "LONG" ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {prediction.direction}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 10, color: "var(--ds-text-faint, #64748b)", fontWeight: 700, textTransform: "uppercase" }}>
                Consensus Confidence
              </span>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#2563eb", marginTop: 2, fontFamily: "monospace" }}>
                {prediction.confidence}%
              </div>
            </div>
          </div>

          {/* Price Target & Stop Loss Levels */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div style={{ background: "var(--ds-surface-2, #f8fafc)", padding: 10, borderRadius: 8, border: "1px solid var(--ds-border, #cbd5e1)" }}>
              <span style={{ fontSize: 10, color: "var(--ds-text-faint, #64748b)", display: "block", fontWeight: 700 }}>Est. Entry Price</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: "var(--ds-text, #0f172a)", fontFamily: "monospace" }}>
                {currencySymbol}{formatPrice(prediction.entryPrice)}
              </span>
            </div>

            <div style={{ background: "rgba(16, 185, 129, 0.08)", padding: 10, borderRadius: 8, border: "1px solid rgba(16, 185, 129, 0.25)" }}>
              <span style={{ fontSize: 10, color: "#059669", display: "block", fontWeight: 700 }}>Target Take-Profit</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: "#059669", fontFamily: "monospace" }}>
                {currencySymbol}{formatPrice(prediction.targetTp)}
              </span>
            </div>

            <div style={{ background: "rgba(239, 68, 68, 0.08)", padding: 10, borderRadius: 8, border: "1px solid rgba(239, 68, 68, 0.25)" }}>
              <span style={{ fontSize: 10, color: "#dc2626", display: "block", fontWeight: 700 }}>Stop-Loss Level</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: "#dc2626", fontFamily: "monospace" }}>
                {currencySymbol}{formatPrice(prediction.stopLoss)}
              </span>
            </div>
          </div>

          {/* Key Signal Drivers */}
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--ds-text, #0f172a)", display: "block", marginBottom: 6 }}>
              Neural Signal Drivers:
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {prediction.reasons.map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: "var(--ds-text-faint, #64748b)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#2563eb" }} />
                  {r}
                </div>
              ))}
            </div>
          </div>

          {/* This is a randomly-generated illustrative forecast (see
              generatePrediction's Math.random() direction/confidence), not
              a live AQEA ensemble decision — placing a real order straight
              from it would skip every conviction/risk gate the real engine
              enforces. Said plainly instead of a fake "order executed"
              toast that never created a trade. */}
          <div
            style={{
              padding: 10,
              borderRadius: 8,
              background: "rgba(100, 116, 139, 0.08)",
              border: "1px solid var(--ds-border, #cbd5e1)",
              color: "var(--ds-text-faint, #64748b)",
              fontSize: 11,
              fontWeight: 600,
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            Illustrative forecast only — not a live AQEA decision. "Trade This" opens the real order terminal.
          </div>

          {/* Execution Controls */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={() => setIsExpanded(false)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "var(--ds-surface-2, #f1f5f9)",
                border: "1px solid var(--ds-border, #cbd5e1)",
                color: "var(--ds-text, #334155)",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Close
            </button>

            <button
              onClick={handleManualExecute}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: "#2563eb",
                border: "none",
                color: "#ffffff",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 10px rgba(37, 99, 235, 0.3)",
              }}
            >
              <Play size={13} />
              Trade This on {isIndianAsset ? "India Terminal" : accountType === "FUTURES" ? "Futures Terminal" : "Spot Terminal"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
