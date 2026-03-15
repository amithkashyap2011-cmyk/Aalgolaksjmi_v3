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
} from "../mock/data";
import * as api from "../lib/api";
import { socket, subscribeTicker, type TickData } from "../lib/socket";

/* ── Types ────────────────────────────────────────────── */

export type Mode = "PAPER" | "LIVE" | "BACKTEST";
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
}

/* ── Store shape ──────────────────────────────────────── */

interface AppState {
  ready: boolean;
  userId: string | null;
  userEmail: string | null;
  connected: boolean;            // true if backend auth succeeded

  mode: Mode;
  execMode: ExecMode;
  selectedSymbol: string;
  selectedSymbols: string[];
  allowedSymbols: string[];
  timeframe: string;
  wallet: { balance: number };
  positions: Position[];
  behaviorWeights: BehaviorWeights;
  alerts: Alert[];
  trades: HistoryTrade[];
  sidebarOpen: boolean;
  livePrices: Record<string, number>;   // symbol → latest price

  boot: () => Promise<void>;
  setMode: (m: Mode) => void;
  setExecMode: (m: ExecMode) => void;
  setSymbol: (s: string) => void;
  toggleSymbol: (s: string) => void;
  setSymbols: (s: string[]) => void;
  setTimeframe: (t: string) => void;
  setBehaviorWeight: (name: string, v: number) => void;
  addAlert: (level: Alert["level"], text: string) => void;
  toggleSidebar: () => void;
  refreshPositions: () => Promise<void>;
  refreshWallet: () => Promise<void>;
  refreshTrades: () => Promise<void>;
  submitOrder: (symbol: string, side: "BUY" | "SELL", quantity: number) => Promise<any>;
}

/* ── Create store ─────────────────────────────────────── */

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  userId: null,
  userEmail: null,
  connected: false,

  mode: "PAPER",
  execMode: "AUTO",
  selectedSymbol: SYMBOLS[0],
  selectedSymbols: [SYMBOLS[0]],
  allowedSymbols: [...SYMBOLS],
  timeframe: "5m",
  wallet: { ...MOCK_WALLET },
  positions: [...MOCK_POSITIONS],
  behaviorWeights: { ...DEFAULT_WEIGHTS },
  alerts: [...MOCK_ALERTS],
  trades: [...MOCK_TRADES],
  sidebarOpen: true,
  livePrices: {},

  /* ── boot: try backend auth, fall back to mock ──────── */
  boot: async () => {
    let connected = false;
    let userId: string | null = "mock-user-001";
    let userEmail: string | null = "demo@aalgo.local";

    // 1. If we have a JWT, try to authenticate and load real data
    if (api.getToken()) {
      try {
        const me = await api.getMe();
        userId = me.user?._id ?? me.user?.id ?? userId;
        userEmail = me.user?.email ?? userEmail;
        connected = true;
      } catch {
        // Token expired or server down — will use mock data
        console.warn("[store] auth failed, using mock data");
      }
    }

    // 2. If connected, load backend data
    if (connected) {
      try {
        const [settings, walletData, posData, tradeData] = await Promise.allSettled([
          api.getSettings(),
          api.getWallet("PAPER"),
          api.getOpenPositions("PAPER"),
          api.getTradeHistory("PAPER"),
        ]);

        if (settings.status === "fulfilled" && settings.value) {
          const s = settings.value;
          set({
            allowedSymbols: s.allowedSymbols ?? [...SYMBOLS],
            behaviorWeights: s.behaviorWeights ?? { ...DEFAULT_WEIGHTS },
            mode: s.defaultMode ?? "PAPER",
          });
        }

        if (walletData.status === "fulfilled" && walletData.value) {
          const w = walletData.value;
          set({ wallet: { balance: w.balance ?? w.usdt ?? MOCK_WALLET.balance } });
        }

        if (posData.status === "fulfilled") {
          const positions = Array.isArray(posData.value)
            ? posData.value
            : posData.value?.positions ?? [];
          if (positions.length > 0) set({ positions });
        }

        if (tradeData.status === "fulfilled") {
          const trades = tradeData.value?.trades ?? [];
          if (trades.length > 0) set({ trades });
        }
      } catch (err) {
        console.warn("[store] failed to load backend data:", err);
      }
    }

    // 3. Subscribe to socket.io ticks for all symbols (skip in test env)
    if (typeof window !== "undefined" && !import.meta.env.SSR) {
      setupSocketListeners(set, get);
      const syms = get().allowedSymbols;
      syms.forEach((s) => subscribeTicker(s));

      // 4. Start periodic refresh (every 30s)
      startAutoRefresh(get);
    }

    set({ ready: true, connected, userId, userEmail });
  },

  setMode: (m) => set({ mode: m }),
  setExecMode: (m) => set({ execMode: m }),
  setSymbol: (s) => set({ selectedSymbol: s }),
  toggleSymbol: (s) =>
    set((st) => {
      const current = st.selectedSymbols;
      const exists = current.includes(s);
      if (exists && current.length === 1) return {};
      const next = exists ? current.filter((x) => x !== s) : [...current, s];
      return {
        selectedSymbols: next,
        selectedSymbol: next[0],
      };
    }),
  setSymbols: (s) => set({ selectedSymbols: s, selectedSymbol: s[0] ?? SYMBOLS[0] }),
  setTimeframe: (t) => set({ timeframe: t }),
  setBehaviorWeight: (name, v) =>
    set((st) => ({ behaviorWeights: { ...st.behaviorWeights, [name]: v } })),
  addAlert: (level, text) =>
    set((st) => ({
      alerts: [
        { id: String(Date.now()), level, text, time: new Date().toLocaleTimeString() },
        ...st.alerts.slice(0, 49),     // keep max 50 alerts
      ],
    })),
  toggleSidebar: () => set((st) => ({ sidebarOpen: !st.sidebarOpen })),

  /* ── Data refresh actions (API-first, mock fallback) ── */
  refreshWallet: async () => {
    if (!get().connected) {
      set({ wallet: { ...MOCK_WALLET } });
      return;
    }
    try {
      const w = await api.getWallet(get().mode);
      set({ wallet: { balance: w.balance ?? w.usdt ?? MOCK_WALLET.balance } });
    } catch {
      console.warn("[store] refreshWallet failed, keeping current data");
    }
  },

  refreshPositions: async () => {
    if (!get().connected) {
      set({ positions: [...MOCK_POSITIONS] });
      return;
    }
    try {
      const data = await api.getOpenPositions(get().mode);
      const positions = Array.isArray(data) ? data : data?.positions ?? [];
      set({ positions });
    } catch {
      console.warn("[store] refreshPositions failed, keeping current data");
    }
  },

  refreshTrades: async () => {
    if (!get().connected) {
      set({ trades: [...MOCK_TRADES] });
      return;
    }
    try {
      const data = await api.getTradeHistory(get().mode);
      set({ trades: data.trades ?? [] });
    } catch {
      console.warn("[store] refreshTrades failed, keeping current data");
    }
  },

  submitOrder: async (symbol, side, quantity) => {
    const state = get();

    // If connected to backend, use real API
    if (state.connected) {
      try {
        const result = await api.placeOrder({
          symbol,
          side,
          quantity,
          mode: state.mode as "PAPER" | "LIVE",
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
}));

/* ═══════════════════════════════════════════════════════
 *  Socket.io tick listener — updates live prices
 * ═══════════════════════════════════════════════════════ */

let socketSetup = false;

function setupSocketListeners(
  set: (fn: (s: AppState) => Partial<AppState>) => void,
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
        const pnl = pos.side === "BUY"
          ? (price - pos.entry) * pos.qty
          : (pos.entry - price) * pos.qty;
        return { ...pos, pnl: +pnl.toFixed(4) };
      });

      return { livePrices, positions };
    });
  });

  socket.on("alert", (data: { level: string; text: string }) => {
    get().addAlert(
      (data.level as "GREEN" | "AMBER" | "RED") ?? "AMBER",
      data.text,
    );
  });
}

/* ═══════════════════════════════════════════════════════
 *  Periodic auto-refresh (every 30 seconds)
 * ═══════════════════════════════════════════════════════ */

let refreshTimer: ReturnType<typeof setInterval> | null = null;

function startAutoRefresh(get: () => AppState) {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    const state = get();
    if (!state.ready) return;
    state.refreshPositions();
    state.refreshWallet();
  }, 30_000);
}
