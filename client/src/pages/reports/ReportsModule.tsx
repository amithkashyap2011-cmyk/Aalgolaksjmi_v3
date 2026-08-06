import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useReportData } from "./useReportData";
import ExecutiveReport from "./ExecutiveReport";
import PerformanceReport from "./PerformanceReport";
import PnLReport from "./PnLReport";
import TradesReport from "./TradesReport";
import RiskReport from "./RiskReport";
import PortfolioReport from "./PortfolioReport";
import StrategyReport from "./StrategyReport";
import AIReport from "./AIReport";
import MarketReport from "./MarketReport";
import CapitalReport from "./CapitalReport";
import AuditReport from "./AuditReport";
import ExportReport from "./ExportReport";

const SECTIONS = [
  { id: "executive", label: "Executive", C: ExecutiveReport },
  { id: "performance", label: "Performance", C: PerformanceReport },
  { id: "pnl", label: "P&L", C: PnLReport },
  { id: "trades", label: "Trades", C: TradesReport },
  { id: "risk", label: "Risk", C: RiskReport },
  { id: "portfolio", label: "Portfolio", C: PortfolioReport },
  { id: "strategy", label: "Strategy", C: StrategyReport },
  { id: "ai", label: "AI", C: AIReport },
  { id: "market", label: "Market", C: MarketReport },
  { id: "capital", label: "Capital", C: CapitalReport },
  { id: "audit", label: "Audit", C: AuditReport },
  { id: "export", label: "Export", C: ExportReport },
] as const;

export default function ReportsModule() {
  const { section } = useParams();
  const navigate = useNavigate();
  const data = useReportData();

  const active = SECTIONS.find((s) => s.id === (section || "executive")) || SECTIONS[0];
  const Active = active.C;

  return (
    <div className="d-flex flex-column" style={{ minHeight: "100%", background: "var(--bs-body-bg, #060B14)" }}>
      {/* Header */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 px-3 py-2 border-bottom border-financial bg-white dark:bg-[#0B1220]">
        <div className="d-flex align-items-center gap-2">
          <span className="text-sm font-black uppercase tracking-tight text-dark dark:text-white">Reports</span>
          <span className="text-[10px] text-secondary font-bold uppercase tracking-widest">· {active.label}</span>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="text-[10px] text-secondary font-mono">
            {data.loading ? "Loading…" : data.refreshedAt ? `Updated ${data.refreshedAt.toLocaleTimeString([], { hour12: false })}` : ""}
          </span>
          <button onClick={data.refresh} className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" style={{ fontSize: 11 }} disabled={data.loading}>
            <RefreshCw size={12} className={data.loading ? "spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* Sub-nav */}
      <div className="d-flex align-items-center gap-1 px-3 py-2 border-bottom border-financial overflow-x-auto no-scrollbar bg-white dark:bg-[#0B1220]">
        {SECTIONS.map((s) => {
          const isActive = s.id === active.id;
          return (
            <button key={s.id} onClick={() => navigate(`/reports/${s.id}`)} className="btn btn-sm border-0 shadow-none flex-shrink-0"
              style={{ fontSize: 11, fontWeight: 800, padding: "4px 12px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.04em",
                background: isActive ? "#3b82f6" : "rgba(148,163,184,0.12)", color: isActive ? "#fff" : "#64748b" }}>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-grow-1 p-3">
        <Active d={data} />
      </div>

      <style>{`.spin{animation:spin 0.8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
