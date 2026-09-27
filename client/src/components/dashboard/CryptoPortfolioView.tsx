/**
 * Crypto Portfolio — holdings-first view for /crypto#portfolio.
 *
 * The sidebar's Portfolio link used to scroll the trading dashboard, so both
 * entries showed the same screen. This view answers "what do I own and how
 * has it done": what's held (Spot + Futures), how equity is allocated across
 * coins and cash, realized P&L per coin, and the closed-trade history. The
 * dashboard stays the trading terminal (signals, heat, regime, charts).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, PieChart, RefreshCw } from "lucide-react";
import * as api from "../../lib/api";
import { formatUsdWithInr } from "../../lib/currency";

const CARD = "var(--ds-surface)";
const BORD = "var(--ds-border)";
const TEXT = "var(--ds-text)";
const FAINT = "var(--ds-text-faint)";
const G = "var(--ds-buy)";
const R = "var(--ds-sell)";

// Allocation slices; "Cash" always takes the neutral last colour.
const SLICE_COLORS = ["#38bdf8", "#a78bfa", "#f59e0b", "#34d399", "#f472b6", "#fb7185", "#60a5fa", "#facc15"];
const CASH_COLOR = "#64748b";

interface Props {
  mode: "PAPER" | "LIVE";
  balances: { spot: number; futures: number };
  livePrices?: Record<string, number | string>;
  inrRate: number;
}

interface Holding {
  key: string;
  symbol: string;
  account: "SPOT" | "FUTURES";
  side: "LONG" | "SHORT";
  qty: number;
  entry: number;
  mark: number;
  leverage: number;
  cost: number;   // capital committed: spot cost basis, futures margin
  value: number;  // what it's worth now: spot market value, futures margin + uPnL
  upnl: number;
}

const num = (v: any) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const coinPrice = (p: number) => {
  if (!p) return "0.00";
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  if (p >= 0.0001) return p.toFixed(6);
  return p.toFixed(8);
};

const coinQty = (q: number) => (q >= 1000 ? q.toLocaleString("en-US", { maximumFractionDigits: 0 }) : q.toLocaleString("en-US", { maximumFractionDigits: 6 }));
const coin = (symbol: string) => symbol.replace(/(USDT|USDC|FDUSD)$/, "");
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

type AccountTab = "ALL" | "SPOT" | "FUTURES";
const TABS: Array<{ id: AccountTab; label: string; hint: string }> = [
  { id: "ALL", label: "All", hint: "Spot + Futures" },
  { id: "SPOT", label: "Spot", hint: "1:1, no leverage" },
  { id: "FUTURES", label: "Futures", hint: "USD-M perp, leverage" },
];
const TAB_KEY = "cryptoPortfolio.tab";
const readTab = (): AccountTab => {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return v === "SPOT" || v === "FUTURES" ? v : "ALL";
  } catch { return "ALL"; }
};

function toHolding(p: any, livePrices?: Props["livePrices"]): Holding {
  const account = p.accountType === "SPOT" ? "SPOT" : "FUTURES";
  const rawSide = String(p.side ?? p.positionSide ?? "BUY").toUpperCase();
  const side = rawSide === "SELL" || rawSide === "SHORT" ? "SHORT" : "LONG";
  const qty = Math.abs(num(p.quantity ?? p.positionAmt ?? p.size ?? p.qty));
  const entry = num(p.entryPrice ?? p.entry);
  const live = num(livePrices?.[p.symbol]);
  const mark = live > 0 ? live : num(p.markPrice ?? p.mark) || entry;
  const leverage = Math.max(1, num(p.leverage) || 1);
  const upnl = side === "LONG" ? (mark - entry) * qty : (entry - mark) * qty;
  const cost = account === "SPOT" ? entry * qty : num(p.margin) || (entry * qty) / leverage;
  const value = account === "SPOT" ? mark * qty : cost + upnl;
  return { key: String(p._id ?? `${p.symbol}-${account}`), symbol: p.symbol, account, side, qty, entry, mark, leverage, cost, value, upnl };
}

// Shared by both paged tables below: text filter + page index.
type Source = "ALL" | "ENGINE" | "EXPLORER" | "MANUAL";
const sourceOf = (t: any): Exclude<Source, "ALL"> =>
  t.entrySource === "PAPER_EXPLORATION" ? "EXPLORER" : t.entrySource === "MANUAL" || !t.entrySource ? "MANUAL" : "ENGINE";
const SOURCE_LABEL: Record<Exclude<Source, "ALL">, string> = { ENGINE: "AI engine", EXPLORER: "Explorer", MANUAL: "Manual" };
const exitReasonOf = (t: any): string => t.exitReason || t.meta?.exitReason || t.meta?.closeReason || "";

/** Page numbers with ellipses: 1 … 4 5 6 … 12 */
function pageList(page: number, pages: number): Array<number | "…"> {
  const out: Array<number | "…"> = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) out.push(i);
    else if (out[out.length - 1] !== "…") out.push("…");
  }
  return out;
}

function Pager({ page, pages, total, pageSize, onPage, onPageSize, sizes }: {
  page: number; pages: number; total: number; pageSize: number;
  onPage: (p: number) => void; onPageSize?: (n: number) => void; sizes?: number[];
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = (active: boolean, disabled = false): React.CSSProperties => ({
    minWidth: 30, height: 28, padding: "0 8px", borderRadius: 6, border: `1px solid ${active ? "#3b82f6" : BORD}`,
    background: active ? "rgba(59,130,246,0.18)" : CARD, color: disabled ? FAINT : active ? "#60a5fa" : TEXT,
    fontSize: 11, fontWeight: 800, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
  });
  return (
    <div className="cp-pager" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
      <span style={{ fontSize: 11, color: FAINT }}>{from}–{to} of {total}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <button aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} style={btn(false, page <= 1)}>‹</button>
        {pageList(page, pages).map((p, i) => p === "…"
          ? <span key={`e${i}`} style={{ color: FAINT, fontSize: 11, padding: "0 2px" }}>…</span>
          : <button key={p} aria-label={`Page ${p}`} aria-current={p === page ? "page" : undefined} onClick={() => onPage(p)} style={btn(p === page)}>{p}</button>)}
        <button aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} style={btn(false, page >= pages)}>›</button>
        {onPageSize && sizes && (
          <select aria-label="Rows per page" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} style={{ ...controlStyle, height: 28, marginLeft: 4 }}>
            {sizes.map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

const controlStyle: React.CSSProperties = {
  height: 30, padding: "0 10px", borderRadius: 8, border: `1px solid ${BORD}`, background: "var(--ds-bg)",
  color: TEXT, fontSize: 12, fontWeight: 600, minWidth: 0,
};

// Below 640px each table row becomes a card of label → value pairs.
const RESPONSIVE_CSS = `
@media (max-width: 480px) { .crypto-portfolio-page .cp-tab-hint { display: none; } }
@media (max-width: 640px) {
  .crypto-portfolio-page .cp-rtable thead { display: none; }
  /* a global mobile rule gives every table min-width: 560px — cards must fit the screen */
  .crypto-portfolio-page .cp-rtable, .crypto-portfolio-page .cp-rtable tbody { display: block; width: 100% !important; min-width: 0 !important; }
  .crypto-portfolio-page .cp-rtable tr { display: block; border: 1px solid var(--ds-border); border-radius: 10px; padding: 6px 10px; margin-bottom: 8px; }
  .crypto-portfolio-page .cp-rtable td { display: flex !important; justify-content: space-between; gap: 12px; border-top: none !important; padding: 4px 0 !important; white-space: normal !important; max-width: none !important; text-align: right; }
  .crypto-portfolio-page .cp-rtable td::before { content: attr(data-label); color: var(--ds-text-faint); font-size: 10px; font-weight: 800; text-transform: uppercase; font-family: inherit; text-align: left; }
  .crypto-portfolio-page .cp-filters > * { flex: 1 1 140px; }
}`;

export default function CryptoPortfolioView({ mode, balances, livePrices, inrRate }: Props) {
  const navigate = useNavigate();
  const [rawPositions, setRawPositions] = useState<any[]>([]);
  const [allClosed, setClosed] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AccountTab>(readTab);
  // Realized-by-coin table
  const [coinQ, setCoinQ] = useState("");
  const [coinSort, setCoinSort] = useState<"pnl" | "trades" | "winRate">("pnl");
  const [coinPage, setCoinPage] = useState(1);
  const COIN_PAGE_SIZE = 10;
  // Closed-trades table
  const [tradeQ, setTradeQ] = useState("");
  const [sideF, setSideF] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [resultF, setResultF] = useState<"ALL" | "WIN" | "LOSS">("ALL");
  const [sourceF, setSourceF] = useState<Source>("ALL");
  const [tradePage, setTradePage] = useState(1);
  const [tradePageSize, setTradePageSize] = useState(20);
  const selectTab = (t: AccountTab) => {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* per-viewer convenience only */ }
  };

  const load = async () => {
    const [spot, fut, hist] = await Promise.allSettled([
      api.getOpenPositions(mode, "SPOT"),
      api.getOpenPositions(mode, "FUTURES"),
      api.getTradeHistory(mode, 500, 0, "CLOSED"),
    ]);
    const open = [
      ...(spot.status === "fulfilled" && Array.isArray(spot.value) ? spot.value : []),
      ...(fut.status === "fulfilled" && Array.isArray(fut.value) ? fut.value : []),
    ];
    // Keyed de-dup: the FUTURES query can echo spot rows on some servers.
    setRawPositions([...new Map(open.map((p) => [String(p._id ?? `${p.symbol}-${p.accountType}`), p])).values()]);
    if (hist.status === "fulfilled") {
      // History is shared with the Indian market; keep crypto accounts only.
      setClosed((hist.value?.trades ?? []).filter((t: any) => t.accountType === "SPOT" || t.accountType === "FUTURES"));
    }
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const money = (usd: number) => formatUsdWithInr(usd, inrRate);
  const allHoldings = useMemo(() => rawPositions.map((p) => toHolding(p, livePrices)), [rawPositions, livePrices]);
  // Every figure below is scoped to the selected account tab, so Share and
  // allocation read as "of this account" on Spot / Futures.
  const holdings = useMemo(() => (tab === "ALL" ? allHoldings : allHoldings.filter((h) => h.account === tab)), [allHoldings, tab]);
  const closed = useMemo(() => (tab === "ALL" ? allClosed : allClosed.filter((t) => t.accountType === tab)), [allClosed, tab]);
  const spotCash = Math.max(0, balances.spot);
  const futCash = Math.max(0, balances.futures);
  const cash = tab === "SPOT" ? spotCash : tab === "FUTURES" ? futCash : spotCash + futCash;
  const tabCount = (t: AccountTab) => (t === "ALL" ? allHoldings.length : allHoldings.filter((h) => h.account === t).length);
  const holdingsValue = holdings.reduce((s, h) => s + h.value, 0);
  const invested = holdings.reduce((s, h) => s + h.cost, 0);
  const upnl = holdings.reduce((s, h) => s + h.upnl, 0);
  const total = cash + holdingsValue;
  const realized = closed.reduce((s, t) => s + num(t.pnl), 0);

  const allocation = useMemo(() => {
    const byCoin = new Map<string, number>();
    for (const h of holdings) byCoin.set(coin(h.symbol), (byCoin.get(coin(h.symbol)) ?? 0) + Math.max(0, h.value));
    const slices = [...byCoin.entries()].sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: SLICE_COLORS[i % SLICE_COLORS.length] }));
    if (cash > 0) slices.push({ label: "Cash (USDT)", value: cash, color: CASH_COLOR });
    const sum = slices.reduce((s, x) => s + x.value, 0);
    return slices.map((x) => ({ ...x, share: sum > 0 ? (x.value / sum) * 100 : 0 }));
  }, [holdings, cash]);

  const perCoin = useMemo(() => {
    const m = new Map<string, { trades: number; wins: number; pnl: number }>();
    for (const t of closed) {
      const k = coin(t.symbol);
      const row = m.get(k) ?? { trades: 0, wins: 0, pnl: 0 };
      row.trades++;
      if (num(t.pnl) > 0) row.wins++;
      row.pnl += num(t.pnl);
      m.set(k, row);
    }
    const q = coinQ.trim().toUpperCase();
    const rows = [...m.entries()].filter(([c]) => !q || c.includes(q));
    const winRate = (r: { trades: number; wins: number }) => (r.trades ? r.wins / r.trades : 0);
    return rows.sort((a, b) =>
      coinSort === "trades" ? b[1].trades - a[1].trades
      : coinSort === "winRate" ? winRate(b[1]) - winRate(a[1]) || b[1].trades - a[1].trades
      : b[1].pnl - a[1].pnl);
  }, [closed, coinQ, coinSort]);
  const coinPages = Math.max(1, Math.ceil(perCoin.length / COIN_PAGE_SIZE));
  const coinPageSafe = Math.min(coinPage, coinPages);
  const perCoinPage = perCoin.slice((coinPageSafe - 1) * COIN_PAGE_SIZE, coinPageSafe * COIN_PAGE_SIZE);

  const filteredClosed = useMemo(() => {
    const q = tradeQ.trim().toUpperCase();
    return [...closed]
      .filter((t) => {
        if (q && !coin(String(t.symbol)).includes(q)) return false;
        const short = String(t.side).toUpperCase() === "SELL";
        if (sideF === "LONG" && short) return false;
        if (sideF === "SHORT" && !short) return false;
        const p = num(t.pnl);
        if (resultF === "WIN" && !(p > 0)) return false;
        if (resultF === "LOSS" && !(p <= 0)) return false;
        if (sourceF !== "ALL" && sourceOf(t) !== sourceF) return false;
        return true;
      })
      .sort((a, b) => new Date(b.closedAt ?? 0).getTime() - new Date(a.closedAt ?? 0).getTime());
  }, [closed, tradeQ, sideF, resultF, sourceF]);
  const tradePages = Math.max(1, Math.ceil(filteredClosed.length / tradePageSize));
  const tradePageSafe = Math.min(tradePage, tradePages);
  const closedPage = filteredClosed.slice((tradePageSafe - 1) * tradePageSize, tradePageSafe * tradePageSize);
  const filteredPnl = filteredClosed.reduce((s, t) => s + num(t.pnl), 0);
  const filteredWins = filteredClosed.filter((t) => num(t.pnl) > 0).length;
  // Any filter or account-tab change starts back at page 1.
  useEffect(() => { setCoinPage(1); }, [coinQ, coinSort, tab]);
  useEffect(() => { setTradePage(1); }, [tradeQ, sideF, resultF, sourceF, tradePageSize, tab]);

  const tile = (label: string, value: string, sub?: string, color: string = TEXT) => (
    <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: FAINT, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 900, color, fontFamily: "monospace", marginTop: 4, overflowWrap: "anywhere" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: FAINT, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const section = (title: string, children: React.ReactNode, right?: React.ReactNode) => (
    <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: TEXT }}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );

  const th: React.CSSProperties = { textAlign: "left", fontSize: 10, fontWeight: 800, color: FAINT, textTransform: "uppercase", padding: "6px 8px", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { fontSize: 12, color: TEXT, padding: "8px", borderTop: `1px solid ${BORD}`, whiteSpace: "nowrap", fontFamily: "monospace" };
  const empty = (msg: string) => <div style={{ fontSize: 12, color: FAINT, padding: "10px 2px" }}>{loading ? "Loading…" : msg}</div>;

  return (
    <div className="crypto-portfolio-page" style={{ background: "var(--ds-bg)", minHeight: "100%", padding: "16px 16px 64px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)" }}>
            <PieChart size={22} color="#3b82f6" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 19, fontWeight: 900, color: TEXT }}>Crypto Portfolio</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 8px", borderRadius: 4, background: mode === "LIVE" ? "rgba(239,68,68,0.18)" : "rgba(16,185,129,0.18)", color: mode === "LIVE" ? "#f87171" : "#34d399" }}>
                {mode === "LIVE" ? "LIVE BINANCE" : "PAPER"}
              </span>
            </div>
            <div style={{ fontSize: 11, color: FAINT }}>Holdings, allocation and realized results across Spot and Futures</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setLoading(true); load(); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1px solid ${BORD}`, background: CARD, color: FAINT, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button onClick={() => navigate("/crypto")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1px solid ${BORD}`, background: CARD, color: FAINT, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            <ArrowLeft size={13} /> Trading Dashboard
          </button>
        </div>
      </div>

      <style>{RESPONSIVE_CSS}</style>
      <div role="tablist" aria-label="Account" style={{ display: "flex", gap: 6, flexWrap: "wrap", borderBottom: `1px solid ${BORD}` }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(t.id)}
              style={{
                display: "flex", alignItems: "baseline", gap: 6, padding: "8px 14px", marginBottom: -1,
                border: "none", borderBottom: `2px solid ${active ? "#3b82f6" : "transparent"}`,
                background: "transparent", color: active ? TEXT : FAINT, fontSize: 13, fontWeight: 800, cursor: "pointer",
              }}
            >
              {t.label}
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8, background: active ? "rgba(59,130,246,0.18)" : BORD, color: active ? "#60a5fa" : FAINT }}>{tabCount(t.id)}</span>
              <span className="cp-tab-hint" style={{ fontSize: 10, fontWeight: 600, color: FAINT }}>{t.hint}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        {tile(tab === "ALL" ? "Total Portfolio Value" : `${tab === "SPOT" ? "Spot" : "Futures"} Account Value`, money(total), "Cash + holdings at live prices")}
        {tile("Cash (USDT)", money(cash), tab === "ALL" ? `Spot ${money(balances.spot)} · Futures ${money(balances.futures)}` : "Free to trade")}
        {tile("Invested in Holdings", money(invested), `${holdings.length} open position${holdings.length === 1 ? "" : "s"}`)}
        {tile("Unrealized P&L", money(upnl), invested > 0 ? pct((upnl / invested) * 100) : "No open positions", upnl >= 0 ? G : R)}
        {tile("Realized P&L (lifetime)", money(realized), `${closed.length} closed trade${closed.length === 1 ? "" : "s"}`, realized >= 0 ? G : R)}
      </div>

      {section("Allocation", allocation.length === 0 ? empty("Nothing held and no cash yet.") : (
        <div>
          <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: BORD }} role="img" aria-label="Portfolio allocation">
            {allocation.map((s) => <div key={s.label} title={`${s.label} ${s.share.toFixed(1)}%`} style={{ width: `${s.share}%`, background: s.color }} />)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", marginTop: 10 }}>
            {allocation.map((s) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: TEXT }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: "inline-block" }} />
                <span style={{ fontWeight: 700 }}>{s.label}</span>
                <span style={{ color: FAINT, fontFamily: "monospace" }}>{s.share.toFixed(1)}% · {money(s.value)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {section("Holdings", holdings.length === 0 ? empty(tab === "ALL" ? "No open positions — everything is in cash." : `No open ${tab === "SPOT" ? "Spot" : "Futures"} positions.`) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Coin", "Account", "Side", "Quantity", "Avg Price", "Current", "Value", "Unrealized P&L", "Share"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.key}>
                  <td style={{ ...td, fontWeight: 800, fontFamily: "inherit" }}>{coin(h.symbol)}</td>
                  <td style={{ ...td, fontFamily: "inherit" }}>{h.account}{h.account === "FUTURES" ? ` ${h.leverage}x` : ""}</td>
                  <td style={{ ...td, color: h.side === "LONG" ? G : R, fontWeight: 700, fontFamily: "inherit" }}>{h.side}</td>
                  <td style={td}>{coinQty(h.qty)}</td>
                  <td style={td}>{coinPrice(h.entry)}</td>
                  <td style={td}>{coinPrice(h.mark)}</td>
                  <td style={td}>{money(h.value)}</td>
                  <td style={{ ...td, color: h.upnl >= 0 ? G : R }}>{money(h.upnl)} ({h.cost > 0 ? pct((h.upnl / h.cost) * 100) : "—"})</td>
                  <td style={td}>{total > 0 ? `${((Math.max(0, h.value) / total) * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {section("Realized P&L by Coin", closed.length === 0 ? empty("No closed trades yet.") : (
        <div>
          <div className="cp-filters" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <input aria-label="Filter coins" placeholder="Search coin…" value={coinQ} onChange={(e) => setCoinQ(e.target.value)} style={{ ...controlStyle, flex: "1 1 160px" }} />
            <select aria-label="Sort coins" value={coinSort} onChange={(e) => setCoinSort(e.target.value as typeof coinSort)} style={controlStyle}>
              <option value="pnl">Sort: P&amp;L</option>
              <option value="trades">Sort: Trades</option>
              <option value="winRate">Sort: Win rate</option>
            </select>
          </div>
          {perCoin.length === 0 ? empty("No coins match this filter.") : (
            <div style={{ overflowX: "auto" }}>
              <table className="cp-rtable" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Coin", "Trades", "Wins", "Win Rate", "Realized P&L"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {perCoinPage.map(([c, r]) => (
                    <tr key={c}>
                      <td data-label="Coin" style={{ ...td, fontWeight: 800, fontFamily: "inherit" }}>{c}</td>
                      <td data-label="Trades" style={td}>{r.trades}</td>
                      <td data-label="Wins" style={td}>{r.wins}</td>
                      <td data-label="Win rate" style={td}>{((r.wins / r.trades) * 100).toFixed(0)}%</td>
                      <td data-label="Realized P&L" style={{ ...td, color: r.pnl >= 0 ? G : R }}>{money(r.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={coinPageSafe} pages={coinPages} total={perCoin.length} pageSize={COIN_PAGE_SIZE} onPage={setCoinPage} />
        </div>
      ))}

      {section("Closed Trades", closed.length === 0 ? empty("No closed trades yet.") : (
        <div>
          <div className="cp-filters" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <input aria-label="Filter trades by coin" placeholder="Search coin…" value={tradeQ} onChange={(e) => setTradeQ(e.target.value)} style={{ ...controlStyle, flex: "1 1 160px" }} />
            <select aria-label="Side" value={sideF} onChange={(e) => setSideF(e.target.value as typeof sideF)} style={controlStyle}>
              <option value="ALL">All sides</option>
              <option value="LONG">Long</option>
              <option value="SHORT">Short</option>
            </select>
            <select aria-label="Result" value={resultF} onChange={(e) => setResultF(e.target.value as typeof resultF)} style={controlStyle}>
              <option value="ALL">Wins &amp; losses</option>
              <option value="WIN">Wins</option>
              <option value="LOSS">Losses</option>
            </select>
            <select aria-label="Source" value={sourceF} onChange={(e) => setSourceF(e.target.value as Source)} style={controlStyle}>
              <option value="ALL">All sources</option>
              <option value="ENGINE">AI engine</option>
              <option value="EXPLORER">Explorer</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>
          <div style={{ fontSize: 11, color: FAINT, marginBottom: 8 }}>
            {filteredClosed.length} trade{filteredClosed.length === 1 ? "" : "s"} · {filteredWins}W/{filteredClosed.length - filteredWins}L ·{" "}
            <span style={{ color: filteredPnl >= 0 ? G : R, fontWeight: 800 }}>{money(filteredPnl)}</span>
          </div>
          {filteredClosed.length === 0 ? empty("No trades match these filters.") : (
            <div style={{ overflowX: "auto" }}>
              <table className="cp-rtable" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Closed", "Coin", "Account", "Side", "Source", "Quantity", "Entry", "Exit", "P&L", "Reason"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {closedPage.map((t) => {
                    const p = num(t.pnl);
                    const short = String(t.side).toUpperCase() === "SELL";
                    const reason = exitReasonOf(t);
                    return (
                      <tr key={String(t._id)}>
                        <td data-label="Closed" style={{ ...td, fontFamily: "inherit", color: FAINT }}>{t.closedAt ? new Date(t.closedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td data-label="Coin" style={{ ...td, fontWeight: 800, fontFamily: "inherit" }}>{coin(t.symbol)}</td>
                        <td data-label="Account" style={{ ...td, fontFamily: "inherit" }}>{t.accountType}</td>
                        <td data-label="Side" style={{ ...td, fontFamily: "inherit", color: short ? R : G }}>{short ? "SHORT" : "LONG"}</td>
                        <td data-label="Source" style={{ ...td, fontFamily: "inherit", color: FAINT }}>{SOURCE_LABEL[sourceOf(t)]}</td>
                        <td data-label="Quantity" style={td}>{coinQty(Math.abs(num(t.quantity)))}</td>
                        <td data-label="Entry" style={td}>{coinPrice(num(t.entryPrice))}</td>
                        <td data-label="Exit" style={td}>{coinPrice(num(t.exitPrice))}</td>
                        <td data-label="P&L" style={{ ...td, color: p >= 0 ? G : R }}>{money(p)}</td>
                        <td data-label="Reason" style={{ ...td, fontFamily: "inherit", color: FAINT, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }} title={reason}>{reason || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={tradePageSafe} pages={tradePages} total={filteredClosed.length} pageSize={tradePageSize} onPage={setTradePage} onPageSize={setTradePageSize} sizes={[10, 20, 50]} />
        </div>
      ))}
    </div>
  );
}
