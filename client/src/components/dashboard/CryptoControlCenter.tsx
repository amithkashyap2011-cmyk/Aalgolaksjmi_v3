/**
 * Crypto counterpart of the Indian page's command tabs: trading controls
 * (Pause / Resume / Panic Stop), why the AI isn't trading, P&L history and
 * performance — all from real server data.
 */
import { useCallback, useEffect, useState } from "react";
import * as api from "../../lib/api";

type Tab = "CONTROLS" | "WHY" | "HISTORY" | "PERF";
interface Props { mode: string; accountType: "SPOT" | "FUTURES" | "BOTH"; }

const card: React.CSSProperties = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 14px" };
const money = (v: number) => `${v < 0 ? "−" : v > 0 ? "+" : ""}$${Math.abs(v).toFixed(2)}`;
const pc = (v: number) => (v > 0 ? "#34d399" : v < 0 ? "#f87171" : "#94a3b8");

export default function CryptoControlCenter({ mode, accountType }: Props) {
  const [tab, setTab] = useState<Tab>("CONTROLS");
  const [status, setStatus] = useState<{ status: string; changedAt?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [perf, setPerf] = useState<any>(null);
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

  const loadStatus = useCallback(() => api.getTradingStatus().then(setStatus).catch(() => {}), []);
  useEffect(() => { loadStatus(); const t = setInterval(loadStatus, 10_000); return () => clearInterval(t); }, [loadStatus]);
  useEffect(() => {
    if (tab === "WHY") {
      const load = () => api.getLiveDecisions().then((d) => setDecisions(Object.values(d.decisions || {}).sort((a: any, b: any) => Math.max(b.buyProbability || 0, b.sellProbability || 0) - Math.max(a.buyProbability || 0, a.sellProbability || 0)))).catch(() => {});
      load(); const t = setInterval(load, 10_000); return () => clearInterval(t);
    }
    if (tab === "HISTORY" || tab === "PERF") api.getPerformance(mode, accountType).then(setPerf).catch(() => {});
  }, [tab, mode, accountType]);

  const act = async (fn: () => Promise<any>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true); setErr(null);
    try { await fn(); await loadStatus(); } catch (e: any) { setErr(e?.message || "Action failed"); } finally { setBusy(false); }
  };

  const st = status?.status || "…";
  const stColor = st === "RUNNING" ? "#34d399" : st === "PAUSED" ? "#fbbf24" : st === "KILLED" ? "#f87171" : "#94a3b8";
  const tabs: [Tab, string][] = [["CONTROLS", "Controls"], ["WHY", "Why no trade"], ["HISTORY", "P&L history"], ["PERF", "Performance"]];
  const btn = (bg: string, fg = "#0b1220"): React.CSSProperties => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color: fg, fontWeight: 800, fontSize: 12, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 });

  return (
    <div style={{ ...card, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, alignItems: "center" }}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${tab === k ? "#3b82f6" : "rgba(255,255,255,0.1)"}`, background: tab === k ? "rgba(59,130,246,0.15)" : "transparent", color: tab === k ? "#93c5fd" : "#94a3b8" }}>{label}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: stColor, border: `1px solid ${stColor}55`, borderRadius: 999, padding: "3px 10px" }}>
          AUTO-TRADER {st}
        </span>
      </div>

      {tab === "CONTROLS" && (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {st === "RUNNING"
              ? <button disabled={busy} style={btn("#fbbf24")} onClick={() => act(api.pauseTrading)}>Pause auto-trade</button>
              : <button disabled={busy} style={btn("#34d399")} onClick={() => act(api.resumeTrading, st === "KILLED" ? "Resume crypto auto-trading after a Panic Stop?" : undefined)}>Resume auto-trade</button>}
            <button disabled={busy || st === "KILLED"} style={btn("#ef4444", "#fff")} onClick={() => act(api.killSwitch, "PANIC STOP: block all new crypto entries until you resume?")}>PANIC STOP</button>
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, lineHeight: 1.5 }}>
            Pause and Panic Stop block <b>new</b> crypto entries (PAPER and LIVE). Open positions keep their stop-loss, target and AI exit management, so risk can still be reduced.
            The state is saved on the server and survives restarts.
            {status?.changedAt && <> Last changed {new Date(status.changedAt).toLocaleString("en-IN")}.</>}
          </div>
          {err && <div style={{ color: "#f87171", fontSize: 12, marginTop: 6 }}>{err}</div>}
        </div>
      )}

      {tab === "WHY" && (
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          {decisions.length === 0 && <div style={{ color: "#94a3b8", fontSize: 12 }}>No decisions yet — the auto-trader evaluates every 60s.</div>}
          {decisions.map((d: any) => {
            const buy = (d.buyProbability ?? 0) * 100, sell = (d.sellProbability ?? 0) * 100, thr = (d.threshold ?? 0) * 100;
            const gate = (String(d.reason).match(/NO_TRADE_GATE=([A-Z_]+)/) || [])[1];
            return (
              <div key={d.symbol} style={{ display: "grid", gridTemplateColumns: "110px 60px 1fr", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 12, alignItems: "center" }}>
                <b style={{ color: "#e2e8f0" }}>{d.symbol}</b>
                <span style={{ fontWeight: 800, color: d.decision === "LONG" ? "#34d399" : d.decision === "SHORT" ? "#f87171" : "#94a3b8" }}>{d.decision}</span>
                <span style={{ color: "#94a3b8" }} title={d.reason}>
                  buy {buy.toFixed(0)}% · sell {sell.toFixed(0)}%{thr ? ` · needs ${thr.toFixed(0)}%` : ""}{gate ? ` · ${gate.replace(/_/g, " ").toLowerCase()}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {tab === "HISTORY" && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {(["daily", "weekly", "monthly"] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)", background: period === p ? "rgba(59,130,246,0.15)" : "transparent", color: period === p ? "#93c5fd" : "#94a3b8", textTransform: "capitalize" }}>{p}</button>
            ))}
          </div>
          {!perf ? <div style={{ color: "#94a3b8", fontSize: 12 }}>Loading…</div> : (perf[period] || []).length === 0 ? <div style={{ color: "#94a3b8", fontSize: 12 }}>No closed trades.</div> : (
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {(perf[period] as any[]).map((b) => (
                <div key={b.period} style={{ display: "grid", gridTemplateColumns: "110px 1fr 90px", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 12 }}>
                  <span style={{ color: "#e2e8f0" }}>{period === "weekly" ? `Week of ${b.period}` : b.period}</span>
                  <span style={{ color: "#94a3b8" }}>{b.trades} trades · {b.wins} won</span>
                  <b style={{ color: pc(b.pnl), textAlign: "right", fontFamily: "monospace" }}>{money(b.pnl)}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "PERF" && (!perf ? <div style={{ color: "#94a3b8", fontSize: 12 }}>Loading…</div> : (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              ["Win rate", `${perf.stats.winRate}%`, perf.stats.winRate >= 50 ? "#34d399" : "#f87171", `${perf.stats.wins}W / ${perf.stats.losses}L of ${perf.stats.trades}`],
              ["Net (closed trades)", money(perf.stats.net), pc(perf.stats.net), `${money(perf.stats.expectancy)} per trade`],
              ["Profit factor", perf.stats.profitFactor ?? "—", (perf.stats.profitFactor ?? 0) >= 1 ? "#34d399" : "#f87171", "gross win ÷ gross loss"],
              ["Avg win / loss", `${money(perf.stats.avgWin)} / ${money(perf.stats.avgLoss)}`, "#e2e8f0", ""],
              ["Max drawdown", money(-perf.stats.maxDrawdown), "#f87171", "peak-to-trough, closed trades"],
            ].map(([l, v, c, sub]) => (
              <div key={l as string} style={{ ...card, flex: "1 1 150px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>{l}</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: c as string, fontFamily: "monospace", marginTop: 4 }}>{v}</div>
                {sub && <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{sub}</div>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 12 }}>
            {(perf.bySource || []).map((b: any) => (
              <div key={b.source} style={{ display: "grid", gridTemplateColumns: "130px 1fr 90px", gap: 8, padding: "4px 0", color: "#94a3b8" }}>
                <b style={{ color: "#e2e8f0" }}>{b.source}</b>
                <span>{b.trades} trades · {b.winRate}% won</span>
                <b style={{ color: pc(b.pnl), textAlign: "right", fontFamily: "monospace" }}>{money(b.pnl)}</b>
              </div>
            ))}
            {perf.stats.best && <div style={{ color: "#64748b", marginTop: 4 }}>Best {perf.stats.best.symbol} {money(perf.stats.best.pnl)} · Worst {perf.stats.worst.symbol} {money(perf.stats.worst.pnl)}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
