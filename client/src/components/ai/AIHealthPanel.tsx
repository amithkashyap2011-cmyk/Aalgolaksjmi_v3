
import React, { useEffect, useState } from 'react';

interface ModelHealth {
  healthy: boolean;
  checkpointLoaded: boolean;
  lastInference?: {
    timestamp: string;
    direction?: string;
    confidence: number;
    action?: string;
  };
  status?: string; // New simplified status
}

interface HealthData {
  [key: string]: ModelHealth | string;
}

export const AIHealthPanel: React.FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        // Use the proxied endpoint on the Node.js backend
        const res = await fetch('/models/health');
        if (res.ok) {
          const data = await res.json();
          setHealth(data);
        }
      } catch (err) {
        console.error("Failed to fetch AI health:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="p-4 bg-slate-900 text-white rounded-lg animate-pulse">Loading AI Governance...</div>;
  if (!health) return <div className="p-4 bg-red-900 text-white rounded-lg">AI Quant Engine Offline</div>;

  return (
    <div className="p-4 bg-slate-900 text-white rounded-lg border border-slate-700">
      <h3 className="text-lg font-bold mb-4 flex items-center">
        <span className="w-3 h-3 bg-green-500 rounded-full mr-2 shadow-[0_0_8px_#22c55e]"></span>
        AI Model Governance (v7.2)
      </h3>
      <div className="grid grid-cols-2 gap-4">
        {Object.entries(health).map(([name, data]) => {
          const isHealthy = typeof data === 'string' ? data === 'HEALTHY' : data.healthy;
          const isDegraded = typeof data === 'string' ? data === 'DEGRADED' : data.status === 'DEGRADED';
          const statusText = typeof data === 'string' ? data : (isHealthy ? 'ONLINE' : 'OFFLINE');
          const checkpointStatus = typeof data === 'string' ? (data === 'HEALTHY' ? 'LOADED' : 'MISSING') : (data.checkpointLoaded ? 'LOADED' : 'MISSING');

          return (
            <div key={name} className={`p-3 rounded border ${isHealthy ? 'border-green-800 bg-green-900/10' : (isDegraded ? 'border-amber-800 bg-amber-900/10' : 'border-red-800 bg-red-900/10')}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="uppercase font-mono text-sm">{name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${isHealthy ? 'bg-green-500/20 text-green-400' : (isDegraded ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400')}`}>
                  {statusText}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                <p>Checkpoint: {checkpointStatus}</p>
                {typeof data !== 'string' && (
                  <>
                    <p>Confidence: {data.lastInference?.confidence.toFixed(4) || '0.0000'}</p>
                    <p className="truncate">Last: {data.lastInference?.timestamp || 'NEVER'}</p>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
