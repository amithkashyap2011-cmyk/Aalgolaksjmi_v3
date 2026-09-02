import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { useDashboardStore } from "../../store/useDashboardStore";
import * as api from "../../lib/api";

/**
 * Aggregates everything the Reports module needs from data that ALREADY exists
 * (Zustand stores + existing api.* endpoints). No new backend, no new APIs.
 * Every network call is defensive — a failure yields null and the section degrades.
 */
export interface ReportData {
  loading: boolean;
  refreshedAt: Date | null;
  refresh: () => void;
  // from stores (live)
  summary: any;
  positions: any[];
  logs: any[];
  weather: any;
  mode: string;
  // from existing endpoints (on demand)
  trades: any[];
  walletTx: any[];
  wallet: any;
  alerts: any[];
  models: any[];
  strategyWeights: Record<string, number> | null;
  animalWeights: Record<string, number> | null;
  risk: any;
  spectral: any;
  aiTimeline: any[];
  sentiment: any;
}

export function useReportData(): ReportData {
  const summary = useDashboardStore((s) => s.summary);
  const storePositions = useDashboardStore((s) => s.positions);
  const logs = useDashboardStore((s) => s.logs);
  const weather = useDashboardStore((s) => s.weatherIntelligence);
  const mode = useDashboardStore((s) => s.mode);
  const appPositions = useAppStore((s) => s.positions);

  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const [trades, setTrades] = useState<any[]>([]);
  const [walletTx, setWalletTx] = useState<any[]>([]);
  const [wallet, setWallet] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [strategyWeights, setStrategyWeights] = useState<Record<string, number> | null>(null);
  const [animalWeights, setAnimalWeights] = useState<Record<string, number> | null>(null);
  const [risk, setRisk] = useState<any>(null);
  const [spectral, setSpectral] = useState<any>(null);
  const [aiTimeline, setAiTimeline] = useState<any[]>([]);
  const [sentiment, setSentiment] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    const safe = <T,>(p: Promise<T>): Promise<T | null> => p.then((r) => r).catch(() => null);
    const arr = (v: any, ...keys: string[]): any[] => {
      if (Array.isArray(v)) return v;
      for (const k of keys) if (Array.isArray(v?.[k])) return v[k];
      return [];
    };

    // Progressive individual resolvers for ultra-fast UI rendering
    safe(api.getTradeHistory(mode, 200, 0)).then(res => { if (alive && res) setTrades(arr(res, "trades", "history", "data")); });
    safe(api.getWalletTransactions(200, 0)).then(res => { if (alive && res) setWalletTx(arr(res, "transactions", "data")); });
    safe(api.getWalletBalance(mode)).then(res => { if (alive && res) setWallet(res); });
    safe(api.getAlerts()).then(res => { if (alive && res) setAlerts(arr(res, "alerts", "data")); });
    safe(api.getModels()).then(res => { if (alive && res) setModels(arr(res, "models")); });
    safe(api.getCurrentWeights()).then(res => { if (alive && res) setStrategyWeights((res as any)?.weights ?? res ?? null); });
    safe(api.getCurrentAnimalWeights()).then(res => { if (alive && res) setAnimalWeights((res as any)?.weights ?? res ?? null); });
    safe(api.getRiskOrchestration()).then(res => { if (alive && res) setRisk(res); });
    safe(api.getSpectralRegime()).then(res => { if (alive && res) setSpectral(res); });
    safe(api.getAITimeline(undefined, 100)).then(res => { if (alive && res) setAiTimeline(arr(res, "timeline", "events", "data")); });
    safe(api.getSentimentMatrix()).then(res => { if (alive && res) setSentiment(res); });

    // Mark ready swiftly
    const timer = setTimeout(() => {
      if (alive) {
        setRefreshedAt(new Date());
        setLoading(false);
      }
    }, 150);

    return () => { alive = false; clearTimeout(timer); };
  }, [mode, tick]);

  const positions = (storePositions && storePositions.length ? storePositions : appPositions) || [];

  return {
    loading,
    refreshedAt,
    refresh: () => setTick((t) => t + 1),
    summary,
    positions,
    logs: logs || [],
    weather,
    mode,
    trades,
    walletTx,
    wallet,
    alerts,
    models,
    strategyWeights,
    animalWeights,
    risk,
    spectral,
    aiTimeline,
    sentiment,
  };
}
