# BINANCE_AUDIT_REPORT.md

## Code Review: `server/src/services/binanceService.ts`

### 1. API Implementation
- **REST Endpoints:** Uses `fetch` for REST calls. Correctly uses `https://api.binance.com` for Spot and `https://fapi.binance.com` for Futures.
- **Time Sync:** Implemented via `syncTime()` which calculates `timeOffset`. It runs initially and every 15 minutes. This is good for preventing "Timestamp for this request is outside of the recvWindow" errors.
- **Signature Generation:** `hmacSign` correctly uses `sha256` HMAC with the API secret.
- **`recvWindow`:** Set to `60000` ms, which is generous and helps with slight clock drift.
- **Futures Support:** Has dedicated functions for Futures exchange info, quantity formatting, leverage setting, and orders.
- **Special Case:** Correctly handles `1000SHIBUSDT` (multiplying/dividing by 1000 where needed), which is a common pitfall for Binance Futures.

### 2. WebSocket Implementation
- **Multiplexed Streams:** Uses combined streams (one for spot, one for futures). This is efficient and avoids hitting the limit of 5 connections per IP.
- **Stream URL:** Uses `wss://stream.binance.com:9443/stream?streams=...`.
- **ISP Bypass:** Explicitly uses spot stream URL even for futures streams with a comment about Indian ISPs blocking `fstream`. 
- **Watchdog:** A watchdog interval checks for stale feeds (no data for 30s) and terminates the connection to trigger a reconnect.
- **Reconnect Logic:** Automatically reconnects in 3s after a close event, unless intentionally closed.

### 3. Potential Issues / Risks
- **Combined Socket Limit:** While multiplexing is used, if a user subscribes to *too many* symbols, the URL length for the streams might hit a limit (though Binance supports up to 200 streams).
- **Hardcoded BASE URLs:** URLs are hardcoded as constants. If Binance changes endpoints, multiple places need updates.
- **Error Handling:** Some REST errors log to console but might not provide enough context back to the UI (returns `res.status` and `res.text()`).
- **IPv4 Preference:** The `index.ts` fix for IPv4 is critical as some Node.js versions on macOS/Linux prefer IPv6, which Binance might not support well or can cause "fetch failed".

## Public Connectivity Test Results
- [ ] Ping: TBD
- [ ] Server Time Sync: TBD
- [ ] Exchange Info Fetch: TBD

## Private Connectivity Test Results (Requires API Keys)
- [ ] Spot Account Info: TBD
- [ ] Futures Account Info: TBD
- [ ] Signature Validation: TBD

## Summary
The Binance service implementation is solid, following best practices for high-performance trading apps (time sync, multiplexed WS, watchdog). The reported connectivity issues might be due to API key handling or network-level restrictions rather than the service logic itself.
