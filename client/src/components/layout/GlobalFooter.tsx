import { useState, useEffect } from "react";
import clsx from "clsx";
import { socket } from "../../lib/socket";
import { useAppStore } from "../../store/useAppStore";
import { CircleDot, Activity, Wifi, ShieldCheck } from "lucide-react";

export default function GlobalFooter() {
  const [latency, setLatency] = useState(0.0);
  const [countdown, setCountdown] = useState(20);
  const { selectedSymbol, consensusData } = useAppStore();

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => (prev <= 0 ? 20 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handlePong = () => {
      const pingTime = (socket as any)._lastPing;
      if (pingTime) {
        setLatency(Number((Date.now() - pingTime).toFixed(1)));
      }
    };

    const pingInterval = setInterval(() => {
      if (socket.connected) {
        (socket as any)._lastPing = Date.now();
        socket.emit("ping");
      }
    }, 2000);

    socket.on("pong", handlePong);

    return () => {
      clearInterval(pingInterval);
      socket.off("pong", handlePong);
    };
  }, []);

  const isHighLatency = latency > 5.0;
  const aiConf = consensusData[selectedSymbol]?.confidenceLong || 0;
  const confidencePct = (aiConf * 100).toFixed(1);

  return (
    <footer className="position-sticky bg-white border-top border-financial shadow-lg z-40 d-none d-lg-block" style={{ height: '40px', bottom: 0, marginTop: 'auto', width: '100%' }}>
      <div className="container-fluid h-100 px-4 d-flex align-items-center justify-content-between">
        
        {/* Connection Telemetry */}
        <div className="d-flex align-items-center gap-4">
           <div className="d-flex align-items-center gap-2">
              <Wifi size={14} className={isHighLatency ? "text-danger" : "text-success"} />
              <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">WSS_Relay:</span>
              <span className="text-[11px] font-bold text-dark font-mono">{latency.toFixed(1)}ms</span>
           </div>
           <div className="vr bg-light h-3"></div>
           <div className="d-flex align-items-center gap-2">
              <ShieldCheck size={14} className="text-primary" />
              <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Protocol:</span>
              <span className="text-[11px] font-bold text-success uppercase font-mono">NOMINAL</span>
           </div>
        </div>

        {/* Real-time Heartbeat */}
        <div className="d-flex align-items-center gap-5">
           <div className="d-flex align-items-center gap-2">
              <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Signal Refresh:</span>
              <div className="bg-light px-2 py-0.5 rounded border border-financial">
                 <span className="text-[11px] font-bold text-primary font-mono">{countdown}S</span>
              </div>
           </div>
           <div className="d-flex align-items-center gap-2">
              <Activity size={14} className="text-primary" />
              <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Model Consensus:</span>
              <span className="text-[11px] font-bold text-dark font-mono">{confidencePct}%</span>
           </div>
        </div>

      </div>
    </footer>
  );
}
