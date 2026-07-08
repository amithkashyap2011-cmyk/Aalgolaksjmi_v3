import React, { useEffect, useState } from 'react';
import { useDashboardStore } from '../../store/useDashboardStore';
import { formatCurrency } from '../../lib/currency';
import { TrendingUp, TrendingDown, CheckCircle2, XCircle, ShieldAlert, CircleDot, Coins } from 'lucide-react';
import clsx from 'clsx';
import IntelligenceDrawer from './IntelligenceDrawer';

const getCoinIcon = (symbol: string) => {
  const iconMap: Record<string, string> = {
    BTCUSDT: '₿',
    ETHUSDT: 'Ξ',
    BNBUSDT: '🔶',
    SOLUSDT: '◎',
    XRPUSDT: '✕',
    ADAUSDT: '₳',
    DOGEUSDT: '🐶',
    SHIBUSDT: '🐕'
  };
  const textIcon = iconMap[symbol];
  if (textIcon) {
    return <span className="font-bold text-xs text-amber-400 me-1">{textIcon}</span>;
  }
  return <Coins size={10} className="text-amber-400 me-1" />;
};

const MarketRibbon: React.FC = () => {
  const { headerData, fetchHeader, summary } = useDashboardStore();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  useEffect(() => {
    fetchHeader();
    const interval = setInterval(fetchHeader, 5000);
    return () => clearInterval(interval);
  }, [fetchHeader]);

  const DecisionTag = ({ decision, score }: { decision: string, score: number }) => {
     const styles: any = {
        LONG: 'text-success bg-success bg-opacity-10',
        SHORT: 'text-danger bg-danger bg-opacity-10',
        HOLD: 'text-warning bg-warning bg-opacity-10'
     };
     return (
        <span className={clsx("px-2 py-0.5 rounded font-black text-[10px] ms-2", styles[decision] || styles.HOLD)}>
           {decision} {score}
        </span>
     );
  };

  const selectedItem = headerData.find(d => d.symbol === selectedSymbol);

  return (
    <>
      <div className="market-ribbon border-bottom border-financial text-white overflow-hidden select-none sticky-top z-50 flex-shrink-0" style={{ height: '56px', top: 0 }}>
         <div className="d-flex align-items-center h-100 position-relative">
            <div className="market-ribbon-label d-flex shrink-0 items-center justify-center px-4 font-black text-xs uppercase tracking-widest border-end border-financial h-100 whitespace-nowrap">
               Market Pulse
            </div>
            
            {/* Smooth Marquee Track */}
            <div className="d-flex flex-grow-1 overflow-hidden position-relative market-ribbon-track" style={{ minWidth: 0 }}>
               <div className="animate-marquee d-flex align-items-center whitespace-nowrap">
                  {/* Render twice for seamless continuous scroll loop */}
                  {[...headerData, ...headerData].map((item, idx) => {
                      const priceUsdt = item.price || 0;
                      const priceInr = priceUsdt * (summary?.inrRate || 85.0);
                      const hasLiveSignal = item?.hasLiveSignal !== false && typeof item?.aqeaScore === "number";
                      const isLong = hasLiveSignal && item.decision === "LONG";
                      const isShort = hasLiveSignal && item.decision === "SHORT";
                      const actionText = hasLiveSignal ? (isLong ? "BUY" : isShort ? "SELL" : "HOLD") : "SYNC";
                      const trendText = hasLiveSignal ? (isLong ? "BULLISH" : isShort ? "BEARISH" : "NEUTRAL") : "AWAITING";
                      
                      // price 0 = server couldn't reach the exchange; show a
                      // dash rather than $0.00 (and never a stale/fake price).
                      const priceUnavailable = !priceUsdt;
                      const formattedUsdt = priceUnavailable ? "—"
                         : priceUsdt < 1
                         ? priceUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
                         : priceUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      const formattedInr = priceUnavailable ? "—"
                         : priceInr < 1
                         ? priceInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
                         : Math.round(priceInr).toLocaleString();
                      
                      return (
                         <div 
                            key={item.symbol + "-" + idx} 
                            className="market-ribbon-item d-flex align-items-center px-4 cursor-pointer transition-colors py-2 shrink-0 gap-3 font-mono h-100"
                            onClick={() => setSelectedSymbol(item.symbol)}
                         >
                            <span className="market-ribbon-symbol text-xs font-black uppercase d-flex align-items-center gap-1.5">
                               {getCoinIcon(item.symbol)}
                               {item.symbol}
                            </span>
                            <span className="market-ribbon-price text-[13px] font-bold">${formattedUsdt}</span>
                            <span className="market-ribbon-inr text-xs">₹{formattedInr}</span>
                           
                           {/* Action Badge */}
                           <span className={clsx("market-ribbon-badge d-flex align-items-center gap-1 text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider", hasLiveSignal ? (isLong ? "signal-long" : isShort ? "signal-short" : "signal-hold") : "signal-sync")}>
                              {actionText}
                           </span>
                           
                           {/* Trend Badge */}
                           <span className={clsx("market-ribbon-badge d-flex align-items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider", hasLiveSignal ? (isLong ? "signal-long" : isShort ? "signal-short" : "signal-hold") : "signal-sync")}>
                              {isLong ? <TrendingUp size={12} /> : isShort ? <TrendingDown size={12} /> : <CircleDot size={12} />}
                              {trendText}
                           </span>
                        </div>
                     );
                  })}
               </div>
            </div>
         </div>
      </div>

      {/* Right Side Drawer */}
      <IntelligenceDrawer 
         symbol={selectedSymbol} 
         onClose={() => setSelectedSymbol(null)} 
         data={selectedItem}
         summary={summary}
      />
    </>
  );
};

export default MarketRibbon;
