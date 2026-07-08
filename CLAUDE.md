# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AALGOLAKSHMI V3 is an autonomous AI-powered crypto trading platform with Binance integration. It consists of three active runtime services and two HFT layers (C++/Rust) that are architectural targets.

## Development Commands

### Start all services (development)
```bash
npm run dev              # starts client (9994) + server (9991) concurrently
npm run dev:client       # Vite dev server only
npm run dev:server       # tsx watch server only
```

### Build
```bash
npm run build            # runs build_gates.js, then builds client + server
npm run build:client
npm run build:server
```

### Testing
```bash
npm run test:all         # server (Jest) + client (Vitest)
npm run test:server      # cd server && npm test (Jest with --forceExit)
npm run test:client      # cd client && vitest run --reporter=verbose
```

### Type checking
```bash
npm run typecheck        # tsc --noEmit for both client and server
```

### Production (PM2)
```bash
pm2 start ecosystem.config.js   # starts aqea-server (port 9991) + aqea-quant (dynamic port)
npm start                        # from root: cd server && npm start (compiled JS)
```

### Quant Engine (Python FastAPI)
```bash
cd quant_engine && python run.py   # auto-allocates a free port, saves to qport.tmp
```

### Install dependencies
```bash
npm run install:all      # installs client + server node_modules
```

## Architecture

### Three-tier runtime

```
Client (React/Vite) :9994
    ↕ REST proxy + Socket.IO (ws)
Server (Node/Express) :9991
    ↕ HTTP (dynamic port from qport.tmp)
Quant Engine (FastAPI/Python) :dynamic
    ↕ Binance REST + WebSocket
Binance Exchange
```

**Client** — `client/src/`
- React 18 + TypeScript + Vite + Tailwind CSS + Zustand
- Vite proxies all API paths (`/auth`, `/trading`, `/aqea-ui`, etc.) to `http://localhost:9991`
- Global state split between `useAppStore.ts` (trading state) and `useDashboardStore.ts`
- `VITE_API_PROXY_TARGET` env var overrides the proxy target

**Server** — `server/src/`
- Express + Socket.IO + Mongoose (MongoDB at `mongodb://127.0.0.1:27017/aalgolakshmi`)
- Logs: `server/auto_trade.log` (main), `server_crash.log` (fatal errors)
- `dns.setDefaultResultOrder("ipv4first")` is set globally — required for Binance API fetch to work
- Server env lives at `server/.env` (not root `.env`)

**Quant Engine** — `quant_engine/`
- FastAPI app, port is dynamically allocated and written to `qport.tmp`
- Models: CNN, PPO, Mamba, Transformer, Portfolio PPO, Regime Forecaster
- Server discovers the quant port via `runtime/registry_client` / service registry
- Startup refuses to register with the server if CNN or PPO models are DEGRADED

### AQEA System (core AI trading brain)

AQEA (Autonomous Quality Evaluation Agent) is the ML voting/execution layer, controlled via `server/.env` flags:

| Flag | Purpose |
|------|---------|
| `AQEA_ENABLED` | Master switch |
| `AQEA_SHADOW_MODE` | Log decisions without executing |
| `AQEA_ORDERFLOW_VOTING_ENABLED` | Order flow signal voting |
| `AQEA_SMART_MONEY_VOTING_ENABLED` | Smart money/whale detection |
| `AQEA_CNN_VOTING_ENABLED` | CNN model votes |
| `AQEA_PPO_ENABLED` | PPO execution agent |
| `AQEA_PPO_EXECUTION_AUTHORITY` | Allow PPO to place real orders |

AQEA source lives in `server/src/services/aqea/` with sub-dirs: `router/`, `routing/`, `institutional/`, `research/`.

### Trading decision pipeline

```
autoTradeEngine.ts (60s scheduler)
  → agentService.ts: buildContext()
      → binanceService.ts: fetch 200 bars
      → indicatorService.ts: EMA, SMA, RSI, MACD, ATR, Bollinger (ring buffers)
      → behaviourModel.ts: 10 animal scoring (Eagle/Tiger/Cheetah/Fox/Tortoise/Dog/Owl/Cow/Spider/Lion)
      → strategies/: Aaryan, Aayush, Gayatri, Lakshmi, Ohmkara named strategies
      → mlModelService.ts + dlModelService.ts → HTTP to Quant Engine
      → checklist.ts: 24-spoke mandatory gate (Trend 8 + Risk 8 + Behaviour 8)
  → decideAction(): LONG / EXIT / NO_TRADE
  → paperState.ts (in-memory O(1) maps) or Binance REST (live)
```

Animal behaviour weights are stored per-user in `Settings.behaviorWeights` (0–100 sliders, normalised to 0–1).

### Named strategies

Strategies in `server/src/services/strategies/` are named after Sanskrit/Hindu names:
- **Aaryan** — core trend-following strategy
- **Aayush** — online RL (PPO-based)
- **Gayatri** — additional signal layer
- **Lakshmi** — capital allocation / risk management
- **Ohmkara** — regime-aware fusion

### Key server service files

| File | Role |
|------|------|
| `services/agentService.ts` | Main trading brain — context → score → decide |
| `services/autoTradeEngine.ts` | 60s periodic scheduler |
| `services/behaviourModel.ts` | 10-animal scoring functions |
| `services/binanceService.ts` | Binance REST + WebSocket |
| `services/paperState.ts` | In-memory O(1) paper trading maps |
| `services/indicatorService.ts` | Streaming indicators with ring buffers |
| `services/checklist.ts` | 24-spoke pre-trade gate |
| `services/hybridEngine.ts` | Fused strategy logic |
| `services/regimeDetectionEngine.ts` | Market regime classification |
| `services/modelRegistry.ts` | Dynamic model weight management |
| `services/systemManager.ts` | Service health / boot coordination |
| `services/recoveryManager.ts` | Auto-recovery on failure |

### MongoDB models

`server/src/models/`: User, Settings, ApiKeys (AES-256-GCM encrypted), Trade, WalletSnapshot, WalletTransaction, BacktestRun, Alert, AIDecision, AqeaAudit, AqeaPerformance, and several AQEA analytics models.

### C++ HFT Engine & Rust Microservices

`cpp-hft-engine/` and `rust-services/` contain the ultra-low-latency execution layer architecture. The Rust layer communicates with C++ via ZeroMQ PUB/SUB on `tcp://localhost:5555`. These are built separately:
```bash
cd cpp-hft-engine && mkdir build && cd build && cmake -DCMAKE_BUILD_TYPE=Release .. && make -j8
cd rust-services && cargo build --release
```

## Ports at a glance

| Service | Port |
|---------|------|
| Client (Vite dev) | 9994 |
| Server (Express) | 9991 |
| Quant Engine (FastAPI) | dynamic (see `qport.tmp`) |
| MongoDB | 27017 |
| ZeroMQ (Rust→C++) | 5555 |
