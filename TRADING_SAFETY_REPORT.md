# TRADING SAFETY REPORT

## Circuit Breaker Logic
- **Middleware:** `app.use` in `server/src/index.ts` blocks `/trading`, `/backtest`, and `/agent` if state is not `READY` or `DEGRADED`.
- **States:**
  - `RECOVERING`: Automatically triggered on heartbeat loss or connection failure.
  - `EMERGENCY_STOP`: Manually triggered via `/system/emergency-stop`.

## Rules
- Quant offline > 30s -> RECOVERING (Trading Paused)
- Binance unreachable -> RECOVERING (Trading Paused)
- Mongo unreachable -> RECOVERING (Trading Paused)
