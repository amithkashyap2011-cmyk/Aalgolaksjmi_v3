import type { ReactNode } from "react";

/**
 * "How much did I put in, and what's my net result?" — one strip used by the
 * Indian and crypto dashboards so both answer it the same way.
 *   Invested    = money deposited into the account
 *   Current     = invested + net P/L
 *   Net P/L     = current − invested (amount and % of invested)
 *   In trades   = capital currently tied up in open positions
 */
interface Props {
  currency: "₹" | "$";
  invested: number;
  netPnl: number;
  inOpenTrades: number;
  openCount?: number;
  /** Optional secondary currency line, e.g. INR for a USD account. */
  secondary?: { symbol: string; rate: number };
  note?: string;
  hidden?: boolean;
}

const fmt = (cur: string, v: number) =>
  `${v < 0 ? "−" : ""}${cur}${Math.abs(v).toLocaleString(cur === "₹" ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InvestmentSummary({ currency, invested, netPnl, inOpenTrades, openCount, secondary, note, hidden }: Props) {
  const current = invested + netPnl;
  const pct = invested > 0 ? (netPnl / invested) * 100 : 0;
  const up = netPnl >= 0;
  const mask = "••••••";
  const sub = (v: number) =>
    secondary && !hidden ? <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{fmt(secondary.symbol, v * secondary.rate)}</div> : null;

  const cell = (label: string, value: string, color: string, extra?: ReactNode, title?: string) => (
    <div title={title} style={{ flex: "1 1 140px", minWidth: 0, padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color, fontFamily: "monospace", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      {extra}
    </div>
  );

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {cell("Invested", hidden ? mask : fmt(currency, invested), "#f8fafc", sub(invested), "Total money deposited into this account")}
        {cell("Current value", hidden ? mask : fmt(currency, current), "#f8fafc", sub(current), "Invested + net P/L")}
        {cell(
          "Net P/L",
          hidden ? mask : `${up ? "+" : ""}${fmt(currency, netPnl)}`,
          up ? "#34d399" : "#f87171",
          <div style={{ fontSize: 11, fontWeight: 800, color: up ? "#34d399" : "#f87171", marginTop: 2 }}>{hidden ? "" : `${up ? "+" : ""}${pct.toFixed(2)}%`}</div>,
          "After charges; realized + open positions",
        )}
        {cell("In open trades", hidden ? mask : fmt(currency, inOpenTrades), "#fbbf24",
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{openCount ?? 0} position{openCount === 1 ? "" : "s"}</div>,
          "Capital currently tied up in open positions")}
      </div>
      {note && <div style={{ fontSize: 10, color: "#64748b", marginTop: 6 }}>{note}</div>}
    </div>
  );
}
