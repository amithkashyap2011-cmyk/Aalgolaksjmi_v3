/**
 * TradeNotificationPopup
 * ─────────────────────
 * Fires on TRADE_OPENED socket events (direct from autoTradeEngine).
 * Shows symbol, side, price, qty, leverage, SL/TP, AI confidence.
 * Auto-dismisses after 10 s with an animated progress bar.
 * Stacks up to 5 concurrent notifications. Manual × dismiss.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

const DURATION_MS = 10000;

let _socket: Socket | null = null;
function getSocket(): Socket {
  if (!_socket) _socket = io(import.meta.env.VITE_API_URL || "");
  return _socket;
}

interface TradeEvent {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  leverage: number;
  accountType: string;
  sl?: number;
  tp?: number;
  confidence?: number;
  regime?: string;
  mode: string;
  timestamp: string;
}

function formatSymbol(sym: string) {
  const m = sym.match(/^([A-Z0-9]{2,6})(USDT|BUSD|BTC|ETH|BNB|INR)$/i);
  return m
    ? { base: m[1].toUpperCase(), quote: m[2].toUpperCase() }
    : { base: sym, quote: "" };
}

export default function TradeNotificationPopup() {
  const [toasts, setToasts] = useState<TradeEvent[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const handler = (data: Omit<TradeEvent, "id">) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [{ ...data, id }, ...prev].slice(0, 5));
    };
    socket.on("TRADE_OPENED", handler);
    return () => { socket.off("TRADE_OPENED", handler); };
  }, []);

  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        top: 68,
        right: 16,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t, i) => (
        <ToastCard
          key={t.id}
          toast={t}
          stackIndex={i}
          onDismiss={() => dismiss(t.id)}
        />
      ))}
    </div>
  );
}

function ToastCard({
  toast: t,
  stackIndex,
  onDismiss,
}: {
  toast: TradeEvent;
  stackIndex: number;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const dismissed = useRef(false);

  const isBuy   = t.side === "BUY";
  const accent   = isBuy ? "#22c55e" : "#f59e0b";
  const accentBg = isBuy ? "rgba(34,197,94,0.11)" : "rgba(245,158,11,0.11)";
  const accentBd = isBuy ? "rgba(34,197,94,0.30)" : "rgba(245,158,11,0.30)";
  const { base, quote } = formatSymbol(t.symbol);
  const confPct = t.confidence != null ? `${(t.confidence * 100).toFixed(0)}%` : null;

  // Slide in
  useEffect(() => {
    const tid = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(tid);
  }, []);

  // Countdown + auto-dismiss
  useEffect(() => {
    const tick = (now: number) => {
      if (!startRef.current) startRef.current = now;
      const elapsed = now - startRef.current;
      const pct = Math.max(0, 100 - (elapsed / DURATION_MS) * 100);
      setProgress(pct);
      if (pct > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else if (!dismissed.current) {
        dismissed.current = true;
        setVisible(false);
        setTimeout(onDismiss, 300);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [onDismiss]);

  const handleDismiss = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

  return (
    <div style={{
      pointerEvents: "auto",
      width: 308,
      borderRadius: 13,
      background: "linear-gradient(135deg, #0f172a 55%, #1a2540)",
      border: `1px solid ${accentBd}`,
      borderTop: `2px solid ${accent}`,
      boxShadow: `0 12px 40px rgba(0,0,0,0.65), 0 0 0 1px ${accentBd} inset`,
      overflow: "hidden",
      transform: visible ? "translateX(0) scale(1)" : "translateX(115%) scale(0.94)",
      opacity: visible ? 1 : 0,
      transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease",
      marginTop: stackIndex > 0 ? -6 : 0,
      filter: stackIndex > 0 ? `brightness(${1 - stackIndex * 0.07})` : "none",
    }}>
      {/* Body */}
      <div style={{ padding: "11px 13px 9px" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
          {/* Pulse icon */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <style>{`
              @keyframes tradeRing {
                0%   { opacity: 0.9; transform: scale(1); }
                100% { opacity: 0;   transform: scale(1.9); }
              }
            `}</style>
            <div style={{
              position: "absolute", inset: -5, borderRadius: "50%",
              border: `2px solid ${accent}`,
              animation: "tradeRing 1.5s ease-out forwards",
            }} />
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: accentBg, border: `1.5px solid ${accentBd}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 900, color: accent,
            }}>
              {isBuy ? "↑" : "↓"}
            </div>
          </div>

          {/* Symbol + side badge */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.01em" }}>
                {base}
              </span>
              {quote && (
                <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>/{quote}</span>
              )}
              <span style={{
                marginLeft: 3, fontSize: 9, fontWeight: 800, letterSpacing: "0.07em",
                padding: "1px 6px", borderRadius: 4,
                background: accentBg, color: accent, border: `1px solid ${accentBd}`,
              }}>
                {t.side}
              </span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: "0.06em", marginTop: 1 }}>
              ORDER FILLED · {t.mode}
            </div>
          </div>

          {/* × dismiss */}
          <button
            onClick={handleDismiss}
            style={{
              background: "none", border: "none", color: "#475569",
              cursor: "pointer", fontSize: 16, lineHeight: 1,
              padding: "0 2px", flexShrink: 0, transition: "color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#94a3b8"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#475569"; }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>

        {/* Price row */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "rgba(255,255,255,0.03)", borderRadius: 7, padding: "5px 9px",
          marginBottom: 6, border: "1px solid rgba(255,255,255,0.05)",
        }}>
          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Entry Price</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9", fontFamily: "monospace" }}>
            ${t.entryPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </span>
        </div>

        {/* Pills */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {[
            { k: "QTY",  v: t.quantity.toFixed(4) },
            { k: "LEV",  v: `${t.leverage}×` },
            { k: "ACCT", v: t.accountType },
            t.sl != null ? { k: "SL", v: `$${t.sl.toLocaleString("en-US", { maximumFractionDigits: 2 })}` } : null,
            t.tp != null ? { k: "TP", v: `$${t.tp.toLocaleString("en-US", { maximumFractionDigits: 2 })}` } : null,
          ].filter(Boolean).map((item) => (
            <span key={item!.k} style={{
              fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)",
            }}>
              <span style={{ color: "#475569" }}>{item!.k} </span>
              <span style={{ color: "#cbd5e1" }}>{item!.v}</span>
            </span>
          ))}
        </div>

        {/* AI row */}
        {(confPct || t.regime) && (
          <div style={{ marginTop: 5, fontSize: 10, color: "#475569", display: "flex", gap: 10 }}>
            {confPct && <span>🤖 AI {confPct} conf</span>}
            {t.regime && <span>📊 {t.regime}</span>}
          </div>
        )}
      </div>

      {/* Countdown progress bar */}
      <div style={{ height: 3, background: "rgba(255,255,255,0.05)" }}>
        <div style={{
          height: "100%", width: `${progress}%`,
          background: `linear-gradient(90deg, ${accent}, ${accent}99)`,
          transition: "width 0.08s linear",
          borderRadius: 2,
        }} />
      </div>
    </div>
  );
}
