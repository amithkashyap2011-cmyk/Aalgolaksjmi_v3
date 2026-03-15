/*
 * ─── OhmSyncPanel ──────────────────────────────────────
 *
 * Phase 2: Mini "528 Hz" style wave chart.
 * Purple gradient areaspline representing regime/energy index.
 * Mock data only.
 */
import { useMemo } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import Card from "../../ui/Card";
import { generateOhmWave } from "../../mock/data";

export default function OhmSyncPanel() {
  const data = useMemo(generateOhmWave, []);

  const opts: Highcharts.Options = {
    chart: {
      height: 120,
      backgroundColor: "transparent",
      margin: [5, 5, 20, 25],
      style: { fontFamily: "inherit" },
    },
    title: { text: "" },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: { type: "datetime", visible: false },
    yAxis: { visible: false },
    plotOptions: { areaspline: { marker: { enabled: false } } },
    series: [
      {
        type: "areaspline",
        data,
        color: "#7c3aed",
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [
            [0, "rgba(124,58,237,0.3)"],
            [1, "rgba(124,58,237,0)"],
          ],
        } as unknown as Highcharts.ColorType,
        lineWidth: 2,
      },
    ],
  };

  return (
    <Card className="p-phi-4" data-testid="ohmsync-panel">
      <h3 className="font-semibold text-phi-sm mb-1 flex items-center gap-2">
        <span className="w-6 h-6 rounded-phi bg-purple-100 flex items-center justify-center text-xs">🔮</span>
        OhmSync · 528 Hz Regime
      </h3>
      <p className="text-[10px] text-slate-400 mb-2">Energy / regime pulse index</p>
      <HighchartsReact highcharts={Highcharts} options={opts} />
    </Card>
  );
}
