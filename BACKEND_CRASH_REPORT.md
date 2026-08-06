# BACKEND_CRASH_REPORT.md

## Initial Findings

### 1. Missing Process-Level Error Handlers
The backend lacks `process.on("uncaughtException")` and `process.on("unhandledRejection")`. This means any error outside of an Express route (e.g., in a background service or an async function not properly awaited) will crash the process without a clear log in the main application log.

### 2. Fatal Startup Failures
The `boot()` sequence uses `process.exit(1)` for:
- Binance API unavailability.
- MongoDB connection failure.
- AI Model Governance check failure.
While this prevents the app from running in a broken state, it causes the process to stop completely, which might be perceived as a "crash" by the user if the environment isn't stable.

### 3. Redundant Database Connections
The `boot()` function attempts to connect to MongoDB twice. This is inefficient and could potentially lead to connection pool issues or race conditions during migrations.

### 4. Hardcoded Paths in Logs
Logging paths are hardcoded to `/Users/amithks/aalgolakshmi_v2/server/auto_trade.log`. This makes the code less portable and might cause issues if permissions are restricted.

### 5. Intermittent Crashes
The "intermittent crashes" reported might be due to:
- Binance API rate limits or connectivity blips causing `process.exit(1)` during boot or re-sync.
- Unhandled rejections in `autoTradeEngine` or `binanceService` websocket handlers.
- Memory pressure from large numbers of socket subscriptions without proper cleanup.

## Implementation Plan
1. Add `process.on("uncaughtException")` to `server/src/index.ts`.
2. Add `process.on("unhandledRejection")` to `server/src/index.ts`.
3. Consolidate MongoDB connection logic in `boot()`.
4. Add more robust error logging to `server_crash.log`.
