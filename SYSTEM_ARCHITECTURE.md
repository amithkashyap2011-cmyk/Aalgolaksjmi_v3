# AALGOLAKSHMI_V2 System Architecture

## Overview
AALGOLAKSHMI_V2 is an autonomous trading platform with a React frontend, Node.js/Express backend, and MongoDB for persistence. It integrates with the Binance API for Spot and Futures trading.

## Core Components

### 1. Frontend (Client)
- **Technology:** React, Vite, TypeScript, Tailwind CSS, Zustand (state management).
- **Port:** 9993 (0.0.0.0:9993).
- **Communication:** Proxies requests to backend at `http://127.0.0.1:9991`.
- **Key Directories:**
  - `client/src/components`: UI components.
  - `client/src/pages`: Main application views.
  - `client/src/store`: Zustand stores for global state.
  - `client/src/hooks`: Custom React hooks.

### 2. Backend (Server)
- **Technology:** Node.js, Express, TypeScript, Socket.IO.
- **Port:** 9991.
- **Key Directories:**
  - `server/src/routes`: API endpoints.
  - `server/src/services`: Business logic (Binance, Trading Engine, etc.).
  - `server/src/models`: Mongoose schemas for MongoDB.
  - `server/src/middleware`: Express middleware (Auth, Logging).
- **Log Files:**
  - `server/auto_trade.log`: Main application log.
  - `server_crash.log`: Log for backend crashes.

### 3. Database (MongoDB)
- **Role:** Persistence for user settings, API keys, trade logs, and system state.
- **Connection:** Managed via Mongoose in `server/src/index.ts`.
- **Default Port:** 27017.

### 4. External Integrations
- **Binance API:** 
  - Managed via `server/src/services/binanceService.ts`.
  - Supports Spot and Futures.
  - Uses WebSocket for real-time market data.
- **AQEA (Autonomous Quality Evaluation Agent):**
  - Various audit and report files in the root directory indicate a monitoring and evaluation layer.

## Connectivity Flow
1. **User** interacts with the **Vite Frontend** (9993).
2. **Frontend** sends API requests (proxied) and WebSocket signals to the **Node.js Backend** (9991).
3. **Backend** interacts with **MongoDB** for state and **Binance API** for trading.
4. **Binance WebSocket** feeds market data back to the **Backend**, which emits updates to the **Frontend** via **Socket.IO**.

## Deployment & Execution
- **Concurrent Development:** `npm run dev` in the root directory starts both client and server.
- **Containerization:** `Dockerfile` and `docker-compose.yml` are present for environment orchestration.
