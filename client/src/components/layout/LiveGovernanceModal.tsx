import React, { useEffect, useState } from "react";
import { X, ShieldAlert, ShieldCheck, CheckCircle, AlertTriangle, RefreshCw, Lock } from "lucide-react";
import { getEvidenceGovernorReport } from "../../lib/api";

interface LiveGovernanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LiveGovernanceModal: React.FC<LiveGovernanceModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getEvidenceGovernorReport();
      setData(res?.report ?? null);
    } catch (err: any) {
      setError(err?.message || "Failed to load governance report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchReport();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const blockers: string[] = data?.blockers || [];
  const nextActions: string[] = data?.nextRequiredEvidence || [];
  const isApproved = Boolean(data?.isLiveApproved);
  const state = data?.currentState || "PAPER_EXPLORATION";
  const vector = data?.evidenceVector || {};

  // Standard 13 Gates definition
  const GATES = [
    { id: 1, name: "Sample Size", req: "N >= 30", status: (vector?.sampleSize || 0) >= 30, val: `N = ${vector?.sampleSize ?? 0}` },
    { id: 2, name: "Effective Sample Size", req: "N_eff >= 20", status: (vector?.nEff || 0) >= 20, val: `N_eff = ${(vector?.nEff ?? 0).toFixed(1)}` },
    { id: 3, name: "Economic Hurdle", req: "EV > 0.05%", status: (vector?.meanReturn || 0) > 0.0005, val: `${((vector?.meanReturn ?? 0) * 100).toFixed(3)}%` },
    { id: 4, name: "Calmar Ratio", req: "Calmar >= 1.5", status: (vector?.calmarRatio || 0) >= 1.5, val: (vector?.calmarRatio ?? 0).toFixed(2) },
    { id: 5, name: "Regime Coverage", req: ">= 3 Regimes", status: (Object.keys(vector?.nPerRegime || {}).length) >= 3, val: `${Object.keys(vector?.nPerRegime || {}).length} regimes` },
    { id: 6, name: "Model Diversity", req: ">= 3 Models", status: (Object.keys(vector?.nPerModel || {}).length) >= 3, val: `${Object.keys(vector?.nPerModel || {}).length} models` },
    { id: 7, name: "Market Domains", req: "Crypto + Equity", status: (vector?.nPerDomain?.CRYPTO || 0) > 0, val: `Crypto: ${vector?.nPerDomain?.CRYPTO ?? 0}` },
    { id: 8, name: "Calibration Error", req: "ECE <= 0.12", status: (vector?.avgECE || 0) <= 0.12 && (vector?.avgECE || 0) > 0, val: (vector?.avgECE ?? 0).toFixed(3) },
    { id: 9, name: "Max Drawdown", req: "MaxDD <= 15%", status: (vector?.maxDD || 0) <= 15, val: `${(vector?.maxDD ?? 0).toFixed(1)}%` },
    { id: 10, name: "Daily Loss Ceiling", req: "Daily <= 5%", status: (vector?.dailyLoss || 0) <= 5, val: `${(vector?.dailyLoss ?? 0).toFixed(1)}%` },
    { id: 11, name: "FDR Significance", req: "p < 0.05", status: (vector?.fdrPValue || 1) < 0.05, val: `p = ${(vector?.fdrPValue ?? 1).toFixed(3)}` },
    { id: 12, name: "Candidate Freeze", req: "Review Freeze", status: Boolean(data?.isPromotionReviewFrozen), val: data?.isPromotionReviewFrozen ? "FROZEN" : "UNFROZEN" },
    { id: 13, name: "Parameter Immutability", req: "Cryptographic Lock", status: Boolean(data?.parameterLockApproved), val: data?.parameterLockApproved ? "VERIFIED" : "PENDING" },
  ];

  const passedCount = GATES.filter(g => g.status).length;
  const progressPct = Math.round((passedCount / GATES.length) * 100);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(3, 7, 18, 0.82)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "100%", maxWidth: 760, maxHeight: "90vh",
          background: "#0b1329", border: "1px solid rgba(59, 130, 246, 0.25)",
          borderRadius: 14, boxShadow: "0 24px 64px rgba(0, 0, 0, 0.6)",
          display: "flex", flexDirection: "column", overflow: "hidden"
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(15, 23, 42, 0.6)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: isApproved ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: isApproved ? "#10b981" : "#ef4444"
            }}>
              {isApproved ? <ShieldCheck size={18} /> : <Lock size={18} />}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#f8fafc", letterSpacing: "0.02em" }}>
                AQEA Live Capital Governance Barrier
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                13 Forward Out-of-Sample (OOS) Criteria Verification
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={fetchReport}
              disabled={loading}
              title="Refresh"
              style={{
                background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6, padding: "5px 8px", color: "#94a3b8", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4, fontSize: 11
              }}
            >
              <RefreshCw size={12} className={loading ? "spin" : ""} />
            </button>
            <button
              onClick={onClose}
              style={{
                background: "transparent", border: "none", color: "#94a3b8",
                cursor: "pointer", padding: 4, display: "flex"
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Status summary banner */}
          <div style={{
            background: isApproved ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${isApproved ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
            borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 8
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {isApproved ? <CheckCircle size={16} color="#10b981" /> : <ShieldAlert size={16} color="#ef4444" />}
                <span style={{ fontSize: 12, fontWeight: 800, color: isApproved ? "#34d399" : "#f87171" }}>
                  {isApproved ? "LIVE CAPITAL TRADING PERMITTED" : `LIVE TRADING BLOCKED — ${state}`}
                </span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8", fontFamily: "monospace" }}>
                {passedCount} / {GATES.length} Gates Cleared ({progressPct}%)
              </span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%", width: `${progressPct}%`,
                  background: isApproved ? "linear-gradient(90deg, #10b981, #34d399)" : "linear-gradient(90deg, #f59e0b, #38bdf8)",
                  transition: "width 0.4s ease"
                }}
              />
            </div>

            <p style={{ fontSize: 11, color: "#94a3b8", margin: 0, lineHeight: 1.4 }}>
              The LiveExecutionBarrier guarantees that no real money orders can be placed until the AI
              trading models generate verifiable statistical evidence on paper trades across all market regimes.
            </p>
          </div>

          {/* 13 Gates Grid */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Mathematical Validation Criteria (13 Gates)
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 8
            }}>
              {GATES.map((g) => (
                <div
                  key={g.id}
                  style={{
                    background: "rgba(15, 23, 42, 0.5)",
                    border: `1px solid ${g.status ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: 8, padding: "10px 12px",
                    display: "flex", flexDirection: "column", gap: 4
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#f1f5f9" }}>
                      #{g.id} {g.name}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 4,
                      background: g.status ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                      color: g.status ? "#34d399" : "#fbbf24"
                    }}>
                      {g.status ? "PASS" : "OPEN"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, color: "#64748b" }}>
                    <span>Target: {g.req}</span>
                    <span style={{ fontFamily: "monospace", color: g.status ? "#34d399" : "#94a3b8" }}>{g.val}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Blockers & Next Actions */}
          {blockers.length > 0 && (
            <div style={{
              background: "rgba(245, 158, 11, 0.05)",
              border: "1px solid rgba(245, 158, 11, 0.2)",
              borderRadius: 8, padding: 12
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <AlertTriangle size={14} color="#f59e0b" />
                <span style={{ fontSize: 11, fontWeight: 800, color: "#fbbf24" }}>
                  Active Governance Blockers ({blockers.length})
                </span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: "#cbd5e1", lineHeight: 1.5 }}>
                {blockers.slice(0, 5).map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>
              {nextActions.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 11, color: "#94a3b8" }}>
                  <strong style={{ color: "#38bdf8" }}>Required Next Step:</strong> {nextActions[0]}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          background: "rgba(15, 23, 42, 0.4)"
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "6px 16px", borderRadius: 6,
              background: "rgba(59, 130, 246, 0.15)", border: "1px solid rgba(59, 130, 246, 0.3)",
              color: "#38bdf8", fontWeight: 700, fontSize: 12, cursor: "pointer"
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
