import { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  Globe,
  Landmark,
  Zap,
  Cpu,
  FlaskConical,
  PieChart,
  ShieldCheck,
  ClipboardList,
  CheckCircle2,
  Settings,
  BarChart3,
  Brain,
  FileText,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

// 🌐 Global Overview
const GLOBAL_NAV = [
  { to: "/global", label: "GLOBAL", icon: Globe, market: "GLOBAL" as const, accent: "#10b981" },
] as const;

// 🇮🇳 Indian Market Section
const INDIA_NAV = [
  { to: "/india",              label: "DASHBOARD",       icon: Landmark,     market: "INDIA" as const, accent: "#ea580c" },
  { to: "/india#portfolio",    label: "Portfolio",        icon: PieChart,     market: "INDIA" as const, accent: "#ea580c" },
  { to: "/aqea/orders?market=INDIA", label: "Orders",     icon: ClipboardList, market: "INDIA" as const, accent: "#ea580c" },
  { to: "/india#reconciliation", label: "Reconciliation", icon: CheckCircle2, market: "INDIA" as const, accent: "#ea580c" },
] as const;

// ₿ Crypto Market Section
const CRYPTO_NAV = [
  { to: "/crypto",             label: "DASHBOARD",       icon: Zap,          market: "CRYPTO" as const, accent: "#3b82f6" },
  { to: "/crypto#portfolio",   label: "Portfolio",        icon: PieChart,     market: "CRYPTO" as const, accent: "#3b82f6" },
  { to: "/aqea/orders?market=CRYPTO", label: "Orders",    icon: ClipboardList, market: "CRYPTO" as const, accent: "#3b82f6" },
] as const;

// 🛠️ Shared Tools
const SHARED_NAV = [
  { to: "/agent-control",     label: "AGENT CONTROL",   icon: Cpu,          accent: "#a855f7" },
  { to: "/strategy-lab",      label: "STRATEGIES",      icon: FlaskConical, accent: "#ec4899" },
  { to: "/aqea/risk-center",  label: "RISK",            icon: ShieldCheck,  accent: "#f59e0b" },
  { to: "/settings",          label: "SYSTEM",          icon: Settings,     accent: "#64748b" },
] as const;

// Supplementary Research Modules
const RESEARCH_NAV = [
  { to: "/backtest",   label: "Backtest Studio", icon: BarChart3, accent: "#8b5cf6" },
  { to: "/prediction", label: "Market Forecast", icon: Brain,     accent: "#8b5cf6" },
  { to: "/reports",    label: "Audit Reports",   icon: FileText,  accent: "#8b5cf6" },
] as const;

interface NavItem {
  to: string;
  label: string;
  icon: any;
  market?: "INDIA" | "CRYPTO" | "GLOBAL";
  accent?: string;
}

const NAV_SECTIONS: { title: string; items: readonly NavItem[] }[] = [
  { title: "OVERVIEW", items: GLOBAL_NAV },
  { title: "🇮🇳 INDIAN MARKET", items: INDIA_NAV },
  { title: "₿ CRYPTO MARKET", items: CRYPTO_NAV },
  { title: "TOOLS", items: SHARED_NAV },
];

function linkStyle(active: boolean, collapsed: boolean, accentColor?: string): React.CSSProperties {
  const highlightColor = accentColor || "#3b82f6";
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: collapsed ? "8px 0" : "7px 12px",
    margin: "1px 8px",
    borderRadius: 7,
    textDecoration: "none",
    whiteSpace: "nowrap",
    justifyContent: collapsed ? "center" : "flex-start",
    background: active ? `${highlightColor}18` : "transparent",
    color: active ? "#ffffff" : "#94a3b8",
    borderLeft: active ? `3px solid ${highlightColor}` : "3px solid transparent",
    transition: "all 0.15s ease",
    fontSize: 12,
    fontWeight: active ? 800 : 500,
    letterSpacing: "0.02em",
    cursor: "pointer",
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const activeMarket = useAppStore((s) => s.activeMarket);
  const setActiveMarket = useAppStore((s) => s.setActiveMarket);
  const navigate = useNavigate();
  const location = useLocation();
  const W = collapsed ? 56 : 224;

  const handleLinkClick = (to: string, market?: "INDIA" | "CRYPTO" | "GLOBAL", onDrawerClose?: () => void) => {
    if (onDrawerClose) onDrawerClose();
    if (market) {
      setActiveMarket(market);
    } else if (to.startsWith("/india")) {
      setActiveMarket("INDIA");
    } else if (to.startsWith("/crypto") || to.startsWith("/futures") || to.startsWith("/spot")) {
      setActiveMarket("CRYPTO");
    } else if (to.startsWith("/global")) {
      setActiveMarket("GLOBAL");
    }
    navigate(to);
  };

  const isLinkActive = (to: string) => {
    if (to.startsWith("/aqea/orders?")) {
      const targetMarket = new URLSearchParams(to.split("?")[1]).get("market");
      return location.pathname === "/aqea/orders" && new URLSearchParams(location.search).get("market") === targetMarket;
    }
    const [targetPath, targetHash] = to.split("#");
    if (targetHash) {
      return location.pathname === targetPath && location.hash === `#${targetHash}`;
    }
    if (to === "/crypto" || to === "/spot") {
      return (location.pathname === "/crypto" || location.pathname === "/spot" || location.pathname === "/") && (!location.hash || location.hash === "#spot");
    }
    if (to === "/india") {
      return (location.pathname === "/india" || location.pathname === "/indian-market") && (!location.hash || location.hash === "" || location.hash === "#terminal");
    }
    return location.pathname.startsWith(to);
  };

  const renderNavItem = (item: NavItem, collapsedState: boolean, closeDrawer?: () => void) => {
    const active = isLinkActive(item.to);
    const Icon = item.icon;
    // "DASHBOARD"/"Orders"/"Portfolio" repeat under both the India and
    // Crypto sections — visually disambiguated by the section header above
    // them, but that header isn't programmatically associated with the
    // link, so a screen reader (or anything querying by accessible name)
    // can't tell the two apart. Prefix the market onto the accessible name.
    const ariaLabel = item.market && item.market !== item.label.toUpperCase() ? `${item.market} ${item.label}` : undefined;
    return (
      <a
        key={item.to}
        href={item.to}
        onClick={(e) => {
          e.preventDefault();
          handleLinkClick(item.to, item.market, closeDrawer);
        }}
        style={linkStyle(active, collapsedState, item.accent)}
        title={collapsedState ? item.label : undefined}
        aria-label={ariaLabel}
      >
        <Icon size={16} style={{ color: active ? item.accent || "#3b82f6" : "#64748b", flexShrink: 0 }} />
        {!collapsedState && <span>{item.label}</span>}
      </a>
    );
  };

  const renderSection = (title: string, items: readonly NavItem[], collapsedState: boolean, closeDrawer?: () => void) => (
    <div key={title}>
      {!collapsedState && (
        <div style={{ padding: "8px 14px 2px", fontSize: 9, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {title}
        </div>
      )}
      {items.map((item) => renderNavItem(item, collapsedState, closeDrawer))}
    </div>
  );

  const logoBlock = (col: boolean) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", justifyContent: col ? "center" : "space-between", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      {!col && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, color: "#fff", flexShrink: 0 }}>
            A
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#f1f5f9", letterSpacing: "0.04em", lineHeight: 1 }}>AQEA V3</div>
            <div style={{ fontSize: 8.5, color: "#475569", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>Control Plane</div>
          </div>
        </div>
      )}
      <button
        onClick={() => setCollapsed(!col)}
        style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", display: "flex", padding: 4, borderRadius: 6, flexShrink: 0 }}
        title={col ? "Expand" : "Collapse"}
      >
        {col ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </div>
  );

  const marketBadge = (col: boolean) => {
    if (col) return null;
    const isInd = activeMarket === "INDIA";
    const isGlb = activeMarket === "GLOBAL";
    const bg = isInd ? "rgba(234, 88, 12, 0.12)" : isGlb ? "rgba(16, 185, 129, 0.12)" : "rgba(37, 99, 235, 0.12)";
    const border = isInd ? "rgba(234, 88, 12, 0.3)" : isGlb ? "rgba(16, 185, 129, 0.3)" : "rgba(37, 99, 235, 0.3)";
    const color = isInd ? "#fb923c" : isGlb ? "#34d399" : "#60a5fa";
    const label = isInd ? "🇮🇳 INDIA ACTIVE" : isGlb ? "🌐 GLOBAL ACTIVE" : "₿ CRYPTO ACTIVE";

    return (
      <div style={{ margin: "6px 10px 8px", padding: "4px 8px", borderRadius: 6, background: bg, border: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9.5, fontWeight: 900, color, letterSpacing: "0.05em" }}>{label}</span>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        style={{ width: W, minWidth: W, height: "100%", flexDirection: "column", background: "#0a1120", borderRight: "1px solid rgba(255,255,255,0.06)", transition: "width 0.22s cubic-bezier(0.4, 0, 0.2, 1)", overflow: "hidden", flexShrink: 0, position: "relative", zIndex: 30 }}
        className="hidden lg:flex"
      >
        {logoBlock(collapsed)}
        {marketBadge(collapsed)}

        <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "6px 0", scrollbarWidth: "none" }}>
          {NAV_SECTIONS.map((section, i) => (
            <div key={section.title}>
              {i > 0 && <div style={{ margin: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.06)" }} />}
              {renderSection(section.title, section.items, collapsed)}
            </div>
          ))}

          <div style={{ margin: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.06)" }} />

          {renderSection("RESEARCH & AUDIT", RESEARCH_NAV, collapsed)}
        </nav>
      </aside>

      {/* Mobile Drawer */}
      <div
        style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 270, background: "#0a1120", zIndex: 50, flexDirection: "column", transform: open ? "translateX(0)" : "translateX(-100%)", transition: "transform 0.25s ease", borderRight: "1px solid rgba(255,255,255,0.08)" }}
        className="flex lg:hidden"
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, color: "#fff" }}>
              A
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#f1f5f9" }}>AALGOLAKSHMI V3</div>
              <div style={{ fontSize: 9, color: "#64748b", fontWeight: 700 }}>Control Plane</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 4, display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        {marketBadge(false)}

        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {NAV_SECTIONS.map((section, i) => (
            <div key={section.title}>
              {i > 0 && <div style={{ margin: "6px 12px", borderTop: "1px solid rgba(255,255,255,0.06)" }} />}
              {renderSection(section.title, section.items, false, onClose)}
            </div>
          ))}

          <div style={{ margin: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.06)" }} />

          {renderSection("RESEARCH & AUDIT", RESEARCH_NAV, false, onClose)}
        </nav>
      </div>
    </>
  );
}
