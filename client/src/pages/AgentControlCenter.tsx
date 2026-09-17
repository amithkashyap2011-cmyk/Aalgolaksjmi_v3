import { useState, useEffect } from "react";
import {
  ShieldAlert,
  Cpu,
  Play,
  Pause,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  Layers,
  Zap,
  RotateCcw,
  RefreshCw,
  Terminal,
  TrendingUp,
  Eye,
  Lock,
} from "lucide-react";

interface AgentStatusItem {
  agentId: string;
  name: string;
  role: string;
  version: string;
  enabled: boolean;
  status: string;
  permissions: string;
  modelTier: string;
  latencyMs: number;
  errors: number;
  consecutiveFailures: number;
  lastExecution: number;
}

interface PendingProposalItem {
  proposalId: string;
  actionId: string;
  status: string;
  proposal: {
    instrument: string;
    action: string;
    quantity: number;
    price?: number;
    reason: string;
    confidence: number;
    strategyId: string;
  };
}

interface DecisionItem {
  auditId: string;
  timestamp: number;
  role: string;
  finalDecision: string;
  structuredDecision: {
    decision: string;
    confidence: number;
    rationale: string;
    proposed_quantity: number;
  };
  policyResult?: {
    allowed: boolean;
    reason: string;
  };
}

export default function AgentControlCenter() {
  const [loading, setLoading] = useState(true);
  const [operatingMode, setOperatingMode] = useState<string>("ASSISTED");
  const [agents, setAgents] = useState<AgentStatusItem[]>([]);
  const [pendingProposals, setPendingProposals] = useState<PendingProposalItem[]>([]);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [shadowStats, setShadowStats] = useState<any>(null);
  const [modelTelemetry, setModelTelemetry] = useState<any>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchControlState = async () => {
    try {
      const res = await fetch("/api/agent-control/status");
      if (res.ok) {
        const data = await res.json();
        setOperatingMode(data.humanOverrideMode || "ASSISTED");
        setAgents(data.agents || []);
        setModelTelemetry(data.modelCostTelemetry || null);
      }

      const propRes = await fetch("/api/agent-control/proposals");
      if (propRes.ok) {
        const propData = await propRes.json();
        setPendingProposals(propData.proposals || []);
      }

      const auditRes = await fetch("/api/agent-control/audit?limit=10");
      if (auditRes.ok) {
        const auditData = await auditRes.json();
        setDecisions(auditData.decisions || []);
      }

      const shadowRes = await fetch("/api/agent-control/shadow");
      if (shadowRes.ok) {
        const shadowData = await shadowRes.json();
        setShadowStats(shadowData.summary || null);
      }
    } catch (err: any) {
      console.error("Failed to fetch agent control state:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchControlState();
    const interval = setInterval(fetchControlState, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleModeChange = async (newMode: string) => {
    try {
      setActionMessage(`Switching operating mode to ${newMode}...`);
      const res = await fetch("/api/agent-control/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode, authorizedBy: "OPERATOR_UI" }),
      });
      if (res.ok) {
        setOperatingMode(newMode);
        setActionMessage(`Operating mode set to ${newMode}`);
      } else {
        const err = await res.json();
        setActionMessage(`Error: ${err.error || "Failed to update mode"}`);
      }
    } catch (e: any) {
      setActionMessage(`Error: ${e.message}`);
    }
    setTimeout(() => setActionMessage(null), 4000);
  };

  const handleEmergencyStop = async () => {
    if (!confirm("ENGAGE EMERGENCY STOP? All autonomous trading will be halted immediately!")) return;
    try {
      const res = await fetch("/api/agent-control/emergency-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorizedBy: "EMERGENCY_DASHBOARD_BUTTON" }),
      });
      if (res.ok) {
        setOperatingMode("EMERGENCY_STOP");
        setActionMessage("🚨 EMERGENCY STOP ACTIVE! All autonomous execution halted.");
      }
    } catch (e: any) {
      setActionMessage(`Error: ${e.message}`);
    }
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleToggleAgent = async (agentId: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`/api/agent-control/agent/${agentId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      if (res.ok) {
        fetchControlState();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage(`Error: ${err.message || err.error || `HTTP ${res.status}`}`);
      }
    } catch (e: any) {
      setActionMessage(`Error: ${e.message}`);
    }
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleResetAgent = async (agentId: string) => {
    try {
      const res = await fetch(`/api/agent-control/agent/${agentId}/reset`, {
        method: "POST",
      });
      if (res.ok) {
        fetchControlState();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage(`Error: ${err.message || err.error || `HTTP ${res.status}`}`);
      }
    } catch (e: any) {
      setActionMessage(`Error: ${e.message}`);
    }
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleApproveProposal = async (proposalId: string) => {
    try {
      const res = await fetch(`/api/agent-control/proposal/${proposalId}/approve`, {
        method: "POST",
      });
      if (res.ok) {
        setActionMessage(`Proposal ${proposalId} approved!`);
        fetchControlState();
      }
    } catch (e: any) {
      console.error(e);
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handleRejectProposal = async (proposalId: string) => {
    try {
      const res = await fetch(`/api/agent-control/proposal/${proposalId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rejected via Control Center UI" }),
      });
      if (res.ok) {
        setActionMessage(`Proposal ${proposalId} rejected.`);
        fetchControlState();
      }
    } catch (e: any) {
      console.error(e);
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  return (
    <div style={{ padding: "24px 32px", minHeight: "100%", background: "#070d1a", color: "#f1f5f9" }}>
      {/* Header Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ padding: 8, background: "rgba(59, 130, 246, 0.15)", borderRadius: 8, color: "#60a5fa" }}>
              <Cpu size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
                Autonomous Control Plane & Agent Kernel
              </h1>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748b" }}>
                Multi-Agent Orchestration · Deterministic Final Risk Authority · Phase 9
              </p>
            </div>
          </div>
        </div>

        {/* Live Refresh & Emergency Stop */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={fetchControlState}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: "#1e293b",
              color: "#94a3b8",
              border: "1px solid #334155",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>

          <button
            onClick={handleEmergencyStop}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 18px",
              background: "#ef4444",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              boxShadow: "0 0 15px rgba(239, 68, 68, 0.4)",
            }}
          >
            <ShieldAlert size={16} /> EMERGENCY STOP
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          style={{
            padding: "10px 16px",
            background: "rgba(59, 130, 246, 0.15)",
            border: "1px solid #3b82f6",
            borderRadius: 6,
            marginBottom: 20,
            fontSize: 13,
            color: "#93c5fd",
          }}
        >
          {actionMessage}
        </div>
      )}

      {/* Operating Mode Bar */}
      <div
        style={{
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: 10,
          padding: 16,
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em" }}>
            Current System Mode
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 6,
                background:
                  operatingMode === "EMERGENCY_STOP"
                    ? "rgba(239, 68, 68, 0.2)"
                    : operatingMode === "AUTO"
                    ? "rgba(34, 197, 94, 0.2)"
                    : "rgba(245, 158, 11, 0.2)",
                color:
                  operatingMode === "EMERGENCY_STOP"
                    ? "#f87171"
                    : operatingMode === "AUTO"
                    ? "#4ade80"
                    : "#fbbf24",
                border: "1px solid currentColor",
              }}
            >
              {operatingMode}
            </span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              {operatingMode === "MANUAL" && "AI recommends only. Zero autonomous trade execution."}
              {operatingMode === "ASSISTED" && "AI generates proposals requiring operator sign-off before dispatch."}
              {operatingMode === "AUTO" && "Approved proposals execute autonomously after passing deterministic risk."}
              {operatingMode === "EMERGENCY_STOP" && "All autonomous operations halted. Only protective exits active."}
            </span>
          </div>
        </div>

        {/* Mode Selector Buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          {(["MANUAL", "ASSISTED", "AUTO"] as const).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              style={{
                padding: "8px 14px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                border: operatingMode === m ? "1px solid #3b82f6" : "1px solid #334155",
                background: operatingMode === m ? "rgba(59, 130, 246, 0.2)" : "#1e293b",
                color: operatingMode === m ? "#60a5fa" : "#94a3b8",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Autonomous System Dashboard Telemetry Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 14 }}>
          <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>AI Orchestrator</span>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#4ade80", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <Activity size={18} /> ACTIVE
          </div>
          <span style={{ fontSize: 11, color: "#64748b" }}>8 Specialist Agents Loaded</span>
        </div>

        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 14 }}>
          <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Risk Authority</span>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#60a5fa", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <Lock size={18} /> DETERMINISTIC
          </div>
          <span style={{ fontSize: 11, color: "#64748b" }}>Hard Limits Non-Bypassable</span>
        </div>

        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 14 }}>
          <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Pending Review</span>
          <div style={{ fontSize: 18, fontWeight: 700, color: pendingProposals.length > 0 ? "#fbbf24" : "#94a3b8", marginTop: 4 }}>
            {pendingProposals.length} Proposals
          </div>
          <span style={{ fontSize: 11, color: "#64748b" }}>Assisted Mode Approvals</span>
        </div>

        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 14 }}>
          <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Shadow AI P&L</span>
          <div style={{ fontSize: 18, fontWeight: 700, color: (shadowStats?.totalSimulatedPnL || 0) >= 0 ? "#4ade80" : "#f87171", marginTop: 4 }}>
            ₹{(shadowStats?.totalSimulatedPnL || 0).toLocaleString("en-IN")}
          </div>
          <span style={{ fontSize: 11, color: "#64748b" }}>{shadowStats?.totalEvaluations || 0} Virtual Decisions</span>
        </div>
      </div>

      {/* Pending Proposals Section (ASSISTED Mode Review) */}
      {pendingProposals.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #eab308", borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <AlertTriangle size={18} color="#eab308" />
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "#fef08a" }}>
              Pending Action Proposals Awaiting Operator Approval ({pendingProposals.length})
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pendingProposals.map((item) => (
              <div
                key={item.proposalId}
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  padding: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>{item.proposal.instrument}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: item.proposal.action === "BUY" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
                        color: item.proposal.action === "BUY" ? "#4ade80" : "#f87171",
                      }}
                    >
                      {item.proposal.action}
                    </span>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>
                      Qty: {item.proposal.quantity} @ ₹{item.proposal.price || "MARKET"}
                    </span>
                    <span style={{ fontSize: 11, color: "#60a5fa" }}>
                      Confidence: {Math.round(item.proposal.confidence * 100)}%
                    </span>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "#cbd5e1" }}>{item.proposal.reason}</p>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleApproveProposal(item.proposalId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "6px 12px",
                      background: "#16a34a",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <CheckCircle size={14} /> Approve & Dispatch
                  </button>
                  <button
                    onClick={() => handleRejectProposal(item.proposalId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "6px 12px",
                      background: "#334155",
                      color: "#cbd5e1",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <XCircle size={14} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 8 Specialized Agents Matrix */}
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 16px", color: "#f8fafc", display: "flex", alignItems: "center", gap: 8 }}>
          <Layers size={16} /> Specialized Agent Matrix (8 Domain Specialists)
        </h2>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e293b", color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "8px 12px" }}>Agent</th>
                <th style={{ padding: "8px 12px" }}>Role</th>
                <th style={{ padding: "8px 12px" }}>Status</th>
                <th style={{ padding: "8px 12px" }}>Permissions</th>
                <th style={{ padding: "8px 12px" }}>Model Tier</th>
                <th style={{ padding: "8px 12px" }}>Latency</th>
                <th style={{ padding: "8px 12px" }}>Errors</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Controls</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((ag) => (
                <tr key={ag.agentId} style={{ borderBottom: "1px solid #0f172a", background: "rgba(15, 23, 42, 0.4)" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: "#f1f5f9" }}>{ag.name}</td>
                  <td style={{ padding: "10px 12px", color: "#94a3b8" }}>{ag.role}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        background:
                          ag.status === "READY" || ag.status === "OBSERVING"
                            ? "rgba(34, 197, 94, 0.15)"
                            : ag.status === "DEGRADED"
                            ? "rgba(245, 158, 11, 0.15)"
                            : "rgba(239, 68, 68, 0.15)",
                        color:
                          ag.status === "READY" || ag.status === "OBSERVING"
                            ? "#4ade80"
                            : ag.status === "DEGRADED"
                            ? "#fbbf24"
                            : "#f87171",
                      }}
                    >
                      {ag.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#cbd5e1" }}>{ag.permissions}</td>
                  <td style={{ padding: "10px 12px", color: "#60a5fa" }}>{ag.modelTier}</td>
                  <td style={{ padding: "10px 12px", color: "#94a3b8" }}>{ag.latencyMs} ms</td>
                  <td style={{ padding: "10px 12px", color: ag.errors > 0 ? "#f87171" : "#64748b" }}>{ag.errors}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                      {ag.status === "DEGRADED" && (
                        <button
                          onClick={() => handleResetAgent(ag.agentId)}
                          style={{
                            padding: "4px 8px",
                            background: "#334155",
                            color: "#fbbf24",
                            border: "none",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontSize: 11,
                          }}
                        >
                          <RotateCcw size={12} /> Reset
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleAgent(ag.agentId, ag.enabled)}
                        style={{
                          padding: "4px 8px",
                          background: ag.enabled ? "#1e293b" : "#16a34a",
                          color: ag.enabled ? "#94a3b8" : "#fff",
                          border: "1px solid #334155",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {ag.enabled ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent AI Decisions Audit Feed */}
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 16px", color: "#f8fafc", display: "flex", alignItems: "center", gap: 8 }}>
          <Terminal size={16} /> Recent AI Decisions & Audit Log ({decisions.length})
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {decisions.map((d) => (
            <div
              key={d.auditId}
              style={{
                padding: "10px 14px",
                background: "#1e293b",
                borderRadius: 6,
                borderLeft:
                  d.finalDecision === "APPROVED"
                    ? "3px solid #22c55e"
                    : d.finalDecision === "SHADOW_RECORDED"
                    ? "3px solid #3b82f6"
                    : "3px solid #ef4444",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#f8fafc" }}>{d.role}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: d.finalDecision === "APPROVED" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                      color: d.finalDecision === "APPROVED" ? "#4ade80" : "#f87171",
                    }}
                  >
                    {d.finalDecision}
                  </span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>
                    {new Date(d.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#cbd5e1" }}>
                  {d.structuredDecision.rationale}
                </p>
              </div>

              <div style={{ textAlign: "right", fontSize: 11, color: "#94a3b8" }}>
                Decision: <strong style={{ color: "#f8fafc" }}>{d.structuredDecision.decision}</strong> ({Math.round(d.structuredDecision.confidence * 100)}%)
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
