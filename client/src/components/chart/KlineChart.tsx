import { useEffect, useState, useCallback } from "react";
import Highcharts from "highcharts/highstock";
import HighchartsReact from "highcharts-react-official";
import * as api from "../../lib/api";
import { RefreshCw } from "lucide-react";

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
  const [interval, setInterval] = useState(initInterval);
  const binInterval = TF_MAP[interval] || "1h";
  const [ohlc, setOhlc]     = useState<number[][]>([]);
  const [volume, setVolume] = useState<number[][]>([]);
  const [err, setErr]       = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    api.getKlines(symbol, binInterval, 200)
      .then((kl: any[]) => {
        if (!Array.isArray(kl) || kl.length === 0) { setErr("No market data"); return; }
        setOhlc(kl.map((k) => [Number(k.openTime), parseFloat(k.open), parseFloat(k.high), parseFloat(k.low), parseFloat(k.close)]));
        setVolume(kl.map((k) => [Number(k.openTime), parseFloat(k.volume)]));
      })
      .catch((e: any) => setErr(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [symbol, binInterval]);

  useEffect(() => { load(); }, [load]);

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

  return (
    <div style={{ position:"relative", background:"#070d1a" }}>
      {/* Toolbar */}
      <div style={{ display:"flex", alignItems:"center", gap:4, padding:"8px 12px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
        <span style={{ fontSize:11, fontWeight:700, color:"#94a3b8", marginRight:8 }}>{symbol}</span>
        {TF_OPTIONS.map((tf) => (
          <button
            key={tf.key}
            onClick={() => setInterval(tf.key)}
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
        <button
          onClick={load}
          style={{ marginLeft:"auto", background:"none", border:"none", color:"#475569", cursor:"pointer", padding:4, display:"flex" }}
          title="Refresh"
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
          <button onClick={load} style={{ fontSize:11, color:"#3b82f6", background:"none", border:"none", cursor:"pointer" }}>Retry</button>
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
