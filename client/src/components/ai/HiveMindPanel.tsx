/*
 * ─── HiveMindPanel ─────────────────────────────────────
 *
 * Phase 2: Tiles for each AI model — Lakshmi Master, Short-term,
 * Trend, Pattern, Volume Profile, Sentiment.
 * All mock data. Golden-ratio card grid.
 */
import Card from "../../ui/Card";
import { MOCK_HIVEMIND } from "../../mock/data";

export default function HiveMindPanel() {
  return (
    <Card className="p-phi-4" data-testid="hivemind-panel">
      <h3 className="font-semibold text-phi-sm mb-phi-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-phi bg-aalgold/15 flex items-center justify-center text-xs">🧠</span>
        Hive Mind
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-phi-2">
        {MOCK_HIVEMIND.map((m) => (
          <div
            key={m.name}
            className="p-phi-3 rounded-phi-lg border border-slate-100 bg-gradient-to-br from-slate-50 to-white hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-phi-xs font-bold ${m.color}`}>{m.shortName}</span>
              <span className="text-[10px] text-slate-400 truncate">{m.name}</span>
            </div>
            <div className="text-phi-lg font-bold tabular-nums">{m.pct}%</div>
            <div className="mt-1.5 gauge-track">
              <div
                className={`gauge-fill ${m.barColor}`}
                style={{ width: `${m.pct}%` }}
              />
            </div>
            <p className="text-[9px] text-slate-400 mt-1 leading-tight">{m.description}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
