/*
 * ─── AlertsFeed ────────────────────────────────────────
 *
 * Phase 2: Scrollable list with [GREEN]/[AMBER]/[RED] alerts.
 * Mock data only. Color-coded badges + timestamps.
 */
import { useAppStore } from "../../store/useAppStore";
import Card from "../../ui/Card";

const LEVEL_STYLES: Record<string, { dot: string; badge: string; label: string }> = {
  GREEN: { dot: "bg-aalgreen", badge: "alert-green", label: "BULLISH" },
  AMBER: { dot: "bg-amber-400", badge: "alert-amber", label: "CAUTION" },
  RED:   { dot: "bg-aalred",   badge: "alert-red",   label: "BEARISH" },
};

export default function AlertsFeed() {
  const { alerts } = useAppStore();

  return (
    <Card className="p-phi-4" data-testid="alerts-feed">
      <h3 className="font-semibold text-phi-sm mb-phi-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-phi bg-aalred/10 flex items-center justify-center text-xs">🔔</span>
        Alerts Feed
        {alerts.length > 0 && (
          <span className="ml-auto text-[10px] font-medium text-slate-400">
            {alerts.length} alerts
          </span>
        )}
      </h3>
      <div className="max-h-56 overflow-y-auto space-y-phi-2 pr-1 scroll-hide">
        {alerts.length === 0 ? (
          <p className="text-phi-xs text-slate-400 py-4 text-center">No alerts</p>
        ) : (
          alerts.map((a) => {
            const style = LEVEL_STYLES[a.level] ?? LEVEL_STYLES.GREEN;
            return (
              <div
                key={a.id}
                className={`flex items-start gap-2 p-phi-2 rounded-phi border text-phi-xs ${style.badge}`}
              >
                <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${style.dot}`} />
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{a.text}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wide opacity-75">
                      [{a.level}]
                    </span>
                    <span className="text-[9px] opacity-60">{a.time}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
