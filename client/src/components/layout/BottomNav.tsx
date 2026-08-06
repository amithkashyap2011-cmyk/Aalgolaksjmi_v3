import { NavLink } from "react-router-dom";
import { LayoutDashboard, Briefcase, Zap, PieChart, Settings } from "lucide-react";

const TABS = [
  { to: "/",                label: "Home",      icon: LayoutDashboard, end: true },
  { to: "/aqea/positions",  label: "Positions", icon: Briefcase },
  { to: "/aqea/ai",         label: "AI",        icon: Zap },
  { to: "/aqea/wallet",     label: "Portfolio", icon: PieChart },
  { to: "/settings",        label: "Settings",  icon: Settings },
] as const;

export default function BottomNav() {
  return (
    <nav
      className="flex lg:hidden"
      style={{ height:56, background:"#0a1120", borderTop:"1px solid rgba(255,255,255,0.05)", alignItems:"stretch", flexShrink:0, paddingBottom:"env(safe-area-inset-bottom)" }}
    >
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={"end" in t ? t.end : false}
          style={({ isActive }) => ({
            flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2,
            textDecoration:"none", color: isActive ? "#3b82f6" : "#475569",
            fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em",
            borderTop: isActive ? "2px solid #3b82f6" : "2px solid transparent",
            transition:"all 0.15s",
          })}
        >
          {({ isActive }) => (
            <>
              <t.icon size={18} style={{ flexShrink:0 }} strokeWidth={isActive ? 2.5 : 1.5} />
              <span>{t.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
