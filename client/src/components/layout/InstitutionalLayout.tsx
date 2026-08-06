import React, { Suspense } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  BrainCircuit, 
  Activity, 
  ShieldAlert, 
  MonitorDot, 
  Wifi, 
  Clock 
} from "lucide-react";

export default function InstitutionalLayout() {
  const location = useLocation();

  const navItems = [
    { name: "Command Center", path: "/institutional/command", icon: LayoutDashboard },
    { name: "AI Observability", path: "/institutional/ai", icon: BrainCircuit },
    { name: "Trade Attribution", path: "/institutional/attribution", icon: Activity },
    { name: "Risk Center", path: "/institutional/risk", icon: ShieldAlert },
    { name: "Paper Monitor", path: "/institutional/paper", icon: MonitorDot },
  ];

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-300 font-mono overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-950 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold text-emerald-500 tracking-tighter uppercase">AQEA V10.3</h1>
          <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">Institutional Terminal</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors text-sm ${
                  isActive 
                    ? "bg-slate-800 text-emerald-400 border border-slate-700" 
                    : "hover:bg-slate-900 text-slate-500 hover:text-slate-300"
                }`}
              >
                <Icon size={18} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 text-[10px] text-slate-600 space-y-2">
          <div className="flex justify-between">
            <span>UPTIME</span>
            <span className="text-slate-400">14:22:05</span>
          </div>
          <div className="flex justify-between">
            <span>VERSION</span>
            <span className="text-slate-400">V10.3.0_GOLDEN</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-8">
          <div className="flex items-center space-x-6 text-[11px] font-bold tracking-widest uppercase">
            <div className="flex items-center space-x-2 text-emerald-500">
              <Wifi size={14} />
              <span>BINANCE: CONNECTED</span>
            </div>
            <div className="flex items-center space-x-2 text-blue-500 border-l border-slate-800 pl-6">
              <Activity size={14} />
              <span>REGIME: TRENDING_BEAR</span>
            </div>
            <div className="flex items-center space-x-2 text-amber-500 border-l border-slate-800 pl-6">
              <ShieldAlert size={14} />
              <span>RISK: NOMINAL</span>
            </div>
          </div>

          <div className="flex items-center space-x-4 text-xs">
            <div className="flex items-center space-x-2 text-slate-500 uppercase">
              <Clock size={14} />
              <span>15:22:45 UTC</span>
            </div>
            <div className="h-4 w-px bg-slate-800" />
            <div className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-emerald-400 font-bold uppercase tracking-tighter">
              Paper Mode
            </div>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-8">
          <Suspense fallback={<div className="text-slate-500 animate-pulse">Loading Terminal Data...</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
