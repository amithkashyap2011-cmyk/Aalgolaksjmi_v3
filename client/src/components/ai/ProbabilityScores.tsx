/*
 * ─── ProbabilityScores ─────────────────────────────────
 *
 * Phase 2: Three gauges/bars — High, Neutral, Low.
 * Mock data only. Golden-ratio card.
 */
import Card from "../../ui/Card";
import { MOCK_PROB_SCORES } from "../../mock/data";

export default function ProbabilityScores() {
  return (
    <Card className="p-phi-4" data-testid="probability-scores">
      <h3 className="font-semibold text-phi-sm mb-phi-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-phi bg-aalgreen/10 flex items-center justify-center text-xs">📊</span>
        Probability Scores
      </h3>
      <div className="space-y-phi-3">
        {MOCK_PROB_SCORES.map((s) => (
          <div key={s.label}>
            <div className="flex items-center justify-between text-phi-xs mb-1">
              <span className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${s.dotColor}`} />
                {s.label}
              </span>
              <span className="font-bold tabular-nums">{s.pct}%</span>
            </div>
            <div className="gauge-track">
              <div
                className={`gauge-fill ${s.barColor}`}
                style={{ width: `${s.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
