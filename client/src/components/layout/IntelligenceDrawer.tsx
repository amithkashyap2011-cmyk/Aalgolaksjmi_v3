import React from 'react';
import { X, TrendingUp, ShieldAlert, BarChart3, Activity, Clock, Anchor, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency } from '../../lib/currency';

interface IntelligenceDrawerProps {
  symbol: string | null;
  onClose: () => void;
  data: any;
  summary: any;
}

const IntelligenceDrawer: React.FC<IntelligenceDrawerProps> = ({ symbol, onClose, data, summary }) => {
  if (!symbol || !data) return null;

  const hasLiveSignal = data?.hasLiveSignal !== false && typeof data?.aqeaScore === "number";

  return (
    <div className={clsx(
      "position-fixed top-0 end-0 h-screen bg-white shadow-2xl border-start border-financial z-index-1060 transition-all duration-300",
      symbol ? "w-lg-450 w-100" : "w-0 overflow-hidden"
    )} style={{ zIndex: 1060, width: symbol ? '450px' : '0' }}>
      
      <div className="d-flex flex-column h-100">
         {/* Header */}
         <div className="p-4 border-bottom border-financial d-flex justify-content-between align-items-center bg-light bg-opacity-50">
            <div className="d-flex align-items-center gap-3">
               <div className="w-10 h-10 rounded-circle bg-primary text-white d-flex align-items-center justify-content-center font-bold">
                  {symbol.substring(0, 2)}
               </div>
               <div>
                  <h4 className="m-0 font-bold tracking-tight">{symbol}</h4>
                  <div className="text-[10px] text-secondary font-bold uppercase tracking-widest">Protocol Intelligence</div>
               </div>
            </div>
            <button onClick={onClose} className="btn btn-light rounded-circle p-2 border-financial">
               <X size={20} className="text-secondary" />
            </button>
         </div>

         {/* Scrollable Content */}
         <div className="flex-grow-1 overflow-y-auto custom-scrollbar p-4 p-xl-5">
            {/* Quick Metrics */}
            <div className="row g-3 mb-5 text-center font-mono">
               <div className="col-6">
                  <div className="bg-light p-4 rounded-financial border border-financial">
                     <div className="text-[9px] text-secondary font-bold uppercase mb-1 tracking-widest">AQEA Score</div>
                     <div className="text-3xl font-bold text-primary">{hasLiveSignal ? data.aqeaScore : "--"}</div>
                  </div>
               </div>
               <div className="col-6">
                  <div className="bg-light p-4 rounded-financial border border-financial">
                     <div className="text-[9px] text-secondary font-bold uppercase mb-1 tracking-widest">Decision</div>
                     <div className={clsx("text-xl font-bold", data.decision === 'LONG' ? 'text-success' : 'text-danger')}>
                        {data.decision}
                     </div>
                  </div>
               </div>
            </div>

            {/* Signal Attribution */}
            <section className="mb-5">
               <h6 className="text-xs font-bold text-secondary uppercase tracking-widest mb-4 d-flex align-items-center gap-2">
                  <Activity size={14} className="text-primary" /> Signal Attribution Matrix
               </h6>
               <div className="space-y-4">
                  {[
                     { label: 'Core Trend', val: 94 },
                     { label: 'OrderFlow', val: 62 },
                     { label: 'SmartMoney', val: 50 },
                     { label: 'Whale Flow', val: 88 }
                  ].map((m, i) => (
                     <div key={i} className="d-flex justify-content-between align-items-center p-3 bg-white border border-light rounded-financial shadow-sm">
                        <span className="text-sm font-medium text-secondary">{m.label}</span>
                        <span className="text-sm font-bold text-dark font-mono">{m.val}</span>
                     </div>
                  ))}
               </div>
            </section>

            {/* Forecast Horizons */}
            <section className="mb-5">
               <h6 className="text-xs font-bold text-secondary uppercase tracking-widest mb-4 d-flex align-items-center gap-2">
                  <Clock size={14} className="text-info" /> Forecast Horizons
               </h6>
               <div className="space-y-4">
                  <div className="bg-light bg-opacity-50 p-4 rounded-financial border border-financial">
                     <div className="d-flex justify-content-between mb-2">
                        <span className="text-xs font-bold text-dark">1H Projection</span>
                        <span className="text-xs font-bold text-success">84% Bullish</span>
                     </div>
                     <div className="progress" style={{ height: '4px' }}>
                        <div className="progress-bar bg-success" style={{ width: '84%' }} />
                     </div>
                  </div>
                  <div className="bg-light bg-opacity-50 p-4 rounded-financial border border-financial">
                     <div className="d-flex justify-content-between mb-2">
                        <span className="text-xs font-bold text-dark">4H Projection</span>
                        <span className="text-xs font-bold text-success">79% Bullish</span>
                     </div>
                     <div className="progress" style={{ height: '4px' }}>
                        <div className="progress-bar bg-success" style={{ width: '79%' }} />
                     </div>
                  </div>
               </div>
            </section>

            {/* Risk Oversight */}
            <section className="mb-5">
               <h6 className="text-xs font-bold text-secondary uppercase tracking-widest mb-4 d-flex align-items-center gap-2">
                  <ShieldAlert size={14} className="text-danger" /> Risk Oversight
               </h6>
               <div className="p-4 bg-white border border-financial rounded-financial shadow-sm">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                     <span className="text-sm font-medium text-secondary">Risk Status</span>
                     <span className={clsx("badge font-bold uppercase", data.riskApproved ? "bg-success bg-opacity-10 text-success" : "bg-danger bg-opacity-10 text-danger")}>
                        {data.riskApproved ? "APPROVED" : "BLOCKADE_ACTIVE"}
                     </span>
                  </div>
                  {!data.riskApproved && (
                     <div className="p-3 bg-danger bg-opacity-5 border border-danger border-opacity-10 rounded-financial mt-3">
                        <div className="text-[10px] text-danger font-bold uppercase tracking-tighter mb-1">Rejection Reason</div>
                        <div className="text-xs text-danger font-mono font-bold">{data.blockReason}</div>
                     </div>
                  )}
               </div>
            </section>

            {/* CTA */}
            <div className="pt-4 border-top border-light mt-auto">
               <button 
                  onClick={() => window.location.href = `/aqea?symbol=${symbol}`}
                  className="btn btn-financial btn-financial-primary w-100 py-3 shadow-md d-flex align-items-center justify-content-center gap-2"
               >
                  Go to Mission Control <ArrowRight size={18} />
               </button>
            </div>
         </div>
      </div>
    </div>
  );
};

export default IntelligenceDrawer;
