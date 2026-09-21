import { useEffect, useState, useCallback, useRef } from "react";
import Highcharts from "highcharts/highstock";
import HighchartsReact from "highcharts-react-official";
import { ensureHighchartsConfigured } from "../../lib/chartSetup";
import * as api from "../../lib/api";
import { socket, subscribeTicker, unsubscribeTicker, type TickData } from "../../lib/socket";
import { RefreshCw, Activity } from "lucide-react";

ensureHighchartsConfigured();

const TF_OPTIONS = [
  { key: "1",   label: "1m" },
  { key: "5",   label: "5m" },
  { key: "15",  label: "15m" },
  { key: "60",  label: "1H" },
  { key: "240", label: "4H" },
  { key: "D",   label: "1D" },
];
const TF_MAP: Record<string, string> = { "1": "1m", "5": "5m", "15": "15m", "30": "30m", "60": "1h", "240": "4h", "D": "1d" };

interface Props {
  symbol: string;
  interval?: string;
  height?: number;
}

export default function KlineChart({ symbol, interval: initInterval = "60", height = 420 }: Props) {
  const [interval, setChartInterval] = useState(initInterval);
  const binInterval = TF_MAP[interval] || "1h";
  const [ohlc, setOhlc]     = useState<number[][]>([]);
  const [volume, setVolume] = useState<number[][]>([]);
  const [err, setErr]       = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const isFetchingRef = useRef(false);

  const load = useCallback((isSilent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!isSilent) {
      setLoading(true);
      setErr(null);
    }
    api.getKlines(symbol, binInterval, 200)
      .then((kl: any[]) => {
        if (!Array.isArray(kl) || kl.length === 0) {
          if (!isSilent) setErr("No market data");
          return;
        }
        const ohlcData = kl.map((k) => [Number(k.openTime), parseFloat(k.open), parseFloat(k.high), parseFloat(k.low), parseFloat(k.close)]);
        const volData = kl.map((k) => [Number(k.openTime), parseFloat(k.volume)]);
        setOhlc(ohlcData);
        setVolume(volData);
        if (ohlcData.length > 0) {
          setLivePrice(ohlcData[ohlcData.length - 1][4]);
        }
      })
      .catch((e: any) => {
        if (!isSilent) setErr(e?.message || "Failed to load");
      })
      .finally(() => {
        isFetchingRef.current = false;
        if (!isSilent) setLoading(false);
      });
  }, [symbol, binInterval]);

  // Initial load on symbol / interval switch
  useEffect(() => {
    load(false);
  }, [load]);

  // Real-time WebSocket streaming & live tick ingestion
  useEffect(() => {
    subscribeTicker(symbol, false);

    const stepMs = (function(tf: string) {
      if (tf === "1") return 60 * 1000;
      if (tf === "5") return 5 * 60 * 1000;
      if (tf === "15") return 15 * 60 * 1000;
      if (tf === "60") return 60 * 60 * 1000;
      if (tf === "240") return 240 * 60 * 1000;
      if (tf === "D") return 24 * 60 * 60 * 1000;
      return 60 * 1000;
    })(interval);

    const handleTick = (tick: TickData) => {
      if (tick.symbol !== symbol) return;
      const price = parseFloat(tick.price);
      if (!Number.isFinite(price) || price <= 0) return;
      setLivePrice(price);

      setOhlc((prev) => {
        if (!prev || prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const now = tick.time || Date.now();
        const candleOpenTime = last[0];

        if (now < candleOpenTime + stepMs) {
          // Inside current candle — update high, low, close
          const updated = [
            candleOpenTime,
            last[1],
            Math.max(last[2], price),
            Math.min(last[3], price),
            price,
          ];
          return [...prev.slice(0, -1), updated];
        } else {
          // Candle interval closed — append new live candle
          const newCandleTime = Math.floor(now / stepMs) * stepMs;
          const newCandle = [newCandleTime, price, price, price, price];
          return [...prev.slice(1), newCandle];
        }
      });
    };

    socket.on("tick", handleTick);

    return () => {
      socket.off("tick", handleTick);
      unsubscribeTicker(symbol, false);
    };
  }, [symbol, interval]);

  // Background authoritative auto-refresh timer (fast 3.5s for 1m candles, 10s for higher)
  useEffect(() => {
    const pollMs = interval === "1" ? 3500 : 10000;
    const timer = window.setInterval(() => {
      load(true);
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [load, interval]);

  const options: Highcharts.Options = {
    chart: { backgroundColor: "#070d1a", animation: false, height },
    accessibility: { enabled: false },
    credits: { enabled: false },
    rangeSelector: { enabled: false },
    navigator: { enabled: true, height: 36, outlineColor: "rgba(255,255,255,0.05)" },
    scrollbar: { enabled: false },
    tooltip: {
      split: false, shared: false,
      backgroundColor: "#0d1524", borderColor: "rgba(255,255,255,0.1)", borderWidth: 1,
      style: { color: "#f1f5f9", fontSize: "11px" },
    },
    xAxis: {
      lineColor: "rgba(255,255,255,0.06)",
      gridLineColor: "rgba(255,255,255,0.03)",
      labels: { style: { color: "#475569", fontSize: "10px" } },
      tickColor: "rgba(255,255,255,0.06)",
    },
    yAxis: [
      {
        height: "72%", gridLineColor: "rgba(255,255,255,0.04)",
        labels: { align: "left", x: 4, style: { color: "#475569", fontSize: "10px" } },
        title: { text: undefined },
      },
      {
        top: "75%", height: "25%", offset: 0,
        gridLineColor: "rgba(255,255,255,0.04)",
        labels: { enabled: false },
        title: { text: undefined },
      },
    ],
    plotOptions: {
      candlestick: { color: "#ef4444", lineColor: "#ef4444", upColor: "#10b981", upLineColor: "#10b981", lineWidth: 1 },
      column: { borderWidth: 0 },
    },
    series: [
      { type: "candlestick", name: symbol, data: ohlc, yAxis: 0, dataGrouping: { enabled: false } } as any,
      { type: "column", name: "Volume", data: volume, yAxis: 1, color: "rgba(59,130,246,0.3)", dataGrouping: { enabled: false } } as any,
    ],
  };

  const center: React.CSSProperties = { display:"flex", alignItems:"center", justifyContent:"center", background:"#070d1a", height, flexDirection:"column", gap:12 };

  const formatPrice = (p: number) => {
    if (!Number.isFinite(p)) return "0.00";
    if (p < 0.001) return p.toFixed(6);
    if (p < 1) return p.toFixed(4);
    if (p < 100) return p.toFixed(3);
    return p.toFixed(2);
  };

  return (
    <div style={{ position:"relative", background:"#070d1a" }}>
      {/* Toolbar */}
      <div style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 12px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
        <span style={{ fontSize:11, fontWeight:800, color:"#f8fafc", marginRight:4 }}>{symbol}</span>
        {TF_OPTIONS.map((tf) => (
          <button
            key={tf.key}
            onClick={() => setChartInterval(tf.key)}
            style={{
              padding:"2px 8px", borderRadius:4, fontSize:10, fontWeight:700,
              border:"none", cursor:"pointer",
              background: interval === tf.key ? "#3b82f6" : "rgba(255,255,255,0.05)",
              color: interval === tf.key ? "#fff" : "#475569",
              transition:"all 0.15s",
            }}
          >
            {tf.label}
          </button>
        ))}

        {/* Live Stream Indicator & Real-Time Price */}
        <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto", marginRight:12 }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:"#10b981", boxShadow:"0 0 8px #10b981", display:"inline-block" }} />
          <span style={{ fontSize:10, fontWeight:800, color:"#10b981", letterSpacing:"0.04em" }}>LIVE {binInterval.toUpperCase()}</span>
          {livePrice !== null && (
            <span style={{ fontSize:12, fontWeight:800, color:"#f8fafc", marginLeft:4, fontVariantNumeric:"tabular-nums" }}>
              ${formatPrice(livePrice)}
            </span>
          )}
        </div>

        <button
          onClick={() => load(false)}
          style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", padding:4, display:"flex" }}
          title="Manual Sync"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {loading && (
        <div style={center}>
          <div style={{ width:28, height:28, border:"2px solid #1e3a5f", borderTopColor:"#3b82f6", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
          <span style={{ fontSize:11, color:"#475569" }}>Loading {symbol}…</span>
        </div>
      )}
      {!loading && err && (
        <div style={center}>
          <span style={{ fontSize:12, color:"#ef4444" }}>{err}</span>
          <button onClick={() => load(false)} style={{ fontSize:11, color:"#3b82f6", background:"none", border:"none", cursor:"pointer" }}>Retry</button>
        </div>
      )}
      {!loading && !err && (
        <HighchartsReact
          highcharts={Highcharts}
          constructorType="stockChart"
          options={options}
          containerProps={{ style: { height, width:"100%" } }}
        />
      )}
    </div>
  );
}
