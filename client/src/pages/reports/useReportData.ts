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
    setLoading(true);
    const safe = <T,>(p: Promise<T>): Promise<T | null> => p.then((r) => r).catch(() => null);

    Promise.allSettled([
      safe(api.getTradeHistory(mode, 200, 0)),
      safe(api.getWalletTransactions(200, 0)),
      safe(api.getWalletBalance(mode)),
      safe(api.getAlerts()),
      safe(api.getModels()),
      safe(api.getCurrentWeights()),
      safe(api.getCurrentAnimalWeights()),
      safe(api.getRiskOrchestration()),
      safe(api.getSpectralRegime()),
      safe(api.getAITimeline(undefined, 100)),
      safe(api.getSentimentMatrix()),
    ]).then((res) => {
      if (!alive) return;
      const val = (i: number): any => (res[i].status === "fulfilled" ? (res[i] as PromiseFulfilledResult<any>).value : null);
      const arr = (v: any, ...keys: string[]): any[] => {
        if (Array.isArray(v)) return v;
        for (const k of keys) if (Array.isArray(v?.[k])) return v[k];
        return [];
      };
      setTrades(arr(val(0), "trades", "history", "data"));
      setWalletTx(arr(val(1), "transactions", "data"));
      setWallet(val(2));
      setAlerts(arr(val(3), "alerts", "data"));
      setModels(arr(val(4), "models"));
      setStrategyWeights(val(5)?.weights ?? val(5) ?? null);
      setAnimalWeights(val(6)?.weights ?? val(6) ?? null);
      setRisk(val(7));
      setSpectral(val(8));
      setAiTimeline(arr(val(9), "timeline", "events", "data"));
      setSentiment(val(10));
      setRefreshedAt(new Date());
      setLoading(false);
    });

    return () => { alive = false; };
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
