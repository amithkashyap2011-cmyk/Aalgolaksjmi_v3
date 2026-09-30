import { useState, useEffect } from "react";
import { Brain } from "lucide-react";
import * as api from "../../lib/api";

type TrainingStatus = Awaited<ReturnType<typeof api.getTrainingStatus>>;

/**
 * Continuous-learning status. Previously a hardcoded/animated fiction (fixed 91%/93% accuracies,
 * a self-incrementing progress bar, a fake retrain button). Now shows only what
 * GET /models/training-status derives from graded prediction telemetry, or an honest no-data state.
 */
export default function AILearningProgressPanel() {
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const s = await api.getTrainingStatus();
        if (!alive) return;
        setStatus(s);
        setError(false);
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setLoaded(true);
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const cnn = status?.last_cycle?.cnn ?? null;
  const graded = cnn?.rows_validated ?? 0;
  const finishedAt = status?.last_cycle?.finished_at ? status.last_cycle.finished_at * 1000 : null;
  const hasData = !!cnn && graded > 0;
  const hours = status?.interval_seconds ? Math.round(status.interval_seconds / 3600) : null;
  // accuracy arrives as a percentage (rolling100_accuracy) or, when absent, F1*100 server-side
  const acc = typeof cnn?.accuracy === "number" && Number.isFinite(cnn.accuracy) ? cnn.accuracy : null;

  const row = (label: string, value: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 130 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ds-text-faint, #64748b)", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 14, color: "var(--ds-text, #0f172a)" }}>{value}</span>
    </div>
  );

  return (
    <div
      className="ai-learning-panel"
      style={{
        background: "var(--ds-surface, #ffffff)",
        border: "1px solid var(--ds-border, #e2e8f0)",
        borderRadius: 14,
        padding: "14px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Brain size={18} color="#2563eb" />
        <div>
          <div style={{ fontSize: 14, fontWeight: 900, color: "var(--ds-text, #0f172a)" }}>AI Continuous Learning</div>
          <div style={{ fontSize: 11, color: "var(--ds-text-faint, #64748b)" }}>
            Measured from graded live predictions{hours ? ` · retrain cycle every ${hours}h` : ""}
          </div>
        </div>
      </div>

      {!loaded ? (
        <div style={{ fontSize: 12, color: "#64748b" }}>Loading learning status…</div>
      ) : error && !status ? (
        <div style={{ fontSize: 12, color: "#b91c1c" }}>Learning status unavailable (server did not respond).</div>
      ) : !hasData ? (
        <div style={{ fontSize: 12, color: "#64748b" }}>No graded predictions yet — nothing to report.</div>
      ) : (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {row("CNN rolling accuracy", acc != null ? `${acc.toFixed(1)}%` : "—")}
          {row("CNN graded F1 (last 200)", typeof cnn?.f1 === "number" ? cnn.f1.toFixed(3) : "—")}
          {row("Graded samples", graded.toLocaleString())}
          {row("Checkpoint promoted", cnn?.promoted ? "Yes" : "No")}
          {row("Last telemetry", finishedAt ? new Date(finishedAt).toLocaleString() : "—")}
        </div>
      )}
      {cnn && !cnn.promoted && cnn.reason ? (
        <div style={{ fontSize: 11, color: "#64748b" }}>{cnn.reason}</div>
      ) : null}
    </div>
  );
}
