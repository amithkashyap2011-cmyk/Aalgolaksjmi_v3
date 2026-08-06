import re

with open('/Users/amithks/aalgolakshmi_v2/client/src/components/chart/TradingViewChart.tsx', 'r') as f:
    code = f.read()

# Fix imports
code = code.replace(
    'import { useEffect, useRef } from "react";\nimport { createChart, CrosshairMode, CandlestickSeries, LineSeries, createSeriesMarkers, type SeriesMarker } from "lightweight-charts";',
    'import { useEffect, useRef, useState } from "react";\nimport { createChart, CrosshairMode, CandlestickSeries, LineSeries, type SeriesMarker } from "lightweight-charts";\nimport clsx from "clsx";'
)

# Fix hook state extraction
code = code.replace(
    'const { selectedSymbol, timeframe, consensusData } = useAppStore();',
    'const { selectedSymbol, timeframe, consensusData, trades } = useAppStore();\n  const [trend, setTrend] = useState<"BULLISH" | "BEARISH" | "NEUTRAL">("NEUTRAL");'
)

# Fix marker logic
marker_old = """    candleSeriesRef.current.setData(data);
    emaSeriesRef.current.setData(calculateEMA(data, 20));
    maSeriesRef.current.setData(calculateSMA(data, 50));

    // Markers for Buy/Sell signals
    const signal = consensusData?.[selectedSymbol];
    if (signal && data.length > 0) {
      const lastCandle = data[data.length - 1];
      const markers: SeriesMarker<any>[] = [];
      
      if (signal.action === "LONG") {
        markers.push({
          time: lastCandle.time,
          position: "belowBar" as const,
          color: "#10b981",
          shape: "arrowUp" as const,
          text: "BUY",
        });
      } else if (signal.action === "SHORT") {
        markers.push({
          time: lastCandle.time,
          position: "aboveBar" as const,
          color: "#f43f5e",
          shape: "arrowDown" as const,
          text: "SELL",
        });
      }
      
      if (!markersPluginRef.current) {
        markersPluginRef.current = createSeriesMarkers(candleSeriesRef.current, markers);
      } else {
        markersPluginRef.current.setMarkers(markers);
      }
    }"""

marker_new = """    const emaData = calculateEMA(data, 20);
    const maData = calculateSMA(data, 50);

    candleSeriesRef.current.setData(data);
    emaSeriesRef.current.setData(emaData);
    maSeriesRef.current.setData(maData);

    // Calculate Trend
    if (emaData.length > 0 && maData.length > 0) {
      const currentEma = emaData[emaData.length - 1].value;
      const currentMa = maData[maData.length - 1].value;
      setTrend(currentEma > currentMa ? "BULLISH" : "BEARISH");
    }

    // Build Markers Array
    const markers: SeriesMarker<any>[] = [];

    // 1. Add Auto-Executed Bot Trades from History
    const symbolTrades = trades.filter((t: any) => t.symbol === selectedSymbol);
    symbolTrades.forEach((t: any) => {
       const tTime = Math.floor(new Date(t.time).getTime() / 1000);
       // Find the closest candle
       let closestCandle = data[0];
       let minDiff = Infinity;
       for (const candle of data) {
          const diff = Math.abs(candle.time - tTime);
          if (diff < minDiff) {
             minDiff = diff;
             closestCandle = candle;
          }
       }
       if (closestCandle) {
          markers.push({
             time: closestCandle.time,
             position: t.side === "BUY" ? "belowBar" : "aboveBar",
             color: t.side === "BUY" ? "#059669" : "#e11d48",
             shape: t.side === "BUY" ? "arrowUp" : "arrowDown",
             text: `BOT ${t.side}`,
          });
       }
    });

    // 2. Add Live Active Signal
    const signal = consensusData?.[selectedSymbol];
    if (signal && data.length > 0) {
      const lastCandle = data[data.length - 1];
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

    candleSeriesRef.current.setMarkers(finalMarkers);"""
code = code.replace(marker_old, marker_new)

# Fix JSX overlay
jsx_old = """      {/* Legend Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-1 pointer-events-none">"""
jsx_new = """      {/* Legend Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-1.5 pointer-events-none">
        
        <div className={clsx(
          "px-2 py-1 rounded-sm border inline-flex items-center gap-1.5 mb-1",
          trend === "BULLISH" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600" :
          trend === "BEARISH" ? "bg-rose-500/10 border-rose-500/20 text-rose-600" :
          "bg-slate-500/10 border-slate-500/20 text-slate-500"
        )}>
           <div className={clsx("w-1.5 h-1.5 rounded-full animate-pulse", trend === "BULLISH" ? "bg-emerald-500" : trend === "BEARISH" ? "bg-rose-500" : "bg-slate-500")} />
           <span className="text-[10px] font-black uppercase tracking-widest bg-white">
              TREND: {trend}
           </span>
        </div>"""
code = code.replace(jsx_old, jsx_new)

with open('/Users/amithks/aalgolakshmi_v2/client/src/components/chart/TradingViewChart.tsx', 'w') as f:
    f.write(code)
