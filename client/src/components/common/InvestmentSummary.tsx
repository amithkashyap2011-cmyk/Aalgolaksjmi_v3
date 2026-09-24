import type { ReactNode } from "react";

/**
 * "How much did I put in, and what's my net result?" — one strip used by the
 * Indian and crypto dashboards so both answer it the same way.
 *   Deposited        = money put into the account (mostly sits as cash)
 *   Current value    = deposited + net P/L
 *   Net P/L          = current − deposited (amount and % of deposited)
 *   In market now    = capital currently tied up in open positions
 *   Put into trades  = sum of every trade's entry cost (cash is reused, so
 *                      this can exceed the deposit)
 *   Peak in market   = most capital in open trades at the same time, with
 *                      net P/L as a % of it (return on money actually used)
 */
interface Props {
  currency: "₹" | "$";
  invested: number;
  netPnl: number;
  inOpenTrades: number;
  openCount?: number;
  /** Sum of every trade's entry cost, and how many trades. */
  deployed?: number;
  tradeCount?: number;
  /** Most capital in open trades at once. */
  peak?: number;
  /** Optional secondary currency line, e.g. INR for a USD account. */
  secondary?: { symbol: string; rate: number };
  note?: string;
  hidden?: boolean;
  /** Data not loaded yet — show dashes instead of a misleading −100%. */
  loading?: boolean;
}

const fmt = (cur: string, v: number) =>
  `${v < 0 ? "−" : ""}${cur}${Math.abs(v).toLocaleString(cur === "₹" ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InvestmentSummary({ currency, invested, netPnl, inOpenTrades, openCount, deployed, tradeCount, peak, secondary, note, hidden: hiddenProp, loading }: Props) {
  const hidden = hiddenProp || loading;
  const current = invested + netPnl;
  const pct = invested > 0 ? (netPnl / invested) * 100 : 0;
  const up = netPnl >= 0;
  const mask = loading ? "—" : "••••••";
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
        {cell("Deposited", hidden ? mask : fmt(currency, invested), "#f8fafc", sub(invested), "Money you put into this account — most of it stays as cash until a trade uses it")}
        {cell("Current value", hidden ? mask : fmt(currency, current), "#f8fafc", sub(current), "Deposited + net P/L")}
        {cell(
          "Net P/L",
          hidden ? mask : `${up ? "+" : ""}${fmt(currency, netPnl)}`,
          up ? "#34d399" : "#f87171",
          <div style={{ fontSize: 11, fontWeight: 800, color: up ? "#34d399" : "#f87171", marginTop: 2 }}>{hidden ? "" : `${up ? "+" : ""}${pct.toFixed(2)}%`}</div>,
          "After charges; realized + open positions",
        )}
        {cell("In market now", hidden ? mask : fmt(currency, inOpenTrades), "#fbbf24",
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{openCount ?? 0} position{openCount === 1 ? "" : "s"}</div>,
          "Capital currently tied up in open positions")}
        {deployed !== undefined && cell("Put into trades", hidden ? mask : fmt(currency, deployed), "#93c5fd",
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{tradeCount ?? 0} trade{tradeCount === 1 ? "" : "s"}{tradeCount ? ` · avg ${hidden ? mask : fmt(currency, deployed / tradeCount)}` : ""}</div>,
          "Sum of every trade's entry cost. The same cash is reused trade after trade, so this can exceed the deposit.")}
        {peak !== undefined && peak > 0 && (() => {
          const r = (netPnl / peak) * 100;
          const c = r >= 0 ? "#34d399" : "#f87171";
          return cell("Peak in market", hidden ? mask : fmt(currency, peak), "#c4b5fd",
            <div style={{ fontSize: 11, fontWeight: 800, color: c, marginTop: 2 }}>{hidden ? "" : `${r >= 0 ? "+" : ""}${r.toFixed(2)}% return on it`}</div>,
            "Most money you had in open trades at the same time. Net P/L as a % of this is the return on capital you actually used.");
        })()}
      </div>
      {note && <div style={{ fontSize: 10, color: "#64748b", marginTop: 6 }}>{note}</div>}
    </div>
  );
}
