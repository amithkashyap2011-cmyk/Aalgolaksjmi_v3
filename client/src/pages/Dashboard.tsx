import React, { useEffect, useState } from 'react';
import { useDashboardStore } from '../store/useDashboardStore';
import { useAppStore } from '../store/useAppStore';
import { useSocket } from '../hooks/useSocket';
import { formatCurrency } from '../lib/currency';
import { 
  Activity, 
  Shield, 
  TrendingUp, 
  Zap, 
  History,
  CircleDot,
  BarChart3,
  Cpu,
  Brain,
  Target,
  Thermometer,
  ShieldCheck,
  TrendingDown,
  Lock,
  ArrowRight,
  Maximize2,
  ChevronRight
} from 'lucide-react';
import clsx from "clsx";

/* ── Institutional Components ── */

const Gauge = ({ value, label, color = "text-primary", max = 100 }: any) => {
  const percentage = (value / max) * 100;
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center text-center px-2">
      <div className="relative w-16 h-16 flex items-center justify-center">
        <svg className="w-full h-100 transform -rotate-90">
          <circle cx="32" cy="32" r={radius} stroke="currentColor" strokeWidth="4" fill="transparent" className="text-slate-100 dark:text-slate-800" />
          <circle cx="32" cy="32" r={radius} stroke="currentColor" strokeWidth="4" fill="transparent" strokeDasharray={circumference} strokeDashoffset={offset} className={clsx("transition-all duration-1000", color)} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-bold font-mono text-dark dark:text-white">{value}%</span>
        </div>
      </div>
      <span className="text-[8px] font-bold uppercase text-secondary tracking-tighter mt-1">{label}</span>
    </div>
  );
};

const MetricStripItem = ({ label, value, color = "text-dark" }: any) => (
  <div className="px-4 py-2 border-r border-financial flex flex-col justify-center min-w-[120px] shrink-0">
    <span className="text-[8px] font-bold text-secondary uppercase tracking-widest leading-none mb-1">{label}</span>
    <span className={clsx("text-[11px] font-bold font-mono leading-none", color)}>{value}</span>
  </div>
);

const AIDecisionTimelineItem = ({ log }: any) => (
  <div className="p-2 border-b border-financial hover:bg-light dark:hover:bg-slate-800 transition-colors group cursor-pointer">
    <div className="flex justify-between items-center mb-1">
      <span className="text-[9px] font-mono text-muted">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}</span>
      <span className={clsx("text-[9px] font-bold uppercase", log.decision === 'LONG' ? 'text-success' : 'text-danger')}>{log.decision}</span>
    </div>
    <div className="text-[10px] font-bold text-dark dark:text-white truncate">{log.symbol}</div>
    <div className="text-[9px] text-secondary truncate leading-tight group-hover:whitespace-normal group-hover:overflow-visible">{log.message}</div>
  </div>
);

const Dashboard: React.FC = () => {
  const { summary, status, logs, fetchDashboard, fetchHeader, headerData, mode, setMode, positions, currencyMode } = useDashboardStore();
  const { userId, connected } = useAppStore();
  const [analytics, setAnalytics] = useState<any>(null);
  useSocket();

  useEffect(() => {
    if (!userId) return;
    const fetchData = async () => {
      try {
        await Promise.all([fetchDashboard(userId, useAppStore.getState().accountType), fetchHeader()]);
        const res = await fetch(`/aqea-ui/analytics?userId=${userId}`);
        const data = await res.json();
        setAnalytics(data);
      } catch (err) {
        console.error("Dashboard data fetch failed:", err);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [userId, fetchDashboard, fetchHeader]);

  const isResetState = summary.totalEquity === 0;
  const heat = isResetState ? 0 : (summary.currentExposure || 0);
  const liveSignals = Array.isArray(headerData)
    ? headerData.filter((item: any) => item?.hasLiveSignal !== false && typeof item?.aqeaScore === 'number')
    : [];
  const avgSignalScore = liveSignals.length > 0
    ? liveSignals.reduce((sum: number, item: any) => sum + Number(item.aqeaScore || 0), 0) / liveSignals.length
    : 0;
  const bullishSignals = liveSignals.filter((item: any) => item?.decision === 'LONG').length;
  const bearishSignals = liveSignals.filter((item: any) => item?.decision === 'SHORT').length;
  const confidence = Number(avgSignalScore.toFixed(1));
  const quality = Math.round(summary.regime.consensus || 0);
  const sentiment = liveSignals.length > 0 ? Math.round((bullishSignals / liveSignals.length) * 100) : 0;
  const regimeLabel = (summary.regime.direction || 'SIDEWAYS').replace(/_/g, ' ');
  const regimeTone = summary.regime.direction === 'BULLISH' ? 'text-success' : summary.regime.direction === 'BEARISH' ? 'text-danger' : 'text-primary';
  const riskScore = Math.min(1, Math.max(0, heat / 100));
  const profitFactor = typeof summary.profitFactor === 'number' ? summary.profitFactor.toFixed(2) : String(summary.profitFactor ?? '0.00');
  const drawdown = `${Number(summary.maxDrawdown || 0).toFixed(2)}%`;
  const signalState = liveSignals.length > 0 ? 'LIVE' : 'AWAITING';
  const activePositions = isResetState ? [] : (positions || []);
  const portfolioModes = [
    { value: "PAPER", label: "Paper" },
    { value: "LIVE", label: "Live" },
    { value: "BACKTEST", label: "Backtest" },
    { value: "FUTURE_TRENT", label: "Future Trent" },
  ] as const;
  const reasoningItems = [
    {
      icon: TrendingUp,
      label: 'Trend Strength',
      val: `${Math.round(summary.regime.strength || 0)}%`,
      desc: liveSignals.length > 0 ? `${summary.regime.forecast} regime from live attribution` : 'Awaiting live attribution'
    },
    {
      icon: Activity,
      label: 'Order Flow',
      val: liveSignals.length > 0 ? (bullishSignals > bearishSignals ? 'Bullish' : bearishSignals > bullishSignals ? 'Bearish' : 'Balanced') : 'Awaiting',
      desc: liveSignals.length > 0 ? `${liveSignals.length} live model signals` : 'No fresh attribution records'
    },
    {
      icon: Target,
      label: 'Liquidity',
      val: activePositions.length > 0 ? 'Tracked' : 'Idle',
      desc: activePositions.length > 0 ? `${activePositions.length} open positions monitored` : 'No open positions'
    },
    {
      icon: ShieldCheck,
      label: 'Risk Gate',
      val: heat > 40 ? 'Elevated' : 'Safe',
      desc: `${summary.regime.riskState || 'NORMAL'} | Heat ${heat.toFixed(1)}%`
    }
  ];

  const dailyPnLVal = isResetState ? 0 : (summary.dailyPnL || 0);
  const dailyPnLStr = dailyPnLVal >= 0 
    ? `+${formatCurrency(dailyPnLVal, { mode: currencyMode, inrRate: summary.inrRate })}` 
    : formatCurrency(dailyPnLVal, { mode: currencyMode, inrRate: summary.inrRate });
  
  const openPnLVal = isResetState ? 0 : (summary.openPnL || 0);
  const openPnLStr = openPnLVal >= 0
    ? `+${formatCurrency(openPnLVal, { mode: currencyMode, inrRate: summary.inrRate })}`
    : formatCurrency(openPnLVal, { mode: currencyMode, inrRate: summary.inrRate });

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC] dark:bg-[#060B14] overflow-hidden">
      
      {/* ── Institutional Metric Strip (Bloomberg Top Bar) ── */}
      <div className="flex items-center bg-white dark:bg-[#0B1220] border-b border-financial overflow-x-auto no-scrollbar scroll-smooth whitespace-nowrap h-12 shrink-0 px-2">
         <div className="flex items-center gap-2 pr-4 border-r border-financial">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] font-bold text-dark dark:text-white uppercase tracking-tighter">NODE: V8_PROD</span>
         </div>
         <MetricStripItem label="Total Equity" value={formatCurrency(summary.totalEquity, { mode: currencyMode, inrRate: summary.inrRate })} color="text-primary" />
         <MetricStripItem label="Realized (Today)" value={dailyPnLStr} color="text-success" />
         <MetricStripItem label="Open P&L (Unreal)" value={openPnLStr} color="text-success" />
         <MetricStripItem label="Portfolio Heat" value={`${heat.toFixed(1)}%`} color={heat > 40 ? "text-danger" : "text-primary"} />
                   <MetricStripItem label="Risk Score" value={riskScore.toFixed(2)} color="text-info" />
          <MetricStripItem label="Win Rate" value={summary.closedTrades > 0 ? `${summary.winRate}%` : "0%"} color="text-success" />
          <MetricStripItem label="Loss Rate" value={summary.closedTrades > 0 ? `${(100 - summary.winRate).toFixed(1)}%` : "0%"} color="text-danger" />
          <MetricStripItem label="Profit Fact" value={profitFactor} color="text-primary" />
          <MetricStripItem label="Drawdown" value={drawdown} color="text-danger" />
          <MetricStripItem label="Market Regime" value={regimeLabel} color={regimeTone} />
         <div className="ml-auto flex items-center gap-4 px-4 h-full border-l border-financial">
            <span className={clsx("text-[10px] font-bold uppercase tracking-widest", mode === 'LIVE' ? 'text-danger' : 'text-primary')}>{mode}_TERMINAL</span>
            <button className="text-secondary hover:text-dark dark:hover:text-white"><Maximize2 size={14} /></button>
         </div>
      </div>

      {/* ── Main Terminal Layout (3-Column Architecture) ── */}
      <div className="flex-grow flex overflow-hidden">
        
        {/* ── Center Column: Trading Workspace (Chart + Orders) ── */}
        <div className="flex-grow flex flex-col border-r border-financial overflow-hidden">
           
           {/* Chart Area */}
           <div className="flex-grow bg-white dark:bg-[#060B14] relative overflow-hidden group">
              <div className="absolute inset-0 flex items-center justify-center opacity-5 dark:opacity-10 pointer-events-none">
                 <Zap size={400} />
              </div>
              
              {/* TradingView Placeholder Header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-financial bg-white dark:bg-[#0B1220] z-10 relative">
                 <div className="flex items-center gap-4">
                    <h2 className="text-sm font-bold text-dark dark:text-white uppercase tracking-tight">BTCUSDT.PERP</h2>
                    <div className="flex items-center gap-2 bg-light dark:bg-slate-800 px-2 py-0.5 rounded text-[10px] font-bold">
                       <span className="text-secondary">1H</span>
                       <ChevronRight size={10} className="text-muted" />
                       <span className="text-dark dark:text-white">64,124.50</span>
                       <span className="text-success">+1.24%</span>
                    </div>
                 </div>
                 <div className="flex items-center gap-2">
                    <button className="px-2 py-1 bg-primary text-white text-[10px] font-bold rounded uppercase shadow-sm">Indicators</button>
                    <button className="px-2 py-1 border border-financial text-dark dark:text-white text-[10px] font-bold rounded uppercase">Settings</button>
                 </div>
              </div>

              {/* Chart Body (Mockup for high density) */}
              <div className="absolute inset-0 top-10 flex flex-col p-4">
                 <div className="flex-grow grid grid-cols-12 gap-1 opacity-20 dark:opacity-40">
                    {Array.from({ length: 24 }).map((_, i) => (
                       <div key={i} className="flex items-end gap-0.5 h-full">
                          <div className="w-1 bg-success h-[60%]" style={{ height: `${35 + Math.abs(Math.sin(i * 0.4)) * 50}%` }} />
                          <div className="w-[1px] bg-dark dark:bg-white h-full opacity-10" />
                       </div>
                    ))}
                 </div>
                 
                 {/* Execution Overlays */}
                 <div className="absolute top-20 left-10 flex flex-col gap-1 z-20">
                    <div className="flex items-center gap-2 bg-success bg-opacity-90 text-white px-2 py-1 rounded text-[9px] font-bold shadow-lg border border-success">
                       <TrendingUp size={10} /> BUY 1.4 BTC @ 63,840.12
                    </div>
                    <div className="w-px h-10 border-l border-dashed border-success ml-2" />
                    <div className="flex items-center gap-2 bg-primary bg-opacity-90 text-white px-2 py-1 rounded text-[9px] font-bold shadow-lg border border-primary">
                       <Target size={10} /> TARGET TP1: 66,400.00
                    </div>
                 </div>
              </div>

              {/* Dynamic SL/TP Visual Widget */}
              <div className="absolute bottom-6 left-6 right-6 h-12 bg-white dark:bg-[#0B1220] border border-financial rounded-lg shadow-2xl flex items-center px-4 z-30 overflow-hidden">
                 <div className="flex items-center gap-3 pr-4 border-r border-financial h-full">
                    <ShieldCheck size={16} className="text-danger" />
                    <span className="text-[10px] font-bold text-dark dark:text-white uppercase">Dynamic_Guard</span>
                 </div>
                 <div className="flex-grow px-6 relative h-1 flex items-center justify-center">
                    <div className="absolute inset-0 bg-slate-100 dark:bg-slate-800 rounded-full" />
                    <div className="absolute left-[10%] w-2 h-2 bg-danger rounded-full shadow-lg border border-white dark:border-slate-900 z-10" />
                    <div className="absolute left-[30%] w-3 h-3 bg-white dark:bg-white rounded-full shadow-xl border-2 border-primary z-20" />
                    <div className="absolute left-[30%] right-[30%] h-full bg-primary bg-opacity-30 rounded-full" />
                    <div className="absolute right-[30%] w-2 h-2 bg-success rounded-full shadow-lg border border-white dark:border-slate-900 z-10" />
                    <div className="absolute right-[10%] w-2 h-2 bg-success rounded-full shadow-lg border border-white dark:border-slate-900 z-10" />
                 </div>
                 <div className="flex items-center gap-8 pl-6 h-full text-[9px] font-mono font-bold">
                    <div className="flex flex-col"><span className="text-danger uppercase leading-none mb-1">STOP LOSS</span><span className="text-dark dark:text-white">63,120.00</span></div>
                    <div className="flex flex-col"><span className="text-secondary uppercase leading-none mb-1">MARK</span><span className="text-dark dark:text-white">64,124.50</span></div>
                    <div className="flex flex-col"><span className="text-success uppercase leading-none mb-1">TAKE PROFIT</span><span className="text-dark dark:text-white">66,400.00</span></div>
                 </div>
              </div>
           </div>

           {/* Activity Ledger (Bottom Panel) */}
           <div className="h-48 bg-white dark:bg-[#0B1220] border-t border-financial flex flex-col shrink-0">
              <div className="flex items-center justify-between px-4 py-2 border-b border-financial bg-light dark:bg-slate-900">
                 <div className="flex items-center gap-2">
                    <History size={12} className="text-primary" />
                    <span className="text-[10px] font-bold text-dark dark:text-white uppercase tracking-widest">Global Order Ledger</span>
                 </div>
                 <div className="flex gap-4">
                    <button className="text-[9px] font-bold uppercase text-primary underline">Open Orders ({activePositions ? activePositions.length : 0})</button>
                    <button className="text-[9px] font-bold uppercase text-secondary">Filled (42)</button>
                 </div>
              </div>
              <div className="flex-grow overflow-y-auto no-scrollbar">
                 <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white dark:bg-[#0B1220] z-10 shadow-sm">
                       <tr className="text-[8px] font-bold text-secondary uppercase tracking-widest border-b border-financial">
                          <th className="px-4 py-2">Symbol</th>
                          <th className="px-4 py-2">Side</th>
                          <th className="px-4 py-2">Size</th>
                          <th className="px-4 py-2">Entry</th>
                          <th className="px-4 py-2">Mark</th>
                          <th className="px-4 py-2">PnL</th>
                          <th className="px-4 py-2">Action</th>
                       </tr>
                    </thead>
                    <tbody className="text-[10px] font-mono">
                       {activePositions && activePositions.length > 0 ? (
                          activePositions.map((pos: any, i: number) => {
                             const isLong = pos.side === 'BUY' || pos.side === 'LONG';
                             const sideText = isLong ? 'LONG' : 'SHORT';
                             const pnlVal = pos.pnl || 0;
                             const markPrice = pos.quantity > 0 
                                ? pos.entryPrice + (pnlVal / pos.quantity) * (isLong ? 1 : -1) 
                                : pos.entryPrice;
                             return (
                                <tr key={pos._id || i} className="border-b border-financial hover:bg-light dark:hover:bg-slate-800 transition-colors">
                                   <td className="px-4 py-2 font-bold text-dark dark:text-white">{pos.symbol}</td>
                                   <td className={clsx("px-4 py-2 font-bold", isLong ? "text-success" : "text-danger")}>{sideText}</td>
                                   <td className="px-4 py-2 text-dark dark:text-white">{pos.quantity}</td>
                                   <td className="px-4 py-2 text-secondary">{pos.entryPrice.toFixed(2)}</td>
                                   <td className="px-4 py-2 text-secondary">{markPrice.toFixed(2)}</td>
                                   <td className={clsx("px-4 py-2 font-bold", pnlVal >= 0 ? "text-success" : "text-danger")}>
                                      {pnlVal >= 0 ? '+' : ''}${pnlVal.toFixed(2)}
                                   </td>
                                   <td className="px-4 py-2">
                                      <button className="p-1 text-danger hover:bg-danger hover:text-white rounded transition-all"><Zap size={12} /></button>
                                   </td>
                                </tr>
                             );
                          })
                       ) : (
                          <tr>
                             <td colSpan={7} className="px-4 py-8 text-center text-secondary font-sans">No open positions</td>
                          </tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>

        {/* ── Right Column: AI Command Center (Intelligence + Gauges) ── */}
        <div className="w-80 bg-white dark:bg-[#0B1220] flex flex-col shrink-0 overflow-hidden">
           
           {/* AI Gauges Matrix */}
           <div className="p-4 border-b border-financial grid grid-cols-2 gap-4">
              <Gauge value={confidence} label="AI Confidence" color="text-warning" />
              <Gauge value={quality} label="Trade Quality" color="text-info" />
              <Gauge value={heat} label="Portfolio Heat" color={heat > 40 ? "text-danger" : "text-success"} />
              <Gauge value={sentiment} label="Sentiment" color="text-success" />
           </div>

           {/* Model Status Strip */}
           <div className="px-4 py-3 bg-light dark:bg-slate-900 border-b border-financial flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <Brain size={14} className="text-warning" />
                 <span className="text-[10px] font-bold text-dark dark:text-white uppercase tracking-widest">Active Intelligence</span>
              </div>
              <div className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-20 text-[9px] font-bold">V8.0_CORE</div>
           </div>

           {/* Reasoning Engine (Persistent Panel) */}
           <div className="flex-grow flex flex-col overflow-hidden">
              <div className="p-4 flex-grow overflow-y-auto no-scrollbar">
                 <div className="text-[10px] text-secondary font-bold uppercase tracking-widest mb-4">Reasoning Engine Logs</div>
                 <div className="space-y-4">
                    {reasoningItems.map((f, i) => (
                       <div key={i} className="flex gap-3">
                          <div className="mt-0.5 text-primary"><f.icon size={14} /></div>
                          <div>
                             <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-bold text-dark dark:text-white uppercase leading-none">{f.label}</span>
                                <span className="text-[10px] font-bold text-primary font-mono leading-none">{f.val}</span>
                             </div>
                             <p className="text-[9px] text-secondary leading-tight">{f.desc}</p>
                          </div>
                       </div>
                    ))}
                 </div>

                 <div className="mt-8 pt-4 border-t border-financial">
                    <div className="text-[10px] text-secondary font-bold uppercase tracking-widest mb-3">Capital Guard Status</div>
                    <div className="p-3 bg-success bg-opacity-5 dark:bg-slate-800 border border-success border-opacity-20 rounded-lg flex items-center gap-4">
                       <Lock size={20} className="text-success" />
                       <div>
                          <div className="text-xs font-bold text-success uppercase">Status: Safe</div>
                          <p className="text-[9px] text-secondary m-0 font-medium tracking-tight">Daily drawdown cap at -5.0%</p>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Event Timeline (Mini) */}
              <div className="h-48 border-t border-financial flex flex-col bg-white dark:bg-[#0B1220]">
                  <div className="px-4 py-2 border-b border-financial flex flex-col bg-white dark:bg-[#0B1220]">
                     <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-secondary uppercase tracking-widest">Decision Stream</span>
                        <button className="text-[8px] font-bold uppercase text-primary">{signalState}</button>
                     </div>
                     <div className="text-[7px] text-muted font-bold uppercase tracking-tighter mt-1">
                        Auto-trade follows configured threshold + live AI consent
                     </div>
                  </div>
                 <div className="flex-grow overflow-y-auto no-scrollbar">
                    {logs.slice(0, 10).map((l, i) => (
                       <AIDecisionTimelineItem key={i} log={l} />
                    ))}
                 </div>
              </div>
           </div>

        </div>
      </div>
    </div>
  );
};

export default Dashboard;
