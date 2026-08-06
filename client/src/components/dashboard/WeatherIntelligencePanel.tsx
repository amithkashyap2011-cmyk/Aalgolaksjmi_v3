import React from 'react';
import { CloudRain, Wind, Thermometer, Activity, Zap, ShieldAlert, Cpu, Lock } from 'lucide-react';
import clsx from "clsx";

interface WeatherIntelligenceProps {
  weatherStress: number;
  minerPressure: number;
  hashRateTrend: number;
  difficultyTrend: number;
  weatherAlpha: number;
  riskAdjustment: {
    leverageMultiplier: number;
    sizeMultiplier: number;
    riskLimitMultiplier: number;
  };
  /** Whether the weather effect is currently acting on the market. Defaults to true. */
  enabled?: boolean;
  /** Market-effective alpha after on/off + influence (0 when disabled). */
  effectiveAlpha?: number;
  /** Influence strength 0..1 set by the user. */
  influence?: number;
}

const WeatherIntelligencePanel: React.FC<WeatherIntelligenceProps> = ({
  weatherStress,
  minerPressure,
  hashRateTrend,
  difficultyTrend,
  weatherAlpha,
  riskAdjustment,
  enabled = true,
  effectiveAlpha,
  influence = 1,
}) => {
  // When disabled, the panel keeps showing the raw computed alpha (monitoring only)
  // but makes clear it is NOT affecting trades.
  const displayAlpha = weatherAlpha;
  const getStatusColor = (val: number) => {
    if (val > 80) return "text-danger";
    if (val > 50) return "text-warning";
    return "text-success";
  };

  const getStatusBg = (val: number) => {
    if (val > 80) return "bg-danger";
    if (val > 50) return "bg-warning";
    return "bg-success";
  };

  return (
    <div className="card-modern shadow-sm border-0 bg-white dark:bg-[#0B1220] overflow-hidden">
      <div className="card-header bg-light dark:bg-slate-900 py-3 px-4 d-flex justify-content-between align-items-center border-bottom border-financial">
        <div className="d-flex align-items-center gap-2">
          <CloudRain size={14} className="text-primary" />
          <span className="text-[11px] text-dark dark:text-white font-bold uppercase tracking-widest">Weather Intelligence Engine</span>
        </div>
        <div className="d-flex align-items-center gap-2">
          {!enabled && (
            <span className="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-20 font-mono text-[9px]">
              MONITORING ONLY
            </span>
          )}
          <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-20 font-mono text-[9px]">
            WIE_V1.0
          </span>
        </div>
      </div>
      <div className="card-body p-4">
        {/* Weather Alpha Gauge */}
        <div className="text-center mb-5">
           <div className="text-[10px] text-secondary font-bold uppercase tracking-widest mb-3 text-slate-400">Weather Alpha Score</div>
           <div className="relative inline-block">
              <h1 className={clsx("text-6xl font-bold m-0 tracking-tighter font-mono", enabled ? getStatusColor(displayAlpha) : "text-secondary opacity-75")}>
                {displayAlpha.toFixed(1)}
              </h1>
              <div className={clsx("text-[10px] font-bold uppercase tracking-widest mt-2 px-3 py-1 rounded inline-block bg-opacity-10", enabled ? getStatusColor(displayAlpha) : "text-secondary", enabled ? getStatusBg(displayAlpha) : "bg-secondary")}>
                {!enabled ? 'EFFECT OFF · NOT APPLIED' : displayAlpha > 85 ? 'CRITICAL_RISK' : displayAlpha > 70 ? 'HIGH_STRESS' : 'STABLE_ENVIRONMENT'}
              </div>
              {enabled && influence < 1 && (
                <div className="text-[9px] text-secondary font-bold uppercase tracking-widest mt-2">
                  Influence {Math.round(influence * 100)}% · effective {(effectiveAlpha ?? displayAlpha * influence).toFixed(1)}
                </div>
              )}
           </div>
        </div>

        {/* Multi-Factor Grid */}
        <div className="grid grid-cols-2 gap-4 mb-5">
           {[
              { label: 'Mining Stress', val: `${weatherStress.toFixed(1)}%`, icon: Thermometer, color: getStatusColor(weatherStress) },
              { label: 'Miner Pressure', val: `${minerPressure.toFixed(1)}%`, icon: Activity, color: getStatusColor(minerPressure) },
              { label: 'Hash Rate Trend', val: `${(hashRateTrend * 100).toFixed(1)}%`, icon: Zap, color: hashRateTrend < 0 ? 'text-danger' : 'text-success' },
              { label: 'Difficulty Trend', val: `${(difficultyTrend * 100).toFixed(1)}%`, icon: Cpu, color: difficultyTrend > 0 ? 'text-warning' : 'text-primary' }
           ].map((item, i) => (
              <div key={i} className="p-3 bg-light dark:bg-slate-800 rounded-financial border border-financial">
                 <div className="flex items-center gap-2 mb-2">
                    <item.icon size={12} className="text-primary" />
                    <span className="text-[9px] font-bold text-secondary uppercase tracking-tighter">{item.label}</span>
                 </div>
                 <div className={clsx("text-sm font-bold font-mono", item.color)}>{item.val}</div>
              </div>
           ))}
        </div>

        {/* Dynamic Risk Adjustment */}
        <div className="pt-4 border-t border-financial">
           <div className="text-[10px] text-secondary font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
              <ShieldAlert size={14} className="text-warning" />
              Dynamic Risk Adjustment
           </div>
           <div className="space-y-3">
              {[
                 { label: 'Leverage Multiplier', val: `x${riskAdjustment.leverageMultiplier.toFixed(2)}`, status: riskAdjustment.leverageMultiplier < 1 ? 'Reduced' : 'Nominal' },
                 { label: 'Position Size', val: `x${riskAdjustment.sizeMultiplier.toFixed(2)}`, status: riskAdjustment.sizeMultiplier < 1 ? 'Scaled' : 'Nominal' },
                 { label: 'Risk Limits', val: `x${riskAdjustment.riskLimitMultiplier.toFixed(2)}`, status: riskAdjustment.riskLimitMultiplier < 1 ? 'Tightened' : 'Nominal' }
              ].map((r, i) => (
                 <div key={i} className="flex justify-between items-center text-[10px] font-bold uppercase">
                    <span className="text-secondary">{r.label}</span>
                    <div className="flex items-center gap-3">
                       <span className="text-dark dark:text-white font-mono">{r.val}</span>
                       <span className={clsx("text-[8px] px-2 py-0.5 rounded", r.status === 'Nominal' ? 'bg-success bg-opacity-10 text-success' : 'bg-warning bg-opacity-10 text-warning')}>
                          {r.status}
                       </span>
                    </div>
                 </div>
              ))}
           </div>
        </div>

        {/* Protection Mode Notification */}
        {enabled && displayAlpha > 85 && (
           <div className="mt-5 p-3 bg-danger bg-opacity-10 border border-danger border-opacity-20 rounded-lg animate-pulse">
              <div className="text-[10px] font-bold text-danger uppercase tracking-widest mb-1 d-flex align-items-center gap-2">
                 <Lock size={12} /> Capital Guard Active
              </div>
              <p className="text-[9px] text-danger font-medium m-0">Aggressive entries blocked due to extreme environment stress.</p>
           </div>
        )}
      </div>
    </div>
  );
};

export default WeatherIntelligencePanel;
