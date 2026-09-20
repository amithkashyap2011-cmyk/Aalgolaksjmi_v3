import { useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

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

let _socket: Socket | null = null;
function getSocket(): Socket {
  if (!_socket) {
    _socket = io(import.meta.env.VITE_API_URL || "");
  }
  return _socket;
}

export default function TradeToast() {
  const [toasts, setToasts] = useState<TradeEvent[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const handler = (data: Omit<TradeEvent, "id">) => {
      const id = `${Date.now()}-${Math.random()}`;
      const toast: TradeEvent = { ...data, id };
      setToasts((prev) => [toast, ...prev].slice(0, 5));
      setTimeout(() => dismiss(id), 10000);
    };

    socket.on("TRADE_OPENED", handler);
    return () => { socket.off("TRADE_OPENED", handler); };
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      zIndex: 9999,
      display: "flex",
      flexDirection: "column-reverse",
      gap: 10,
      pointerEvents: "none",
    }}>
      <style>{`
        @keyframes tradeSlideIn {
          from { opacity: 0; transform: translateX(120px) scale(0.92); }
          to   { opacity: 1; transform: translateX(0)    scale(1); }
        }
        @keyframes tradeProgress {
          from { width: 100%; }
          to   { width: 0%; }
        }
        .trade-toast { animation: tradeSlideIn 0.35s cubic-bezier(0.22,1,0.36,1) both; }
        .trade-progress { animation: tradeProgress 10s linear forwards; }
      `}</style>

      {toasts.map((t) => {
        const isBuy   = t.side === "BUY";
        const accent  = isBuy ? "#10b981" : "#ef4444";
        const bgAccent = isBuy ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)";
        const arrow   = isBuy ? "▲" : "▼";
        const label   = isBuy ? "LONG" : "SHORT";
        const confTag = t.confidence != null
          ? `${(t.confidence * 100).toFixed(0)}% confidence`
          : null;

        return (
          <div
            key={t.id}
            className="trade-toast"
            style={{
              pointerEvents: "all",
              width: 320,
              background: "linear-gradient(135deg, #0d1527 0%, #131c31 100%)",
              border: `1px solid ${accent}55`,
              borderLeft: `3px solid ${accent}`,
              borderRadius: 10,
              overflow: "hidden",
              boxShadow: `0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)`,
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 12px 8px",
              background: bgAccent,
              borderBottom: `1px solid ${accent}22`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20, lineHeight: 1, filter: `drop-shadow(0 0 6px ${accent})` }}>
                  {arrow}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: accent, letterSpacing: "0.05em" }}>
                    {label} ORDER PLACED
                  </div>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.04em" }}>
                    {t.mode} · {t.accountType}
                  </div>
                </div>
              </div>
              <button
                onClick={() => dismiss(t.id)}
                style={{
                  background: "none", border: "none", color: "#475569",
                  cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 2px",
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#94a3b8"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#475569"; }}
                title="Dismiss"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              {/* Symbol + price */}
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: "#f8fafc", letterSpacing: "0.03em" }}>
                  {t.symbol}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>
                  ${t.entryPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </span>
              </div>

              {/* Tag pills */}
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {[
                  { label: "QTY",  value: t.quantity.toFixed(4) },
                  { label: "LEV",  value: `${t.leverage}×` },
                  t.sl != null ? { label: "SL", value: `$${t.sl.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` } : null,
                  t.tp != null ? { label: "TP", value: `$${t.tp.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` } : null,
                ].filter(Boolean).map((item) => (
                  <span key={item!.label} style={{
                    background: "rgba(255,255,255,0.05)", borderRadius: 5,
                    padding: "2px 7px", fontSize: 10, fontWeight: 700,
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}>
                    <span style={{ color: "#64748b" }}>{item!.label} </span>
                    <span style={{ color: "#cbd5e1" }}>{item!.value}</span>
                  </span>
                ))}
              </div>

              {/* Confidence + regime */}
              {(confTag || t.regime) && (
                <div style={{ fontSize: 10, color: "#64748b", display: "flex", gap: 10 }}>
                  {confTag && <span>🤖 {confTag}</span>}
                  {t.regime && <span>📊 {t.regime}</span>}
                </div>
              )}
            </div>

            {/* 10s progress bar */}
            <div style={{ height: 2, background: "rgba(255,255,255,0.06)" }}>
              <div
                className="trade-progress"
                style={{ height: "100%", background: accent, borderRadius: 2 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
