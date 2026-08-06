import { useEffect, useState } from 'react';
import { useDashboardStore } from '../store/useDashboardStore';
import { Zap, Brain, RefreshCw, Edit2, Share2, X, Check, RotateCcw, GraduationCap, Clock, AlertTriangle, TrendingUp } from 'lucide-react';
import * as api from '../lib/api';

const BG = "var(--ds-bg)", CARD = "var(--ds-surface)", CARD2 = "var(--ds-surface-2)", BORD = "var(--ds-border)";
const G = "var(--ds-buy)", R = "var(--ds-sell)", B = "var(--ds-primary)", A = "var(--ds-warning)", P = "var(--ds-accent)";

const TYPE_COLOR: Record<string, string> = {
  DEEP_LEARNING:  B,
  REINFORCEMENT:  G,
  CLASSICAL_ML:   "#f97316",
  RESEARCH:       A,
  MICROSTRUCTURE: P,
  FOUNDATION:     "var(--ds-accent)",
};

/* ── Edit modal ── */
interface EditModalProps {
  model: any;
  onClose: () => void;
  onSave: (id: string, enabled: boolean, weight: number) => Promise<void>;
}
function EditModal({ model, onClose, onSave }: EditModalProps) {
  const [enabled, setEnabled] = useState<boolean>(model.enabled !== false);
  const [weight, setWeight]   = useState<number>(Math.round((model.weight ?? 0) * 100));
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(model.id, enabled, weight / 100);
      setSaved(true);
      setTimeout(onClose, 900);
    } finally { setSaving(false); }
  };

  const color = TYPE_COLOR[model.category] ?? B;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:16, padding:24, width:"100%", maxWidth:400 }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>{model.category}</div>
            <div style={{ fontSize:16, fontWeight:800, color:"var(--ds-text)" }}>{model.name}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--ds-text-faint)", cursor:"pointer", padding:4, display:"flex" }}><X size={16} /></button>
        </div>

        {/* Enable / Disable toggle */}
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:10, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Model Status</div>
          <div style={{ display:"flex", gap:8 }}>
            <button
              onClick={() => setEnabled(true)}
              style={{ flex:1, padding:"10px", borderRadius:8, fontSize:12, fontWeight:700, border:`1px solid ${enabled ? G + "60" : BORD}`, background: enabled ? `${G}14` : "transparent", color: enabled ? G : "var(--ds-text-faint)", cursor:"pointer", transition:"all 0.15s" }}
            >
              ● Enabled
            </button>
            <button
              onClick={() => setEnabled(false)}
              style={{ flex:1, padding:"10px", borderRadius:8, fontSize:12, fontWeight:700, border:`1px solid ${!enabled ? R + "60" : BORD}`, background: !enabled ? `${R}14` : "transparent", color: !enabled ? R : "var(--ds-text-faint)", cursor:"pointer", transition:"all 0.15s" }}
            >
              ○ Disabled
            </button>
          </div>
          {!enabled && <div style={{ fontSize:10, color:"var(--ds-text-faint)", marginTop:6 }}>This model will not participate in ensemble votes.</div>}
        </div>

        {/* Weight slider */}
        <div style={{ marginBottom:24 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Ensemble Weight</div>
            <div style={{ fontSize:16, fontWeight:800, color, fontFamily:"monospace" }}>{weight}%</div>
          </div>
          <input
            type="range" min={0} max={100} step={1}
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            disabled={!enabled}
            style={{ width:"100%", accentColor: color, opacity: enabled ? 1 : 0.4 }}
          />
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"var(--ds-text-faint)", marginTop:4 }}>
            <span>0% (off)</span>
            <span>100% (full weight)</span>
          </div>
          <div style={{ marginTop:8, height:4, background:"var(--ds-border)", borderRadius:4, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${weight}%`, background: color, borderRadius:4, transition:"width 0.2s ease" }} />
          </div>
        </div>

        {/* Description */}
        {model.description && (
          <div style={{ marginBottom:20, fontSize:11, color:"var(--ds-text-faint)", lineHeight:1.6, padding:"10px 12px", background:"rgba(255,255,255,0.02)", borderRadius:8, border:`1px solid ${BORD}` }}>
            {model.description}
          </div>
        )}

        {/* Actions */}
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={onClose} style={{ flex:1, padding:"10px", borderRadius:8, border:`1px solid ${BORD}`, background:"transparent", color:"var(--ds-text-faint)", fontSize:12, fontWeight:700, cursor:"pointer" }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ flex:2, padding:"10px", borderRadius:8, border:"none", background: saved ? G : B, color:"#fff", fontSize:12, fontWeight:800, cursor: saving ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, transition:"background 0.2s" }}
          >
            {saved ? <><Check size={14} /> Saved!</> : saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Share toast ── */
function ShareToast({ onDone }: { onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position:"fixed", bottom:80, left:"50%", transform:"translateX(-50%)", background:CARD, border:`1px solid ${G}40`, borderRadius:10, padding:"10px 18px", display:"flex", alignItems:"center", gap:8, zIndex:300, boxShadow:"0 4px 20px rgba(0,0,0,0.4)" }}>
      <Check size={14} color={G} />
      <span style={{ fontSize:12, fontWeight:700, color:G }}>Card info copied to clipboard</span>
    </div>
  );
}

/* ── Model card ── */
// These two model ids are the only ones gated by AQEA_CONFIG.RESEARCH_FROZEN
// (aqeaUi.ts:235-236: status.transformer/mamba = !RESEARCH_FROZEN) — when
// that flag is on, they intentionally run inference in shadow mode but are
// excluded from voting on live trades. That is NOT the same thing as the
// underlying Python service being down (their /health/models entries can
// read HEALTHY the whole time), so "OFFLINE" is the wrong word for it.
const RESEARCH_FROZEN_IDS = new Set(["transformer", "mamba-hybrid"]);

function parseWeightString(raw: any, fallback?: any): string {
  if (raw == null || raw === "") return fallback != null ? String(fallback) : "—";
  if (typeof raw === "string") {
    if (raw.endsWith("%")) return raw;
    const n = parseFloat(raw);
    if (isNaN(n)) return fallback != null ? String(fallback) : "—";
    return `${(n <= 1 && n > 0 ? n * 100 : n).toFixed(0)}%`;
  }
  if (typeof raw === "number") {
    if (isNaN(raw)) return fallback != null ? String(fallback) : "—";
    return `${(raw <= 1 && raw > 0 ? raw * 100 : raw).toFixed(0)}%`;
  }
  return "—";
}

function getNumericWeight(m: any, weightsMap: Record<string, number>): number {
  if (weightsMap[m.id] != null && !isNaN(weightsMap[m.id])) return weightsMap[m.id] * 100;
  if (weightsMap[m.name] != null && !isNaN(weightsMap[m.name])) return weightsMap[m.name] * 100;
  if (typeof m.weight === "number" && !isNaN(m.weight)) {
    return m.weight <= 1 && m.weight > 0 ? m.weight * 100 : m.weight;
  }
  if (typeof m.weight === "string") {
    const val = parseFloat(m.weight);
    if (!isNaN(val)) return val <= 1 && val > 0 ? val * 100 : val;
  }
  return 0;
}

function ModelCard({ model, online, onEdit, onShare }: { model: any; online: boolean; onEdit: () => void; onShare: () => void }) {
  const color = TYPE_COLOR[model.category] ?? B;
  const enabled = model.enabled !== false;
  const isShadowFrozen = !online && RESEARCH_FROZEN_IDS.has(model.id);

  return (
    <div style={{ background:CARD, border:`1px solid ${enabled ? BORD : "var(--ds-border)"}`, borderRadius:12, overflow:"hidden", display:"flex", flexDirection:"column", opacity: enabled ? 1 : 0.55, transition:"opacity 0.2s" }}>

      {/* Card header */}
      <div style={{ padding:"12px 14px", borderBottom:`1px solid ${BORD}`, display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:9, fontWeight:700, color, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:3 }}>{model.category?.replace(/_/g," ")}</div>
          <div style={{ fontSize:13, fontWeight:700, color: enabled ? "var(--ds-text)" : "var(--ds-text-faint)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{model.name}</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0, marginLeft:8 }}>
          <div
            style={{ width:7, height:7, borderRadius:"50%", background: !enabled ? "var(--ds-text-faint)" : online ? G : isShadowFrozen ? A : R, boxShadow: (!enabled || !online) ? "none" : `0 0 6px ${G}` }}
            title={!enabled ? "Disabled" : online ? "Online" : isShadowFrozen ? "Shadow only — frozen from live voting, not down" : "Offline"}
          />
          {/* Edit */}
          <button
            onClick={onEdit}
            title="Edit model settings"
            style={{ background:"none", border:`1px solid ${BORD}`, borderRadius:6, padding:"3px 7px", cursor:"pointer", color:"var(--ds-text-faint)", display:"flex", alignItems:"center", gap:3, fontSize:10, fontWeight:600 }}
            onMouseEnter={(e) => { e.currentTarget.style.color="var(--ds-text)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.15)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color="var(--ds-text-faint)"; e.currentTarget.style.borderColor=BORD; }}
          >
            <Edit2 size={11} /> Edit
          </button>
          {/* Share */}
          <button
            onClick={onShare}
            title="Copy card info to clipboard"
            style={{ background:"none", border:`1px solid ${BORD}`, borderRadius:6, padding:"3px 7px", cursor:"pointer", color:"var(--ds-text-faint)", display:"flex", alignItems:"center", gap:3, fontSize:10, fontWeight:600 }}
            onMouseEnter={(e) => { e.currentTarget.style.color="var(--ds-text)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.15)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color="var(--ds-text-faint)"; e.currentTarget.style.borderColor=BORD; }}
          >
            <Share2 size={11} /> Share
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:7, flex:1 }}>
        <Row label="Latency"    value={model.latencyMs != null ? `${model.latencyMs}ms` : (model.latency ?? "—")} />
        <Row label="Accuracy"   value={model.metrics?.directionalAccuracy ?? model.accuracy ?? "—"} color={G} />
        <Row label="Weight"     value={parseWeightString(model.weight, model.contrib)} color={color} />
        <Row label="Sharpe"     value={model.metrics?.sharpeContribution ?? model.sharpe ?? model.sharpeRatio ?? model.metrics?.sharpe ?? "—"} color={A} />
        <Row label="Status"     value={!enabled ? "DISABLED" : online ? "HEALTHY" : isShadowFrozen ? "SHADOW ONLY" : "OFFLINE"} color={!enabled ? "var(--ds-text-faint)" : online ? G : isShadowFrozen ? A : R} />
      </div>

      {/* Footer: prod-ready stars */}
      <div style={{ padding:"9px 14px", borderTop:`1px solid ${BORD}`, background:"rgba(255,255,255,0.01)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:9, color:"var(--ds-text-faint)", fontWeight:700, textTransform:"uppercase" }}>Prod Ready</span>
        <div>
          {[1,2,3,4,5].map((s) => (
            <span key={s} style={{ color: s <= (model.metrics?.productionReady ?? 4) ? A : "var(--ds-text-faint)", fontSize:11 }}>★</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color = "var(--ds-text-muted)" }: { label: string; value: any; color?: string }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <span style={{ fontSize:10, color:"var(--ds-text-faint)" }}>{label}</span>
      <span style={{ fontSize:11, fontWeight:700, color, fontFamily:"monospace" }}>{value}</span>
    </div>
  );
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0 || !Number.isFinite(ms)) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

/* ── Continuous learning panel (Web3 Cyber-Glassmorphism) ── */
function TrainingModelCard({
  label, color, trainState, lastCycleResult, metricLabel, metricValue,
}: {
  label: string; color: string; trainState: Record<string, any>; lastCycleResult: any;
  metricLabel: string; metricValue: string;
}) {
  const promotedAt = trainState?.last_promoted_at;
  const attemptedAt = trainState?.last_attempt_at;
  const refused = trainState?.last_attempt_promoted === false;
  const sampleCount = trainState?.rows_trained ?? trainState?.steps_trained;

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 41, 59, 0.7) 100%)",
      border: "1px solid rgba(255, 255, 255, 0.12)",
      borderRadius: 12,
      padding: "14px 16px",
      flex: 1,
      minWidth: 240,
      boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
      backdropFilter: "blur(10px)"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: "#ffffff", letterSpacing: "0.03em" }}>{label}</span>
        {lastCycleResult?.error ? (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 12, background: "rgba(239, 68, 68, 0.2)", color: "#fca5a5", border: "1px solid #ef4444" }}>
            <AlertTriangle size={11} /> ERROR
          </span>
        ) : lastCycleResult && !lastCycleResult.promoted ? (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 12, background: "rgba(245, 158, 11, 0.2)", color: "#fbbf24", border: "1px solid #f59e0b" }}>
            <AlertTriangle size={11} /> NOT PROMOTED
          </span>
        ) : (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 12, background: "rgba(16, 185, 129, 0.2)", color: "#34d399", border: "1px solid #10b981" }}>
            <TrendingUp size={11} /> LEARNING
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: refused ? 10 : 0 }}>
        <Row label={metricLabel} value={metricValue} color="#38bdf8" />
        <Row label="Last promoted" value={timeAgo(promotedAt)} color="#e2e8f0" />
        <Row label="Trained on" value={sampleCount != null ? `${sampleCount.toLocaleString()} samples` : "—"} color="#e2e8f0" />
      </div>

      {refused && (
        <div style={{
          marginTop: 10,
          fontSize: 11,
          fontWeight: 700,
          color: "#ffffff",
          background: "linear-gradient(135deg, rgba(120, 53, 15, 0.95), rgba(69, 26, 3, 0.95))",
          border: "1px solid #f59e0b",
          borderRadius: 10,
          padding: "10px 12px",
          lineHeight: 1.45,
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          boxShadow: "0 4px 14px rgba(0,0,0,0.5)"
        }}>
          <AlertTriangle size={16} color="#fbbf24" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <span style={{ color: "#fbbf24", fontWeight: 900, display: "block", marginBottom: 2, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              CHECKPOINT REFUSED
            </span>
            Last attempt ({timeAgo(attemptedAt)}) regressed past tolerance — checkpoint refused, previous weights kept.
          </div>
        </div>
      )}

      {lastCycleResult?.reason && (
        <div style={{
          marginTop: 10,
          fontSize: 11,
          fontWeight: 700,
          color: "#ffffff",
          background: "linear-gradient(135deg, #0f172a, #1e293b)",
          border: "1px solid #38bdf8",
          borderRadius: 10,
          padding: "10px 12px",
          lineHeight: 1.45,
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          boxShadow: "0 4px 14px rgba(0,0,0,0.5)"
        }}>
          <AlertTriangle size={16} color="#38bdf8" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <span style={{ color: "#38bdf8", fontWeight: 900, display: "block", marginBottom: 2, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              CYCLE RETRY NOTE
            </span>
            {lastCycleResult.reason}
          </div>
        </div>
      )}
    </div>
  );
}

function getIndianMarketStatus(): { open: boolean; reason: string } {
  const date = new Date();
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
  const istDate = new Date(utcTime + 5.5 * 3600000);
  const day = istDate.getDay();
  if (day === 0 || day === 6) return { open: false, reason: "Weekend — NSE Closed" };
  const mins = istDate.getHours() * 60 + istDate.getMinutes();
  if (mins < 9 * 60 + 15 || mins > 15 * 60 + 30) return { open: false, reason: "Outside NSE Hours (09:15 - 15:30 IST)" };
  return { open: true, reason: "NSE Active Session" };
}

function ContinuousLearningPanel({ training, selectedMarketDomain }: { training: any; selectedMarketDomain?: string }) {
  if (!training) {
    return (
      <div style={{ background: "#0b0f19", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "14px 20px", fontSize: 12, color: "#94a3b8" }}>
        Continuous learning status unavailable — quant engine unreachable.
      </div>
    );
  }

  const { enabled, interval_seconds, last_cycle, cnn_train_state, ppo_train_state } = training;
  const nextCycleAt = last_cycle?.finished_at ? last_cycle.finished_at * 1000 + interval_seconds * 1000 : null;
  const nextCycleMins = nextCycleAt ? Math.max(0, Math.round((nextCycleAt - Date.now()) / 60000)) : null;

  const isIndian = selectedMarketDomain === "INDIAN";
  const indianStatus = isIndian ? getIndianMarketStatus() : { open: true, reason: "" };
  const isNSEPaused = isIndian && !indianStatus.open;

  return (
    <div style={{
      background: "linear-gradient(135deg, #0b0f19 0%, #111827 50%, #070a14 100%)",
      border: isNSEPaused ? "1px solid rgba(245, 158, 11, 0.45)" : "1px solid rgba(16, 185, 129, 0.35)",
      borderRadius: 16,
      padding: "20px 24px",
      boxShadow: "0 10px 30px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.1)",
      backdropFilter: "blur(12px)"
    }}>
      {isNSEPaused && (
        <div style={{ background: "linear-gradient(135deg, rgba(120, 53, 15, 0.95), rgba(69, 26, 3, 0.95))", border: "1px solid #f59e0b", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 4px 14px rgba(0,0,0,0.4)" }}>
          <Clock size={20} color="#fbbf24" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 13, fontWeight: 800, color: "#ffffff", lineHeight: 1.45 }}>
            <span style={{ color: "#fbbf24", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em", marginRight: 8 }}>🇮🇳 NSE SESSION PAUSED:</span>
            Indian market session paused ({indianStatus.reason}) — Resumes <span style={{ color: "#fbbf24", fontWeight: 900 }}>Monday 09:15 AM IST</span>.
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #10b981, #059669)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 12px rgba(16, 185, 129, 0.4)" }}>
            <GraduationCap size={18} color="#ffffff" />
          </div>
          <div>
            <h4 style={{ fontSize: 15, fontWeight: 900, color: "#ffffff", margin: 0, letterSpacing: "0.02em" }}>Continuous Retraining Engine</h4>
            <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 10, background: isNSEPaused ? "rgba(245, 158, 11, 0.2)" : enabled ? "rgba(16, 185, 129, 0.2)" : "rgba(255,255,255,0.05)", color: isNSEPaused ? "#fbbf24" : enabled ? "#34d399" : "#94a3b8", border: isNSEPaused ? "1px solid #f59e0b" : enabled ? "1px solid #10b981" : "none" }}>
              {isNSEPaused ? `PAUSED (${indianStatus.reason.toUpperCase()})` : enabled ? "ACTIVE" : "DISABLED"}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#fbbf24", fontWeight: 800, background: "rgba(245, 158, 11, 0.15)", border: "1px solid rgba(245, 158, 11, 0.4)", borderRadius: 20, padding: "6px 14px", boxShadow: "0 2px 10px rgba(0,0,0,0.3)" }}>
          <Clock size={14} color="#fbbf24" style={{ flexShrink: 0 }} />
          {last_cycle?.finished_at ? (
            <span>Last cycle {timeAgo(new Date(last_cycle.finished_at * 1000).toISOString())} · retrains every {formatInterval(interval_seconds)}{nextCycleMins != null && ` · next in ~${nextCycleMins}m`}</span>
          ) : (
            <span>First training cycle running now (retrains every {formatInterval(interval_seconds)})</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <TrainingModelCard
          label="CNN_1D_V1" color="#38bdf8" trainState={cnn_train_state} lastCycleResult={last_cycle?.cnn}
          metricLabel="Validation F1" metricValue={cnn_train_state?.last_promoted_f1 != null ? cnn_train_state.last_promoted_f1.toFixed(3) : "—"}
        />
        <TrainingModelCard
          label="PPO_EXECUTION_V1" color="#34d399" trainState={ppo_train_state} lastCycleResult={last_cycle?.ppo}
          metricLabel="Avg reward/step" metricValue={ppo_train_state?.last_promoted_avg_reward_per_step != null ? ppo_train_state.last_promoted_avg_reward_per_step.toFixed(5) : "—"}
        />
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function AIMatrix() {
  const { status } = useDashboardStore();
  const [selectedMarketDomain, setSelectedMarketDomain] = useState<"ALL" | "INDIAN" | "CRYPTO">("INDIAN");
  const [models, setModels]     = useState<any[]>([]);
  const [weights, setWeights]   = useState<Record<string, number>>({});
  const [ensemble, setEnsemble] = useState<any>(null);
  const [training, setTraining] = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [editModel, setEditModel]   = useState<any>(null);
  const [showToast, setShowToast]   = useState(false);
  const [actionMsg, setActionMsg]   = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [reg, matrixRes, ens, train] = await Promise.allSettled([
        fetch("/models").then((r) => r.json()),
        fetch(`/models/matrix-stats?domain=${selectedMarketDomain}`).then((r) => r.json()),
        api.getEnsembleReport(selectedMarketDomain === "INDIAN" ? "NIFTY50" : "BTCUSDT"),
        api.getTrainingStatus(),
      ]);

      if (matrixRes.status === "fulfilled" && matrixRes.value?.models) {
        setModels(matrixRes.value.models);
      } else if (reg.status === "fulfilled") {
        setModels(reg.value.models ?? []);
      }

      if (matrixRes.status === "fulfilled" && matrixRes.value?.weights) {
        const wMap: Record<string, number> = {};
        matrixRes.value.weights.forEach((w: any) => { wMap[w.name] = w.weight / 100; });
        setWeights(wMap);
      } else if (reg.status === "fulfilled") {
        setWeights(reg.value.normalizedWeights ?? {});
      }

      if (ens.status === "fulfilled") setEnsemble(ens.value);
      setTraining(train.status === "fulfilled" ? train.value : null);
    } catch {
      /* fallback empty */
    } finally { setLoading(false); }
  };

  const [modelToggles, setModelToggles] = useState<Record<string, boolean>>({
    cnn: true, ppo: true, transformer: true, mamba: true, lnn: true,
    orderFlow: true, smartMoney: true, gayatri: true, ohmkara: true, lakshmi: true
  });

  const fetchModelToggles = async () => {
    try {
      const data = await api.getModelsToggles();
      if (data?.toggles) setModelToggles(data.toggles);
    } catch (e) {
      console.warn("fetchModelToggles error:", e);
    }
  };

  const handleToggleModel = async (modelKey: string, currentEnabled: boolean) => {
    const nextVal = !currentEnabled;
    setModelToggles((prev) => ({ ...prev, [modelKey]: nextVal }));
    try {
      await api.toggleAqeaModel(modelKey, nextVal);
      flash(`Model ${modelKey.toUpperCase()} toggled ${nextVal ? "ON" : "OFF"}`);
    } catch (e) {
      console.warn("handleToggleModel error:", e);
    }
  };

  useEffect(() => {
    load();
    fetchModelToggles();
    const interval = setInterval(() => {
      api.getTrainingStatus().then(setTraining).catch(() => {});
      fetchModelToggles();
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedMarketDomain]);

  const flash = (msg: string) => { setActionMsg(msg); setTimeout(() => setActionMsg(null), 3000); };

  /* Save edits */
  const handleSave = async (id: string, enabled: boolean, weight: number) => {
    try {
      await api.toggleModel(id, enabled);
      await api.updateModelWeight(id, weight);
      flash(`${id} updated — ${enabled ? "enabled" : "disabled"}, weight ${(weight * 100).toFixed(0)}%`);
      await load();
    } catch (err: any) {
      flash(`Failed to update ${id}: ${err.message || err}`);
    }
  };

  /* Reset to defaults */
  const handleReset = async () => {
    try {
      await api.resetModels();
      flash("All model weights reset to defaults");
      await load();
    } catch (err: any) {
      flash(`Reset failed: ${err.message || err}`);
    }
  };

  /* Reset for Indian Trade */
  const handleResetIndian = async () => {
    try {
      setSelectedMarketDomain("INDIAN");
      await api.resetModels();
      flash("AI Engine Matrix reset & optimized for 🇮🇳 Indian Trade (NSE/BSE)");
      await load();
    } catch (err: any) {
      flash(`Reset failed: ${err.message || err}`);
    }
  };

  /* Share: copy card info */
  const handleShare = (m: any) => {
    const text = [
      `Model: ${m.name}`,
      `Type: ${m.category}`,
      `Status: ${m.enabled !== false ? "Enabled" : "Disabled"}`,
      `Weight: ${m.weight != null ? (m.weight * 100).toFixed(0) : 0}%`,
      `Accuracy: ${m.metrics?.directionalAccuracy ?? "—"}`,
      `Latency: ${m.latencyMs != null ? `${m.latencyMs}ms` : "—"}`,
      `Sharpe contribution: ${m.metrics?.sharpeContribution ?? "—"}`,
      `Description: ${m.description ?? "—"}`,
    ].join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
    setShowToast(true);
  };

  const onlineMap: Record<string, boolean> = {
    cnn: status.cnn, "ppo-agent": status.ppo, transformer: status.transformer, "mamba-hybrid": status.mamba,
  };

  const enabledCount  = models.filter((m) => m.enabled !== false).length;
  const disabledCount = models.length - enabledCount;

  return (
    <div style={{ background:BG, minHeight:"100%", padding:"16px 16px 64px 16px", display:"flex", flexDirection:"column", gap:16 }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, background:`${P}18`, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <Brain size={18} color={P} />
          </div>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:"var(--ds-text)", display:"flex", alignItems:"center", gap:8 }}>
              AI Engine Matrix
              <span style={{ fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:6, background: selectedMarketDomain === "INDIAN" ? "rgba(245,158,11,0.15)" : "rgba(59,130,246,0.15)", color: selectedMarketDomain === "INDIAN" ? "#fbbf24" : "#60a5fa", border: `1px solid ${selectedMarketDomain === "INDIAN" ? "rgba(245,158,11,0.3)" : "rgba(59,130,246,0.3)"}` }}>
                {selectedMarketDomain === "INDIAN" ? "🇮🇳 INDIAN MARKETS (NSE/BSE)" : selectedMarketDomain === "CRYPTO" ? "🪙 CRYPTO PERPETUALS" : "🌐 ALL MARKETS"}
              </span>
            </div>
            <div style={{ fontSize:11, color:"var(--ds-text-faint)" }}>
              {enabledCount} active · {disabledCount} disabled · ensemble voting weights
            </div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <button
            onClick={handleResetIndian}
            style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", borderRadius:8, border:"1px solid rgba(245,158,11,0.4)", background:"rgba(245,158,11,0.12)", color:"#fbbf24", fontSize:11, fontWeight:800, cursor:"pointer", transition:"all 0.15s ease" }}
            title="Reset & optimize AI matrix weights for Indian Market Trading (NSE/BSE)"
          >
            <RotateCcw size={13} /> Reset for Indian Trade
          </button>
          <button
            onClick={handleReset}
            style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", borderRadius:8, border:`1px solid ${BORD}`, background:"transparent", color:"var(--ds-text-faint)", fontSize:11, fontWeight:700, cursor:"pointer" }}
            title="Reset all weights to defaults"
          >
            <RotateCcw size={13} /> Reset Defaults
          </button>
          <button onClick={load} style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:8, padding:"7px 10px", color:"var(--ds-text-faint)", cursor:"pointer", display:"flex" }}>
            <RefreshCw size={14} style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }} />
          </button>
        </div>
      </div>

      {/* 🌐 Market Domain Selector Segmented Switch */}
      <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, padding: "8px 12px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => setSelectedMarketDomain("ALL")}
            style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: "pointer", border: "none",
              background: selectedMarketDomain === "ALL" ? B : "rgba(255,255,255,0.04)",
              color: selectedMarketDomain === "ALL" ? "#fff" : "var(--ds-text-faint)",
              transition: "all 0.15s ease"
            }}
          >
            🌐 ALL MARKETS
          </button>
          <button
            onClick={() => setSelectedMarketDomain("INDIAN")}
            style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: "pointer", border: "none",
              background: selectedMarketDomain === "INDIAN" ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(255,255,255,0.04)",
              color: selectedMarketDomain === "INDIAN" ? "#000" : "var(--ds-text-faint)",
              transition: "all 0.15s ease"
            }}
          >
            🇮🇳 INDIAN EQUITIES (NSE / BSE)
          </button>
          <button
            onClick={() => setSelectedMarketDomain("CRYPTO")}
            style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: "pointer", border: "none",
              background: selectedMarketDomain === "CRYPTO" ? "linear-gradient(135deg, #10b981, #059669)" : "rgba(255,255,255,0.04)",
              color: selectedMarketDomain === "CRYPTO" ? "#000" : "var(--ds-text-faint)",
              transition: "all 0.15s ease"
            }}
          >
            🪙 CRYPTO PERPETUALS (USDT)
          </button>
        </div>

        <div style={{ fontSize: 11, color: "var(--ds-text-faint)", display: "flex", alignItems: "center", gap: 6 }}>
          <span>Active Domain:</span>
          <span style={{ fontWeight: 800, color: selectedMarketDomain === "INDIAN" ? "#fbbf24" : selectedMarketDomain === "CRYPTO" ? "#34d399" : "#60a5fa" }}>
            {selectedMarketDomain === "INDIAN" ? "IST 09:15-15:30 (Angel One SmartAPI)" : selectedMarketDomain === "CRYPTO" ? "24/7 Binance Futures" : "Cross-Asset Ensemble"}
          </span>
        </div>
      </div>

      {/* 🤖 AI Engine Models Control Center (Advanced Web3 Cyber-Glassmorphism UI) */}
      <div style={{
        background: "linear-gradient(135deg, #0b0f19 0%, #111827 50%, #070a14 100%)",
        border: "1px solid rgba(168, 85, 247, 0.35)",
        borderRadius: 16,
        padding: "22px 24px",
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.1)",
        position: "relative",
        overflow: "hidden",
        backdropFilter: "blur(12px)"
      }}>
        {/* Glow ambient background effects */}
        <div style={{ position: "absolute", top: "-50px", right: "-50px", width: "180px", height: "180px", background: "radial-gradient(circle, rgba(168, 85, 247, 0.25) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-50px", left: "-50px", width: "180px", height: "180px", background: "radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 70%)", pointerEvents: "none" }} />

        {/* Header Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10, position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg, #a855f7, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 15px rgba(168, 85, 247, 0.5)" }}>
              <Brain size={20} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 900, margin: 0, color: "#ffffff", letterSpacing: "0.02em", display: "flex", alignItems: "center", gap: 8 }}>
                AI Engine Models Control Center
                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 12, background: "rgba(168, 85, 247, 0.2)", color: "#c084fc", border: "1px solid rgba(168, 85, 247, 0.4)" }}>
                  WEB3 CYBER ENSEMBLE
                </span>
              </h3>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "2px 0 0 0" }}>
                Select active voting models. Toggled models dynamically participate in real-time consensus decisions.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(15, 23, 42, 0.8)", padding: "6px 14px", borderRadius: 20, border: "1px solid rgba(255, 255, 255, 0.1)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: "#34d399", letterSpacing: "0.05em" }}>
              {Object.values(modelToggles).filter(Boolean).length} / 10 MODELS ACTIVE
            </span>
          </div>
        </div>

        {/* Models Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, position: "relative", zIndex: 2 }}>
          {[
            { key: "mamba", name: "FinMamba (SSM S6)", icon: "🧠", desc: "Selective State-Space Model", category: "DEEP_LEARNING", tag: "MACRO SHIFT" },
            { key: "lnn", name: "Liquid Neural Net", icon: "💧", desc: "Continuous Differential Net", category: "DEEP_LEARNING", tag: "FLASH SHIELD" },
            { key: "transformer", name: "Transformer Micro", icon: "⚡", desc: "Multi-Head Cross Attention", category: "FOUNDATION", tag: "ATTENTION" },
            { key: "cnn", name: "CNN Pattern Vision", icon: "👁️", desc: "1D Conv Visual Pattern", category: "DEEP_LEARNING", tag: "PATTERN" },
            { key: "ppo", name: "PPO Reinforcement", icon: "🎯", desc: "Proximal Policy Optimization", category: "REINFORCEMENT", tag: "POLICY" },
            { key: "orderFlow", name: "Order Flow Engine", icon: "🌊", desc: "Microstructure Delta", category: "MICROSTRUCTURE", tag: "DELTA" },
            { key: "smartMoney", name: "Smart Money Flow", icon: "🐋", desc: "Institutional Liquidity", category: "MICROSTRUCTURE", tag: "WHALE" },
            { key: "gayatri", name: "Gayatri 24-Signal", icon: "🕉️", desc: "Harmonic Frequency Scorer", category: "CLASSICAL_ML", tag: "HARMONIC" },
            { key: "ohmkara", name: "Ohmkara Resonance", icon: "🔊", desc: "528Hz Market Vibration", category: "CLASSICAL_ML" , tag: "VIBRATION" },
            { key: "lakshmi", name: "Lakshmi Quant Trend", icon: "💰", desc: "Equity & Index Trend Engine", category: "CLASSICAL_ML", tag: "QUANT" },
          ].map((item) => {
            const isEnabled = modelToggles[item.key] !== false;
            return (
              <div
                key={item.key}
                onClick={() => handleToggleModel(item.key, isEnabled)}
                style={{
                  background: isEnabled
                    ? "linear-gradient(135deg, rgba(30, 27, 75, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)"
                    : "rgba(15, 23, 42, 0.6)",
                  border: isEnabled
                    ? "1px solid rgba(168, 85, 247, 0.45)"
                    : "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  boxShadow: isEnabled
                    ? "0 4px 20px rgba(168, 85, 247, 0.15), inset 0 1px 1px rgba(255,255,255,0.1)"
                    : "none",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  userSelect: "none"
                }}
                onMouseEnter={(e) => {
                  if (isEnabled) e.currentTarget.style.borderColor = "#c084fc";
                  else e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
                }}
                onMouseLeave={(e) => {
                  if (isEnabled) e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.45)";
                  else e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
                }}
              >
                <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: isEnabled ? "#c084fc" : "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                    {item.tag}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: isEnabled ? "#ffffff" : "#64748b", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span>{item.icon}</span>
                    <span>{item.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: isEnabled ? "#cbd5e1" : "#475569", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.desc}
                  </div>
                </div>

                <div style={{
                  padding: "4px 10px",
                  borderRadius: 20,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.05em",
                  background: isEnabled
                    ? "linear-gradient(135deg, #10b981, #059669)"
                    : "rgba(239, 68, 68, 0.15)",
                  color: isEnabled ? "#ffffff" : "#fca5a5",
                  border: isEnabled ? "1px solid #34d399" : "1px solid rgba(239, 68, 68, 0.4)",
                  boxShadow: isEnabled ? "0 0 10px rgba(16, 185, 129, 0.4)" : "none",
                  flexShrink: 0,
                  transition: "all 0.2s ease"
                }}>
                  {isEnabled ? "ON" : "OFF"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Domain Insights Card — High Visibility UI */}
      {selectedMarketDomain === "INDIAN" && (
        <div style={{ background: "linear-gradient(145deg, #0f172a, #1e293b)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 14, padding: "16px 20px", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <span>🇮🇳 INDIAN EQUITIES & DERIVATIVES AI CONFIGURATION</span>
            <span style={{ fontSize: 9, background: "rgba(245,158,11,0.2)", color: "#f59e0b", padding: "2px 6px", borderRadius: 4 }}>ACTIVE</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ color: "#94a3b8", display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>PRIMARY EXCHANGES</span>
              <span style={{ fontWeight: 900, color: "#fbbf24", fontSize: 13 }}>NSE & BSE India (₹ INR)</span>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ color: "#94a3b8", display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>HARMONIC FREQUENCY MODELS</span>
              <span style={{ fontWeight: 800, color: "#f8fafc", fontSize: 12 }}>Gayatri (24 Signals) & Ohmkara (528 Hz)</span>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ color: "#94a3b8", display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>TARGET UNIVERSE</span>
              <span style={{ fontWeight: 800, color: "#f8fafc", fontSize: 12 }}>NIFTY 50, BANKNIFTY, Bluechips</span>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ color: "#94a3b8", display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>WIN PROBABILITY (LAKSHMI MODEL)</span>
              <span style={{ fontWeight: 900, color: "#34d399", fontSize: 14 }}>92.3% Measured</span>
            </div>
          </div>
        </div>
      )}

      {/* Flash message */}

      {/* Flash message */}
      {actionMsg && (
        <div style={{ background:`${G}12`, border:`1px solid ${G}30`, borderRadius:8, padding:"10px 14px", fontSize:12, color:G, fontWeight:600 }}>
          {actionMsg}
        </div>
      )}

      {/* Continuous learning status */}
      <ContinuousLearningPanel training={training} selectedMarketDomain={selectedMarketDomain} />

      {/* Ensemble summary banner */}
      {ensemble && (
        <div style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:12, padding:"14px 20px", display:"flex", alignItems:"center", gap:24, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Zap size={14} color={B} />
            <span style={{ fontSize:11, fontWeight:700, color:"var(--ds-text)" }}>Ensemble Signal</span>
          </div>
          <div style={{ fontFamily:"monospace", fontWeight:800, fontSize:18, color: ensemble.signal === "LONG" ? G : ensemble.signal === "SHORT" ? R : A }}>
            {ensemble.signal ?? "HOLD"}
          </div>
          <div style={{ fontSize:11, color:"var(--ds-text-faint)" }}>Confidence: <span style={{ color:"var(--ds-text)", fontWeight:700 }}>{((ensemble.confidence ?? 0) * 100).toFixed(0)}%</span></div>
          <div style={{ fontSize:11, color:"var(--ds-text-faint)" }}>Active models: <span style={{ color:"var(--ds-text)", fontWeight:700 }}>{enabledCount}</span></div>
        </div>
      )}

      {/* Weight distribution bar */}
      {models.length > 0 && (
        <div style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:12, padding:"14px 16px" }}>
          <div style={{ fontSize:10, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Ensemble Weight Distribution</div>
          <div style={{ display:"flex", height:8, borderRadius:4, overflow:"hidden", gap:1 }}>
            {models.filter((m) => m.enabled !== false).map((m) => {
              const color = TYPE_COLOR[m.category] ?? B;
              const w = getNumericWeight(m, weights);
              return (
                <div key={m.id} title={`${m.name}: ${w.toFixed(0)}%`} style={{ flex: Math.max(w, 1), background: color, minWidth:2, transition:"flex 0.4s ease" }} />
              );
            })}
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 16px", marginTop:10 }}>
            {models.filter((m) => m.enabled !== false).map((m) => {
              const color = TYPE_COLOR[m.category] ?? B;
              const w = getNumericWeight(m, weights);
              return (
                <div key={m.id} style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:8, height:8, borderRadius:2, background: color, flexShrink:0 }} />
                  <span style={{ fontSize:10, color:"var(--ds-text-faint)" }}>{m.name}</span>
                  <span style={{ fontSize:10, fontWeight:700, color, fontFamily:"monospace" }}>{w.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Model cards grid */}
      {loading ? (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:12 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ background:CARD, borderRadius:12, height:220, border:`1px solid ${BORD}`, animation:"pulse 1.5s ease-in-out infinite", opacity:0.4 }} />
          ))}
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:12 }}>
          {models.map((m) => (
            <ModelCard
              key={m.id}
              model={m}
              online={onlineMap[m.id] !== false}
              onEdit={() => setEditModel(m)}
              onShare={() => handleShare(m)}
            />
          ))}
        </div>
      )}

      {/* Service status footer */}
      <div style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:12, padding:"14px 20px" }}>
        <div style={{ fontSize:10, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Quant Engine Services</div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          {[
            { label:"CNN Predictor",      up: status.cnn },
            { label:"PPO Agent",          up: status.ppo },
            { label:"Transformer",        up: status.transformer, shadowFrozen: true },
            { label:"Mamba Research",     up: status.mamba, shadowFrozen: true },
            { label:"Order Flow Engine",  up: true },
            { label:"Smart Money Engine", up: true },
          ].map((s) => (
            <div
              key={s.label}
              title={!s.up && s.shadowFrozen ? "Shadow only — frozen from live voting by RESEARCH_FROZEN, not necessarily down" : undefined}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", background:"rgba(255,255,255,0.02)", borderRadius:6, border:`1px solid ${BORD}` }}
            >
              <div style={{ width:6, height:6, borderRadius:"50%", background: s.up ? G : s.shadowFrozen ? A : "var(--ds-text-faint)" }} />
              <span style={{ fontSize:11, color: s.up ? "var(--ds-text-muted)" : "var(--ds-text-faint)" }}>{s.label}{!s.up && s.shadowFrozen ? " (shadow)" : ""}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Edit modal */}
      {editModel && (
        <EditModal
          model={editModel}
          onClose={() => setEditModel(null)}
          onSave={async (id, enabled, weight) => {
            await handleSave(id, enabled, weight);
            setEditModel(null);
          }}
        />
      )}

      {/* Share toast */}
      {showToast && <ShareToast onDone={() => setShowToast(false)} />}
    </div>
  );
}
