/*
 * ─── BottomNav ─────────────────────────────────────────
 *
 * Mobile-only bottom tab bar (visible below lg breakpoint).
 * Golden-ratio spacing, safe-area padding for notch devices.
 * 5 tabs: Home, AI, Orders, Wallet, Settings.
 */
import { NavLink } from "react-router-dom";
import clsx from "clsx";

const TABS = [
  { to: "/",         label: "Home",     icon: "🏠" },
  { to: "/backtest", label: "AI",       icon: "🧠" },
  { to: "/history",  label: "Orders",   icon: "📋" },
  { to: "/wallet",   label: "Wallet",   icon: "💰" },
  { to: "/settings", label: "Settings", icon: "⚙️" },
] as const;

export default function BottomNav() {
  return (
    <nav
      data-testid="bottom-nav"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200/80 pb-[env(safe-area-inset-bottom)]"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-16">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === "/"}
            className={({ isActive }) =>
              clsx(
                "flex flex-col items-center justify-center gap-0.5 w-16 h-full text-phi-xs font-medium transition-all duration-200",
                isActive
                  ? "text-aalgreen scale-110"
                  : "text-slate-400 active:text-slate-600 active:scale-95",
              )
            }
          >
            <span className="text-lg leading-none">{t.icon}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
