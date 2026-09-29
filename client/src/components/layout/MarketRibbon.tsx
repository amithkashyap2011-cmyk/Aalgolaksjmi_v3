import React, { useEffect, useState } from 'react';
import { useDashboardStore } from '../../store/useDashboardStore';
import { useAppStore } from '../../store/useAppStore';
import { TrendingUp, TrendingDown, CircleDot, Coins, Landmark } from 'lucide-react';
import clsx from 'clsx';
import IntelligenceDrawer from './IntelligenceDrawer';
import { checkIsIndianMarketOpen } from '../../utils/indianMarketHours';

const getCoinIcon = (symbol: string) => {
  const iconMap: Record<string, string> = {
    BTCUSDT: '₿',
    ETHUSDT: 'Ξ',
    BNBUSDT: '🔶',
    SOLUSDT: '◎',
    XRPUSDT: '✕',
    ADAUSDT: '₳',
    DOGEUSDT: '🐶',
    SHIBUSDT: '🐕',
  };
  const textIcon = iconMap[symbol];
  if (textIcon) {
    return <span className="font-bold text-xs text-amber-400 me-1">{textIcon}</span>;
  }
  return <Coins size={10} className="text-amber-400 me-1" />;
};

interface IndianTickerItem {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  decision: "LONG" | "SHORT" | "HOLD";
  score: number;
}

const MarketRibbon: React.FC = () => {
  const { headerData, fetchHeader, summary } = useDashboardStore();
  const activeMarket = useAppStore((s) => s.activeMarket);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [indianPulse, setIndianPulse] = useState<IndianTickerItem[]>([]) // no invented prices: empty until the first live poll;

  useEffect(() => {
    fetchHeader().catch(() => {});
    const interval = setInterval(() => {
      fetchHeader().catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Live polling for Indian market prices when in Indian mode
  useEffect(() => {
    if (activeMarket !== "INDIA") return;
    const fetchIndianTicks = async () => {
      try {
        const res = await fetch("/api/indian-market/ticks");
        const data = await res.json();
        if (data.success && Array.isArray(data.ticks)) {
          setIndianPulse(data.ticks);
        }
      } catch {}
    };
    fetchIndianTicks();
    const t = setInterval(fetchIndianTicks, 8000);
    return () => clearInterval(t);
  }, [activeMarket]);

  const isIndian = activeMarket === "INDIA";
  const selectedItem = headerData.find((d) => d.symbol === selectedSymbol);

  return (
    <>
      <div className="market-ribbon border-bottom border-financial text-white overflow-hidden select-none sticky-top z-50 flex-shrink-0" style={{ height: '44px', top: 0, background: '#0b1326' }}>
        <div className="d-flex align-items-center h-100 position-relative">
          
          {/* Market Badge Label */}
          <div
            className="market-ribbon-label d-flex shrink-0 items-center justify-center px-3 font-black text-xs uppercase tracking-wider border-end border-financial h-100 whitespace-nowrap gap-1.5"
            style={{ color: isIndian ? "#fb923c" : "#60a5fa" }}
          >
            {isIndian ? <Landmark size={13} /> : <span>⚡</span>}
            <span>{isIndian ? "NSE / BSE Pulse" : "Binance 24/7"}</span>
          </div>

          {/* Smooth Marquee Track */}
          <div className="d-flex flex-grow-1 overflow-hidden position-relative market-ribbon-track" style={{ minWidth: 0 }}>
            <div className="animate-marquee d-flex align-items-center whitespace-nowrap">
              
              {/* 🇮🇳 INDIAN MARKET TICKERS */}
              {isIndian ? (() => {
                // After NSE close these signals are computed on frozen prices;
                // show CLOSED and keep the last signal as a tooltip.
                const nse = checkIsIndianMarketOpen();
                const nseClosed = !nse.isOpen && !nse.isPreMarket;
                if (indianPulse.length === 0) {
                  return (
                    <div className="market-ribbon-item d-flex align-items-center px-4 py-1.5 shrink-0 font-mono h-100" style={{ color: "#94a3b8", fontSize: 11 }}>
                      Loading live NSE / BSE prices…
                    </div>
                  );
                }
                return [...indianPulse, ...indianPulse].map((item, idx) => {
                  const isPositive = item.changePct >= 0;
                  const isLong = item.decision === "LONG";
                  const isShort = item.decision === "SHORT";
                  const actionText = isLong ? "BUY" : isShort ? "SELL" : "HOLD";

                  return (
                    <div
                      key={item.symbol + "-" + idx}
                      className="market-ribbon-item d-flex align-items-center px-4 cursor-pointer transition-colors py-1.5 shrink-0 gap-3 font-mono h-100"
                      onClick={() => setSelectedSymbol(item.symbol)}
                    >
                      <span className="market-ribbon-symbol text-xs font-black uppercase d-flex align-items-center gap-1">
                        <span style={{ color: "#f97316" }}>●</span>
                        {item.symbol}
                      </span>
                      <span className="market-ribbon-price text-[12px] font-bold text-slate-100">
                        ₹{item.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span style={{ fontSize: 10.5, color: "#94a3b8", fontFamily: "monospace" }}>
                        (${((item.price / (summary?.inrRate || 85.0))).toFixed(2)})
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: isPositive ? "#10b981" : "#ef4444" }}>
                        {isPositive ? "+" : ""}{item.changePct.toFixed(2)}%
                      </span>

                      {/* Action Badge */}
                      {nseClosed ? (
                        <span title={`Last signal at close: ${actionText} ${item.score}`} className="market-ribbon-badge d-flex align-items-center gap-1 text-[9.5px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider signal-hold">
                          CLOSED
                        </span>
                      ) : (
                        <span className={clsx("market-ribbon-badge d-flex align-items-center gap-1 text-[9.5px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider", isLong ? "signal-long" : isShort ? "signal-short" : "signal-hold")}>
                          {actionText} {item.score}
                        </span>
                      )}
                    </div>
                  );
                });
              })() : (
                /* ₿ CRYPTO MARKET TICKERS */
                [...headerData, ...headerData].map((item, idx) => {
                  const priceUsdt = item.price || 0;
                  const priceInr = priceUsdt * (summary?.inrRate || 85.0);
                  const hasLiveSignal = item?.hasLiveSignal !== false && typeof item?.aqeaScore === "number";
                  const isLong = hasLiveSignal && item.decision === "LONG";
                  const isShort = hasLiveSignal && item.decision === "SHORT";
                  const actionText = hasLiveSignal ? (isLong ? "BUY" : isShort ? "SELL" : "HOLD") : "SYNC";
                  const trendText = hasLiveSignal ? (isLong ? "BULLISH" : isShort ? "BEARISH" : "NEUTRAL") : "AWAITING";

                  const priceUnavailable = !priceUsdt;
                  const formattedUsdt = priceUnavailable
                    ? "—"
                    : priceUsdt < 1
                    ? priceUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
                    : priceUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  const formattedInr = priceUnavailable
                    ? "—"
                    : priceInr < 1
                    ? priceInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
                    : Math.round(priceInr).toLocaleString("en-IN");

                  return (
                    <div
                      key={item.symbol + "-" + idx}
                      className="market-ribbon-item d-flex align-items-center px-4 cursor-pointer transition-colors py-1.5 shrink-0 gap-2.5 font-mono h-100"
                      onClick={() => setSelectedSymbol(item.symbol)}
                    >
                      <span className="market-ribbon-symbol text-xs font-black uppercase d-flex align-items-center gap-1.5">
                        {getCoinIcon(item.symbol)}
                        {item.symbol}
                      </span>
                      <span className="market-ribbon-price text-[12px] font-bold text-slate-100">${formattedUsdt}</span>
                      <span style={{ fontSize: 10.5, color: "#94a3b8", fontFamily: "monospace" }}>
                        (₹{formattedInr})
                      </span>

                      {/* Action Badge */}
                      <span className={clsx("market-ribbon-badge d-flex align-items-center gap-1 text-[9.5px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider", hasLiveSignal ? (isLong ? "signal-long" : isShort ? "signal-short" : "signal-hold") : "signal-sync")}>
                        {actionText}
                      </span>

                      {/* Trend Badge */}
                      <span className={clsx("market-ribbon-badge d-flex align-items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider", hasLiveSignal ? (isLong ? "signal-long" : isShort ? "signal-short" : "signal-hold") : "signal-sync")}>
                        {isLong ? <TrendingUp size={11} /> : isShort ? <TrendingDown size={11} /> : <CircleDot size={11} />}
                        {trendText}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedItem && (
        <IntelligenceDrawer
          symbol={selectedItem.symbol}
          onClose={() => setSelectedSymbol(null)}
          data={selectedItem}
          summary={summary}
        />
      )}
    </>
  );
};

export default MarketRibbon;
