# AALGOLAKSHMI V2

> AI-powered crypto trading assistant with animal behaviour modelling,
> rule-based + ML/DL fusion engine, and Binance integration.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Tech Stack](#tech-stack)
3. [Quick Start](#quick-start)
4. [Environment Variables](#environment-variables)
5. [Agile Phases](#agile-phases)
6. [How UI ↔ Backend ↔ AI Fit Together](#how-ui--backend--ai-fit-together)
7. [PWA & Hybrid Mobile](#pwa--hybrid-mobile)
8. [Project Structure](#project-structure)
9. [API Reference](#api-reference)
10. [Development](#development)

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      CLIENT (React)                      │
│  Vite + Tailwind + Zustand + Highcharts + React Router   │
│  PWA-ready (manifest + service worker)                   │
│  Responsive: Desktop sidebar ↔ Mobile bottom nav         │
└──────────┬───────────────────────────────┬───────────────┘
           │  REST (fetch)                 │  WebSocket
           ▼                               ▼
┌──────────────────────────────────────────────────────────┐
│                     SERVER (Express)                      │
│  TypeScript + Mongoose + Socket.io + JWT                 │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐ │
│  │   Routes    │  │  Services  │  │    AI Engine        │ │
│  │ auth       │  │ binance    │  │ indicators (stream) │ │
│  │ settings   │  │ paperState │  │ behaviour (animals) │ │
│  │ apikeys    │  │ autoTrade  │  │ agentService        │ │
│  │ trading    │  │ mlModel*   │  │ checklist (24spoke) │ │
│  │ backtest   │  │ dlModel*   │  │ fusion (R+ML+DL)   │ │
│  │ agent      │  │            │  │                     │ │
│  └────────────┘  └────────────┘  └────────────────────┘ │
│                       │                                  │
│                  MongoDB + in-memory Maps                │
└──────────────────────────────────────────────────────────┘
           │
           ▼
    ┌──────────────┐        ┌──────────────┐
    │   Binance    │        │  ML/DL       │
    │   REST + WS  │        │  Python      │
    │   API        │        │  Services*   │
    └──────────────┘        └──────────────┘
                            (* stub, see docs/)
```

---

## Tech Stack

| Layer    | Technology                                            |
|----------|-------------------------------------------------------|
| Client   | React 18, TypeScript, Vite, Tailwind CSS 3, Zustand   |
| Charts   | Highcharts Stock                                      |
| Routing  | React Router 6                                        |
| Server   | Node.js, Express 4, TypeScript, tsx                   |
| Database | MongoDB (Mongoose 8)                                  |
| Auth     | JWT (jsonwebtoken) + bcryptjs                         |
| Realtime | Socket.io 4 + Binance WebSocket                      |
| Crypto   | AES-256-GCM (API key encryption)                      |
| AI       | Custom rule engine + ML/DL stubs (FastAPI-ready)      |
| PWA      | Web App Manifest + Service Worker                     |

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **MongoDB** running locally (or update `MONGO_URI`)
- **npm** ≥ 9

### One-command setup

```bash
# 1. Clone and install everything
cd aalgolakshmi_v2
npm install              # installs root concurrently
npm run install:all      # installs client + server deps

# 2. Start MongoDB (if not already running)
mkdir -p /tmp/aalgo_db && mongod --dbpath /tmp/aalgo_db &

# 3. Run both client + server in one terminal
npm run dev
```

This starts:
- **Client** → http://localhost:5173  (Vite dev server)
- **Server** → http://localhost:5050  (Express + Socket.io)

### Production build

```bash
npm run build         # builds both client and server
npm start             # runs compiled server (serves API)
```

Serve the `client/dist/` folder with any static server (Nginx, Vercel, etc.).

---

## Environment Variables

### Server (`server/.env`)

| Variable         | Description                          | Default                                    |
|------------------|--------------------------------------|--------------------------------------------|
| `PORT`           | HTTP server port                     | `5050`                                     |
| `MONGO_URI`      | MongoDB connection string            | `mongodb://127.0.0.1:27017/aalgolakshmi`   |
| `JWT_SECRET`     | Secret for signing JWT tokens        | (change in production!)                    |
| `ENCRYPTION_KEY` | 64-hex-char key for AES-256-GCM      | (change in production!)                    |
| `ML_SERVICE_URL` | URL of Python ML service (optional)  | —                                          |
| `DL_SERVICE_URL` | URL of Python DL service (optional)  | —                                          |

### Client

The client reads the API base URL from the Vite proxy or can be set via:

```env
VITE_API_URL=http://localhost:5050
```

---

## Agile Phases

### Phase 1 — UI Scaffold ✅
- React + Vite + Tailwind project setup
- All pages: Dashboard, Backtest, History, Settings
- Component library: Card, Button, Badge, Tag, SymbolSelector, TimeframeTabs
- Zustand store with mock data
- Highcharts candlestick chart with Fibonacci bands

### Phase 2 — UI Polish ✅
- Mobile bottom navigation bar (`BottomNav.tsx`)
- Confirmation dialog on AUTO/MANUAL switch
- Hover tooltips on animal behaviour cards
- ARIA attributes across Sidebar, TopBar, DashboardPage
- Settings gear icon on dashboard
- Responsive layout: flex/grid, lg breakpoint for sidebar ↔ bottom nav

### Phase 3 — Full Backend ✅
- MongoDB schemas: User, Settings, ApiKeys, WalletSnapshot, Trade, BacktestRun, Alert
- JWT auth (register/login/me)
- Settings & API key management (AES-256-GCM encrypted)
- Binance REST & WebSocket integration
- Trading endpoints (place-order for PAPER/LIVE, positions, history, wallet)
- Backtest endpoint with kline fetch + mock strategy engine
- Paper trading state with O(1) in-memory Maps

### Phase 4 — Business Logic & Algorithms ✅
- **Indicator engine** (`indicatorService.ts`): Streaming EMA, SMA, RSI, MACD, ATR, Bollinger, StdDev with ring buffers and incremental formulas
- **Behaviour model** (`behaviourModel.ts`): 10 animals (Eagle, Tiger, Cheetah, Fox, Tortoise, Dog, Owl, Cow, Spider, Lion) with per-animal scoring functions
- **Agent service** (`agentService.ts`): `buildContext` → `scoreLong/Exit/NoTrade` → `decideAction` with animal blend
- **24-spoke checklist** (`checklist.ts`): Trend (8) + Risk (8) + Behaviour (8), mandatory gate
- **Auto-trade engine** (`autoTradeEngine.ts`): 60s scheduler, per-user symbol loop, PAPER + LIVE execution

### Phase 5 — ML & DL Integration Hooks ✅
- `mlModelService.ts`: Interface + stub for RandomForest/XGBoost/MLP
- `dlModelService.ts`: Interface + stub for LSTM/Transformer sequence models
- Fusion logic in `decideAction()`: Rule 50% + ML 25% + DL 25%, scaled by confidence
- Risk & checklist always enforced — no model can bypass limits
- Full integration guide: `docs/ML_integration.md`

### Phase 6 — Hybrid-Ready Polish ✅
- PWA support: Web App Manifest (SVG icons), versioned service worker (v2), apple-touch-icon
- Touch-friendly CSS: min 44px tap targets, safe-area padding, overscroll prevention, focus-visible rings
- Responsive utilities: `desktop-only` / `mobile-only`, `text-responsive-*`, `scroll-x-mobile`, `touch-pad`
- Dark mode CSS layer prepared
- `capacitor.config.ts` template for native iOS/Android wrapping
- Root `package.json` v2.0.0 with `npm run dev`, `npm run test:all`, `npm run cap:init`
- Capacitor / React Native Web documentation
- **Server tests: 15 suites, 267 tests** (includes phase6Integration.test.ts with 20 new tests)
- **Client tests: 4 files, 109 tests** (includes phase6Hybrid.test.tsx with 40 new tests)
- This README

---

## How UI ↔ Backend ↔ AI Fit Together

### Data Flow

```
User opens Dashboard
  → Client connects Socket.io to Server
  → Server subscribes to Binance WebSocket for selected symbol
  → Real-time ticks streamed to client chart

User clicks BUY (manual)
  → Client POST /trading/place-order { symbol, side, quantity, mode }
  → Server validates: allowed symbols, risk limits, wallet balance
  → If PAPER: update in-memory maps + persist Trade doc
  → If LIVE:  decrypt API keys → call Binance REST → persist Trade doc
  → Response: trade details + updated wallet

Auto-trade (every 60 seconds)
  → autoTradeEngine loops enabled users × allowed symbols
  → buildContext(): fetch 200 bars (5m), compute indicators, load settings
  → ML/DL prediction (stub returns neutral; replace with HTTP to Python)
  → scoreLong/Exit/NoTrade: blend rules + animals + ML + DL
  → buildChecklist (24 spokes): mandatory checks must all pass
  → decideAction(): LONG / EXIT / NO_TRADE
  → If LONG + checklist.allowed → place order (PAPER or LIVE)
  → Log decision as Alert

Agent recommendation (on-demand)
  → Client GET /agent/recommendation?symbol=DOGEUSDT&mode=PAPER
  → Same pipeline as auto-trade, returns:
    { action, confidenceLong/Exit/NoTrade, contributions, checklist, ml, dl }
  → Client displays in HiveMindPanel + ProbabilityScores + Checklist view
```

### Animal Behaviour System

The 10 animals act as personality multipliers on the trading signals:

| Animal   | Role                                  | Effect on Scoring          |
|----------|---------------------------------------|----------------------------|
| Eagle    | Higher-timeframe trend follower       | Boosts HTF-aligned trades  |
| Tiger    | Conviction & position sizing          | Scales with RSI alignment  |
| Cheetah  | Fast breakout bias                    | Rewards Bollinger breakouts|
| Fox      | Scalp / volatility bias               | Rewards high volatility    |
| Tortoise | Conservative; fewer trades            | Penalises overtrading      |
| Dog      | Discipline; daily-loss caps           | Hard stops at loss limit   |
| Owl      | Reversal / divergence hunter          | RSI extremes + MACD cross  |
| Cow      | Steady growth, moderate risk          | Mean-reversion to EMA21    |
| Spider   | Correlation awareness                 | Penalises correlated bets  |
| Lion     | Aggressive trend continuation         | Rewards EMA alignment      |

Weights are stored per-user in `Settings.behaviorWeights` (0–100 sliders in UI, normalised to 0–1 internally).

---

## PWA & Hybrid Mobile

### PWA (Progressive Web App)

The app is PWA-ready out of the box:
- `public/manifest.json` — app name, icons, theme colour, standalone display
- `public/sw.js` — service worker with cache-first for assets, network-first for API
- Meta tags for iOS: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`
- Touch-friendly: 44px minimum tap targets, safe-area padding, overscroll disabled

Users can "Add to Home Screen" on iOS/Android for a native-like experience.

### Capacitor (Native Hybrid)

A ready-to-use `capacitor.config.ts` is included at the project root. To wrap as a native iOS/Android app:

```bash
npm install @capacitor/core @capacitor/cli
npm run cap:init            # uses the existing config
npm run build               # builds client/dist
npx cap add ios
npx cap add android
npx cap sync
npx cap open ios            # opens Xcode
npx cap open android        # opens Android Studio
```

The Vite build output (`client/dist/`) is served as the WebView content.
All API calls go to the same Express backend.

### React Native Web (Alternative)

If a React Native migration is desired:
1. The Zustand store and all business logic can be reused directly
2. Replace Tailwind classes with `StyleSheet.create()` or use `nativewind`
3. Replace `react-router-dom` with `@react-navigation/native`
4. Replace Highcharts with `react-native-svg-charts` or `victory-native`
5. The backend remains 100% unchanged

See the [React Native Web docs](https://necolas.github.io/react-native-web/) for shared component patterns.

---

## Project Structure

```
aalgolakshmi_v2/
├── package.json                  # Root: concurrently dev/build/test
├── capacitor.config.ts           # Hybrid mobile config (iOS/Android)
├── README.md                     # This file
│
├── client/                       # React UI
│   ├── index.html                # PWA meta tags, viewport-fit
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.cjs
│   ├── postcss.config.cjs
│   ├── tsconfig.json
│   ├── public/
│   │   ├── manifest.json         # PWA manifest
│   │   ├── sw.js                 # Service worker
│   │   └── icons/                # App icons
│   └── src/
│       ├── main.tsx              # Entry + SW registration
│       ├── App.tsx               # Root layout + routes
│       ├── lib/
│       │   └── registerSW.ts     # SW registration helper
│       ├── store/
│       │   └── useAppStore.ts    # Zustand global state
│       ├── styles/
│       │   └── index.css         # Tailwind + touch-friendly CSS
│       ├── ui/                   # Shared UI primitives
│       │   ├── Badge.tsx
│       │   ├── Button.tsx
│       │   ├── Card.tsx
│       │   ├── SymbolSelector.tsx
│       │   ├── Tag.tsx
│       │   └── TimeframeTabs.tsx
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Sidebar.tsx       # Desktop nav
│       │   │   ├── TopBar.tsx        # Header bar
│       │   │   ├── BottomNav.tsx     # Mobile bottom tabs
│       │   │   └── PageShell.tsx     # Page wrapper
│       │   ├── chart/
│       │   │   └── PriceChart.tsx    # Highcharts candlestick
│       │   ├── dashboard/
│       │   │   ├── ActivePositionsCard.tsx
│       │   │   ├── ModeToggle.tsx
│       │   │   └── OrderPanel.tsx
│       │   └── ai/
│       │       ├── AlertsFeed.tsx
│       │       ├── BehaviorModifiers.tsx
│       │       ├── HiveMindPanel.tsx
│       │       ├── OhmSyncPanel.tsx
│       │       └── ProbabilityScores.tsx
│       └── pages/
│           ├── DashboardPage.tsx
│           ├── BacktestPage.tsx
│           ├── HistoryPage.tsx
│           └── SettingsPage.tsx
│
└── server/                       # Express API
    ├── package.json
    ├── tsconfig.json
    ├── .env                      # Environment variables
    ├── .gitignore
    ├── docs/
    │   ├── strategy_design.md    # Algorithm documentation
    │   └── ML_integration.md     # ML/DL training guide
    └── src/
        ├── index.ts              # Entry: Express + Socket.io + Mongoose
        ├── lib/
        │   ├── crypto.ts         # AES-256-GCM encrypt/decrypt
        │   └── ringBuffer.ts     # O(1) circular buffer
        ├── middleware/
        │   └── auth.ts           # JWT guard + signToken
        ├── models/
        │   ├── index.ts          # Barrel export
        │   ├── User.ts
        │   ├── Settings.ts       # Risk, behaviour weights, chart prefs
        │   ├── ApiKeys.ts        # Encrypted Binance keys
        │   ├── WalletSnapshot.ts
        │   ├── Trade.ts          # Full lifecycle tracking
        │   ├── BacktestRun.ts
        │   └── Alert.ts
        ├── routes/
        │   ├── auth.ts           # register, login, me
        │   ├── settings.ts       # get, update
        │   ├── apikeys.ts        # save, test
        │   ├── trading.ts        # place-order, positions, history, wallet
        │   ├── backtest.ts       # run backtest
        │   └── agent.ts          # recommendation, auto enable/disable
        └── services/
            ├── binanceService.ts     # REST + WebSocket
            ├── paperState.ts         # In-memory O(1) position/wallet maps
            ├── indicatorService.ts   # Streaming technical indicators
            ├── behaviourModel.ts     # 10 animal scoring functions
            ├── agentService.ts       # Trading brain: context → score → decide
            ├── checklist.ts          # 24-spoke pre-trade checklist
            ├── autoTradeEngine.ts    # Periodic auto-trade scheduler
            ├── mlModelService.ts     # ML stub (→ FastAPI)
            └── dlModelService.ts     # DL stub (→ FastAPI)
```

---

## API Reference

| Method | Path                        | Auth | Description                        |
|--------|-----------------------------|------|------------------------------------|
| POST   | `/auth/register`            | No   | Create account                     |
| POST   | `/auth/login`               | No   | Get JWT token                      |
| GET    | `/auth/me`                  | Yes  | Current user info                  |
| GET    | `/settings/get`             | Yes  | User settings                      |
| PUT    | `/settings/update`          | Yes  | Update settings                    |
| POST   | `/apikeys/save`             | Yes  | Store encrypted Binance keys       |
| POST   | `/apikeys/test`             | Yes  | Test API key connectivity          |
| POST   | `/trading/place-order`      | Yes  | Place PAPER or LIVE order          |
| GET    | `/trading/open-positions`   | Yes  | Current open positions             |
| GET    | `/trading/history`          | Yes  | Trade history (paginated)          |
| GET    | `/trading/wallet`           | Yes  | Wallet balances                    |
| POST   | `/backtest/run`             | Yes  | Run backtest simulation            |
| GET    | `/agent/recommendation`     | Yes  | AI trading recommendation          |
| POST   | `/agent/auto/enable`        | Yes  | Enable auto-trading                |
| POST   | `/agent/auto/disable`       | Yes  | Disable auto-trading               |
| GET    | `/agent/auto/status`        | Yes  | Check auto-trade status            |
| GET    | `/health`                   | No   | Server health check                |

---

## Development

### Type checking

```bash
npm run typecheck    # checks both client and server
```

### Testing

```bash
npm run test:all     # runs server (Jest) + client (Vitest) tests
npm run test:server  # server only: 15 suites, 267 tests
npm run test:client  # client only: 4 files, 109 tests
npm test             # alias for test:all
```

### Individual services

```bash
npm run dev:client   # Vite on :5173
npm run dev:server   # tsx watch on :5050
```

### Adding ML/DL models

See [`server/docs/ML_integration.md`](server/docs/ML_integration.md) for:
- Training data export from MongoDB
- Python training scripts (RandomForest, XGBoost, LSTM)
- FastAPI serving templates
- How to replace the Node.js stubs with HTTP calls

---

## License

Private — all rights reserved.
