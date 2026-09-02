import { create } from 'zustand';
import { CurrencyDisplayMode } from '../lib/currency';
import { useAppStore } from './useAppStore';

interface DashboardStats {
  totalEquity: number;
  dailyPnL: number;
  openPnL: number;
  totalAllTimePnL?: number;
  openPositions: number;
  closedTrades: number;
  winRate: number;
  realizedWinRate?: number;
  overallWinRate?: number;
  profitFactor: number | string;
  maxDrawdown: number;
  currentExposure: number;
  inrRate: number;
  regime: {
    direction: string;
    strength: number;
    consensus: number;
    forecast: string;
    riskState: string;
  };
}

// Per-domain metrics (Crypto vs Indian Stock) — independent wallets, P&L, win rate
export interface DomainMetrics {
  totalEquity: number;
  dailyPnL: number;
  openPnL: number;
  totalAllTimePnL: number;
  openPositions: number;
  closedTrades: number;
  totalTrades: number;
  winRate: number;
  realizedWinRate: number;
  overallWinRate: number;
  profitFactor: number | string;
  maxDrawdown: number;
  currentExposure: number;
  invested: { total: number; spot: number; futures: number };
  balances: { spot: number; futures: number };
  netPnL: { total: number; spot: number; futures: number };
  currency: string;
  inrRate: number;
}

export const INITIAL_DOMAIN_METRICS: DomainMetrics = {
  totalEquity: 0, dailyPnL: 0, openPnL: 0, totalAllTimePnL: 0,
  openPositions: 0, closedTrades: 0, totalTrades: 0,
  winRate: 0, realizedWinRate: 0, overallWinRate: 0,
  profitFactor: 0, maxDrawdown: 0, currentExposure: 0,
  invested: { total: 0, spot: 0, futures: 0 },
  balances: { spot: 0, futures: 0 },
  netPnL: { total: 0, spot: 0, futures: 0 },
  currency: "USD", inrRate: 85.0,
};

export interface DomainData {
  crypto: DomainMetrics;
  indianStock: DomainMetrics;
}

interface ServiceStatus {
  aqea: boolean;
  cnn: boolean;
  ppo: boolean;
  transformer: boolean;
  mamba: boolean;
  python: boolean;
  mongo: boolean;
  node: boolean;
}

export const INITIAL_SUMMARY: DashboardStats = {
  totalEquity: 0,
  dailyPnL: 0,
  openPnL: 0,
  totalAllTimePnL: 0,
  openPositions: 0,
  closedTrades: 0,
  winRate: 0,
  profitFactor: 0,
  maxDrawdown: 0,
  currentExposure: 0,
  inrRate: 85.0,
  regime: {
    direction: "SIDEWAYS",
    strength: 0,
    consensus: 0,
    forecast: "NEUTRAL",
    riskState: "NORMAL",
  },
};

export const INITIAL_STATUS: ServiceStatus = {
  aqea: false,
  cnn: false,
  ppo: false,
  transformer: false,
  mamba: false,
  python: false,
  mongo: false,
  node: false,
};

interface DashboardStore {
  summary: DashboardStats;
  domains: DomainData;
  status: ServiceStatus;
  currencyMode: CurrencyDisplayMode;
  mode: "PAPER" | "LIVE" | "BACKTEST" | "FUTURE_TRENT";
  positions: any[];
  trades: any[];
  logs: any[];
  headerData: any[];
  weatherIntelligence: any | null;
  setSummary: (summary: DashboardStats) => void;
  setStatus: (status: ServiceStatus) => void;
  setCurrencyMode: (mode: CurrencyDisplayMode) => void;
  setMode: (mode: "PAPER" | "LIVE" | "BACKTEST" | "FUTURE_TRENT") => void;
  setPositions: (positions: any[]) => void;
  setWeatherIntelligence: (data: any) => void;
  addTrade: (trade: any) => void;
  addLog: (log: any) => void;
  fetchDashboard: (userId: string, accountType?: string) => Promise<void>;
  fetchLogs: (userId: string) => Promise<void>;
  fetchHeader: () => Promise<void>;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  summary: INITIAL_SUMMARY,
  domains: { crypto: { ...INITIAL_DOMAIN_METRICS, currency: "USD" }, indianStock: { ...INITIAL_DOMAIN_METRICS, currency: "INR" } },
  status: INITIAL_STATUS,
  currencyMode: "USDT_INR",
  mode: "PAPER",
  positions: [],
  trades: [],
  logs: [],
  headerData: [],
  weatherIntelligence: null,
  setSummary: (summary) => set({ summary }),
  setStatus: (status) => set({ status }),
  setCurrencyMode: (mode) => set({ currencyMode: mode }),
  setMode: (mode) => set({ mode }),
  setPositions: (positions) => set({ positions }),
  setWeatherIntelligence: (data) => set({ weatherIntelligence: data }),
  addTrade: (trade) => set((state) => ({ trades: [trade, ...state.trades].slice(0, 100) })),
  addLog: (log) => set((state) => ({ logs: [log, ...state.logs].slice(0, 500) })),
  fetchDashboard: async (userId: string, accountType?: string) => {
    try {
      const activeAcctType = accountType || "BOTH";
      const acctParam = `&accountType=${activeAcctType}`;
      const [dashRes, posRes] = await Promise.all([
        fetch(`/aqea-ui/dashboard?userId=${userId}${acctParam}`),
        fetch(`/aqea-ui/positions?userId=${userId}${acctParam}`)
      ]);
      if (!dashRes.ok) {
        throw new Error(`Dashboard request failed with HTTP ${dashRes.status}`);
      }
      if (!posRes.ok) {
        throw new Error(`Positions request failed with HTTP ${posRes.status}`);
      }

      const dashData = await dashRes.json();
      const posData = await posRes.json();
      const summary = dashData?.summary && typeof dashData.summary === "object"
        ? { ...INITIAL_SUMMARY, ...dashData.summary, regime: { ...INITIAL_SUMMARY.regime, ...(dashData.summary.regime ?? {}) } }
        : INITIAL_SUMMARY;
      const status = dashData?.status && typeof dashData.status === "object"
        ? { ...INITIAL_STATUS, ...dashData.status }
        : INITIAL_STATUS;
      // Parse per-domain metrics
      const domains: DomainData = {
        crypto: dashData?.domains?.crypto
          ? { ...INITIAL_DOMAIN_METRICS, ...dashData.domains.crypto }
          : { ...INITIAL_DOMAIN_METRICS, currency: "USD" },
        indianStock: dashData?.domains?.indianStock
          ? { ...INITIAL_DOMAIN_METRICS, ...dashData.domains.indianStock }
          : { ...INITIAL_DOMAIN_METRICS, currency: "INR" },
      };
      set({
        summary,
        domains,
        status,
        positions: Array.isArray(posData) ? posData : [],
      });
    } catch (err) {
      // Gentle warning for transient network hiccups
    }
  },
  fetchHeader: async () => {
    try {
      const res = await fetch(`/aqea-ui/header`);
      if (!res.ok) {
        throw new Error(`Header request failed with HTTP ${res.status}`);
      }
      const data = await res.json();
      set({ headerData: Array.isArray(data) ? data : [] });
    } catch (err) {
      // Gentle warning for transient network hiccups
    }
  },
  fetchLogs: async (userId: string) => {
    try {
      const res = await fetch(`/aqea-ui/logs?userId=${userId}&limit=100`);
      if (!res.ok) {
        throw new Error(`Logs request failed with HTTP ${res.status}`);
      }
      const data = await res.json();
      const mappedLogs = Array.isArray(data) ? data.map((l: any) => ({
        type: 'DECISION',
        timestamp: l.timestamp,
        symbol: l.symbol,
        data: l.data,
        message: l.message
      })) : [];
      set({ logs: mappedLogs });
    } catch (err) {
      // Gentle warning for transient network hiccups
    }
  }
}));
