/*
 * ─── PriceChart ────────────────────────────────────────
 *
 * Phase 2: Highcharts Stock candlestick chart using MOCK data.
 * Fibonacci-colored bands: 0.236 (gold), 0.382 (green),
 * 0.5 (blue), 0.618 (purple), 0.786 (red).
 */
import { useMemo } from "react";
import Highcharts from "highcharts/highstock";
import HighchartsReact from "highcharts-react-official";
import { useAppStore } from "../../store/useAppStore";
import { computeFibLevels, generateMockCandles } from "../../mock/data";

export default function PriceChart() {
  const { selectedSymbol, timeframe } = useAppStore();

  const { ohlc, fib } = useMemo(() => {
    const candles = generateMockCandles(selectedSymbol, timeframe);
    const ohlcData = candles.map((c) => [c.time, c.open, c.high, c.low, c.close]);
    const fibLevels = computeFibLevels(candles);
    return { ohlc: ohlcData, fib: fibLevels };
  }, [selectedSymbol, timeframe]);

  const options: Highcharts.Options = {
    chart: {
      height: 380,
      backgroundColor: "transparent",
      style: { fontFamily: "inherit" },
    },
    rangeSelector: { enabled: false },
    navigator: { enabled: false },
    scrollbar: { enabled: false },
    title: { text: "" },
    credits: { enabled: false },
    xAxis: { type: "datetime", lineColor: "#e2e8f0", tickColor: "#e2e8f0" },
    yAxis: {
      opposite: false,
      gridLineColor: "#f1f5f9",
      plotBands: [
        {
          from: fib.low,
          to: fib.fib236,
          color: "rgba(212,175,55,0.08)",
          label: { text: "Fib 0.236", align: "right", style: { color: "#d4af37", fontSize: "9px" } },
        },
        {
          from: fib.fib236,
          to: fib.fib382,
          color: "rgba(0,185,107,0.06)",
          label: { text: "Fib 0.382", align: "right", style: { color: "#00b96b", fontSize: "9px" } },
        },
        {
          from: fib.fib382,
          to: fib.fib500,
          color: "rgba(59,130,246,0.05)",
          label: { text: "Fib 0.500", align: "right", style: { color: "#3b82f6", fontSize: "9px" } },
        },
        {
          from: fib.fib500,
          to: fib.fib618,
          color: "rgba(168,85,247,0.06)",
          label: { text: "Fib 0.618", align: "right", style: { color: "#a855f7", fontSize: "9px" } },
        },
        {
          from: fib.fib618,
          to: fib.fib786,
          color: "rgba(255,59,48,0.05)",
          label: { text: "Fib 0.786", align: "right", style: { color: "#ff3b30", fontSize: "9px" } },
        },
      ],
    },
    series: [
      {
        type: "candlestick",
        name: selectedSymbol,
        data: ohlc,
        color: "#ff3b30",
        upColor: "#00b96b",
        lineColor: "#ff3b30",
        upLineColor: "#00b96b",
      },
    ],
    tooltip: {
      backgroundColor: "rgba(255,255,255,0.95)",
      borderColor: "#e2e8f0",
      borderRadius: 10,
      shadow: true,
      style: { fontSize: "11px" },
    },
  };

  return (
    <div data-testid="price-chart">
      <HighchartsReact
        highcharts={Highcharts}
        constructorType="stockChart"
        options={options}
      />
    </div>
  );
}
