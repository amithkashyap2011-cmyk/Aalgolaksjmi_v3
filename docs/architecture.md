# AALGOLAKSHMI V2 — Architecture Document

> **Version**: 2.0.0 &bull; **Last updated**: 15 March 2026

---

## 1. System Layers

```
┌────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION (UI)                          │
│  React 18 + TypeScript + Vite + Tailwind CSS + Highcharts         │
│  Golden-ratio layout (φ ≈ 1.618) · 100% responsive · PWA          │
├────────────────────────────────────────────────────────────────────┤
│                        TRANSPORT                                  │
│  REST (fetch) via Vite proxy · Socket.io client (real-time ticks) │
├────────────────────────────────────────────────────────────────────┤
│                        API LAYER                                  │
│  Express 4 + JWT auth middleware · Zod request validation          │
├────────────────────────────────────────────────────────────────────┤
│                     DOMAIN / BUSINESS LOGIC                       │
│  indicatorService · agentService · behaviourModel                  │
│  autoTradeEngine · paperState · checklist                          │
├────────────────────────────────────────────────────────────────────┤
│                       INTEGRATION LAYER                           │
│  binanceService (REST + WebSocket) · AES-256-GCM key vault         │
├────────────────────────────────────────────────────────────────────┤
│                       PERSISTENCE                                 │
│  MongoDB via Mongoose · In-memory paper state (Map)                │
└────────────────────────────────────────────────────────────────────┘
```

### 1.1 Presentation (UI)

| Concern | Technology |
|---|---|
| Framework | React 18.3 with TypeScript 5.5 |
| Bundler | Vite 5.3 (HMR, proxy to server) |
| Styling | Tailwind CSS 3.4, golden-ratio proportions |
| State | Zustand 4.5 global store |
| Charts | Highcharts 11.4 (OHLC candlestick, Fib bands) |
| Real-time | Socket.io-client 4.7 (tick stream) |
| Routing | React Router 6 |

### 1.2 API Layer

Express REST API mounted at `/auth`, `/settings`, `/apikeys`, `/trading`, `/backtest`, `/agent`, `/wallet`. Every mutation route is protected by JWT `authGuard` middleware. Request bodies validated with **Zod** schemas.

### 1.3 Domain / Business Logic

| Service | Responsibility |
|---|---|
| `indicatorService` | Streaming EMA, SMA, RSI, MACD, ATR, Bollinger, StdDev |
| `agentService` | Multi-signal recommendation engine |
| `behaviourModel` | 10-animal personality weighting |
| `autoTradeEngine` | Scheduled 60s auto-trade loop |
| `paperState` | In-memory PositionIndex + Wallet for paper mode |
| `checklist` | Pre-trade 15-point safety checklist |

### 1.4 Integration (Binance)

| Endpoint | Type | Auth |
|---|---|---|
| `GET /api/v3/exchangeInfo` | REST (public) | None |
| `GET /api/v3/klines` | REST (public) | None |
| `GET /api/v3/ticker/price` | REST (public) | None |
| `GET /api/v3/account` | REST (signed) | HMAC-SHA256 |
| `POST /api/v3/order` | REST (signed) | HMAC-SHA256 |
| `wss://stream.binance.com` | WebSocket | None |

API keys stored in MongoDB encrypted with **AES-256-GCM** (separate IV + authTag per field).

---

## 2. Data Flow

```
Client (React)
   │
   ├──── REST ──────────► Express API ──────► Domain Services ──────► MongoDB
   │     (fetch)           (authGuard)        (indicators, agent)     (Mongoose)
   │
   ├──── Socket.io ─────► Socket.io Server ─► binanceService.subscribeTicker()
   │     (real-time)       (relay ticks)       wss://stream.binance.com
   │
   └──── Zustand Store ◄── REST responses + Socket.io events
```

### Request lifecycle (example: place order)

1. **Client** calls `api.placeOrder({ symbol, side, quantity, mode })`
2. **Vite proxy** forwards `POST /trading/place-order` → `localhost:5050`
3. **authGuard** validates JWT, injects `req.userId`
4. **trading route** validates symbol against `Settings.allowedSymbols`
5. **PAPER mode**: fetch real price via `binance.getTickerPrice()`, update in-memory `paperState`, persist `Trade` + `WalletSnapshot` to MongoDB
6. **LIVE mode**: decrypt API keys, call `binance.placeOrder()`, persist `Trade`
7. Response flows back → Zustand store refreshes wallet / positions / trades

---

## 3. Core Data Structures

### 3.1 PositionIndex

A `Map<string, PaperPosition>` keyed by `${userId}:${symbol}:${mode}`.

```typescript
// server/src/services/paperState.ts
interface PaperPosition {
  userId: string;
  symbol: string;       // e.g. "DOGEUSDT"
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  tradeId: string;      // Mongo _id
}

const positions = new Map<string, PaperPosition>();
// Key: "userId123:DOGEUSDT:PAPER"

// O(1) lookup
getPosition(userId, symbol, mode)  → PaperPosition | undefined
setPosition(userId, symbol, mode, pos) → void
removePosition(userId, symbol, mode) → void

// O(n) scan for user's open positions
getOpenPositions(userId, mode) → PaperPosition[]
```

### 3.2 Wallet

A `Map<string, Map<string, number>>` — outer key `${userId}:${mode}`, inner key is asset ticker.

```typescript
// server/src/services/paperState.ts
const wallets = new Map<string, Map<string, number>>();

// Example: user "abc" in PAPER mode
// wallets.get("abc:PAPER") → Map { "USDT" → 5000, "DOGE" → 1000 }

getWallet(userId, mode) → Map<string, number>
// Auto-seeds new users with 5000 USDT

setWalletBalance(userId, mode, asset, amount) → void
```

### 3.3 TradeLog

Append-only log persisted in MongoDB via the `Trade` model:

```typescript
// server/src/models/Trade.ts
interface ITrade {
  userId: ObjectId;
  mode: "PAPER" | "LIVE";
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  sl: number | null;          // stop-loss
  tp: number | null;          // take-profit
  status: "PENDING" | "OPEN" | "CLOSED" | "CANCELLED";
  pnl: number;
  openedAt: Date;
  closedAt: Date | null;
  meta: Record<string, unknown>;
}

// Compound index for fast queries:
TradeSchema.index({ userId: 1, symbol: 1, mode: 1, status: 1 });
```

---

## 4. Mono-repo Structure

```
aalgolakshmi_v2/
├── package.json          ← root: concurrently, install:all, dev, build
├── client/               ← React + TS + Vite + Tailwind
│   ├── src/
│   │   ├── components/   (layout, chart, dashboard, ai)
│   │   ├── pages/        (Dashboard, Backtest, History, Settings, Wallet)
│   │   ├── store/        (Zustand useAppStore)
│   │   ├── lib/          (api.ts, socket.ts, registerSW.ts)
│   │   └── ui/           (Button, Card, Badge, Tag, SymbolSelector, TimeframeTabs)
│   ├── index.html
│   ├── tailwind.config.cjs
│   └── vite.config.ts    (proxy /auth, /trading, etc. → :5050)
├── server/               ← Express + TS + Mongoose + Socket.io
│   ├── src/
│   │   ├── routes/       (auth, settings, apikeys, trading, backtest, agent, wallet)
│   │   ├── models/       (User, Settings, ApiKeys, Trade, etc.)
│   │   ├── services/     (binance, indicators, agent, paper, autoTrade, etc.)
│   │   ├── middleware/   (auth.ts JWT guard)
│   │   └── lib/          (crypto.ts AES-256-GCM, ringBuffer.ts)
│   ├── __tests__/        (Jest unit tests)
│   ├── jest.config.ts
│   └── tsconfig.json
└── docs/
    └── architecture.md   ← this file
```

---

## 5. npm Scripts

### Root (`/package.json`)
| Script | Command |
|---|---|
| `install:all` | Install both client + server deps |
| `dev` | `concurrently` runs client dev + server dev |
| `build` | Build client (Vite) + server (tsc) |
| `typecheck` | Run `tsc --noEmit` on both sides |

### Client (`/client/package.json`)
| Script | Command |
|---|---|
| `dev` | `vite` (port 5173) |
| `build` | `tsc && vite build` |
| `preview` | `vite preview` |

### Server (`/server/package.json`)
| Script | Command |
|---|---|
| `dev` | `tsx watch src/index.ts` |
| `build` | `tsc` |
| `start` | `node dist/index.js` |
| `test` | `jest --forceExit --detectOpenHandles` |

---

## 6. UI Design Principles – Golden Ratio

The UI follows the **golden ratio (φ = 1.618)** for harmonious proportions:

- **Dashboard split**: 61.8% center (chart + orders) / 38.2% right (AI panels)
- **Sidebar width**: 80px collapsed / 224px expanded (80 × φ ≈ 129 → next golden step)
- **Card padding**: uses Tailwind spacing scale aligned to φ-derived stops
- **Typography scale**: headings step up by ×1.618 (e.g. 14px → 22.6px → 36.6px)
- **Touch targets**: minimum 44×44px (WCAG 2.5.5)
- **Breakpoints**: mobile-first, lg (1024px) triggers desktop layout
- **Bottom nav**: visible below lg, safe-area-aware for notch devices

---

## 7. Security

- JWT tokens (7-day expiry) stored in localStorage
- API keys encrypted at rest with AES-256-GCM (separate IV + authTag per field)
- ENCRYPTION_KEY is 32-byte hex in server `.env`
- Passwords hashed with bcryptjs (cost 12)
- CORS open in dev, should be restricted in production
