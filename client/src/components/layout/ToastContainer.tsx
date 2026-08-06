import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import clsx from "clsx";

export default function ToastContainer() {
  const alerts = useAppStore((s) => s.alerts);
  const [toasts, setToasts] = useState<any[]>([]);

  useEffect(() => {
    if (alerts.length === 0) return;
    const latest = alerts[0];
    setToasts((prev) => {
      if (prev.some((t) => t.id === latest.id)) return prev;
      return [latest, ...prev].slice(0, 10);
    });
  }, [alerts]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timeouts = toasts.map(toast => {
      return setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, 10000);
    });
    return () => timeouts.forEach(clearTimeout);
  }, [toasts]);

  // Helper to format text highlighting Score=XX in red
  const renderTextWithRedScore = (text: string) => {
    const regex = /(Score\s*[:=]\s*\d+(?:\.\d+)?%?)/gi;
    const parts = text.split(regex);
    if (parts.length === 1) return text;
    
    return parts.map((part, i) => {
      if (part.match(regex)) {
        return <span key={i} className="text-danger font-black">{part}</span>;
      }
      return part;
    });
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] flex flex-row overflow-x-auto gap-2 p-2 pointer-events-auto w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-financial items-center [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {toasts.map((toast) => {
        const textUpper = (toast.text || "").toUpperCase();
        
        let type: "HOLD" | "SUCCESS" | "FAILED" = "SUCCESS";
        
        if (textUpper.includes("HOLD") || textUpper.includes("NOT EXECUTED")) {
          type = "HOLD";
        } else if (
          textUpper.includes("FAIL") || 
          textUpper.includes("REJECT") || 
          textUpper.includes("ERROR") || 
          toast.level === "RED"
        ) {
          type = "FAILED";
        } else {
          type = "SUCCESS";
        }

        let bgClass = "";
        let headerColor = "";
        let icon = null;

        if (type === "HOLD") {
          bgClass = "bg-[#FFFBEB] border-[#FEF3C7] text-[#78350F]";
          headerColor = "text-[#D97706]";
          icon = <AlertCircle className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />;
        } else if (type === "SUCCESS") {
          bgClass = "bg-[#F0FDF4] border-[#DCFCE7] text-[#14532D]";
          headerColor = "text-[#16A34A]";
          icon = <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />;
        } else {
          // FAILED
          bgClass = "bg-[#FEF2F2] border-[#FEE2E2] text-[#7F1D1D]";
          headerColor = "text-[#DC2626]";
          icon = <AlertCircle className="w-3.5 h-3.5 text-[#DC2626] shrink-0" />;
        }

        return (
          <div
            key={toast.id}
            className={clsx(
              "flex items-center gap-2 px-3 py-1.5 rounded-pill shadow-sm border whitespace-nowrap shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-300",
              bgClass
            )}
          >
             {icon}
             <div className="flex items-center gap-2">
                <span className={clsx("text-[9px] font-black uppercase tracking-wider", headerColor)}>
                  [{toast.symbol || 'SYS'}]
                </span>
                <span className="text-[9px] font-semibold opacity-90 leading-tight">
                  {renderTextWithRedScore(toast.text)}
                </span>
             </div>
             <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-black/10">
               <span className="text-[8px] font-mono opacity-60">{new Date().toLocaleTimeString([], { hour12: false })}</span>
               <button 
                 onClick={() => setToasts(t => t.filter(x => x.id !== toast.id))}
                 className="p-0 border-0 bg-transparent opacity-60 hover:opacity-100 transition-opacity flex items-center justify-center"
               >
                 <X className="w-3 h-3 text-current" />
               </button>
             </div>
          </div>
        );
      })}
    </div>
  );
}
