import { useAppStore } from "../../store/useAppStore";

export default function LogsCard() {
  const { alerts } = useAppStore();

  return (
    <div className="flex flex-col h-full bg-transparent">
      <h3 className="font-bold text-slate-100 mb-4 flex items-center justify-between text-sm">
        <span>EXECUTION LOGS</span>
        <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full uppercase tracking-wider">Live</span>
      </h3>
      
      <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800 flex flex-col-reverse">
        {alerts.length === 0 ? (
           <div className="flex-1 flex items-center justify-center text-slate-600 text-xs italic">
              Awaiting system events...
           </div>
        ) : (
          <ul className="space-y-2 pb-2">
            {[...alerts].reverse().map((log) => (
              <li key={log.id} className="text-xs flex gap-2 font-mono pb-1 border-b border-terminal-800 break-words">
                <span className="text-slate-500 shrink-0">[{log.time}]</span>
                <span className={`shrink-0 font-bold ${
                  log.level === "GREEN" ? "text-emerald-400" :
                  log.level === "AMBER" ? "text-amber-400" : "text-rose-400"
                }`}>
                  {log.level === "GREEN" ? "EXEC" : log.level === "AMBER" ? "WARN" : "ERR"}
                </span>
                <span className="text-slate-300 ml-1">{log.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
