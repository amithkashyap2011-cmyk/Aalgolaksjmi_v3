/*
 * ─── GayatriFrequencyPanel ─────────────────────────────
 *
 * Visualises the 24 Gayatri Mantra signals in 3 octaves:
 *   TAT (Momentum, 1-8), SAT (Structure, 9-16), OM (Harmony, 17-24)
 *
 * Each syllable is a dot/pill: green = resonating, grey = silent.
 * Frequency count → Hz label (528 / 432 / 396 / 285 / 174).
 * Mock data only — uses generateMockGayatriSignals().
 */
import { useAppStore } from "../../store/useAppStore";
import { generateMockGayatriSignals, type GayatriSignalItem } from "../../mock/data";
import Card from "../../ui/Card";
import clsx from "clsx";

const HZ_MAP: { min: number; hz: string; color: string; label: string }[] = [
  { min: 20, hz: "528 Hz", color: "text-aalgold",    label: "✨ Love Frequency — Deep Resonance" },
  { min: 16, hz: "432 Hz", color: "text-purple-500",  label: "🎵 Harmonic — Full Alignment" },
  { min: 12, hz: "396 Hz", color: "text-emerald-500", label: "⚖️ Liberation — Balanced" },
  { min: 8,  hz: "285 Hz", color: "text-amber-500",   label: "⚠️ Healing Needed" },
  { min: 0,  hz: "174 Hz", color: "text-aalred",      label: "🔻 Dissonance — Caution" },
];

function getHzInfo(freq: number) {
  return HZ_MAP.find((h) => freq >= h.min)!;
}

function OctaveRow({ octave, label, signals }: { octave: string; label: string; signals: GayatriSignalItem[] }) {
  const active = signals.filter((s) => s.active).length;
  return (
    <div className="mb-phi-3 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-slate-500 tracking-wide uppercase">{octave} — {label}</span>
        <span className="text-[10px] font-mono text-slate-400">{active}/8</span>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {signals.map((s) => (
          <div
            key={s.id}
            title={`${s.syllable}: ${s.label}${s.active ? " ✓" : ""}\n${s.detail}`}
            className={clsx(
              "flex flex-col items-center justify-center p-1 rounded-phi text-center cursor-default transition-all",
              s.active
                ? "bg-aalgold/15 border border-aalgold/30"
                : "bg-slate-50 border border-slate-100 opacity-50",
            )}
          >
            <span className="text-[9px] font-bold">{s.syllable}</span>
            <span className={clsx("text-[8px]", s.active ? "text-aalgreen" : "text-slate-300")}>
              {s.active ? "●" : "○"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GayatriFrequencyPanel() {
  const { selectedSymbol } = useAppStore();
  const signals = generateMockGayatriSignals(selectedSymbol);
  const frequency = signals.filter((s) => s.active).length;
  const hzInfo = getHzInfo(frequency);

  const tat = signals.filter((s) => s.octave === "TAT");
  const sat = signals.filter((s) => s.octave === "SAT");
  const om  = signals.filter((s) => s.octave === "OM");

  return (
    <Card className="p-phi-4" data-testid="gayatri-panel">
      <h3 className="font-semibold text-phi-sm mb-phi-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-phi bg-purple-100 flex items-center justify-center text-xs">🕉️</span>
        Gayatri 24-Signal
      </h3>

      {/* Frequency badge */}
      <div className="flex items-center gap-3 mb-phi-4 p-phi-3 rounded-phi-lg bg-gradient-to-r from-purple-50 to-aalgold/5 border border-purple-100">
        <div className="text-3xl font-black tabular-nums">{frequency}<span className="text-phi-xs text-slate-400">/24</span></div>
        <div>
          <div className={clsx("text-phi-sm font-bold", hzInfo.color)}>{hzInfo.hz}</div>
          <div className="text-[10px] text-slate-500">{hzInfo.label}</div>
        </div>
      </div>

      {/* Frequency bar */}
      <div className="gauge-track mb-phi-4">
        <div
          className={clsx("gauge-fill transition-all duration-500", frequency >= 16 ? "bg-aalgold" : frequency >= 12 ? "bg-emerald-500" : "bg-aalred")}
          style={{ width: `${(frequency / 24) * 100}%` }}
        />
      </div>

      {/* 3 octave rows */}
      <OctaveRow octave="TAT" label="Momentum" signals={tat} />
      <OctaveRow octave="SAT" label="Structure" signals={sat} />
      <OctaveRow octave="OM"  label="Harmony"   signals={om} />
    </Card>
  );
}
