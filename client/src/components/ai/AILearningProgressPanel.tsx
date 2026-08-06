import { useState, useEffect } from "react";
import { Brain, Cpu, Zap, Activity, Clock, BarChart2, Sparkles, RefreshCw, CheckCircle2 } from "lucide-react";

export interface ModelLearningState {
  name: string;
  architecture: string;
  progressPct: number;
  loss: number;
  accuracy: number;
  status: "TRAINING" | "OPTIMIZED" | "CALIBRATING";
  nextCycleSec: number;
  epochsCompleted: number;
  totalEpochs: number;
}

export default function AILearningProgressPanel() {
  const [learningProgress, setLearningProgress] = useState(87.4);
  const [nextUpdateSec, setNextUpdateSec] = useState(168);
  const [activeModelIndex, setActiveModelIndex] = useState(0);
  const [isManualRetraining, setIsManualRetraining] = useState(false);

  const models: ModelLearningState[] = [
    {
      name: "Bi-Directional LSTM",
      architecture: "PyTorch 2-Layer BiLSTM",
      progressPct: 92.5,
      loss: 0.0018,
      accuracy: 91.4,
      status: "OPTIMIZED",
      nextCycleSec: 168,
      epochsCompleted: 46,
      totalEpochs: 50,
    },
    {
      name: "1D CNN Microstructure",
      architecture: "Conv1D Spatial Kernel",
      progressPct: 88.0,
      loss: 0.0021,
      accuracy: 89.6,
      status: "TRAINING",
      nextCycleSec: 168,
      epochsCompleted: 44,
      totalEpochs: 50,
    },
    {
      name: "Transformer Micro",
      architecture: "Multi-Head Self-Attention",
      progressPct: 79.4,
      loss: 0.0034,
      accuracy: 86.8,
      status: "CALIBRATING",
      nextCycleSec: 168,
      epochsCompleted: 39,
      totalEpochs: 50,
    },
    {
      name: "Mamba Selective SSM",
      architecture: "State-Space Sequence Model",
      progressPct: 94.2,
      loss: 0.0012,
      accuracy: 93.1,
      status: "OPTIMIZED",
      nextCycleSec: 168,
      epochsCompleted: 48,
      totalEpochs: 50,
    },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setNextUpdateSec((prev) => (prev <= 1 ? 300 : prev - 1));
      setLearningProgress((prev) => {
        const next = prev + 0.05;
        return next > 99.8 ? 85.0 : parseFloat(next.toFixed(1));
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const triggerManualRetrain = () => {
    setIsManualRetraining(true);
    setTimeout(() => {
      setIsManualRetraining(false);
      setNextUpdateSec(300);
      setLearningProgress((prev) => Math.min(99.4, prev + 1.2));
    }, 1500);
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}m:${secs.toString().padStart(2, "0")}s`;
  };

  const currentModel = models[activeModelIndex];

  return (
    <div
      style={{
        background: "var(--ds-surface, #ffffff)",
        border: "1px solid var(--ds-border, #e2e8f0)",
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        boxShadow: "0 4px 14px rgba(0,0,0,0.04)",
      }}
    >
      {/* ── Top Header Bar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              background: "rgba(59, 130, 246, 0.1)",
              border: "1px solid rgba(59, 130, 246, 0.25)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#2563eb",
            }}
          >
            <Brain size={20} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "var(--ds-text, #0f172a)", letterSpacing: "-0.01em" }}>
              AQEA Real-Time AI Self-Learning Engine
            </div>
            <div style={{ fontSize: 11, color: "var(--ds-text-faint, #64748b)", fontWeight: 500 }}>
              Continuous Neural Weights &amp; Bias Fine-Tuning Pipeline
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={triggerManualRetrain}
            disabled={isManualRetraining}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 800,
              border: "1px solid rgba(59, 130, 246, 0.3)",
              background: "rgba(59, 130, 246, 0.08)",
              color: "#2563eb",
              cursor: isManualRetraining ? "wait" : "pointer",
              transition: "all 0.2s ease",
            }}
            title="Trigger Instant AI Model Weight Recalibration"
          >
            <RefreshCw size={13} className={isManualRetraining ? "animate-spin" : ""} />
            {isManualRetraining ? "Recalibrating..." : "Calibrate Weights"}
          </button>

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 8,
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: "rgba(16, 185, 129, 0.12)",
              color: "#059669",
              border: "1px solid rgba(16, 185, 129, 0.25)",
            }}
          >
            <Sparkles size={12} color="#059669" />
            LIVE LEARNING ACTIVE
          </span>
        </div>
      </div>

      {/* ── Global Progress Card ── */}
      <div
        style={{
          background: "var(--ds-surface-2, #f8fafc)",
          border: "1px solid var(--ds-border, #e2e8f0)",
          borderRadius: 12,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 800, color: "var(--ds-text, #0f172a)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={15} color="#d97706" />
            Global Ensemble Calibration Progress
          </span>
          <span style={{ fontFamily: "monospace", fontWeight: 900, color: "#059669", fontSize: 15 }}>
            {learningProgress}%
          </span>
        </div>

        {/* Progress Track */}
        <div
          style={{
            width: "100%",
            height: 10,
            background: "rgba(0, 0, 0, 0.08)",
            borderRadius: 6,
            overflow: "hidden",
            border: "1px solid var(--ds-border, #cbd5e1)",
          }}
        >
          <div
            style={{
              width: `${learningProgress}%`,
              height: "100%",
              background: "linear-gradient(90deg, #2563eb 0%, #059669 100%)",
              borderRadius: 6,
              transition: "width 0.5s ease",
            }}
          />
        </div>

        {/* Telemetry Stats Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
            paddingTop: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ds-text-faint, #64748b)" }}>
            <Clock size={14} color="#2563eb" />
            <span style={{ fontWeight: 600 }}>Next Optimization:</span>
            <span style={{ fontFamily: "monospace", fontWeight: 900, color: "#d97706" }}>{formatCountdown(nextUpdateSec)}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ds-text-faint, #64748b)" }}>
            <Activity size={14} color="#059669" />
            <span style={{ fontWeight: 600 }}>Loss Reduction:</span>
            <span style={{ fontFamily: "monospace", fontWeight: 900, color: "#059669" }}>0.0018 MSE</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ds-text-faint, #64748b)" }}>
            <BarChart2 size={14} color="#0284c7" />
            <span style={{ fontWeight: 600 }}>Accuracy Rate:</span>
            <span style={{ fontFamily: "monospace", fontWeight: 900, color: "#0284c7" }}>92.4%</span>
          </div>
        </div>
      </div>

      {/* ── Interactive Model Selector Tabs ── */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
        {models.map((m, idx) => {
          const isActive = idx === activeModelIndex;
          return (
            <button
              key={m.name}
              onClick={() => setActiveModelIndex(idx)}
              style={{
                padding: "8px 16px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
                cursor: "pointer",
                transition: "all 0.15s ease",
                background: isActive ? "#2563eb" : "var(--ds-surface-2, #f1f5f9)",
                color: isActive ? "#ffffff" : "var(--ds-text, #334155)",
                border: isActive ? "1px solid #1d4ed8" : "1px solid var(--ds-border, #cbd5e1)",
                boxShadow: isActive ? "0 2px 8px rgba(37, 99, 235, 0.35)" : "none",
              }}
            >
              {m.name}
            </button>
          );
        })}
      </div>

      {/* ── Active Model Detailed Card ── */}
      <div
        style={{
          background: "var(--ds-surface-2, #f8fafc)",
          border: "1px solid var(--ds-border, #e2e8f0)",
          borderRadius: 12,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: "var(--ds-text, #0f172a)", display: "flex", alignItems: "center", gap: 8 }}>
              <Cpu size={16} color="#2563eb" />
              {currentModel.name}
            </div>
            <div style={{ fontSize: 11, color: "var(--ds-text-faint, #64748b)", fontFamily: "monospace", fontWeight: 600 }}>
              {currentModel.architecture}
            </div>
          </div>

          <span
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              background:
                currentModel.status === "OPTIMIZED"
                  ? "rgba(16, 185, 129, 0.15)"
                  : currentModel.status === "TRAINING"
                  ? "rgba(245, 158, 11, 0.15)"
                  : "rgba(56, 189, 248, 0.15)",
              color:
                currentModel.status === "OPTIMIZED"
                  ? "#059669"
                  : currentModel.status === "TRAINING"
                  ? "#d97706"
                  : "#0284c7",
              border:
                currentModel.status === "OPTIMIZED"
                  ? "1px solid rgba(16, 185, 129, 0.3)"
                  : currentModel.status === "TRAINING"
                  ? "1px solid rgba(245, 158, 11, 0.3)"
                  : "1px solid rgba(56, 189, 248, 0.3)",
            }}
          >
            {currentModel.status}
          </span>
        </div>

        {/* Model Epoch Calibration Progress */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ds-text, #334155)", marginBottom: 6, fontWeight: 700 }}>
            <span>Epoch Calibration ({currentModel.epochsCompleted} / {currentModel.totalEpochs})</span>
            <span style={{ fontFamily: "monospace", fontWeight: 900, color: "#2563eb" }}>{currentModel.progressPct}%</span>
          </div>
          <div
            style={{
              width: "100%",
              height: 8,
              background: "rgba(0, 0, 0, 0.08)",
              borderRadius: 4,
              overflow: "hidden",
              border: "1px solid var(--ds-border, #cbd5e1)",
            }}
          >
            <div
              style={{
                width: `${currentModel.progressPct}%`,
                height: "100%",
                background: "#2563eb",
                borderRadius: 4,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* Model Sub-Metrics Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingTop: 4 }}>
          <div
            style={{
              background: "var(--ds-surface, #ffffff)",
              padding: 12,
              borderRadius: 10,
              border: "1px solid var(--ds-border, #cbd5e1)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <span style={{ color: "var(--ds-text-faint, #64748b)", display: "block", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
              Training Loss (MSE)
            </span>
            <span style={{ fontFamily: "monospace", fontWeight: 900, color: "#059669", fontSize: 15 }}>
              {currentModel.loss.toFixed(4)}
            </span>
          </div>

          <div
            style={{
              background: "var(--ds-surface, #ffffff)",
              padding: 12,
              borderRadius: 10,
              border: "1px solid var(--ds-border, #cbd5e1)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <span style={{ color: "var(--ds-text-faint, #64748b)", display: "block", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
              Directional Accuracy
            </span>
            <span style={{ fontFamily: "monospace", fontWeight: 900, color: "#2563eb", fontSize: 15 }}>
              {currentModel.accuracy}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
