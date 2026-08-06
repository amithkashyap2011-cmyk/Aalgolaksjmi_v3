/*
 * ─── AALGOLAKSHMI_V2  ·  Zustand Global Store ──────────────────────
 *
 * Phase 6: Live-data store with mock fallback.
 *
 * On boot():
 *   1. Try to authenticate via stored JWT  → fetch live data from backend
 *   2. If auth fails or no token           → seed with mock data
 *
 * refreshWallet / refreshPositions / refreshTrades all try the API first,
 * and silently fall back to mock data if the call fails.
 *
 * Socket.io ticks update the live price in real-time.
 */

import { create } from "zustand";
import {
  SYMBOLS,
  MOCK_WALLET,
  MOCK_POSITIONS,
  MOCK_TRADES,
  MOCK_ALERTS,
  DEFAULT_WEIGHTS,
  generateMockStrategyEvals,
  MOCK_CANDLES,
} from "../mock/data";
import * as api from "../lib/api";
import { socket, subscribeTicker, unsubscribeTicker, type TickData } from "../lib/socket";
import type { EnsembleReport } from "../types/ensemble";

// Socket connection state listeners for reactive Online/Offline badge updates
socket.on("connect", () => {
  useAppStore.setState({ connected: true });
});
socket.on("disconnect", () => {
  useAppStore.setState({ connected: false });
});

const DEMO_EMAIL = "demo@aalgo.local";
const DEMO_PASSWORD = "123456";

let demoAuthBootstrap: Promise<void> | null = null;

async function ensureDemoAuthSession(): Promise<void> {
  if (demoAuthBootstrap) {
    return demoAuthBootstrap;
  }

  demoAuthBootstrap = (async () => {
    try {
      await api.login(DEMO_EMAIL, DEMO_PASSWORD);
      return;
    } catch (loginErr: any) {
      try {
        await api.register(DEMO_EMAIL, DEMO_PASSWORD);
        return;
      } catch (registerErr: any) {
        if (registerErr?.status === 409) {
          await api.login(DEMO_EMAIL, DEMO_PASSWORD);
          return;
        }
        throw registerErr;
      }
    }
  })().finally(() => {
    demoAuthBootstrap = null;
  });

  return demoAuthBootstrap;
}

/* ── Types ────────────────────────────────────────────── */

export type Mode = "PAPER" | "LIVE" | "BACKTEST";
// "BOTH" is a client-only view mode — it merges Spot + Futures data for
// display (ticker subscriptions, wallet, positions) but is never sent to
// the server as Settings.accountType, whose enum only knows SPOT/FUTURES.
// The actual per-account-type auto-trade state lives in
// Settings.autoTradeSpot/autoTradeFutures, toggled independently from the
// Wallet page — this is purely "what am I looking at" now.
export type AccountType = "SPOT" | "FUTURES" | "BOTH";
export type ExecMode = "AUTO" | "MANUAL";

export interface Position {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  entry: number;
  pnl: number;
  strategy?: string;
  sl?: number;
  tp?: number;
  leverage?: number;
  accountType?: "SPOT" | "FUTURES";
}

export interface Alert {
  id: string;
  level: "GREEN" | "AMBER" | "RED";
  text: string;
  time: string;
}

export type BehaviorWeights = Record<string, number>;

export interface HistoryTrade {
  id: number;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  entry: number;
  exit: number;
  pnl: number;
  time: string;
  strategy?: string;
  status?: "PENDING" | "OPEN" | "CLOSED" | "CANCELLED";
}

export interface MarketCheckData {
  symbol: string;
  interval: string;
  close: number;
  vwap: number;
  supertrend: number;
  supertrendDirection: "bull" | "bear";
  fundingRate: number;
  openInterest: number;
  bias: "bullish" | "bearish";
  liquidityPulse: number;
  marketSignal: "long" | "short" | "neutral";
  ruleSet: {
    pcrApprox: string;
    riskGuard: string;
  };
  lastUpdated: string;
}

export interface SpectralRegimeReport {
  absorptionRatio: number;
  eigenvalues: number[];
  marchenkoPasturUpper: number;
  regime: "NORMAL_RISK_ON" | "CORRELATION_SHOCK_RISK_OFF" | "CALIBRATING";
  shieldActive: boolean;
  timestamp: string;
}

/* ── Store shape ──────────────────────────────────────── */

// Helper to map backend format (quantity/entryPrice) to UI format (qty/entry)
const mapBackendPosition = (p: any): Position => ({
  id: p._id || p.id,
  symbol: p.symbol,
  side: p.side,
  qty: p.quantity ?? p.qty ?? 0,
  entry: p.entryPrice ?? p.entry ?? 0,
  pnl: p.pnl ?? 0,
  strategy: p.strategy,
  sl: p.sl,
  tp: p.tp,
  leverage: p.leverage || 1,
  accountType: p.accountType,
});

const isAuthError = (err: any) => {
  const message = err?.message?.toString().toLowerCase() ?? "";
  return err?.status === 401 || err?.status === 403 || /unauthor|token|jwt|forbidden/.test(message);
};

interface AppState {
  ready: boolean;
  userId: string | null;
  userEmail: string | null;
  connected: boolean;            // true if backend auth succeeded

  mode: Mode;
  accountType: AccountType;
  execMode: ExecMode;
  selectedSymbol: string;
  selectedSymbols: string[];
  allowedSymbols: string[];
  timeframe: string;
  theme: string;
  density: "COMPACT" | "COMFORTABLE" | "SPACIOUS";
  wallet: { 
    balance: number; // Free/Available
    totalBalance?: number; // Total Equity
    lockedMargin?: number;
    realizedBalance?: number; // Core Capital + Booked Profit
    bookedProfit?: number; // Booked Profit
    inrEquivalent?: number; 
    inrRate?: number;
    savingsUsdt?: number;
    isUnactivated?: boolean;
    totalDeposited?: number;
    totalWithdrawn?: number;
    realizedPnL?: number;
  };
  positions: Position[];
  behaviorWeights: BehaviorWeights;
  alerts: Alert[];
  trades: HistoryTrade[];
  sidebarOpen: boolean;
  livePrices: Record<string, number>;   // symbol → latest price
  tickerData: Record<string, TickData>;
  marketCheckData: MarketCheckData | null;
  totalProfit: number;                  // Lifetime/Session realized PnL
  sessionPnl?: number;                  // Net session PnL (realized + unrealized)
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  inrRate: number;
  ensembleReport: EnsembleReport | null;
  quantumReport: any | null;
  consensusData: Record<string, {
    symbol: string;
    action: string;
    confidenceLong: number;
    confidenceShort: number;
    score?: number;
    threshold: number;
    saraswati?: {
      alphaScore: number;
      reason: string;
      status: string;
      expectedValue: number;
    };
    weights?: any;
    ml?: any;
    dl?: any;
    fusion?: any;
    riskStatus?: string;
    executionAction?: string;
    executionReason?: string;
    checklist?: any;
  }>;

  boot: () => Promise<void>;
  setMode: (m: Mode) => void;
  setAccountType: (type: AccountType) => void;
  setExecMode: (m: ExecMode) => Promise<void>;
  setTheme: (t: string) => void;
  setDensity: (d: "COMPACT" | "COMFORTABLE" | "SPACIOUS") => void;
  setSymbol: (s: string) => void;
  toggleSymbol: (s: string) => void;
  setSymbols: (s: string[]) => void;
  setTimeframe: (t: string) => void;
  setBehaviorWeight: (name: string, v: number) => void;
  addAlert: (level: Alert["level"], text: string) => void;
  toggleSidebar: () => void;
  refreshPositions: (m?: Mode, t?: AccountType) => Promise<void>;
  refreshWallet: (m?: Mode, t?: AccountType) => Promise<void>;
  refreshTrades: () => Promise<void>;
  refreshMarketCheck: (symbol?: string, interval?: string, limit?: number) => Promise<void>;
  refreshEnsembleReport: (symbol?: string, interval?: string, limit?: number) => Promise<void>;
  refreshQuantumReport: (symbol?: string, mode?: string, exchange?: string) => Promise<void>;
  submitOrder: (symbol: string, side: "BUY" | "SELL", quantity: number, sl?: number, tp?: number, leverage?: number) => Promise<any>;
  updateSlTp: (tradeId: string, sl?: number, tp?: number) => Promise<void>;
  setAllowedSymbols: (s: string[]) => void;
  addAllowedSymbol: (s: string) => void;
  removeAllowedSymbol: (s: string) => void;
  reorderAllowedSymbols: (fromIndex: number, toIndex: number) => void;
  highPrecisionMode: boolean;
  bypassHtfTrendGate: boolean;
  bypassChecklist: boolean;
  bypassConsensusLag: boolean;
  dynamicGuardian: boolean;
  dynamicWeights: boolean;
  dynamicAnimals: boolean;
  overdrive: boolean;
  noLossMode: boolean;
  dynamicSLTP: boolean;
  aiConsensusGate: boolean;
  orderFlowVotingEnabled: boolean;
  smartMoneyVotingEnabled: boolean;
  liveNewsSentimentEnabled: boolean;
  cnnVotingEnabled: boolean;
  lstmVotingEnabled: boolean;
  mambaVotingEnabled: boolean;
  lnnVotingEnabled: boolean;
  transformerVotingEnabled: boolean;
  ppoVotingEnabled: boolean;
  gayatriVotingEnabled: boolean;
  ohmkaraVotingEnabled: boolean;
  lakshmiVotingEnabled: boolean;
  aiPredictorsEnabled: boolean;
  transitionOverrideEnabled: boolean;
  behaviourModelEnabled: boolean;
  taFallbackEnabled: boolean;
  taFallbackScope: "PAPER_ONLY" | "PAPER_AND_LIVE";
  defaultSL: number;
  riskLevel: number;
  maxDrawdown: number;
  autoTradeThreshold: number;
  shortScoreThreshold: number;
  aiFlipExitMinProfitR: number;
  driftHaltThreshold: number;
  driftReduceThreshold: number;
  saraswatiAlphaThreshold: number;
  setHighPrecisionMode: (v: boolean) => Promise<void>;
  setBypassHtfTrendGate: (v: boolean) => Promise<void>;
  setBypassChecklist: (v: boolean) => Promise<void>;
  setBypassConsensusLag: (v: boolean) => Promise<void>;
  setDynamicGuardian: (v: boolean) => Promise<void>;
  setDynamicWeights: (v: boolean) => Promise<void>;
  setDynamicAnimals: (v: boolean) => Promise<void>;
  setOverdrive: (v: boolean) => Promise<void>;
  setNoLossMode: (v: boolean) => Promise<void>;
  setDynamicSLTP: (v: boolean) => Promise<void>;
  setAiConsensusGate: (v: boolean) => Promise<void>;
  setOrderFlowVotingEnabled: (v: boolean) => Promise<void>;
  setSmartMoneyVotingEnabled: (v: boolean) => Promise<void>;
  setLiveNewsSentimentEnabled: (v: boolean) => Promise<void>;
  setCnnVotingEnabled: (v: boolean) => Promise<void>;
  setLstmVotingEnabled: (v: boolean) => Promise<void>;
  setMambaVotingEnabled: (v: boolean) => Promise<void>;
  setLnnVotingEnabled: (v: boolean) => Promise<void>;
  setTransformerVotingEnabled: (v: boolean) => Promise<void>;
  setPpoVotingEnabled: (v: boolean) => Promise<void>;
  setGayatriVotingEnabled: (v: boolean) => Promise<void>;
  setOhmkaraVotingEnabled: (v: boolean) => Promise<void>;
  setLakshmiVotingEnabled: (v: boolean) => Promise<void>;
  setAiPredictorsEnabled: (v: boolean) => Promise<void>;
  setTransitionOverrideEnabled: (v: boolean) => Promise<void>;
  setBehaviourModelEnabled: (v: boolean) => Promise<void>;
  setTaFallbackEnabled: (v: boolean) => Promise<void>;
  setTaFallbackScope: (v: "PAPER_ONLY" | "PAPER_AND_LIVE") => Promise<void>;
  setDefaultSL: (v: number) => Promise<void>;
  setRiskLevel: (v: number) => Promise<void>;
  setMaxDrawdown: (v: number) => Promise<void>;
  setAutoTradeThreshold: (v: number) => Promise<void>;
  setShortScoreThreshold: (v: number) => Promise<void>;
  setAiFlipExitMinProfitR: (v: number) => Promise<void>;
  setDriftHaltThreshold: (v: number) => Promise<void>;
  setDriftReduceThreshold: (v: number) => Promise<void>;
  setSaraswatiAlphaThreshold: (v: number) => Promise<void>;
  spectralRegimeData: SpectralRegimeReport | null;
  refreshSpectralRegime: () => Promise<void>;
}

/* ── Create store ─────────────────────────────────────── */

const getStoredItem = (key: string) => {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return null;
};

/* ── Theme registry ──────────────────────────────────────
 * Each theme has a base `mode` (controls the Tailwind `.dark` class so all
 * `dark:` variants keep working) and a CSS id applied as `data-theme` on
 * <html>, which overrides the --ds-* design tokens (see design-tokens.css).
 * `label`/`swatch` drive the Settings UI picker. */
export const THEMES: { id: string; label: string; desc: string; mode: "light" | "dark"; swatch: [string, string] }[] = [
  { id: "dark",     label: "Institutional Dark", desc: "High-contrast terminal",      mode: "dark",  swatch: ["#060b14", "#3b82f6"] },
  { id: "light",    label: "Professional Light", desc: "Daylight-optimised clarity",  mode: "light", swatch: ["#f8fafc", "#3b82f6"] },
  { id: "midnight", label: "Midnight Indigo",    desc: "Deep navy, indigo accent",    mode: "dark",  swatch: ["#0a0e24", "#6366f1"] },
  { id: "ocean",    label: "Deep Ocean",         desc: "Teal-cyan low-light",         mode: "dark",  swatch: ["#06141a", "#06b6d4"] },
  { id: "forest",   label: "Forest",             desc: "Emerald on charcoal",         mode: "dark",  swatch: ["#07140f", "#10b981"] },
  { id: "crimson",  label: "Crimson Gold",       desc: "Warm dark, gold accent",      mode: "dark",  swatch: ["#160a0c", "#f59e0b"] },
  { id: "solar",    label: "Solar Light",        desc: "Warm sepia daylight",         mode: "light", swatch: ["#fbf6ec", "#d97706"] },
];

const THEME_MODE: Record<string, "light" | "dark"> = Object.fromEntries(THEMES.map(t => [t.id, t.mode]));

/** Apply a theme id to <html>: toggles the .dark class (Tailwind) + sets data-theme (CSS tokens). */
export function applyThemeToDom(id: string): void {
  if (typeof document === "undefined") return;
  const mode = THEME_MODE[id] ?? "light";
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.setAttribute("data-theme", id);
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  userId: null,
  userEmail: null,
  connected: false,
  inrRate: MOCK_WALLET.inrRate ?? 83.5,

  mode: "PAPER",
  accountType: (getStoredItem("aalgo_account_type") as AccountType) || "BOTH",
  execMode: "AUTO",
  theme: getStoredItem("aalgo_theme") || "light",
  density: (getStoredItem("aalgo_density") as "COMPACT" | "COMFORTABLE" | "SPACIOUS") || "COMFORTABLE",
  selectedSymbol: getStoredItem("aalgo_last_symbol") || (SYMBOLS.includes("BTCUSDT" as any) ? "BTCUSDT" as any : SYMBOLS[0]),
  selectedSymbols: [getStoredItem("aalgo_last_symbol") || (SYMBOLS.includes("BTCUSDT" as any) ? "BTCUSDT" as any : SYMBOLS[0])],
  allowedSymbols: (() => {
    try {
      const saved = getStoredItem("aalgo_ticker_symbols");
      return saved ? JSON.parse(saved) : [...SYMBOLS];
    } catch {
      return [...SYMBOLS];
    }
  })(),
  tickerData: {},
  timeframe: "5m",
  ensembleReport: null,
  quantumReport: null,
  marketCheckData: null,
  spectralRegimeData: null,
  wallet: { ...MOCK_WALLET },
  positions: [],
  behaviorWeights: { ...DEFAULT_WEIGHTS },
  alerts: [],
  trades: [],
  sidebarOpen: true,
  highPrecisionMode: false,
  bypassHtfTrendGate: false,
  bypassChecklist: false,
  bypassConsensusLag: false,
  dynamicGuardian: false,
  dynamicWeights: false,
  dynamicAnimals: true,
  overdrive: false,
  noLossMode: false,
  dynamicSLTP: true,
  aiConsensusGate: true,
  orderFlowVotingEnabled: true,
  smartMoneyVotingEnabled: true,
  liveNewsSentimentEnabled: true,
  cnnVotingEnabled: true,
  lstmVotingEnabled: true,
  mambaVotingEnabled: true,
  lnnVotingEnabled: true,
  transformerVotingEnabled: true,
  ppoVotingEnabled: true,
  gayatriVotingEnabled: true,
  ohmkaraVotingEnabled: true,
  lakshmiVotingEnabled: true,
  aiPredictorsEnabled: true,
  transitionOverrideEnabled: true,
  behaviourModelEnabled: true,
  taFallbackEnabled: true,
  taFallbackScope: "PAPER_ONLY",
  defaultSL: 1.5,
  riskLevel: 50,
  maxDrawdown: 15,
  autoTradeThreshold: 65,
  shortScoreThreshold: 35,
  aiFlipExitMinProfitR: 0.3,
  driftHaltThreshold: 80,
  driftReduceThreshold: 60,
  saraswatiAlphaThreshold: 45,
  livePrices: (() => {
    // Initialize with mock prices from the latest candle of each symbol
    const prices: Record<string, number> = {};
    SYMBOLS.forEach((sym) => {
      const candles = MOCK_CANDLES[sym];
      if (candles && candles.length > 0) {
        prices[sym] = candles[candles.length - 1].close;
      }
    });
    return prices;
  })(),
  totalProfit: 0,
  winRate: 0,
  totalTrades: 0,
  winningTrades: 0,
  consensusData: Object.fromEntries(
    SYMBOLS.map((sym) => {
      const evals = generateMockStrategyEvals(sym);
      const lakshmi = evals.find((e) => e.id === "LAKSHMI") ?? evals[0];
      const sig = lakshmi.signal;
      // Force 100% for SOL as per Phase 9 spec
      const confidence = sym === "SOLUSDT" ? 1.0 : lakshmi.confidence;
      return [
        sym,
        {
          symbol: sym,
          action: sig === "STRONG_BUY" || sig === "BUY" ? "LONG" : sig === "STRONG_SELL" || sig === "SELL" ? "SHORT" : "HOLD",
          confidenceLong: +confidence.toFixed(3),
          confidenceShort: +(1 - confidence).toFixed(3),
          threshold: 0.6,
        },
      ];
    })
  ),

  /* ── boot: try backend auth, fall back to mock ──────── */
  boot: async () => {
    let connected = false;
    let userId: string | null = "mock-user-001";
    let userEmail: string | null = DEMO_EMAIL;

    // 1. Auto-login into demo to test real-time backend loops if token is missing
    if (!api.getToken()) {
      try {
        await ensureDemoAuthSession();
      } catch {
        // Server unreachable — stay in offline/mock mode, no log needed
      }
    }

    if (api.getToken()) {
      try {
        const me = await api.getMe();
        userId = me.user?._id ?? me.user?.id ?? userId;
        userEmail = me.user?.email ?? userEmail;
        connected = true;
      } catch {
        console.warn("[store] token invalid, attempting auto-login fallback");
        api.clearToken();
        try {
          await ensureDemoAuthSession();
          const me = await api.getMe();
          userId = me.user?._id ?? me.user?.id ?? userId;
          userEmail = me.user?.email ?? userEmail;
          connected = true;
        } catch (err: any) {
          console.error("[store] auto-login retry failed:", err.message);
        }
      }
    }

    // 2. If connected, load backend data
    if (connected) {
      try {
        // Wallet init is now manual via 'Add Dummy Funds'. User wants to start from 0.

        let s: any = null;
        try {
          s = await api.getSettings();
        } catch (err) {
          console.warn("[store] failed to get settings:", err);
        }

        const localSavedAccountType = getStoredItem("aalgo_account_type") as AccountType | null;
        const loadedAccountType = localSavedAccountType ?? s?.accountType ?? "FUTURES";
        const loadedMode = s?.defaultMode ?? "PAPER";

        const localSavedSymbols = (() => {
          try {
            const saved = getStoredItem("aalgo_ticker_symbols");
            return saved ? JSON.parse(saved) : null;
          } catch { return null; }
        })();
        const loadedSymbols = s?.allowedSymbols ?? localSavedSymbols ?? [...SYMBOLS];
        const loadedExecMode = s?.autoTrade === false ? "MANUAL" : "AUTO";

        set({
          allowedSymbols: loadedSymbols,
          behaviorWeights: s?.behaviorWeights ?? { ...DEFAULT_WEIGHTS },
          mode: loadedMode,
          accountType: loadedAccountType,
          highPrecisionMode: s?.highPrecisionMode ?? false,
          bypassHtfTrendGate: s?.bypassHtfTrendGate ?? false,
          bypassChecklist: s?.bypassChecklist ?? false,
          bypassConsensusLag: s?.bypassConsensusLag ?? false,
          dynamicGuardian: s?.dynamicGuardian ?? false,
          dynamicWeights: s?.dynamicWeights ?? false,
          dynamicAnimals: s?.dynamicAnimals ?? false,
          overdrive: s?.overdrive ?? false,
          noLossMode: s?.noLossMode ?? false,
          dynamicSLTP: s?.riskConfig?.dynamicSLTP ?? true,
          aiConsensusGate: s?.aiConsensusGate ?? true,
          orderFlowVotingEnabled: s?.orderFlowVotingEnabled ?? true,
          smartMoneyVotingEnabled: s?.smartMoneyVotingEnabled ?? true,
          liveNewsSentimentEnabled: s?.liveNewsSentimentEnabled ?? true,
          cnnVotingEnabled: s?.cnnVotingEnabled ?? true,
          lstmVotingEnabled: s?.lstmVotingEnabled ?? true,
          mambaVotingEnabled: s?.mambaVotingEnabled ?? true,
          lnnVotingEnabled: s?.lnnVotingEnabled ?? true,
          transformerVotingEnabled: s?.transformerVotingEnabled ?? true,
          ppoVotingEnabled: s?.ppoVotingEnabled ?? true,
          gayatriVotingEnabled: s?.gayatriVotingEnabled ?? true,
          ohmkaraVotingEnabled: s?.ohmkaraVotingEnabled ?? true,
          lakshmiVotingEnabled: s?.lakshmiVotingEnabled ?? true,
          aiPredictorsEnabled: s?.aiPredictorsEnabled ?? true,
          transitionOverrideEnabled: s?.transitionOverrideEnabled ?? true,
          behaviourModelEnabled: s?.behaviourModelEnabled ?? true,
          taFallbackEnabled: s?.taFallbackEnabled ?? true,
          taFallbackScope: s?.taFallbackScope ?? "PAPER_ONLY",
          defaultSL: s?.riskConfig?.defaultSL ?? 1.5,
          riskLevel: s?.riskConfig?.maxPositionSizePct ?? 50,
          maxDrawdown: s?.riskConfig?.maxDailyLoss ?? 15,
          autoTradeThreshold: s?.autoTradeThreshold ?? 85,
          shortScoreThreshold: s?.shortScoreThreshold ?? 35,
          aiFlipExitMinProfitR: s?.aiFlipExitMinProfitR ?? 0.3,
          driftHaltThreshold: s?.driftHaltThreshold ?? 80,
          driftReduceThreshold: s?.driftReduceThreshold ?? 60,
          saraswatiAlphaThreshold: s?.saraswatiAlphaThreshold ?? 45,
          execMode: loadedExecMode,
          ready: true,
          connected,
          userId,
          userEmail,
        });

        const [walletData, posData, tradeData] = await Promise.allSettled([
          api.getWalletBalance(loadedMode, loadedAccountType),
          api.getOpenPositions(loadedMode, loadedAccountType),
          api.getTradeHistory(loadedMode),
        ]);

        if (walletData.status === "fulfilled" && walletData.value) {
          const w = walletData.value as any;
          set({ 
            wallet: { 
              balance: w.usdt ?? 0, 
              totalBalance: w.totalBalance ?? 0,
              lockedMargin: w.lockedMargin ?? 0,
              realizedBalance: w.realizedBalance ?? 0,
              bookedProfit: w.bookedProfit ?? 0,
              inrEquivalent: w.inrEquivalent ?? 0, 
              inrRate: w.inrRate ?? 83.5,
              savingsUsdt: w.savingsUsdt ?? 0,
              isUnactivated: w.isUnactivated ?? false,
              totalDeposited: w.totalDeposited ?? 0,
              totalWithdrawn: w.totalWithdrawn ?? 0,
              realizedPnL: w.realizedPnL ?? 0
            },
            inrRate: w.inrRate ?? 83.5,
          });
        }

        if (posData.status === "fulfilled" && posData.value) {
          const rawPositions = Array.isArray(posData.value)
            ? posData.value
            : (posData.value as any)?.positions ?? [];
          const positions = rawPositions.map(mapBackendPosition);
          set({ positions });
        }

        if (tradeData.status === "fulfilled") {
          const trades = tradeData.value?.trades ?? [];
          const today = new Date();
          today.setUTCHours(0, 0, 0, 0);
          
          const realizedPnl = trades
            .filter((t: any) => t.status === "CLOSED" && new Date(t.closedAt || t.openedAt || Date.now()).getTime() >= today.getTime())
            .reduce((sum: number, t: any) => sum + (t.pnl || 0), 0);
          set({ trades, totalProfit: realizedPnl });
        }

        // Fetch & Map Initial alerts
        try {
          const alertRes = await api.getAlerts();
          const mapAlert = (a: any) => ({
            id: a._id || a.id || (String(Date.now()) + "_" + Math.floor(performance.now())),
            level: (a.severity || "GREEN") as "GREEN" | "AMBER" | "RED",
            text: a.title
              ? `${a.symbol ? `[${a.symbol.replace("USDT","")}] ` : ""}${a.title}${a.message ? ": " + a.message : ""}`
              : a.message || "System event",
            time: a.createdAt ? new Date(a.createdAt).toLocaleTimeString() : "Now"
          });
          const mapped = (alertRes.alerts || [])
            .filter((a: any) => a.title || a.message) // skip empty records
            .map(mapAlert);
          set({ alerts: mapped });
        } catch { /* noop */ }

        // Fetch real ticker data from Binance via server
        try {
          const tickerDataFetch = await api.getCurrentTickerData(loadedSymbols);
          if (tickerDataFetch && Object.keys(tickerDataFetch).length > 0) {
            const newLivePrices: Record<string, number> = {};
            for (const sym in tickerDataFetch) {
              newLivePrices[sym] = parseFloat(tickerDataFetch[sym].price);
            }
            set({ livePrices: newLivePrices, tickerData: tickerDataFetch });
            console.log("[store] Initialized tickerData from Binance:", tickerDataFetch);
          }
        } catch (err) {
          console.warn("[store] Failed to fetch ticker data, keeping mock data:", err);
        }

        // Poll for alerts every 5 seconds with correct mapping
        if (typeof window !== "undefined") {
          const mapAlert = (a: any) => ({
            id: a._id || a.id || (String(Date.now()) + "_" + Math.floor(performance.now())),
            level: (a.severity || "GREEN") as "GREEN" | "AMBER" | "RED",
            text: a.title
              ? `${a.symbol ? `[${a.symbol.replace("USDT","")}] ` : ""}${a.title}${a.message ? ": " + a.message : ""}`
              : a.message || "System event",
            time: a.createdAt ? new Date(a.createdAt).toLocaleTimeString() : "Now"
          });
          const alertInterval = setInterval(() => {
            api.getAlerts().then((res) => {
              const mapped = (res.alerts || [])
                .filter((a: any) => a.title || a.message)
                .map(mapAlert);
              set({ alerts: mapped });
            }).catch(() => { /* noop */ });
          }, 5000);
        }

      } catch (err) {
        console.warn("[store] failed to load backend data:", err);
      }
    }

    // 3. Subscribe to socket.io ticks for all symbols (skip in test env)
    if (typeof window !== "undefined" && !import.meta.env.SSR) {
      try {
        // Sync theme on boot (applies .dark class + data-theme tokens)
        applyThemeToDom(get().theme);
        
        const syms = get().allowedSymbols;
        const bootAcct = get().accountType;
        if (bootAcct === "BOTH") {
          syms.forEach((s) => { subscribeTicker(s, true); subscribeTicker(s, false); });
        } else {
          const isFutures = bootAcct === "FUTURES";
          syms.forEach((s) => subscribeTicker(s, isFutures));
        }

        // 4. Start periodic refresh (every 30s)
        startAutoRefresh(set, get);

        // 5. Mock consensus ticker — refreshes per-symbol AI signals every 8s when offline
        startMockConsensusTicker(set, get);

        // 6. Dynamic animal weights poller (every 5s when online & dynamicAnimals is true)
        startDynamicWeightsPoller(set, get);

        // 7. Real-time dynamic visual weights jitter vibration engine (vibrates every 1.5s)
        startWeightsJitter(set, get);
      } catch (bootSetupErr) {
        console.warn("[store] Boot setup warning:", bootSetupErr);
      }
    }

    if (!connected && typeof window !== "undefined") {
      const saved = localStorage.getItem("aalgo_behavior_weights");
      if (saved) {
        try {
          set({ behaviorWeights: JSON.parse(saved) });
        } catch {}
      }
    }

    set({ ready: true, connected, userId, userEmail });
    if (typeof window !== "undefined") {
      get().refreshMarketCheck();
      get().refreshEnsembleReport();
      get().refreshSpectralRegime();
    }
  },

  setMode: (m) => {
    set({ mode: m });
    get().refreshWallet(m);
    get().refreshPositions(m);
    if (get().connected) api.updateSettings({ defaultMode: m }).catch(console.error);
  },
  setAccountType: (t) => {
    const prevType = get().accountType;
    try { localStorage.setItem("aalgo_account_type", t); } catch {}
    set({ accountType: t });
    get().refreshWallet(undefined, t);
    get().refreshPositions(undefined, t);

    // Re-subscribe sockets with correct account type. "BOTH" keeps both the
    // spot and futures feeds live at once, so diff per-feed rather than
    // treating this as a single on/off toggle.
    const syms = get().allowedSymbols;
    const prevWantsFutures = prevType === "FUTURES" || prevType === "BOTH";
    const prevWantsSpot    = prevType === "SPOT" || prevType === "BOTH";
    const nextWantsFutures = t === "FUTURES" || t === "BOTH";
    const nextWantsSpot    = t === "SPOT" || t === "BOTH";
    syms.forEach((s) => {
      if (prevWantsFutures && !nextWantsFutures) unsubscribeTicker(s, true);
      if (prevWantsSpot && !nextWantsSpot) unsubscribeTicker(s, false);
      if (!prevWantsFutures && nextWantsFutures) subscribeTicker(s, true);
      if (!prevWantsSpot && nextWantsSpot) subscribeTicker(s, false);
    });

    if (get().connected) api.updateSettings({ accountType: t }).catch(console.error);
  },
  setExecMode: async (m) => {
    const state = get();
    set({ execMode: m });
    
    // Communicate with backend if connected
    if (state.connected) {
      try {
        // "BOTH" toggles both legs at once — enable/disableAutoTrade only
        // accept a single SPOT|FUTURES account type at the API layer.
        const targets: ("SPOT" | "FUTURES")[] = state.accountType === "BOTH" ? ["SPOT", "FUTURES"] : [state.accountType];
        if (m === "AUTO") {
          const primary = state.selectedSymbol;
          await Promise.all(targets.map((acct) => api.enableAutoTrade([], primary, acct))); // pass current chart symbol as priority
          get().addAlert("GREEN", `Auto-Trade Enabled 🤖 (${targets.join(" + ")}) | Watching ${primary} first`);
        } else {
          await Promise.all(targets.map((acct) => api.disableAutoTrade(acct)));
          get().addAlert("AMBER", "Manual Mode Activated 🖐️");
        }
      } catch (err: any) {
        get().addAlert("RED", `Failed to set execution mode: ${err.message}`);
      }
    }
  },
  setTheme: (t) => {
    localStorage.setItem("aalgo_theme", t);
    applyThemeToDom(t);
    set({ theme: t });
  },
  setDensity: (d) => {
    localStorage.setItem("aalgo_density", d);
    set({ density: d });
  },
  setSymbol: (s) => {
    if (typeof window !== "undefined") localStorage.setItem("aalgo_last_symbol", s);
    set({ selectedSymbol: s });
  },
  toggleSymbol: (s) =>
    set((st) => {
      const current = st.selectedSymbols;
      const exists = current.includes(s);
      if (exists && current.length === 1) return {};
      const next = exists ? current.filter((x) => x !== s) : [...current, s];
      if (typeof window !== "undefined") localStorage.setItem("aalgo_last_symbol", next[0]);
      return {
        selectedSymbols: next,
      };
    }),
  setSymbols: (s) => {
    if (typeof window !== "undefined" && s[0]) localStorage.setItem("aalgo_last_symbol", s[0]);
    set({ selectedSymbols: s, selectedSymbol: s[0] ?? SYMBOLS[0] });
  },
  setTimeframe: (t) => set({ timeframe: t }),
  setBehaviorWeight: (name, v) => {
    set((st) => {
      const next = { ...st.behaviorWeights, [name]: v };
      if (typeof window !== "undefined") {
        localStorage.setItem("aalgo_behavior_weights", JSON.stringify(next));
      }
      
      // 🚀 Save to Backend Settings if Connected
      if (st.connected) {
        api.updateSettings({ behaviorWeights: next }).catch((err) => {
          console.error("[store] Failed to save behaviorWeights:", err);
        });
      }

      return { behaviorWeights: next };
    });
  },
  addAlert: (level, text) =>
    set((st) => ({
      alerts: [
        { id: String(Date.now()), level, text, time: new Date().toLocaleTimeString() },
        ...st.alerts.slice(0, 49),     // keep max 50 alerts
      ],
    })),
  toggleSidebar: () => set((st) => ({ sidebarOpen: !st.sidebarOpen })),

  /* ── Data refresh actions (API-first, mock fallback) ── */
  refreshWallet: async (m?: Mode, t?: AccountType) => {
    if (!get().connected) return;
    try {
      const mode = m || get().mode;
      const type = t || get().accountType;
      // "BOTH" has no single-call server equivalent (accountType is
      // SPOT|FUTURES at the API layer) — fetch each leg and sum, same
      // combined-total math the Wallet page's Estimated Balance uses.
      const w = type === "BOTH"
        ? await (async () => {
            const [s, f] = await Promise.all([
              api.getWalletBalance(mode, "SPOT").catch(() => null) as Promise<any>,
              api.getWalletBalance(mode, "FUTURES").catch(() => null) as Promise<any>,
            ]);
            if (!s && !f) return null;
            const sum = (k: string) => (s?.[k] ?? 0) + (f?.[k] ?? 0);
            return {
              usdt: sum("usdt"), totalBalance: sum("totalBalance"), lockedMargin: sum("lockedMargin"),
              realizedBalance: sum("realizedBalance"), bookedProfit: sum("bookedProfit"),
              inrEquivalent: sum("inrEquivalent"), inrRate: s?.inrRate ?? f?.inrRate ?? 83.5,
              savingsUsdt: sum("savingsUsdt"), isUnactivated: false,
              totalDeposited: sum("totalDeposited"), totalWithdrawn: sum("totalWithdrawn"),
              realizedPnL: sum("realizedPnL"),
            };
          })()
        : await api.getWalletBalance(mode, type) as any;
      // Always update wallet state from API response — the /balance endpoint
      // returns valid data even in degraded mode (DB down) via in-memory paper state
      if (w) {
        set({
          wallet: {
            balance: w.usdt ?? 0, // Available/Free
            totalBalance: w.totalBalance ?? 0, // Cash Balance
            lockedMargin: w.lockedMargin ?? 0,
            realizedBalance: w.realizedBalance ?? 0,
            bookedProfit: w.bookedProfit ?? 0,
            inrEquivalent: w.inrEquivalent ?? 0,
            inrRate: w.inrRate ?? 83.5,
            savingsUsdt: w.savingsUsdt ?? 0,
            isUnactivated: w.isUnactivated ?? false,
            totalDeposited: w.totalDeposited ?? 0,
            totalWithdrawn: w.totalWithdrawn ?? 0,
            realizedPnL: w.realizedPnL ?? 0
          },
          inrRate: w.inrRate ?? 83.5,
        });
      }
    } catch (err: any) {
      if (isAuthError(err)) {
        console.warn("[store] refreshWallet unauthorized, disabling backend connection");
        api.clearToken();
        set({ connected: false });
      } else {
        if (get().connected) console.warn("[store] refreshWallet failed, keeping current data");
      }
    }
  },

  refreshPositions: async (m?: Mode, t?: AccountType) => {
    if (!get().connected) {
      return; // Do nothing in offline/mock mode
    }
    try {
      const mode = m || get().mode;
      const type = t || get().accountType;
      // "BOTH" merges both legs' open positions into one list — each
      // position keeps its own accountType (set below) so the UI can still
      // tell which account it belongs to.
      let rawPositions: any[];
      if (type === "BOTH") {
        const [sData, fData] = await Promise.all([
          api.getOpenPositions(mode, "SPOT").catch(() => []),
          api.getOpenPositions(mode, "FUTURES").catch(() => []),
        ]);
        const toArr = (d: any) => Array.isArray(d) ? d : (d as any)?.positions ?? [];
        rawPositions = [
          ...toArr(sData).map((p: any) => ({ ...p, accountType: p.accountType || "SPOT" })),
          ...toArr(fData).map((p: any) => ({ ...p, accountType: p.accountType || "FUTURES" })),
        ];
      } else {
        const posData = await api.getOpenPositions(mode, type);
        rawPositions = Array.isArray(posData) ? posData : (posData as any)?.positions ?? [];
      }
      const { livePrices, positions: existingPositions } = get();
      const positions = rawPositions.map((p: any) => {
        const mapped = mapBackendPosition(p);

        // Dynamically ensure we are subscribed to ticker updates for active
        // positions — use the position's OWN accountType when merging both
        // (type === "BOTH"), since a single global futures/spot flag can't
        // describe a mixed list correctly.
        try {
          const isFutures = mapped.accountType ? mapped.accountType === "FUTURES" : type === "FUTURES";
          subscribeTicker(mapped.symbol, isFutures);
        } catch (subErr) {
          console.warn("[store] Failed to subscribe to position ticker:", mapped.symbol, subErr);
        }

        const currentPrice = livePrices[mapped.symbol];
        if (currentPrice) {
          const pnl = mapped.side === "BUY"
            ? (currentPrice - mapped.entry) * mapped.qty
            : (mapped.entry - currentPrice) * mapped.qty;
          mapped.pnl = +pnl.toFixed(4);
        } else {
          // If backend provided a calculated PnL (we recently added this to the backend API), use it!
          // Otherwise, preserve last known PnL if price hasn't ticked yet to avoid 0 flickering
          const existing = existingPositions.find(ep => ep.id === mapped.id);
          if (p.pnl !== undefined && p.pnl !== 0) {
            mapped.pnl = p.pnl;
          } else if (existing) {
            mapped.pnl = existing.pnl;
          } else {
            mapped.pnl = p.pnl ?? 0;
          }
        }
        return mapped;
      });
      set({ positions });
    } catch (err: any) {
      if (isAuthError(err)) {
        console.warn("[store] refreshPositions unauthorized, disabling backend connection");
        api.clearToken();
        set({ connected: false });
      } else {
        console.warn("[store] refreshPositions failed, keeping current data");
      }
    }
  },

  refreshTrades: async () => {
    if (!get().connected) {
      return; // Do nothing in offline/mock mode
    }
    try {
      const data = await api.getTradeHistory(get().mode);
      const trades = data.trades ?? [];
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const realizedPnl = trades
        .filter((t: any) => t.status === "CLOSED" && new Date(t.closedAt || t.openedAt || Date.now()).getTime() >= today.getTime())
        .reduce((sum: number, t: any) => sum + (t.pnl || 0), 0);
      set({ trades, totalProfit: realizedPnl });
    } catch (err: any) {
      if (isAuthError(err)) {
        console.warn("[store] refreshTrades unauthorized, disabling backend connection");
        api.clearToken();
        set({ connected: false });
      } else {
        console.warn("[store] refreshTrades failed, keeping current data");
      }
    }
  },

  refreshMarketCheck: async (symbol, interval, limit = 200) => {
    if (!get().connected) return;
    try {
      const sym = symbol || get().selectedSymbol;
      const tf = interval || get().timeframe || "5m";
      const payload = await api.getMarketCheck(sym, tf, limit);
      if (get().selectedSymbol !== sym) return; // Prevent race condition if symbol changed during await
      if (payload && typeof payload === "object") {
        set({
          marketCheckData: {
            symbol: payload.symbol || sym,
            interval: payload.interval || tf,
            close: Number(payload.close ?? 0),
            vwap: Number(payload.vwap ?? 0),
            supertrend: Number(payload.supertrend ?? 0),
            supertrendDirection: payload.supertrendDirection === "bear" ? "bear" : "bull",
            fundingRate: Number(payload.fundingRate ?? 0),
            openInterest: Number(payload.openInterest ?? 0),
            bias: payload.bias === "bearish" ? "bearish" : "bullish",
            liquidityPulse: Number(payload.liquidityPulse ?? 0),
            marketSignal: payload.marketSignal === "short" ? "short" : payload.marketSignal === "neutral" ? "neutral" : "long",
            ruleSet: {
              pcrApprox: payload.ruleSet?.pcrApprox ?? "balanced",
              riskGuard: payload.ruleSet?.riskGuard ?? "neutral",
            },
            lastUpdated: new Date().toISOString(),
          },
        });
      }
    } catch (err: any) {
      console.warn("[store] refreshMarketCheck failed:", err?.message || err);
    }
  },

  refreshEnsembleReport: async (symbol?: string, interval?: string, limit = 200) => {
    if (!get().connected) return;
    try {
      const sym = symbol || get().selectedSymbol;
      const tf = interval || get().timeframe || "5m";
      const payload = await api.getEnsembleReport(sym, tf, limit);
      if (get().selectedSymbol !== sym) return; // Prevent race condition
      set({ ensembleReport: payload as EnsembleReport });
    } catch (err: any) {
      console.warn("[store] refreshEnsembleReport failed:", err?.message || err);
    }
  },
  refreshQuantumReport: async (symbol?: string, mode?: string, exchange?: string) => {
    try {
      const sym = symbol || get().selectedSymbol;
      const md = mode || get().mode || "PAPER";
      const ex = exchange || "binance";
      const payload = await api.getQuantumRecommendation(sym, md, ex);
      if (get().selectedSymbol !== sym) return; // Prevent race condition
      set({ quantumReport: payload });
    } catch (err: any) {
      console.warn("[store] refreshQuantumReport failed:", err?.message || err);
    }
  },

  refreshSpectralRegime: async () => {
    if (!get().connected) return;
    try {
      const payload = await api.getSpectralRegime();
      if (payload && typeof payload === "object") {
        set({ spectralRegimeData: payload });
      }
    } catch (err: any) {
      console.warn("[store] refreshSpectralRegime failed:", err?.message || err);
    }
  },

  submitOrder: async (symbol, side, quantity, sl?: number, tp?: number, leverage?: number) => {
    const state = get();

    // If connected to backend, use real API
    if (state.connected) {
      try {
        const result = await api.placeOrder({
          symbol,
          side,
          quantity,
          mode: state.mode as "PAPER" | "LIVE",
          // A manual order always lands in exactly one account — "BOTH" is
          // a view mode, not a valid order destination, so fall back to
          // FUTURES (the long-standing default) when it's selected.
          accountType: state.accountType === "BOTH" ? "FUTURES" : state.accountType,
          sl,
          tp,
          leverage,
        });
        // Refresh positions & wallet after order
        get().refreshPositions();
        get().refreshWallet();
        get().addAlert("GREEN", `${side} ${quantity} ${symbol} filled`);
        return result;
      } catch (err: any) {
        get().addAlert("RED", `Order failed: ${err.message}`);
        throw err;
      }
    }

    // Mock fallback
    const price = symbol === "ETHUSDT" ? 2450 : symbol === "BNBUSDT" ? 310 : symbol === "ADAUSDT" ? 0.38 : 0.082;
    const newPos: Position = {
      id: `p-${Date.now()}`,
      symbol,
      side,
      qty: quantity,
      entry: price,
      pnl: 0,
    };
    set((st) => ({
      positions: [newPos, ...st.positions],
      wallet: { balance: st.wallet.balance - quantity * price },
    }));
    get().addAlert("GREEN", `${side} ${quantity} ${symbol} filled (mock)`);
    return { ok: true };
  },

  updateSlTp: async (tradeId: string, sl?: number, tp?: number) => {
    const state = get();
    if (state.connected) {
      try {
        await api.updateSlTp({ tradeId, sl, tp });
        get().refreshPositions();
        get().addAlert("GREEN", `Position SL/TP updated`);
      } catch (err: any) {
        get().addAlert("RED", `Update failed: ${err.message}`);
      }
    }
  },

  setHighPrecisionMode: async (v) => {
    set({ highPrecisionMode: v });
    if (get().connected) {
      await api.updateSettings({ highPrecisionMode: v }).catch(console.error);
    }
  },

  setBypassHtfTrendGate: async (v) => {
    set({ bypassHtfTrendGate: v });
    if (get().connected) {
      await api.updateSettings({ bypassHtfTrendGate: v }).catch(console.error);
    }
  },

  setBypassChecklist: async (v) => {
    set({ bypassChecklist: v });
    if (get().connected) {
      await api.updateSettings({ bypassChecklist: v }).catch(console.error);
    }
  },

  setBypassConsensusLag: async (v) => {
    set({ bypassConsensusLag: v });
    if (get().connected) {
      await api.updateSettings({ bypassConsensusLag: v }).catch(console.error);
    }
  },

  setDynamicGuardian: async (v) => {
    set({ dynamicGuardian: v });
    if (get().connected) {
      await api.updateSettings({ dynamicGuardian: v }).catch(console.error);
    }
  },

  setDynamicWeights: async (v) => {
    set({ dynamicWeights: v });
    if (get().connected) {
      await api.updateSettings({ dynamicWeights: v }).catch(console.error);
    }
  },

  setDynamicAnimals: async (v) => {
    set({ dynamicAnimals: v });
    if (get().connected) {
      await api.updateSettings({ dynamicAnimals: v }).catch(console.error);
    }
  },

  setOverdrive: async (v) => {
    set({ overdrive: v });
    if (get().connected) {
      await api.updateSettings({ overdrive: v }).catch(console.error);
    }
  },

  setNoLossMode: async (v) => {
    set({ noLossMode: v });
    if (get().connected) {
      await api.updateSettings({ noLossMode: v }).catch(console.error);
    }
  },

  setDynamicSLTP: async (v) => {
    set({ dynamicSLTP: v });
    if (get().connected) {
      await api.updateSettings({ "riskConfig.dynamicSLTP": v }).catch(console.error);
    }
  },

  setAiConsensusGate: async (v) => {
    set({ aiConsensusGate: v });
    if (get().connected) {
      await api.updateSettings({ aiConsensusGate: v }).catch(console.error);
    }
  },

  setOrderFlowVotingEnabled: async (v) => {
    set({ orderFlowVotingEnabled: v });
    if (get().connected) {
      await api.updateSettings({ orderFlowVotingEnabled: v }).catch(console.error);
    }
  },

  setSmartMoneyVotingEnabled: async (v) => {
    set({ smartMoneyVotingEnabled: v });
    if (get().connected) {
      await api.updateSettings({ smartMoneyVotingEnabled: v }).catch(console.error);
    }
  },

  setLiveNewsSentimentEnabled: async (v) => {
    set({ liveNewsSentimentEnabled: v });
    if (get().connected) {
      await api.updateSettings({ liveNewsSentimentEnabled: v }).catch(console.error);
    }
  },

  setCnnVotingEnabled: async (v) => {
    set({ cnnVotingEnabled: v });
    if (get().connected) {
      await api.updateSettings({ cnnVotingEnabled: v }).catch(console.error);
    }
  },

  setLstmVotingEnabled: async (v) => {
    set({ lstmVotingEnabled: v });
    if (get().connected) {
      await api.updateSettings({ lstmVotingEnabled: v }).catch(console.error);
    }
  },

  setMambaVotingEnabled: async (v) => {
    set({ mambaVotingEnabled: v });
    if (get().connected) {
      await api.updateSettings({ mambaVotingEnabled: v }).catch(console.error);
    }
  },

  setLnnVotingEnabled: async (v) => {
    set({ lnnVotingEnabled: v });
    if (get().connected) {
      await api.updateSettings({ lnnVotingEnabled: v }).catch(console.error);
    }
  },

  setTransformerVotingEnabled: async (v) => {
    set({ transformerVotingEnabled: v });
    if (get().connected) {
      await api.updateSettings({ transformerVotingEnabled: v }).catch(console.error);
    }
  },

  setPpoVotingEnabled: async (v) => {
    set({ ppoVotingEnabled: v });
    if (get().connected) {
      await api.updateSettings({ ppoVotingEnabled: v }).catch(console.error);
    }
  },

  setGayatriVotingEnabled: async (v) => {
    set({ gayatriVotingEnabled: v });
    if (get().connected) {
      await api.updateSettings({ gayatriVotingEnabled: v }).catch(console.error);
    }
  },

  setOhmkaraVotingEnabled: async (v) => {
    set({ ohmkaraVotingEnabled: v });
    if (get().connected) {
      await api.updateSettings({ ohmkaraVotingEnabled: v }).catch(console.error);
    }
  },

  setLakshmiVotingEnabled: async (v) => {
    set({ lakshmiVotingEnabled: v });
    if (get().connected) {
      await api.updateSettings({ lakshmiVotingEnabled: v }).catch(console.error);
    }
  },

  setAiPredictorsEnabled: async (v) => {
    set({ aiPredictorsEnabled: v });
    if (get().connected) {
      await api.updateSettings({ aiPredictorsEnabled: v }).catch(console.error);
    }
  },

  setTransitionOverrideEnabled: async (v) => {
    set({ transitionOverrideEnabled: v });
    if (get().connected) {
      await api.updateSettings({ transitionOverrideEnabled: v }).catch(console.error);
    }
  },

  setBehaviourModelEnabled: async (v) => {
    set({ behaviourModelEnabled: v });
    if (get().connected) {
      await api.updateSettings({ behaviourModelEnabled: v }).catch(console.error);
    }
  },

  setTaFallbackEnabled: async (v) => {
    set({ taFallbackEnabled: v });
    if (get().connected) {
      await api.updateSettings({ taFallbackEnabled: v }).catch(console.error);
    }
  },

  setTaFallbackScope: async (v) => {
    set({ taFallbackScope: v });
    if (get().connected) {
      await api.updateSettings({ taFallbackScope: v }).catch(console.error);
    }
  },

  setDefaultSL: async (v) => {
    set({ defaultSL: v });
    if (get().connected) {
      await api.updateSettings({ "riskConfig.defaultSL": v }).catch(console.error);
    }
  },

  setRiskLevel: async (v) => {
    set({ riskLevel: v });
    if (get().connected) {
      await api.updateSettings({ "riskConfig.maxPositionSizePct": v }).catch(console.error);
    }
  },

  setMaxDrawdown: async (v) => {
    set({ maxDrawdown: v });
    if (get().connected) {
      await api.updateSettings({ "riskConfig.maxDailyLoss": v }).catch(console.error);
    }
  },

  setAutoTradeThreshold: async (v) => {
    set({ autoTradeThreshold: v });
    if (get().connected) {
      await api.updateSettings({ autoTradeThreshold: v }).catch(console.error);
    }
  },

  setShortScoreThreshold: async (v) => {
    set({ shortScoreThreshold: v });
    if (get().connected) {
      await api.updateSettings({ shortScoreThreshold: v }).catch(console.error);
    }
  },

  setAiFlipExitMinProfitR: async (v) => {
    set({ aiFlipExitMinProfitR: v });
    if (get().connected) {
      await api.updateSettings({ aiFlipExitMinProfitR: v }).catch(console.error);
    }
  },

  setDriftHaltThreshold: async (v) => {
    set({ driftHaltThreshold: v });
    if (get().connected) {
      await api.updateSettings({ driftHaltThreshold: v }).catch(console.error);
    }
  },

  setDriftReduceThreshold: async (v) => {
    set({ driftReduceThreshold: v });
    if (get().connected) {
      await api.updateSettings({ driftReduceThreshold: v }).catch(console.error);
    }
  },

  setSaraswatiAlphaThreshold: async (v) => {
    set({ saraswatiAlphaThreshold: v });
    if (get().connected) {
      await api.updateSettings({ saraswatiAlphaThreshold: v }).catch(console.error);
    }
  },

  setAllowedSymbols: (s) => set({ allowedSymbols: s }),

  addAllowedSymbol: (s) => {
    const sym = s.toUpperCase().trim();
    if (!sym) return;
    const current = get().allowedSymbols;
    if (current.includes(sym)) return;
    const next = [...current, sym];
    set({ allowedSymbols: next });
    const acct = get().accountType;
    if (acct === "BOTH") { subscribeTicker(sym, true); subscribeTicker(sym, false); }
    else subscribeTicker(sym, acct === "FUTURES");
    if (typeof window !== "undefined") {
      try { localStorage.setItem("aalgo_ticker_symbols", JSON.stringify(next)); } catch {}
    }
    if (get().connected) {
      api.updateSettings({ allowedSymbols: next }).catch(console.error);
    }
  },

  removeAllowedSymbol: (sym) => {
    const current = get().allowedSymbols;
    const next = current.filter((s) => s !== sym);
    if (next.length === 0) return;
    try {
      const acct = get().accountType;
      if (acct === "BOTH") { unsubscribeTicker(sym, true); unsubscribeTicker(sym, false); }
      else unsubscribeTicker(sym, acct === "FUTURES");
    } catch {}
    set({
      allowedSymbols: next,
      selectedSymbol: get().selectedSymbol === sym ? next[0] : get().selectedSymbol,
      selectedSymbols: get().selectedSymbols.filter((s) => s !== sym),
    });
    if (typeof window !== "undefined") {
      try { localStorage.setItem("aalgo_ticker_symbols", JSON.stringify(next)); } catch {}
    }
    if (get().connected) {
      api.updateSettings({ allowedSymbols: next }).catch(console.error);
    }
  },

  reorderAllowedSymbols: (fromIndex, toIndex) => {
    const current = [...get().allowedSymbols];
    const [removed] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, removed);
    set({ allowedSymbols: current });
    if (typeof window !== "undefined") {
      try { localStorage.setItem("aalgo_ticker_symbols", JSON.stringify(current)); } catch {}
    }
    if (get().connected) {
      api.updateSettings({ allowedSymbols: current }).catch(console.error);
    }
  },
}));

/* ═══════════════════════════════════════════════════════
 *  Socket.io tick listener — updates live prices
 * ═══════════════════════════════════════════════════════ */

let socketSetup = false;

type AppStateSetter = Partial<AppState> | ((s: AppState) => Partial<AppState>);

function setupSocketListeners(
  set: (fn: AppStateSetter) => void,
  get: () => AppState,
) {
  if (socketSetup) return;
  socketSetup = true;

  socket.on("tick", (data: TickData) => {
    const price = parseFloat(data.price);
    if (isNaN(price)) return;

    set((st) => {
      // Update live price
      const livePrices = { ...st.livePrices, [data.symbol]: price };

      // Update P&L on matching open positions
      const positions = st.positions.map((pos) => {
        if (pos.symbol !== data.symbol) return pos;
        
        // Ensure robust fallbacks for fields
        const entry = pos.entry ?? (pos as any).entryPrice ?? 0;
        const qty = pos.qty ?? (pos as any).quantity ?? 0;

        const pnl = pos.side === "BUY"
          ? (price - entry) * qty
          : (entry - price) * qty;

        return { ...pos, pnl: +pnl.toFixed(4) };
      });

      const tickerData = { ...st.tickerData, [data.symbol]: data };
 
      return { livePrices, positions, tickerData };
    });
  });

  socket.on("consensus", (data: any) => {
    set((st: any) => {
      const updates: any = {
        consensusData: { ...st.consensusData, [data.symbol]: data }
      };
      
      // Auto-track the bot's focus by changing active symbol when in AUTO mode
      if (st.execMode === "AUTO" && st.selectedSymbol !== data.symbol) {
        updates.selectedSymbol = data.symbol;
      }
      
      return updates;
    });
  });

  socket.on("alert", (data: { level: string; text: string }) => {
    get().addAlert(
      (data.level as "GREEN" | "AMBER" | "RED") ?? "AMBER",
      data.text,
    );
  });

  socket.on("position_update", (data: { symbol: string; action: string }) => {
     console.log(`[socket] Position updated: ${data.symbol} ${data.action}`);
     get().refreshPositions();
     get().refreshWallet().catch(() => {});
     get().refreshTrades().catch(() => {});
  });

  socket.on("performance", (data: any) => {
      if (data.totalPnl !== undefined) {
        set(() => ({ 
        totalProfit: parseFloat(data.totalPnl),
        sessionPnl: data.sessionPnl !== undefined ? parseFloat(data.sessionPnl) : (parseFloat(data.totalValue || "0") - parseFloat(data.initialBalance || "0")) || 0,
        winRate: parseFloat(data.winRate || 0),
        totalTrades: parseInt(data.totalTrades || 0, 10),
        winningTrades: parseInt(data.winningTrades || 0, 10),
        }));
      }
  });
}

/* ═══════════════════════════════════════════════════════
 *  Periodic auto-refresh (every 30 seconds)
 * ═══════════════════════════════════════════════════════ */

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let spectralTimer: ReturnType<typeof setInterval> | null = null;
let tickerPricesTimer: ReturnType<typeof setInterval> | null = null;

function startAutoRefresh(set: any, get: () => AppState) {
  if (!refreshTimer) {
    refreshTimer = setInterval(() => {
      const state = get();
      if (!state.ready) return;
      state.refreshPositions();
      state.refreshWallet();
      state.refreshMarketCheck();
      state.refreshEnsembleReport();
    }, 30_000);
  }
  if (!spectralTimer) {
    spectralTimer = setInterval(() => {
      const state = get();
      if (!state.ready) return;
      state.refreshSpectralRegime();
    }, 60_000);
  }
  // Periodically refresh ticker prices every 15 seconds as a fallback to WebSocket
  if (!tickerPricesTimer) {
    tickerPricesTimer = setInterval(async () => {
      const state = get();
      if (!state.ready || !state.connected) return;
      try {
        const tickerPrices = await api.getCurrentTickerPrices(state.allowedSymbols);
        if (tickerPrices && Object.keys(tickerPrices).length > 0) {
          // Only update prices that have actual values
          const validPrices = Object.fromEntries(
            Object.entries(tickerPrices).filter(([_, price]) => typeof price === 'number' && price > 0)
          );
          if (Object.keys(validPrices).length > 0) {
            set((state: AppState) => ({
              livePrices: { ...state.livePrices, ...validPrices }
            }));
          }
        }
      } catch (err) {
        console.debug('[store] ticker price refresh skipped:', err);
      }
    }, 15_000);
  }
}

/* ═══════════════════════════════════════════════════════
 *  Mock consensus ticker — simulates AI signal updates
 *  every 8 seconds when the backend socket is offline
 * ═══════════════════════════════════════════════════════ */

let mockConsensusTimer: ReturnType<typeof setInterval> | null = null;

function buildMockConsensus(sym: string) {
  const evals = generateMockStrategyEvals(sym);
  const lakshmi = evals.find((e) => e.id === "LAKSHMI") ?? evals[0];
  const sig = lakshmi.signal;
  const rawConf = Math.min(0.99, Math.max(0.1, lakshmi.confidence));
  return {
    symbol: sym,
    action: sig === "STRONG_BUY" || sig === "BUY" ? "LONG" : sig === "STRONG_SELL" || sig === "SELL" ? "SHORT" : "HOLD",
    confidenceLong: +rawConf.toFixed(3),
    confidenceShort: +(1 - rawConf).toFixed(3),
    threshold: 0.6,
  };
}

function startMockConsensusTicker(
  set: (fn: AppStateSetter) => void,
  get: () => AppState,
) {
  // Mock consensus ticker is intentionally disabled.
  // It generated random AI signals which misled users into thinking the entire system used mock data.
  // The system relies exclusively on the real backend AI ensemble now.
  return;
}

/* ═══════════════════════════════════════════════════════
 *  Dynamic animal weights poller (online & dynamicAnimals)
 * ═══════════════════════════════════════════════════════ */

let weightsPollerTimer: ReturnType<typeof setInterval> | null = null;

function startDynamicWeightsPoller(
  set: (fn: AppStateSetter) => void,
  get: () => AppState,
) {
  if (weightsPollerTimer) return;
  weightsPollerTimer = setInterval(() => {
    const state = get();
    if (!state.ready || !state.connected) return;

    if (state.dynamicAnimals) {
      api.getCurrentAnimalWeights()
        .then((weights) => {
          if (weights) {
            set(() => ({ behaviorWeights: weights }));
          }
        })
        .catch((err: any) => {
          if (isAuthError(err)) {
            console.warn("[store] Dynamic animals poll unauthorized, disabling backend connection");
            api.clearToken();
            set({ connected: false });
          } else {
            console.warn("[store] Dynamic animals poll failed:", err.message);
          }
        });
    }

  }, 5000);
}

/* ═══════════════════════════════════════════════════════
 *  Real-time dynamic visual weights jitter vibration engine
 * ═══════════════════════════════════════════════════════ */

let weightsJitterTimer: ReturnType<typeof setInterval> | null = null;

function startWeightsJitter(
  set: (fn: AppStateSetter) => void,
  get: () => AppState,
) {
  // Weights jitter disabled to enforce 100% deterministic mathematical calculations from the backend engine.
  return;
}
