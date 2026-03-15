/*
 * ─── Sidebar ───────────────────────────────────────────
 *
 * Left nav rail with golden-ratio proportions.
 * Fixed on desktop (lg+), slide-over on mobile.
 * Items: Home, AI/Strategies, Orders, Settings.
 */
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { useAppStore } from "../../store/useAppStore";

const NAV_ITEMS = [
  { to: "/",         label: "Home",            icon: "🏠" },
  { to: "/backtest", label: "AI / Strategies", icon: "🧠" },
  { to: "/history",  label: "Orders",          icon: "📋" },
  { to: "/settings", label: "Settings",        icon: "⚙️" },
] as const;

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useAppStore();

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 lg:hidden"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      <aside
        data-testid="sidebar"
        className={clsx(
          "fixed lg:sticky top-0 z-40 h-screen bg-white/95 backdrop-blur-lg border-r border-slate-200/80",
          "transition-all duration-300 ease-out flex flex-col shrink-0",
          sidebarOpen
            ? "translate-x-0 w-56"
            : "-translate-x-full lg:translate-x-0 lg:w-20 w-0",
        )}
        aria-label="Main navigation"
      >
        {/* Brand header — golden rectangle */}
        <div className="p-phi-4 flex items-center gap-phi-2 border-b border-slate-100">
          <div className="w-10 h-10 rounded-phi-lg bg-gradient-to-br from-aalgold to-aalgold-dark flex items-center justify-center text-white font-bold text-phi-lg shrink-0 shadow-md">
            A
          </div>
          {sidebarOpen && (
            <span className="font-bold text-phi-sm tracking-tight hidden lg:inline bg-gradient-to-r from-aalgold to-aalgreen bg-clip-text text-transparent">
              AALGOLAKSHMI
            </span>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 flex flex-col gap-phi-1 p-phi-3" role="navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-phi-3 px-phi-3 py-2.5 rounded-phi text-phi-sm transition-all duration-200",
                  isActive
                    ? "bg-aalgreen/10 text-aalgreen font-semibold shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 hover:translate-x-0.5",
                )
              }
            >
              <span className="w-7 h-7 rounded-phi bg-slate-100 flex items-center justify-center text-sm shrink-0">
                {item.icon}
              </span>
              {sidebarOpen && (
                <span className="hidden lg:inline">{item.label}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom status */}
        <div className="p-phi-3 border-t border-slate-100">
          <div className="flex items-center gap-2 px-phi-3 py-2">
            <span className="dot-paper" />
            {sidebarOpen && (
              <span className="text-phi-xs text-slate-400 hidden lg:inline">
                v2.0 · Phase 6
              </span>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
