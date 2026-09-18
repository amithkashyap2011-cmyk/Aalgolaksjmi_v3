/**
 * TradeNotificationPopup
 * ─────────────────────
 * A premium, auto-dismissing popup that fires whenever a trade alert
 * is added to the store (any alert with isTrade = true).
 *
 * Features
 *  • Slides in from the top-right with a spring animation
 *  • Shows symbol, side (BUY/SELL), status (FILLED / FAILED), price & time
 *  • Animated countdown progress bar — dismisses after 5 s
 *  • Stacks up to 3 concurrent notifications
 *  • Manual dismiss via × button
 *  • Sound-pulse ring on the icon for BUY/SELL fills
 */
import { useEffect, useRef, useState } from "react";
import { useAppStore, type Alert } from "../../store/useAppStore";

/* ── helpers ──────────────────────────────────────────── */
const DURATION_MS = 5000;

function parseSide(text: string): "BUY" | "SELL" | null {
  const upper = text.toUpperCase();
  if (upper.includes("BUY")) return "BUY";
  if (upper.includes("SELL")) return "SELL";
  return null;
}

function isFailed(alert: Alert) {
  const upper = (alert.text || "").toUpperCase();
  return (
    upper.includes("FAIL") ||
    upper.includes("ERROR") ||
    upper.includes("REJECT") ||
    alert.level === "RED"
  );
}

function formatSymbol(sym?: string) {
  if (!sym) return "—";
  // BTCUSDT → BTC / USDT
  const match = sym.match(/^([A-Z0-9]{2,6})(USDT|BUSD|BTC|ETH|BNB|INR)$/i);
  if (match) return { base: match[1].toUpperCase(), quote: match[2].toUpperCase() };
  return { base: sym, quote: "" };
}

/* ── internal notification state ─────────────────────── */
interface TradeNote {
  alert: Alert;
  enteredAt: number;
}

/* ── component ────────────────────────────────────────── */
export default function TradeNotificationPopup() {
  const alerts = useAppStore((s) => s.alerts);
  const [notes, setNotes] = useState<TradeNote[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  // Watch for new trade alerts
  useEffect(() => {
    if (!alerts.length) return;
    const latest = alerts[0];
    if (!latest.isTrade) return;
    if (seenIds.current.has(latest.id)) return;
    seenIds.current.add(latest.id);

    setNotes((prev) => [
      { alert: latest, enteredAt: Date.now() },
      ...prev,
    ].slice(0, 3)); // max 3 stacked
  }, [alerts]);

  function dismiss(id: string) {
    setNotes((prev) => prev.filter((n) => n.alert.id !== id));
  }

  if (!notes.length) return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        top: 72,
        right: 16,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        pointerEvents: "none",
      }}
    >
      {notes.map((note, i) => (
        <NoteCard
          key={note.alert.id}
          note={note}
          stackIndex={i}
          onDismiss={() => dismiss(note.alert.id)}
        />
      ))}
    </div>
  );
}

/* ── NoteCard ─────────────────────────────────────────── */
function NoteCard({
  note,
  stackIndex,
  onDismiss,
}: {
  note: TradeNote;
  stackIndex: number;
  onDismiss: () => void;
}) {
  const { alert } = note;
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  const failed = isFailed(alert);
  const side = parseSide(alert.text);
  const sym = formatSymbol(alert.symbol);
  const base = typeof sym === "object" ? sym.base : sym;
  const quote = typeof sym === "object" ? sym.quote : "";

  // Animate in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  // Countdown progress bar
  useEffect(() => {
    const tick = (now: number) => {
      if (!startRef.current) startRef.current = now;
      const elapsed = now - startRef.current;
      const remaining = Math.max(0, 100 - (elapsed / DURATION_MS) * 100);
      setProgress(remaining);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setVisible(false);
        setTimeout(onDismiss, 320);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Style tokens based on outcome
  const isBuy = side === "BUY";
  const accent = failed ? "#ef4444" : isBuy ? "#22c55e" : "#f59e0b";
  const accentDim = failed ? "rgba(239,68,68,0.12)" : isBuy ? "rgba(34,197,94,0.10)" : "rgba(245,158,11,0.10)";
  const accentBorder = failed ? "rgba(239,68,68,0.35)" : isBuy ? "rgba(34,197,94,0.30)" : "rgba(245,158,11,0.30)";
  const statusLabel = failed ? "FAILED" : "FILLED";
  const statusIcon = failed ? "✕" : "✓";

  return (
    <div
      style={{
        pointerEvents: "auto",
        width: 300,
        borderRadius: 14,
        background: "linear-gradient(135deg, #0f172a 60%, #1e293b)",
        border: `1px solid ${accentBorder}`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${accentBorder} inset`,
        overflow: "hidden",
        transform: visible ? "translateX(0) scale(1)" : "translateX(110%) scale(0.96)",
        opacity: visible ? 1 : 0,
        transition: "transform 0.32s cubic-bezier(0.34,1.56,0.64,1), opacity 0.28s ease",
        marginTop: stackIndex > 0 ? -4 : 0,
        filter: stackIndex > 0 ? `brightness(${1 - stackIndex * 0.08})` : "none",
      }}
    >
      {/* Top accent stripe */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${accent}, ${accent}88)` }} />

      {/* Body */}
      <div style={{ padding: "12px 14px 10px" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          {/* Icon with pulse ring on fill */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            {!failed && (
              <div
                style={{
                  position: "absolute",
                  inset: -4,
                  borderRadius: "50%",
                  border: `2px solid ${accent}`,
                  animation: "tradeRing 1.4s ease-out forwards",
                }}
              />
            )}
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: accentDim,
                border: `1.5px solid ${accentBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
                fontWeight: 800,
                color: accent,
              }}
            >
              {statusIcon}
            </div>
          </div>

          {/* Symbol + status */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
                {base}
              </span>
              {quote && (
                <span style={{ fontSize: 10, fontWeight: 600, color: "#64748b" }}>/{quote}</span>
              )}
              {side && (
                <span
                  style={{
                    marginLeft: 4,
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: isBuy ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                    color: isBuy ? "#22c55e" : "#f59e0b",
                    border: `1px solid ${isBuy ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}`,
                  }}
                >
                  {side}
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: "0.06em", marginTop: 1 }}>
              ORDER {statusLabel}
            </div>
          </div>

          {/* Dismiss button */}
          <button
            onClick={onDismiss}
            style={{
              background: "none",
              border: "none",
              color: "#475569",
              cursor: "pointer",
              padding: 4,
              lineHeight: 1,
              fontSize: 14,
              borderRadius: 6,
              flexShrink: 0,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#94a3b8")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>

        {/* Message */}
        <div
          style={{
            fontSize: 11,
            color: "#94a3b8",
            lineHeight: 1.5,
            background: "rgba(255,255,255,0.03)",
            borderRadius: 8,
            padding: "6px 8px",
            borderLeft: `3px solid ${accentBorder}`,
            wordBreak: "break-word",
          }}
        >
          {alert.text}
        </div>

        {/* Time */}
        <div style={{ marginTop: 6, fontSize: 9, color: "#475569", fontFamily: "monospace" }}>
          {alert.time}
        </div>
      </div>

      {/* Countdown progress bar */}
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)" }}>
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
            transition: "width 0.05s linear",
          }}
        />
      </div>

      {/* Keyframes injected once */}
      <style>{`
        @keyframes tradeRing {
          0%   { opacity: 0.8; transform: scale(1); }
          100% { opacity: 0;   transform: scale(1.8); }
        }
      `}</style>
    </div>
  );
}
