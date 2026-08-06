import { useEffect, useRef, useState } from "react";
import { createChart, CrosshairMode, CandlestickSeries, LineSeries, createSeriesMarkers, type SeriesMarker } from "lightweight-charts";
import clsx from "clsx";
import { useAppStore } from "../../store/useAppStore";
import { useKlines } from "../../hooks/useKlines";

export default function TradingViewChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const emaSeriesRef = useRef<any>(null);
  const maSeriesRef = useRef<any>(null);
  const markersPluginRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);
  const currentPriceLineRef = useRef<any>(null);
  
  const formatPrice = (p: number) => {
    if (!isFinite(p)) return "0.00";
    const digits = p < 0.0001 ? 8 : p < 0.01 ? 6 : p < 1 ? 4 : p < 100 ? 3 : 2;
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(p);
  };

  const formatVolume = (v: number) => {
    if (!isFinite(v)) return "0";
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
    return v.toFixed(0);
  };
  
  const { selectedSymbol, timeframe, consensusData, trades, positions, inrRate, tickerData } = useAppStore();
  const [trend, setTrend] = useState<"BULLISH" | "BEARISH" | "NEUTRAL">("NEUTRAL");
  const { data, loading } = useKlines(selectedSymbol, timeframe);

  const formatINR = (n: number) => {
    if (!isFinite(n)) return "0.00";
    const abs = Math.abs(n);
    const digits = abs === 0 ? 2 : abs < 0.0001 ? 8 : abs < 0.01 ? 6 : abs < 1 ? 4 : 2;
    return n.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  };

  // EMA Calculation (Exponential Moving Average)
  const calculateEMA = (data: any[], period: number) => {
    const ema: any[] = [];
    const k = 2 / (period + 1);
    let prevEma = data[0]?.close;
    
    for (let i = 0; i < data.length; i++) {
      const currentEma = data[i].close * k + prevEma * (1 - k);
      ema.push({ time: data[i].time, value: currentEma });
      prevEma = currentEma;
    }
    return ema;
  };

  // SMA Calculation (Simple Moving Average)
  const calculateSMA = (data: any[], period: number) => {
    const sma: any[] = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((acc, d) => acc + d.close, 0);
      sma.push({ time: data[i].time, value: sum / period });
    }
    return sma;
  };

  useEffect(() => {
    const initChart = () => {
      try {
        if (!containerRef.current) {
          console.warn("[TradingViewChart] Container ref not available");
          return;
        }

        containerRef.current.innerHTML = "";
        
        // Create chart with proper error handling
        const chart = createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
          layout: {
            background: { color: "#0A0F1C" },
            textColor: "#94A3B8",
          },
          grid: {
            vertLines: { color: "rgba(255,255,255,0.03)" },
            horzLines: { color: "rgba(255,255,255,0.03)" },
          },
          crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { color: "#3B82F6", labelBackgroundColor: "#1E293B" },
            horzLine: { color: "#3B82F6", labelBackgroundColor: "#1E293B" },
          },
          rightPriceScale: {
            borderColor: "rgba(255,255,255,0.08)",
          },
          timeScale: {
            borderColor: "rgba(255,255,255,0.08)",
            timeVisible: true,
            secondsVisible: false,
          },
        });

        if (!chart || typeof chart.addSeries !== 'function') {
          console.error("[TradingViewChart] Chart object invalid or missing methods", chart);
          return;
        }

        chartRef.current = chart;
        markersPluginRef.current = null;

        candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
          upColor: "#10b981",
          downColor: "#f43f5e",
          borderVisible: false,
          wickUpColor: "#10b981",
          wickDownColor: "#f43f5e",
        });

        emaSeriesRef.current = chart.addSeries(LineSeries, {
          color: "#fbbf24",
          lineWidth: 2,
          title: "EMA (20)",
        });

        maSeriesRef.current = chart.addSeries(LineSeries, {
          color: "#3b82f6",
          lineWidth: 2,
          title: "MA (50)",
        });

        const handleResize = () => {
          if (chartRef.current && containerRef.current) {
            chartRef.current.applyOptions({
              width: containerRef.current.clientWidth,
              height: containerRef.current.clientHeight,
            });
          }
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
      } catch (err) {
        console.error("[TradingViewChart] Init error:", err);
      }
    };

    initChart();

    return () => {
      if (chartRef.current && typeof chartRef.current.remove === 'function') {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || data.length === 0) return;

    const activeInrRate = inrRate || 83.5;
    
    const inrData = data.map(d => ({
      time: d.time,
      open: d.open * activeInrRate,
      high: d.high * activeInrRate,
      low: d.low * activeInrRate,
      close: d.close * activeInrRate,
    }));

    const samplePrice = inrData[inrData.length - 1]?.close || inrData[0]?.close || 1;
    const precision = samplePrice < 0.0001 ? 8 : samplePrice < 0.01 ? 6 : samplePrice < 1 ? 4 : samplePrice < 100 ? 3 : 2;
    const minMove = 1 / Math.pow(10, precision);

    const priceFormatConfig = {
      type: 'price' as const,
      precision,
      minMove,
    };

    candleSeriesRef.current.applyOptions({ priceFormat: priceFormatConfig });
    emaSeriesRef.current.applyOptions({ priceFormat: priceFormatConfig });
    maSeriesRef.current.applyOptions({ priceFormat: priceFormatConfig });

    const emaData = calculateEMA(inrData, 20);
    const maData = calculateSMA(inrData, 50);

    candleSeriesRef.current.setData(inrData);
    emaSeriesRef.current.setData(emaData);
    maSeriesRef.current.setData(maData);

    // Calculate Trend
    if (emaData.length > 0 && maData.length > 0) {
      const currentEma = emaData[emaData.length - 1].value;
      const currentMa = maData[maData.length - 1].value;
      setTrend(currentEma > currentMa ? "BULLISH" : "BEARISH");
    }

    // Clear existing price lines
    priceLinesRef.current.forEach((line) => {
      try {
        candleSeriesRef.current.removePriceLine(line);
      } catch (e) {}
    });
    priceLinesRef.current = [];
    if (currentPriceLineRef.current) {
      try {
        candleSeriesRef.current.removePriceLine(currentPriceLineRef.current);
      } catch (e) {}
      currentPriceLineRef.current = null;
    }

    // Draw current price on chart
    const latestPrice = inrData[inrData.length - 1]?.close;
    if (typeof latestPrice === "number" && candleSeriesRef.current) {
      currentPriceLineRef.current = candleSeriesRef.current.createPriceLine({
        price: latestPrice,
        color: "#60a5fa",
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `PRICE: ₹${formatINR(latestPrice)}`,
      });
    }

    // Build Markers Array
    const markers: SeriesMarker<any>[] = [];

    // 1. Add Auto-Executed Bot Trades from History
    const symbolTrades = trades.filter((t: any) => t.symbol === selectedSymbol);
    symbolTrades.forEach((t: any) => {
       // --- ENTRY POINT ---
       const entryTimeStr = t.openedAt || t.time;
       if (entryTimeStr) {
          const entryTime = Math.floor(new Date(entryTimeStr).getTime() / 1000);
          let closestCandle = null;
          let minDiff = Infinity;
          for (const candle of inrData) {
             const diff = Math.abs(candle.time - entryTime);
             if (diff < minDiff) {
                minDiff = diff;
                closestCandle = candle;
             }
          }
          if (closestCandle && minDiff < 3600) { 
             const usdPrice = t.entryPrice ?? t.price ?? 0;
             const inrPrice = usdPrice * activeInrRate;

             markers.push({
                time: closestCandle.time,
                position: t.side === "BUY" ? "belowBar" : "aboveBar",
                color: t.side === "BUY" ? "#10b981" : "#f43f5e",
                shape: t.side === "BUY" ? "arrowUp" : "arrowDown",
                text: `BOT ${t.side === "BUY" ? "BUY (Long)" : "SELL (Short)"} @ ₹${formatINR(inrPrice)}`,
             });
          }
       }

       // --- EXIT POINT ---
       if (t.status === "CLOSED" && t.closedAt) {
          const exitTime = Math.floor(new Date(t.closedAt).getTime() / 1000);
          let closestCandle = null;
          let minDiff = Infinity;
          for (const candle of inrData) {
             const diff = Math.abs(candle.time - exitTime);
             if (diff < minDiff) {
                minDiff = diff;
                closestCandle = candle;
             }
          }
          if (closestCandle && minDiff < 3600) {
             const usdPrice = t.exitPrice ?? t.price ?? 0;
             const inrPrice = usdPrice * activeInrRate;

             markers.push({
                time: closestCandle.time,
                position: t.side === "BUY" ? "aboveBar" : "belowBar",
                color: "#a855f7",
                shape: t.side === "BUY" ? "arrowDown" : "arrowUp",
                text: `BOT EXIT @ ₹${formatINR(inrPrice)} (${t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)} USDT)`,
             });
          }
       }
    });

    // 2. Add Live Active Signal
    const signal = consensusData?.[selectedSymbol];
    if (signal && inrData.length > 0) {
      const lastCandle = inrData[inrData.length - 1];
      if (signal.action === "LONG") {
        markers.push({
          time: lastCandle.time,
          position: "belowBar" as const,
          color: "#10b981",
          shape: "arrowUp" as const,
          text: "BUY SIGNAL",
        });
      } else if (signal.action === "SHORT") {
        markers.push({
          time: lastCandle.time,
          position: "aboveBar" as const,
          color: "#f43f5e",
          shape: "arrowDown" as const,
          text: "SELL SIGNAL",
        });
      }
    }
    
    // De-duplicate and Sort
    const uniqueMarkersMap = new Map();
    markers.forEach((m: any) => {
       uniqueMarkersMap.set(m.time + m.text, m); 
    });
    const finalMarkers = Array.from(uniqueMarkersMap.values()).sort((a: any, b: any) => a.time - b.time);

    if (!markersPluginRef.current) {
      markersPluginRef.current = createSeriesMarkers(candleSeriesRef.current, finalMarkers);
    } else {
      markersPluginRef.current.setMarkers(finalMarkers);
    }

    // 3. Draw Active Position entry, Stop Loss, and Take Profit lines
    const activePos = positions.find((p) => p.symbol === selectedSymbol);
    if (activePos && candleSeriesRef.current) {
      const entry = Number(activePos.entry ?? 0);
      if (entry > 0) {
        const entryInr = entry * activeInrRate;
        const entryLine = candleSeriesRef.current.createPriceLine({
          price: entryInr,
          color: "#0dcaf0", // Cyan for entry
          lineWidth: 2,
          lineStyle: 1, // Dotted
          axisLabelVisible: true,
          title: `ENTRY: ₹${formatINR(entryInr)}`,
        });
        priceLinesRef.current.push(entryLine);
      }

      const sl = Number(activePos.sl ?? 0);
      if (sl > 0) {
        const slInr = sl * activeInrRate;
        const slLine = candleSeriesRef.current.createPriceLine({
          price: slInr,
          color: "#dc3545", // Red for SL
          lineWidth: 1.5,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: `SL: ₹${formatINR(slInr)}`,
        });
        priceLinesRef.current.push(slLine);
      }

      const tp = Number(activePos.tp ?? 0);
      if (tp > 0) {
        const tpInr = tp * activeInrRate;
        const tpLine = candleSeriesRef.current.createPriceLine({
          price: tpInr,
          color: "#198754", // Green for TP
          lineWidth: 1.5,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: `TP: ₹${formatINR(tpInr)}`,
        });
        priceLinesRef.current.push(tpLine);
      }
    }
  }, [data, consensusData, selectedSymbol, positions, trades]);

  useEffect(() => {
    if (!loading && data.length > 0) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [selectedSymbol, loading]);

  const signal = consensusData?.[selectedSymbol];
  const signalAction = signal?.action === "LONG"
    ? "BUY"
    : signal?.action === "SHORT"
    ? "SELL"
    : "HOLD";
  const confidenceVal = signal?.confidenceLong !== undefined
    ? (Math.max(signal.confidenceLong, signal.confidenceShort || 0) * 100).toFixed(0)
    : "--";

  const marketSymbol = selectedSymbol.replace("USDT", "");
  const currentClose = data[data.length - 1]?.close ?? 0;
  const activeInrRate = inrRate || 83.5;
  const priceInINR = currentClose * activeInrRate;
  const ticker = tickerData[selectedSymbol];
  const open24 = ticker?.open ? parseFloat(ticker.open) : (data[0]?.open ?? 0);
  const high24 = ticker?.high ? parseFloat(ticker.high) : (data.length > 0 ? Math.max(...data.map((d) => d.high)) : 0);
  const low24 = ticker?.low ? parseFloat(ticker.low) : (data.length > 0 ? Math.min(...data.map((d) => d.low)) : 0);
  const high24INR = high24 * activeInrRate;
  const low24INR = low24 * activeInrRate;
  const rawVolume24 = ticker?.volume ? parseFloat(ticker.volume) : NaN;
  const volume24 = Number.isFinite(rawVolume24) && rawVolume24 > 0 ? rawVolume24 : null;
  const changePct24 = open24 > 0 ? ((currentClose - open24) / open24) * 100 : 0;
  const changeLabel = open24 > 0 ? `${changePct24 >= 0 ? "+" : ""}${changePct24.toFixed(2)}%` : "--";
  const changeColor = changePct24 > 0
    ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
    : changePct24 < 0
    ? "border-rose-500 bg-rose-500/10 text-rose-200"
    : "border-slate-700 bg-slate-900 text-slate-300";

  return (
    <div className="relative w-full h-full rounded-terminal overflow-hidden group bg-terminal-bg border border-white-08 shadow-2xl">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-terminal-bg/80 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="spinner-border text-info opacity-40" role="status" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted mt-2">Connecting_Oracle...</span>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute top-2 left-2 right-[60px] md:top-4 md:left-4 z-30 flex flex-wrap items-start gap-2 pointer-events-none">
        {/* Asset Header */}
        <div className="flex items-center gap-3 glass-panel rounded-terminal px-3 py-2 shadow-lg pointer-events-auto border-white-08">
           <img 
             src={`https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/svg/color/${marketSymbol.toLowerCase()}.svg`} 
             alt={marketSymbol} 
             className="w-5 h-5 rounded-full bg-white p-0.5 shadow-sm object-cover" 
             onError={(e) => { 
               e.currentTarget.onerror = null; 
               e.currentTarget.src = `https://ui-avatars.com/api/?name=${marketSymbol}&background=random&color=fff&rounded=true&font-size=0.4`; 
             }} 
           />
           <div className="flex flex-col justify-center">
             <div className="text-[11px] font-black text-white uppercase leading-none tracking-tighter">{marketSymbol} <span className="text-[8px] text-muted font-bold font-mono">PERP</span></div>
             <div className={clsx("text-[8px] font-black mt-1 uppercase tracking-widest font-mono", trend === "BULLISH" ? "text-profit" : trend === "BEARISH" ? "text-loss" : "text-muted")}>
               BIAS_{trend}
             </div>
           </div>
        </div>

        {/* Dynamic Price Tape */}
        <div className="flex items-center gap-3 glass-panel rounded-terminal px-3 py-2 shadow-lg pointer-events-auto border-white-08 font-mono">
          <div className="flex flex-col justify-center">
            <div className="flex items-baseline gap-2">
              <span className={clsx("text-sm font-black leading-none tracking-tighter", changePct24 >= 0 ? "text-profit" : "text-loss")}>
                {formatPrice(currentClose)}
              </span>
              <span className="hidden md:inline text-[9px] text-muted font-bold"> (₹{formatINR(priceInINR)})</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
               <span className={clsx("text-[9px] font-black", changePct24 >= 0 ? "text-profit" : "text-loss")}>{changeLabel}</span>
               <span className="text-[8px] text-muted font-bold uppercase tracking-widest">VOL: {volume24 !== null ? formatVolume(volume24) : "--"}</span>
            </div>
          </div>
        </div>

        {/* AI Execution Signal */}
        {signalAction !== "HOLD" && (
           <div className="flex items-center gap-2 glass-panel rounded-terminal px-3 py-2 shadow-lg pointer-events-auto border-white-08">
              <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${signalAction === "BUY" ? "bg-profit shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-loss shadow-[0_0_8px_rgba(239,68,68,0.6)]"}`}></div>
              <div className="flex flex-col justify-center">
                <span className={clsx("text-[9px] font-black uppercase tracking-widest leading-none", signalAction === "BUY" ? "text-profit" : "text-loss")}>{signalAction}_EXEC</span>
                <span className="text-[8px] text-muted font-black mt-1 tracking-tighter font-mono">CONF: {confidenceVal}%</span>
              </div>
           </div>
        )}
      </div>
    </div>
  );
}
