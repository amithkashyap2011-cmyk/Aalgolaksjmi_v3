/*
 * ─── BehaviorModifiers ─────────────────────────────────
 *
 * Phase 2: Animal/bird sliders/toggles with tooltips.
 * Eagle, Tiger, Cheetah, Fox, Tortoise, Dog, Owl, Cow, Spider, Lion.
 * Each card has: emoji, name, description, 0–100 slider, tooltip.
 * Mock data only.
 */
import { useAppStore } from "../../store/useAppStore";
import Card from "../../ui/Card";
import { ANIMAL_MODIFIERS } from "../../mock/data";

export default function BehaviorModifiers() {
  const { behaviorWeights, setBehaviorWeight } = useAppStore();

  return (
    <Card className="p-phi-4" data-testid="behavior-modifiers">
      <h3 className="font-semibold text-phi-sm mb-phi-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-phi bg-amber-50 flex items-center justify-center text-xs">🐾</span>
        Behavior Modifiers
      </h3>
      <div className="grid grid-cols-2 gap-phi-2">
        {ANIMAL_MODIFIERS.map((a) => {
          const val = behaviorWeights[a.key] ?? 50;
          return (
            <div
              key={a.key}
              className="group relative p-phi-3 rounded-phi-lg border border-slate-100 bg-gradient-to-br from-slate-50/80 to-white hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-lg leading-none" aria-hidden="true">
                  {a.emoji}
                </span>
                <div className="min-w-0">
                  <div className="text-phi-xs font-semibold leading-tight truncate">{a.name}</div>
                  <div className="text-[9px] text-slate-400 leading-tight truncate">{a.desc}</div>
                </div>
              </div>

              <label className="sr-only" htmlFor={`slider-${a.key}`}>
                {a.name} weight
              </label>
              <input
                id={`slider-${a.key}`}
                type="range"
                min={0}
                max={100}
                value={val}
                onChange={(e) => setBehaviorWeight(a.key, Number(e.target.value))}
                className="w-full h-1.5 accent-aalgold cursor-pointer"
                aria-valuenow={val}
                aria-valuemin={0}
                aria-valuemax={100}
              />
              <div className="text-right text-[10px] text-slate-500 font-semibold tabular-nums">
                {val}
              </div>

              {/* Tooltip on hover */}
              <div
                role="tooltip"
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 p-2.5 rounded-phi-lg bg-slate-800 text-white text-[11px] leading-snug shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30"
              >
                <strong className="text-aalgold">{a.name}:</strong> {a.tooltip}
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-slate-800" />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
