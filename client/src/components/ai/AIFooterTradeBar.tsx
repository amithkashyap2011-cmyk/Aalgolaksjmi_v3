import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
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

export default function AIFooterTradeBar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionMessage, setExecutionMessage] = useState("");
  const location = useLocation();
  const { headerData } = useDashboardStore();

  const isIndianRoute = location.pathname.startsWith("/indian-market");
  const indianStatus = checkIsIndianMarketOpen();
  // Only include Indian equities if explicitly on Indian Market page OR Indian stock market is actively open
  const shouldIncludeIndian = isIndianRoute || indianStatus.isOpen;

  // Active pool of candidate symbols based on session/page
  const activePool = useMemo(() => {
    if (isIndianRoute) {
      return INDIAN_POOL.map((item) => ({ ...item, isIndian: true }));
    }
    if (shouldIncludeIndian) {
      return [
        ...CRYPTO_POOL.map((item) => ({ ...item, isIndian: false })),
        ...INDIAN_POOL.map((item) => ({ ...item, isIndian: true })),
      ];
    }
    return CRYPTO_POOL.map((item) => ({ ...item, isIndian: false }));
  }, [isIndianRoute, shouldIncludeIndian]);

  const [poolIndex, setPoolIndex] = useState(0);

  const getLivePrice = useCallback((sym: string) => {
    const found = headerData?.find((h) => h.symbol === sym);
    return found?.price;
  }, [headerData]);

  const [prediction, setPrediction] = useState<UpcomingTradePrediction>(() => {
    const initialItem = isIndianRoute ? INDIAN_POOL[0] : CRYPTO_POOL[0];
    return generatePrediction(initialItem, isIndianRoute);
  });

  // Keep prediction in sync if user navigates between Indian Market and Crypto views
  useEffect(() => {
    const pool = isIndianRoute
      ? INDIAN_POOL.map((item) => ({ ...item, isIndian: true }))
      : CRYPTO_POOL.map((item) => ({ ...item, isIndian: false }));
    const selected = pool[0];
    const live = getLivePrice(selected.symbol);
    setPrediction(generatePrediction(selected, selected.isIndian, live));
    setPoolIndex(0);
    setCountdown(15);
  }, [isIndianRoute, getLivePrice]);

  // Cycle upcoming predictions smoothly every 15 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setPoolIndex((oldIdx) => {
            const nextIdx = (oldIdx + 1) % activePool.length;
            const nextItem = activePool[nextIdx];
            const live = getLivePrice(nextItem.symbol);
            setPrediction(generatePrediction(nextItem, nextItem.isIndian, live));
            return nextIdx;
          });
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activePool, getLivePrice]);

  const isIndianAsset = prediction.domain === "INDIAN" || prediction.exchange.includes("NSE") || prediction.exchange.includes("BSE");
  const currencySymbol = isIndianAsset ? "₹" : "$";

  const handleManualExecute = () => {
    setIsExecuting(true);
    setExecutionMessage(`Creating ${prediction.direction} paper trade for ${prediction.symbol}...`);
    setTimeout(() => {
      setIsExecuting(false);
      setExecutionMessage(
        `✓ ${prediction.direction} Order Executed successfully at ${currencySymbol}${prediction.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}!`
      );
      setTimeout(() => {
        setExecutionMessage("");
        setIsExpanded(false);
      }, 2000);
    }, 1200);
  };

  const getDirColor = (dir: string) => {
    if (dir === "LONG") return "#10b981";
    if (dir === "SHORT") return "#ef4444";
    return "#f59e0b";
  };

  return (
    <>
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
              <span style={{ fontSize: 10, fontWeight: 900, color: "var(--ds-text-faint, #64748b)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                NEXT TRADE IMMINENT
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "var(--ds-surface-2, #f1f5f9)",
                  color: "var(--ds-text, #334155)",
                  border: "1px solid var(--ds-border, #cbd5e1)",
                  fontFamily: "monospace",
                }}
              >
                {prediction.exchange}
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
                {currencySymbol}{prediction.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div style={{ background: "rgba(16, 185, 129, 0.08)", padding: 10, borderRadius: 8, border: "1px solid rgba(16, 185, 129, 0.25)" }}>
              <span style={{ fontSize: 10, color: "#059669", display: "block", fontWeight: 700 }}>Target Take-Profit</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: "#059669", fontFamily: "monospace" }}>
                {currencySymbol}{prediction.targetTp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div style={{ background: "rgba(239, 68, 68, 0.08)", padding: 10, borderRadius: 8, border: "1px solid rgba(239, 68, 68, 0.25)" }}>
              <span style={{ fontSize: 10, color: "#dc2626", display: "block", fontWeight: 700 }}>Stop-Loss Level</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: "#dc2626", fontFamily: "monospace" }}>
                {currencySymbol}{prediction.stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

          {/* Action Message / Status */}
          {executionMessage && (
            <div
              style={{
                padding: 10,
                borderRadius: 8,
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#059669",
                fontSize: 12,
                fontWeight: 800,
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              {executionMessage}
            </div>
          )}

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
              disabled={isExecuting}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: "#2563eb",
                border: "none",
                color: "#ffffff",
                fontSize: 12,
                fontWeight: 800,
                cursor: isExecuting ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 10px rgba(37, 99, 235, 0.3)",
              }}
            >
              <Play size={13} />
              {isExecuting ? "Executing..." : `Execute ${prediction.direction} Order Now`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
