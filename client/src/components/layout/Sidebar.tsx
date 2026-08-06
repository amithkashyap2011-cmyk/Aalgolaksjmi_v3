import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Briefcase, ClipboardList, Zap,
  Settings, PieChart, ShieldCheck, BarChart3,
  Brain, FileText, ChevronLeft, ChevronRight, X, Landmark,
} from "lucide-react";

const NAV = [
  { to: "/",                label: "Dashboard",  icon: LayoutDashboard, end: true },
  { to: "/indian-market",   label: "NSE / BSE India", icon: Landmark },
  { to: "/aqea/wallet",     label: "Portfolio",  icon: PieChart },
  { to: "/aqea/positions",  label: "Positions",  icon: Briefcase },
  { to: "/aqea/orders",     label: "Orders",     icon: ClipboardList },
  { to: "/aqea/ai",         label: "AI Engine",  icon: Zap },
  { to: "/aqea/risk-center",label: "Risk",       icon: ShieldCheck },
] as const;

const NAV2 = [
  { to: "/backtest",   label: "Backtest",  icon: BarChart3 },
  { to: "/prediction", label: "Forecast",  icon: Brain },
  { to: "/reports",    label: "Reports",   icon: FileText },
  { to: "/settings",   label: "Settings",  icon: Settings },
] as const;

function linkStyle(active: boolean, collapsed: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 10,
    padding: collapsed ? "9px 0" : "8px 12px",
    margin: "1px 8px", borderRadius: 8,
    textDecoration: "none", whiteSpace: "nowrap",
    justifyContent: collapsed ? "center" : "flex-start",
    background: active ? "rgba(59,130,246,0.12)" : "transparent",
    color: active ? "#60a5fa" : "#64748b",
    borderLeft: active ? "2px solid #3b82f6" : "2px solid transparent",
    transition: "all 0.15s ease",
    fontSize: 13, fontWeight: active ? 600 : 400,
    cursor: "pointer",
  };
}

interface Props { open: boolean; onClose: () => void; }

export default function Sidebar({ open, onClose }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const W = collapsed ? 56 : 220;

  const links = (items: typeof NAV | typeof NAV2, col: boolean, onClick?: () => void) =>
    items.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={"end" in item ? item.end : false}
        title={col ? item.label : undefined}
        onClick={onClick}
        style={({ isActive }) => linkStyle(isActive, col)}
      >
        <item.icon size={16} style={{ flexShrink: 0 }} />
        {!col && <span>{item.label}</span>}
      </NavLink>
    ));

  const logoBlock = (col: boolean) => (
    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"14px 14px 10px", justifyContent: col ? "center" : "space-between", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
      {!col && (
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:28, height:28, background:"linear-gradient(135deg,#3b82f6,#1d4ed8)", borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:13, color:"#fff", flexShrink:0 }}>A</div>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:"#f1f5f9", lineHeight:1 }}>AQEA</div>
            <div style={{ fontSize:9, color:"#334155", fontWeight:700, letterSpacing:"0.1em" }}>V3.0</div>
          </div>
        </div>
      )}
      <button
        onClick={() => setCollapsed(!col)}
        style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", display:"flex", padding:4, borderRadius:6, flexShrink:0 }}
        title={col ? "Expand" : "Collapse"}
      >
        {col ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </div>
  );

  /* Desktop */
  return (
    <>
      <aside
        style={{ width:W, minWidth:W, height:"100%", flexDirection:"column", background:"#0a1120", borderRight:"1px solid rgba(255,255,255,0.05)", transition:"width 0.25s ease", overflow:"hidden", flexShrink:0, position:"relative", zIndex:30 }}
        className="hidden lg:flex"
      >
        {logoBlock(collapsed)}
        <nav style={{ flex:1, overflowY:"auto", overflowX:"hidden", padding:"8px 0", scrollbarWidth:"none" }}>
          {links(NAV, collapsed)}
          <div style={{ margin:"6px 12px", borderTop:"1px solid rgba(255,255,255,0.05)" }} />
          {!collapsed && <div style={{ fontSize:9, fontWeight:700, color:"#334155", textTransform:"uppercase", letterSpacing:"0.1em", padding:"6px 16px 2px" }}>Analysis</div>}
          {links(NAV2, collapsed)}
        </nav>
      </aside>

      {/* Mobile drawer */}
      <div
        style={{ position:"fixed", top:0, left:0, bottom:0, width:260, background:"#0a1120", zIndex:50, flexDirection:"column", transform: open ? "translateX(0)" : "translateX(-100%)", transition:"transform 0.25s ease", borderRight:"1px solid rgba(255,255,255,0.06)" }}
        className="flex lg:hidden"
      >
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:28, height:28, background:"linear-gradient(135deg,#3b82f6,#1d4ed8)", borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:13, color:"#fff" }}>A</div>
            <div style={{ fontSize:14, fontWeight:800, color:"#f1f5f9" }}>AQEA V3.0</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", padding:4, display:"flex" }}>
            <X size={18} />
          </button>
        </div>
        <nav style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
          {links(NAV, false, onClose)}
          <div style={{ margin:"6px 12px", borderTop:"1px solid rgba(255,255,255,0.05)" }} />
          <div style={{ fontSize:9, fontWeight:700, color:"#334155", textTransform:"uppercase", letterSpacing:"0.1em", padding:"6px 16px 2px" }}>Analysis</div>
          {links(NAV2, false, onClose)}
        </nav>
        <div style={{ borderTop:"1px solid rgba(255,255,255,0.05)", padding:"8px 0" }}>
          <NavLink to="/settings" onClick={onClose} style={({ isActive }) => linkStyle(isActive, false)}>
            <Settings size={16} />
            <span>Settings</span>
          </NavLink>
        </div>
      </div>
    </>
  );
}
