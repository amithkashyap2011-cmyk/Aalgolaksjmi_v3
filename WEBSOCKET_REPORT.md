# WEBSOCKET_REPORT.md

## WebSocket Architecture Audit

### 1. Binance Service (Backend -> Exchange)
- **Multiplexing:** Uses combined streams to reduce connection count.
- **Watchdog:** A 10s watchdog monitors for stale data (30s threshold) and terminates/reconnects.
- **ISP Bypass:** Uses `wss://stream.binance.com:9443` even for futures because of ISP blocks on `fstream.binance.com`.
- **Signal Bus:** Emits `PRICE_TICK` signals but currently no services subscribe to these events (most rely on the 60s polling loop).

### 2. Socket.IO (Frontend -> Backend)
- **Endpoint:** Listens on port 9991.
- **Handlers:**
    - `subscribe`: Triggers `subscribeTicker` in `binanceService`.
    - `unsubscribe`: Triggers `unsubscribeTicker` in `binanceService`.
- **Latency:** Ticks are emitted immediately upon receiving them from Binance.

### 3. Stability & Performance
- **Reconnect Logic:** Frontend automatically reconnects with exponential backoff (handled by `socket.io-client`). Backend handles Binance WS reconnection with a 3s delay.
- **Memory Leaks:** `subscribedSymbolKeys` and `combinedSockets` Maps in `binanceService` seem properly managed via `subscribe`/`unsubscribe`.
- **Heartbeat:** `socket.io` has built-in ping/pong.

## Identified Improvements
- **Signal Bus Integration:** Critical decision logic (e.g., SL/TP) should move from the 60s polling loop to the `SignalBus` to react instantly to price movements.
- **Stale Socket Detection:** The current 30s watchdog in `binanceService` is good, but the frontend should also show a "Stale Feed" warning if ticks stop arriving.

## Validation Results
- [ ] WebSocket Handshake: TBD
- [ ] Real-time Ticker Delivery: TBD
- [ ] Auto-Reconnect Test: TBD

## Summary
The WebSocket layer is robustly implemented with multiplexing and watchdog mechanisms. The "stale or cached data" symptom reported might be due to the 60s polling interval in the `autoTradeEngine` rather than a WebSocket failure itself, or a lack of initial subscription on backend boot (which was fixed in Phase 2).
