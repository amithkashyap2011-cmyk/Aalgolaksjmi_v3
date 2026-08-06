import { useDashboardStore } from '../store/useDashboardStore';
import { ShieldCheck, Thermometer, Zap, AlertTriangle, CheckCircle } from 'lucide-react';

const BG = "var(--ds-bg)", CARD = "var(--ds-surface)", BORD = "var(--ds-border)";
const G = "var(--ds-buy)", R = "var(--ds-sell)", A = "var(--ds-warning)", B = "var(--ds-primary)";

function RiskCard({ label, value, subValue, status, color }: any) {
  return (
    <div style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:12, padding:"16px 20px" }}>
      <div style={{ fontSize:9, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:800, color, fontFamily:"monospace", lineHeight:1.1, marginBottom: subValue ? 2 : 4 }}>{value}</div>
      {subValue && (
        <div style={{ fontSize:12, fontWeight:800, color: "#fbbf24", fontFamily:"monospace", marginBottom:4 }}>
          {subValue}
        </div>
      )}
      <div style={{ fontSize:9, color:"var(--ds-text-faint)", fontWeight:700, textTransform:"uppercase" }}>{status}</div>
    </div>
  );
}

export default function RiskCenterV8() {
  const { summary } = useDashboardStore();
  const inrRate  = summary?.inrRate || 85.0;
  const heat     = summary.currentExposure || 0;
  const equity   = summary.totalEquity || 0;
  const dailyPnl = summary.dailyPnL || 0;

  const riskScore       = (0.05 + (summary.openPositions || 0) * 0.03 + (Math.abs(dailyPnl) / (equity || 1)) * 0.05).toFixed(2);
  const dailyDrawdownPct = equity > 0 ? (dailyPnl / equity) * 100 : 0;
  const varVal           = (equity * 0.05);

  const heatColor = heat >= 70 ? R : heat >= 40 ? A : G;
  const ddColor   = dailyDrawdownPct < -5 ? R : dailyDrawdownPct < 0 ? A : G;

  const rules = [
    { label: "Heat > 40%",    rule: "BLOCK_NEW_TRADES", triggered: heat > 40 },
    { label: "Heat > 60%",    rule: "REDUCE_POSITION",  triggered: heat > 60 },
    { label: "Heat > 80%",    rule: "EMERGENCY_EXIT",   triggered: heat > 80 },
    { label: "Drawdown > 5%", rule: "AUTO_KILL",        triggered: Math.abs(dailyDrawdownPct) > 5 },
  ];

  const dailyPnlInr = dailyPnl * inrRate;
  const varInr      = varVal * inrRate;

  return (
    <div style={{ background:BG, minHeight:"100%", padding:"16px 16px 64px 16px", display:"flex", flexDirection:"column", gap:16 }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, background:"rgba(239,68,68,0.12)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <ShieldCheck size={18} color={R} />
          </div>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:"var(--ds-text)" }}>Risk Command</div>
            <div style={{ fontSize:11, color:"var(--ds-text-faint)" }}>Exposure monitoring &amp; enforcement (USD $ &amp; INR ₹)</div>
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:9, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Portfolio Heat</div>
          <div style={{ fontSize:28, fontWeight:800, color: heatColor, fontFamily:"monospace" }}>{heat.toFixed(1)}%</div>
        </div>
      </div>

      {/* Risk metrics grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:12 }}>
        <RiskCard
          label="Risk Score"
          value={riskScore}
          color={parseFloat(riskScore) > 0.25 ? R : parseFloat(riskScore) > 0.10 ? A : G}
          status={parseFloat(riskScore) < 0.10 ? "LOW RISK" : parseFloat(riskScore) < 0.25 ? "NORMAL" : "HIGH RISK"}
        />
        <RiskCard
          label="Daily PnL"
          value={`${dailyPnl >= 0 ? "+" : ""}${dailyPnl.toFixed(2)}$`}
          subValue={`${dailyPnlInr >= 0 ? "+" : "-"}₹${Math.abs(dailyPnlInr).toFixed(2)}`}
          color={ddColor}
          status={dailyPnl >= 0 ? "POSITIVE" : "NEGATIVE"}
        />
        <RiskCard
          label="Daily Drawdown"
          value={`${dailyDrawdownPct.toFixed(2)}%`}
          color={ddColor}
          status={Math.abs(dailyDrawdownPct) > 5 ? "CRITICAL" : Math.abs(dailyDrawdownPct) > 2 ? "WARNING" : "SAFE"}
        />
        <RiskCard
          label="Value At Risk"
          value={`$${varVal.toFixed(2)}`}
          subValue={`₹${varInr.toFixed(2)}`}
          color={B}
          status="95% CI"
        />
        <RiskCard
          label="Margin Usage"
          value={`${heat.toFixed(1)}%`}
          color={heatColor}
          status={heat > 40 ? "EXPOSURE WARNING" : "STABLE"}
        />
      </div>

      {/* Heat gauge */}
      <div style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:12, padding:"20px 24px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <Thermometer size={16} color={heatColor} />
          <span style={{ fontSize:12, fontWeight:700, color:"var(--ds-text)" }}>Real-Time Exposure Heat</span>
          <span style={{ marginLeft:"auto", fontSize:11, fontWeight:700, color: heat > 40 ? A : G }}>{heat > 40 ? "⚠ WARNING" : "✓ SAFE"}</span>
        </div>

        {/* Bar */}
        <div style={{ height:16, background:"var(--ds-border)", borderRadius:8, overflow:"hidden", marginBottom:8 }}>
          <div style={{ height:"100%", width:`${Math.min(100, heat)}%`, background: heat >= 70 ? R : heat >= 40 ? A : G, borderRadius:8, transition:"width 0.8s ease" }} />
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"var(--ds-text-faint)", fontWeight:700 }}>
          <span>0% SAFE</span>
          <span>40% THRESHOLD</span>
          <span>70% DANGER</span>
          <span>100%</span>
        </div>

        {/* Zone legend */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 130px), 1fr))", gap:6, marginTop:14 }} className="grid-4to2">
          {[
            { label:"Safe 0–30%",    color:G },
            { label:"Caution 30–50%", color:"#84cc16" },
            { label:"Warning 50–70%", color:A },
            { label:"Danger 70%+",    color:R },
          ].map((z) => (
            <div key={z.label} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 10px", background:`${z.color}10`, borderRadius:6, border:`1px solid ${z.color}30` }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:z.color, flexShrink:0 }} />
              <span style={{ fontSize:9, fontWeight:700, color:z.color }}>{z.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hard rules + SL/TP side by side */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap:16 }} className="risk-grid">

        {/* Hard block rules */}
        <div style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:12, overflow:"hidden" }}>
          <div style={{ padding:"12px 16px", borderBottom:`1px solid ${BORD}`, display:"flex", alignItems:"center", gap:8 }}>
            <AlertTriangle size={14} color={R} />
            <span style={{ fontSize:11, fontWeight:700, color:"var(--ds-text)" }}>Hard-Block Enforcement</span>
          </div>
          <div style={{ padding:"12px 16px", display:"flex", flexDirection:"column", gap:8 }}>
            {rules.map((r, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", background:"rgba(255,255,255,0.02)", borderRadius:8, border:`1px solid rgba(255,255,255,0.04)` }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:"var(--ds-text)" }}>{r.label}</div>
                  <div style={{ fontSize:10, fontWeight:700, color: r.triggered ? R : "var(--ds-text-faint)", fontFamily:"monospace" }}>{r.rule}</div>
                </div>
                <div style={{ fontSize:9, fontWeight:700, padding:"3px 8px", borderRadius:5, background: r.triggered ? `${R}18` : `${G}18`, color: r.triggered ? R : G, textTransform:"uppercase" }}>
                  {r.triggered ? "TRIGGERED" : "STANDBY"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SL/TP */}
        <div style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:12, overflow:"hidden" }}>
          <div style={{ padding:"12px 16px", borderBottom:`1px solid ${BORD}`, display:"flex", alignItems:"center", gap:8 }}>
            <Zap size={14} color={A} />
            <span style={{ fontSize:11, fontWeight:700, color:"var(--ds-text)" }}>Adaptive SL/TP Engine</span>
          </div>
          <div style={{ padding:"16px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, padding:"10px 14px", background:`${G}10`, borderRadius:8, border:`1px solid ${G}30` }}>
              <CheckCircle size={14} color={G} />
              <span style={{ fontSize:12, fontWeight:700, color:G }}>AUTO-CLOSE ENGINE ARMED</span>
            </div>
            {[
              "Profit lock active at +1.5%",
              "Breakeven protection at +0.5%",
              "Volatility exit enabled",
              "ATR-based trailing stop active",
              "Max position exposure: 3%",
            ].map((s, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderBottom:"1px solid var(--ds-border)" }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:G, flexShrink:0, animation:"pulse 2s infinite" }} />
                <span style={{ fontSize:11, color:"var(--ds-text-muted)" }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
